/**
 * The expected-value model.
 *
 *   EV = claim_value
 *      × P(contactable)
 *      × P(signs)
 *      × P(entitlement_provable)
 *      × fee_pct
 *      − expected_cost_to_work
 *
 * This is a HIGH-VALUE-CLAIM-SELECTION business, not a volume business. A $4,000
 * claim at 30% is $1,200 — one claim repays the entire registration. So the
 * queue optimises for expected dollars recovered per hour of human work, never
 * for record count.
 *
 * Every score carries its inputs and its params version, so the model can be
 * back-tested against actual outcomes once claims start closing. Nothing here is
 * a black box.
 */

import { type Cents, cents, dollarsToCents } from '@/lib/compliance/money'
import { computeFee } from '@/lib/compliance/computeFee'
import { DEFAULT_PARAMS, type ScoringParams } from './params'

export type OwnerClass = 'individual' | 'entity' | 'multi_owner' | 'unknown'
export type EntityStatus =
  | 'active' | 'admin_dissolved' | 'terminated' | 'merged' | 'withdrawn'
  /** Not yet matched against the SOS file. NOT the same as 'unknown'. */
  | 'unchecked'
  /** Matched, but the status could not be determined. Resolves pessimistically. */
  | 'unknown'
export type AddressQuality = 'full' | 'partial' | 'none'

export interface ScoringInput {
  propertyId: string
  /** Cash amount, or an estimated value for non-cash property. Null if unknown. */
  claimValueCents: Cents | null
  ownerClass: OwnerClass
  addressQuality: AddressQuality
  /** Years since the date of last activity. Null when the file did not provide one. */
  yearsSinceLastActivity: number | null
  /** Distinct owners who must all sign. 1 for a sole owner. */
  ownerCount: number
  entityStatus: EntityStatus
  /** Owner known deceased — routes through the heir path. */
  ownerDeceased: boolean
  /** Fee percentage we intend to charge. Strategic per claim — see § 44-12-220(g). */
  feePct: number
  /** Statutory cap for the governing state. */
  feeCapPct: number
}

export interface ScoreBreakdown {
  pContactable: number
  pSigns: number
  pEntitlementProvable: number
  grossFeeCents: Cents
  expectedCostCents: Cents
  expectedValueCents: Cents
  /** 0–1. How much of the input we actually knew, rather than defaulted. */
  confidence: number
}

export interface Score extends ScoreBreakdown {
  propertyId: string
  paramsVersion: string
  scoredAt: string
  /** Verbatim inputs, so the score is reproducible and back-testable. */
  inputs: ScoringInput
  /** Human-readable reasons, for the queue UI. Never make a human guess why. */
  rationale: string[]
  workable: boolean
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function pContactable(input: ScoringInput, p: ScoringParams): number {
  const c = p.contactable

  let base =
    input.addressQuality === 'full' ? c.withFullAddress
    : input.addressQuality === 'partial' ? c.withPartialAddress
    : c.withNoAddress

  // Address decay. Unknown last-activity is treated as one decade stale rather
  // than as fresh — the conservative reading of missing data.
  const years = input.yearsSinceLastActivity ?? 10
  base *= Math.pow(c.decayPerDecade, years / 10)

  // An entity can be reached through its SOS registered agent even when the DOR
  // address is long dead — unless it dissolved, in which case there is no agent.
  // 'unchecked' means we have not looked yet, so neither adjustment applies.
  if (input.ownerClass === 'entity') {
    base *=
      input.entityStatus === 'active' ? c.entityRegisteredAgentBonus
      : input.entityStatus === 'unchecked' ? c.uncheckedEntityFactor
      : c.dissolvedEntityPenalty
  }

  return clamp01(base)
}

export function pSigns(input: ScoringInput, p: ScoringParams): number {
  const s = p.signs
  let probability = s.base

  // Larger claims plausibly justify reading past the legend.
  if (input.claimValueCents !== null && input.claimValueCents > 0) {
    const dollars = input.claimValueCents / 100
    const decadesAboveThousand = Math.max(0, Math.log10(dollars / 1_000))
    probability += decadesAboveThousand * s.valueLiftPerDecade
  }

  probability = Math.min(probability, s.max)

  // EVERY owner must sign (§ 44-12-224(c)(7) requires the claimant's own manual
  // signature), so multi-owner property compounds badly.
  if (input.ownerCount > 1) {
    probability *= Math.pow(s.perAdditionalOwner, input.ownerCount - 1)
  }

  if (input.ownerClass === 'entity') probability *= s.entityFriction

  return clamp01(probability)
}

export function pEntitlementProvable(input: ScoringInput, p: ScoringParams): number {
  const e = p.entitlementProvable

  if (input.ownerDeceased) {
    // § 44-12-220(i): heir claims aggregating at or below $7,500 skip probate
    // entirely on an all-heir affidavit. Above it, probate is back.
    const ceiling = dollarsToCents(7_500)
    const underCeiling =
      input.claimValueCents !== null && input.claimValueCents <= ceiling
    return underCeiling ? e.heirUnderAffidavitCeiling : e.heirOverAffidavitCeiling
  }

  if (input.ownerClass === 'entity') {
    switch (input.entityStatus) {
      case 'active': return e.activeEntity
      case 'merged': return e.mergedEntity
      // Not yet looked up. Blended, not worst-case — see the note in params.ts
      // on why ranking is not the place for conservatism.
      case 'unchecked': return e.uncheckedEntity
      case 'admin_dissolved':
      case 'terminated':
      case 'withdrawn': return e.dissolvedEntity
      default: return e.dissolvedEntity  // looked up but indeterminate: pessimistic
    }
  }

  if (input.ownerClass === 'multi_owner' || input.ownerCount > 1) return e.multiOwner
  if (input.ownerClass === 'individual') return e.individualSoleOwner

  return e.multiOwner  // unknown owner class resolves pessimistically
}

/**
 * Cost decomposed by the STAGE at which it is actually incurred.
 *
 * Getting this wrong produces a perverse model. Scaling the whole cost by
 * P(contactable) makes a MORE reachable owner look worse on a small claim,
 * because it assumes we do the full evidence work on someone who never replies.
 * We do not.
 *
 *   unconditional  first-touch mail — spent on every property we work
 *   onContact      follow-up mail — spent once someone engages
 *   onSigning      notary reimbursement and evidence assembly — spent only when
 *                  they actually sign and we build the claim
 */
export interface StagedCost {
  unconditionalCents: Cents
  onContactCents: Cents
  onSigningCents: Cents
  /** Full cost if the claim runs all the way through. */
  totalCents: Cents
}

export function expectedCost(input: ScoringInput, p: ScoringParams): StagedCost {
  const c = p.costsCents

  let hours: number
  if (input.ownerDeceased) hours = c.hoursHeir
  else if (input.ownerClass === 'entity') {
    hours = input.entityStatus === 'active' || input.entityStatus === 'unchecked'
      ? c.hoursActiveEntity
      : c.hoursComplexEntity
  } else hours = c.hoursIndividual

  const owners = Math.max(1, input.ownerCount)

  const unconditional = c.firstTouchMail
  // Multi-owner claims need chasing on every signature.
  const onContact = c.followUpMail * owners
  // § 44-12-224(c)(7) requires each claimant's own manual signature, and the
  // forms require notarisation — so both scale with the number of owners.
  const onSigning = c.notaryReimbursement * owners + Math.round(c.evidenceAssemblyPerHour * hours)

  return {
    unconditionalCents: cents(unconditional),
    onContactCents: cents(onContact),
    onSigningCents: cents(onSigning),
    totalCents: cents(unconditional + onContact + onSigning),
  }
}

/** How much of the input we actually knew, rather than defaulted pessimistically. */
function computeConfidence(input: ScoringInput): number {
  const known = [
    input.claimValueCents !== null,
    input.addressQuality !== 'none',
    input.yearsSinceLastActivity !== null,
    input.ownerClass !== 'unknown',
    input.ownerClass !== 'entity' || !['unchecked', 'unknown'].includes(input.entityStatus),
  ]
  return known.filter(Boolean).length / known.length
}

export function scoreProperty(
  input: ScoringInput,
  params: ScoringParams = DEFAULT_PARAMS,
): Score {
  const contactable = pContactable(input, params)
  const signs = pSigns(input, params)
  const provable = pEntitlementProvable(input, params)
  const cost = expectedCost(input, params)

  // Cost weighted by the probability of actually reaching each stage.
  const expectedCostCents = cents(Math.round(
    cost.unconditionalCents +
    contactable * cost.onContactCents +
    contactable * signs * cost.onSigningCents,
  ))

  // The fee is computed through the SAME cap engine that generates agreements,
  // so a queue can never promise economics an agreement would refuse to produce.
  // Costs count inside the cap (§ 44-12-224(d)(1)), so they are passed in here.
  // The fee is computed through the SAME cap engine that generates agreements,
  // using the FULL cost we would actually recover — § 44-12-224(d)(1) counts
  // costs inside the cap, so a claim we cannot recover costs on is one the
  // agreement path would clamp.
  const claimValue = input.claimValueCents ?? cents(0)
  const fee = computeFee({
    claimedAmount: claimValue,
    propertyValue: claimValue,
    costs: cost.totalCents,
    requestedFeePct: input.feePct,
    feeCapPct: input.feeCapPct,
  })

  const probability = contactable * signs * provable
  const grossFee = cents(Math.round(fee.feeExcludingCosts * probability))
  const expectedValueCents = cents(grossFee - expectedCostCents)
  const confidence = computeConfidence(input)

  const rationale: string[] = []
  if (input.claimValueCents === null) {
    rationale.push('Holder reported no value — UP-CDR2 Path B, percentage of net value (§ 44-12-224(c)(3))')
  }
  if (input.addressQuality === 'none') {
    rationale.push('No usable address in the DOR file; contact requires a locate step')
  }
  if (input.yearsSinceLastActivity === null) {
    rationale.push('No last-activity date; address decay assumed at one decade')
  }
  if (input.ownerCount > 1) {
    rationale.push(`${input.ownerCount} owners must EACH sign personally (§ 44-12-224(c)(7))`)
  }
  if (input.ownerClass === 'entity' && input.entityStatus === 'unchecked') {
    rationale.push('Entity not yet matched against the GA SOS file — status prior is blended, not measured')
  } else if (input.ownerClass === 'entity' && input.entityStatus !== 'active') {
    rationale.push(`Entity status "${input.entityStatus}" — DOR publishes no dissolved/merged requirements (DOR-QUESTIONS #3)`)
  }
  if (input.ownerDeceased) {
    const under = input.claimValueCents !== null && input.claimValueCents <= dollarsToCents(7_500)
    rationale.push(under
      ? 'Heir claim at or below $7,500 — all-heir affidavit, no probate (§ 44-12-220(i))'
      : 'Heir claim above $7,500 — probate required')
  }
  if (fee.capBinding) {
    rationale.push(`Fee clamped to the ${input.feeCapPct}% cap; costs count inside it (§ 44-12-224(d)(1))`)
  }
  if (confidence < DEFAULT_PARAMS.thresholds.lowConfidence) {
    rationale.push('LOW CONFIDENCE — most inputs were defaulted pessimistically')
  }

  return {
    propertyId: input.propertyId,
    paramsVersion: params.version,
    scoredAt: new Date().toISOString(),
    inputs: input,
    pContactable: contactable,
    pSigns: signs,
    pEntitlementProvable: provable,
    grossFeeCents: grossFee,
    expectedCostCents,
    expectedValueCents,
    confidence,
    rationale,
    workable: expectedValueCents >= params.thresholds.minimumExpectedValueCents,
  }
}

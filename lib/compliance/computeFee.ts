/**
 * Fee computation under O.C.G.A. § 44-12-224(d)(1).
 *
 * The statute: total fees AND COSTS may not exceed 30% of the claimed amount OR
 * the property's value, WHICHEVER IS LOWER. Over-cap agreements are reduced to
 * the cap and DOR remits the net directly to the claimant.
 *
 * Two traps live in that sentence:
 *
 *   1. "fees AND costs" — postage, notary fees, skip-trace spend, and document
 *      retrieval all count INSIDE the 30%. A 30% fee plus $40 of postage is an
 *      over-cap agreement.
 *
 *   2. "whichever is lower" — the basis is min(claimedAmount, propertyValue),
 *      not the claimed amount.
 *
 * This function CLAMPS rather than throwing, so the caller can display what the
 * cap did. Refusing to generate the agreement is a separate, later gate — see
 * assertFeeAgreementEligible() below.
 */

import { type Cents, ZERO, add, cents, min, percentOf, subtract } from './money'
import { getStateRules } from './stateRules'

/**
 * The statutory cap for a state, from the rules engine. Null where the state
 * has NO percentage cap — which is materially different from zero and must
 * never be coerced to one.
 */
function getStatutoryCapPct(stateCode: string): number | null {
  const rules = getStateRules(stateCode)
  const cap = rules.feeCapPct
  return typeof cap === 'number' ? cap : null
}

export interface ComputeFeeInput {
  /** Amount being claimed from DOR. */
  claimedAmount: Cents
  /**
   * Property value as reported by the holder. Null when the holder reported no
   * value — § 44-12-224(c)(3) then requires the agreement to state a PERCENTAGE
   * of net value rather than a dollar figure (form UP-CDR2 Path B).
   */
  propertyValue: Cents | null
  /** Costs we intend to recover. Counts toward the cap. */
  costs: Cents
  /** Requested fee percentage. Defaults to the state cap. */
  requestedFeePct?: number
  /** Statutory cap for the governing state. */
  feeCapPct: number
}

export interface FeeComputation {
  /** Effective total take as a percentage of the basis, fees and costs combined. */
  feePct: number
  /** Total fee in cents, INCLUSIVE of costs, after any clamp. */
  feeDollars: Cents
  /** The fee portion alone, exclusive of costs. */
  feeExcludingCosts: Cents
  /** Costs recovered, unchanged by the clamp unless costs alone exceed the cap. */
  costs: Cents
  /** What the claimant receives. */
  netToClaimant: Cents
  /** min(claimedAmount, propertyValue) — the figure the cap applies to. */
  capBasis: Cents
  /** The dollar ceiling: feeCapPct of capBasis. */
  capCeiling: Cents
  /** True when the requested economics were reduced to fit the cap. */
  capBinding: boolean
  /**
   * True when the holder reported no value, so the agreement must use UP-CDR2
   * Path B and state percentages instead of dollars. § 44-12-224(c)(3).
   */
  requiresPathB: boolean
}

export function computeFee(input: ComputeFeeInput): FeeComputation {
  const { claimedAmount, propertyValue, costs, feeCapPct } = input
  const requestedFeePct = input.requestedFeePct ?? feeCapPct

  if (claimedAmount < 0 || costs < 0) {
    throw new RangeError('Claimed amount and costs must be non-negative')
  }
  if (requestedFeePct < 0) {
    throw new RangeError(`Requested fee percentage must be non-negative, got ${requestedFeePct}`)
  }

  // "whichever is lower" — the basis is the lesser of claim and value.
  const capBasis = propertyValue === null ? claimedAmount : min(claimedAmount, propertyValue)
  const capCeiling = percentOf(capBasis, feeCapPct)

  const requestedFee = percentOf(capBasis, requestedFeePct)

  // "fees AND costs" — costs are added BEFORE the cap is tested.
  const requestedTotal = add(requestedFee, costs)

  const capBinding = requestedTotal > capCeiling
  const total = capBinding ? capCeiling : requestedTotal

  // When the clamp binds, costs are recovered first and the fee absorbs the
  // reduction. If costs alone exceed the ceiling, the fee is zero and costs are
  // themselves clamped — we cannot recover more than the cap under any label.
  const costsRecovered = min(costs, total)
  const feeExcludingCosts = subtract(total, costsRecovered)

  const netToClaimant = subtract(claimedAmount, total)

  return {
    feePct: capBasis === 0 ? 0 : (total / capBasis) * 100,
    feeDollars: total,
    feeExcludingCosts,
    costs: costsRecovered,
    netToClaimant,
    capBasis,
    capCeiling,
    capBinding,
    requiresPathB: propertyValue === null,
  }
}

/**
 * Hard gate before an agreement may be generated.
 *
 * computeFee() clamps so the UI can explain itself. This throws, because
 * § 44-12-224(b) voids the representative's claim on a defective agreement and
 * § 44-12-239.2(b) reaches "willful imposition of illegal or excessive charges."
 *
 * `stateCode` is not optional decoration. `feeCapPct` is a caller-supplied
 * parameter — it has to be, because the cap is per-state — which means a wrong
 * value would propagate through BOTH the clamp and the check that is supposed to
 * validate it, and the agreement would look internally consistent while being
 * over the statutory cap. Passing the state code makes this verify the cap
 * against the rules engine rather than trusting its own input.
 */
export function assertFeeAgreementEligible(
  computation: FeeComputation,
  feeCapPct: number,
  stateCode = 'GA',
): void {
  const statutoryCap = getStatutoryCapPct(stateCode)
  if (statutoryCap !== null && feeCapPct > statutoryCap) {
    throw new Error(
      `Refusing to generate agreement: a fee cap of ${feeCapPct}% was supplied, ` +
        `but the statutory cap for ${stateCode} is ${statutoryCap}%. The cap is ` +
        'not a caller preference (O.C.G.A. § 44-12-224(d)(1)).',
    )
  }
  // Compare in integer cents, never in the derived float percentage.
  if (computation.feeDollars > computation.capCeiling) {
    throw new Error(
      `Refusing to generate agreement: total fees and costs ${computation.feeDollars} ` +
        `exceed the ${feeCapPct}% cap of ${computation.capCeiling} ` +
        '(O.C.G.A. § 44-12-224(d)(1)). This is a bug — computeFee should have clamped.',
    )
  }
  if (computation.netToClaimant < ZERO) {
    throw new Error(
      'Refusing to generate agreement: net to claimant is negative. ' +
        'The claimant must receive value from the transaction.',
    )
  }
}

/**
 * UP-CDR2 Path B percentages, used when the holder reported no value.
 * § 44-12-224(c)(3); the form requires B1 + B2 === 100.
 */
export interface PathBSplit {
  /** B1 — percentage of net value to the CDR. */
  cdrPct: number
  /** B2 — percentage of net value to the claimant. */
  claimantPct: number
}

export function computePathBSplit(feePct: number, feeCapPct: number): PathBSplit {
  if (feePct < 0 || feePct > feeCapPct) {
    throw new RangeError(
      `Path B CDR percentage ${feePct} must be between 0 and the ${feeCapPct}% cap ` +
        '(O.C.G.A. § 44-12-224(d)(1))',
    )
  }
  // Round to two decimals and derive the complement, so the pair always sums to
  // exactly 100 as the form requires.
  const cdrPct = Math.round(feePct * 100) / 100
  const claimantPct = Math.round((100 - cdrPct) * 100) / 100
  return { cdrPct, claimantPct }
}

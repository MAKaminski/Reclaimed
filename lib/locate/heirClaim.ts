/**
 * Heir claims under O.C.G.A. § 44-12-220(i), added by SB 403 (eff. 2026-07-01).
 *
 * Heir claims aggregating $7,500 or less no longer need probate: an affidavit
 * signed by ALL heirs, stating amicable division and that funeral, last-illness,
 * and lawful claims are paid, with the will attached if testate — PROVIDED no
 * Georgia probate proceeding is pending or was EVER filed.
 *
 * The completeness gate is not a formality. Recipients are personally liable to
 * estate creditors up to the value received, and an affidavit signed by three of
 * four heirs is not an all-heir affidavit — it is a document the fourth heir can
 * act against.
 */

import { type Cents, dollarsToCents } from '@/lib/compliance/money'

/** § 44-12-192(7.1): ADULT surviving spouse, child, parent, or sibling. */
export type HeirRelationship = 'spouse' | 'child' | 'parent' | 'sibling'

export const HEIR_AFFIDAVIT_CEILING: Cents = dollarsToCents(7_500)

export interface Heir {
  fullName: string
  relationship: HeirRelationship
  isAdult: boolean
  hasSigned: boolean
  identityDocumentId: string | null
}

export interface HeirClaim {
  decedentName: string
  dateOfDeath: string | null
  deathCertificateId: string | null
  testate: boolean
  willDocumentId: string | null
  noProbatePending: boolean
  noProbateEverFiled: boolean
  funeralAndClaimsPaid: boolean
  amicableDivision: boolean
  /** Aggregate across ALL properties in this estate claim. */
  aggregateValueCents: Cents | null
  heirs: readonly Heir[]
}

export interface HeirClaimEvaluation {
  ready: boolean
  reasons: string[]
}

export function evaluateHeirClaim(claim: HeirClaim): HeirClaimEvaluation {
  const reasons: string[] = []
  const heirs = claim.heirs

  if (heirs.length === 0) {
    reasons.push(
      'No heirs enumerated. § 44-12-220(i) requires an affidavit signed by ALL heirs.',
    )
  } else {
    const signed = heirs.filter((h) => h.hasSigned).length
    if (signed < heirs.length) {
      reasons.push(
        `Only ${signed} of ${heirs.length} heirs have signed. A partial heir set is ` +
          'NOT an all-heir affidavit.',
      )
    }
    const minors = heirs.filter((h) => !h.isAdult).length
    if (minors > 0) {
      reasons.push(
        `${minors} enumerated heir(s) are not adults. § 44-12-192(7.1) defines an ` +
          'heir as an ADULT surviving spouse, child, parent, or sibling.',
      )
    }
  }

  if (claim.aggregateValueCents === null) {
    reasons.push('Aggregate estate value is unknown; the $7,500 ceiling cannot be tested.')
  } else if (claim.aggregateValueCents > HEIR_AFFIDAVIT_CEILING) {
    reasons.push(
      `Aggregate exceeds the $7,500 ceiling — probate is required and the ` +
        'affidavit path is unavailable.',
    )
  }

  if (!claim.noProbatePending || !claim.noProbateEverFiled) {
    reasons.push(
      'The affidavit path requires that NO Georgia probate proceeding is pending ' +
        'or was EVER filed.',
    )
  }
  if (!claim.funeralAndClaimsPaid) {
    reasons.push('Affidavit must state that funeral, last-illness, and lawful claims are paid.')
  }
  if (!claim.amicableDivision) {
    reasons.push('Affidavit must state amicable division among the heirs.')
  }
  if (claim.deathCertificateId === null) {
    reasons.push('No death certificate on file.')
  }
  if (claim.testate && claim.willDocumentId === null) {
    reasons.push('Decedent was testate; the will must be attached.')
  }

  return {
    ready: reasons.length === 0,
    reasons: reasons.length === 0
      ? ['All heirs enumerated and signed; within the $7,500 ceiling; no probate filed.']
      : reasons,
  }
}

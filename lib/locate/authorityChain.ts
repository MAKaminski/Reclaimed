/**
 * The authority chain.
 *
 * THIS IS THE MOST SAFETY-CRITICAL MODULE IN THE CODEBASE.
 *
 * Every criminal prosecution in this industry turned on forged authority, not
 * fee abuse. US v. Pendergrass & McQueen (N.D. Ga., 2017) ran eight shell
 * "asset recovery" companies on FORGED POWER-OF-ATTORNEY FORMS against local
 * BUSINESSES — chosen because a dissolved entity has nobody left to object.
 * That is precisely the segment this platform enters.
 *
 * The rules, each enforced in the DATABASE as well as here:
 *   · every link requires an uploaded evidence document (NOT NULL)
 *   · evidence content is immutable once uploaded (trigger)
 *   · a chain's confidence is the MINIMUM of its links, never the mean
 *   · entity status other than active blocks auto-progression
 *   · evidence later found forged invalidates the chain retroactively
 *   · below threshold a claim cannot be submitted, only escalated to a NAMED human
 *
 * This module mirrors db/migrations/0010 + 0011 so the app fails the same way
 * the database does, and a reviewer can read the rule in one place.
 */

export type EntityStatus =
  | 'active' | 'admin_dissolved' | 'terminated' | 'merged' | 'withdrawn'
  | 'unchecked' | 'unknown'

export type AuthorityLinkType =
  | 'owner_name_to_entity'
  | 'entity_status'
  | 'successor_entity'
  | 'authorized_signer'
  | 'signer_identity'
  | 'decedent_death'
  | 'heir_enumeration'
  | 'individual_identity'

export type LinkReviewStatus = 'asserted' | 'reviewed' | 'rejected'

export interface AuthorityLink {
  sequence: number
  linkType: AuthorityLinkType
  fromRef: string | null
  toRef: string | null
  /** Required. A link without evidence is not a link. */
  evidenceDocumentId: string
  /** True when the evidence was later found forged, superseded, or wrong. */
  evidenceInvalidated: boolean
  confidence: number
  reviewStatus: LinkReviewStatus
  entityStatus: EntityStatus | null
  assertedBy: string
  reviewedBy: string | null
}

export const DEFAULT_MINIMUM_CONFIDENCE = 0.75

export interface ChainEvaluation {
  submittable: boolean
  /** The MINIMUM link confidence. Null when the chain is empty. */
  chainConfidence: number | null
  threshold: number
  reasons: string[]
  /** True when a named human must review before anything proceeds. */
  requiresManualReview: boolean
}

export class AuthorityChainError extends Error {
  readonly reasons: string[]
  constructor(propertyId: string, reasons: string[]) {
    super(
      `REFUSING TO PROCEED on property ${propertyId}: the authority chain is not ` +
        `submittable.\n${reasons.map((r) => `  · ${r}`).join('\n')}\n` +
        'O.C.G.A. § 44-12-224(b) voids the representative\'s claim on a defective ' +
        'agreement, and every prosecution in this industry involved authority ' +
        'asserted without documentation.',
    )
    this.name = 'AuthorityChainError'
    this.reasons = reasons
  }
}

/**
 * Evaluate a chain. Pure — takes the links, returns the verdict.
 */
export function evaluateChain(
  links: readonly AuthorityLink[],
  threshold: number = DEFAULT_MINIMUM_CONFIDENCE,
): ChainEvaluation {
  if (links.length === 0) {
    return {
      submittable: false,
      chainConfidence: null,
      threshold,
      requiresManualReview: false,
      reasons: [
        'No authority chain exists for this property. § 44-12-224(b) voids the ' +
          "representative's claim on a defective agreement.",
      ],
    }
  }

  const reasons: string[] = []

  // THE MINIMUM, NOT THE MEAN. One weak link is a weak chain.
  const chainConfidence = Math.min(...links.map((l) => l.confidence))

  if (links.some((l) => l.evidenceDocumentId === '' )) {
    reasons.push('A link is asserted without an evidence document.')
  }
  if (links.some((l) => l.evidenceInvalidated)) {
    reasons.push('A link rests on evidence later invalidated (forged, superseded, or wrong).')
  }

  const rejected = links.filter((l) => l.reviewStatus === 'rejected').length
  if (rejected > 0) reasons.push(`${rejected} link(s) rejected on review.`)

  const unreviewed = links.filter((l) => l.reviewStatus === 'asserted').length
  if (unreviewed > 0) {
    reasons.push(`${unreviewed} link(s) never reviewed by a second person.`)
  }

  // Sequence must be contiguous from 1: a gap means a step was skipped.
  const sequences = links.map((l) => l.sequence).sort((a, b) => a - b)
  const contiguous = sequences.every((s, i) => s === i + 1)
  if (!contiguous) reasons.push('Chain sequence has a gap — a step was skipped.')

  // Any entity status other than active blocks auto-progression. DOR publishes
  // NOTHING on dissolved or merged entity requirements — DOR-QUESTIONS #3.
  const nonActive = links
    .map((l) => l.entityStatus)
    .filter((s): s is EntityStatus => s !== null && s !== 'active')
  const requiresManualReview = nonActive.length > 0
  if (requiresManualReview) {
    reasons.push(
      `Entity status ${[...new Set(nonActive)].join(', ')} is not active. DOR ` +
        'publishes NO dissolved/merged requirements (DOR-QUESTIONS #3); a named ' +
        'human must review.',
    )
  }

  if (chainConfidence < threshold) {
    reasons.push(`Chain confidence ${chainConfidence.toFixed(3)} is below the ${threshold} threshold.`)
  }

  return {
    submittable: reasons.length === 0,
    chainConfidence,
    threshold,
    requiresManualReview,
    reasons: reasons.length === 0
      ? ['Chain is evidenced, reviewed, contiguous, and above threshold.']
      : reasons,
  }
}

/** Hard gate. Call before generating an agreement or submitting a claim. */
export function assertChainSubmittable(
  propertyId: string,
  links: readonly AuthorityLink[],
  threshold: number = DEFAULT_MINIMUM_CONFIDENCE,
): void {
  const evaluation = evaluateChain(links, threshold)
  if (!evaluation.submittable) {
    throw new AuthorityChainError(propertyId, evaluation.reasons)
  }
}

/**
 * The chain a claim of each shape must establish. Used to tell staff what is
 * still missing rather than only that something is.
 */
export function requiredLinks(shape: {
  ownerClass: 'individual' | 'entity' | 'multi_owner'
  ownerDeceased: boolean
  entityStatus?: EntityStatus
}): AuthorityLinkType[] {
  if (shape.ownerDeceased) {
    return ['decedent_death', 'heir_enumeration', 'individual_identity']
  }
  if (shape.ownerClass === 'entity') {
    const base: AuthorityLinkType[] = ['owner_name_to_entity', 'entity_status']
    // A merged entity needs an unbroken chain of title through the name changes.
    if (shape.entityStatus === 'merged') base.push('successor_entity')
    return [...base, 'authorized_signer', 'signer_identity']
  }
  return ['individual_identity']
}

export function missingLinks(
  present: readonly AuthorityLink[],
  required: readonly AuthorityLinkType[],
): AuthorityLinkType[] {
  const have = new Set(present.map((l) => l.linkType))
  return required.filter((t) => !have.has(t))
}

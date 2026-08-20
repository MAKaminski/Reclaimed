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
 * Shape of the claim, so the chain can be checked for COMPLETENESS and not
 * merely for internal consistency. Without this, a single `individual_identity`
 * link satisfies an entity-owned claim that actually needs four links.
 */
export interface ClaimShape {
  ownerClass: 'individual' | 'entity' | 'multi_owner'
  ownerDeceased: boolean
  entityStatus?: EntityStatus
}

/**
 * Validate one link's own integrity BEFORE it reaches any comparison.
 *
 * This exists because of a real fail-open. `Math.min(...links.map(l =>
 * l.confidence))` over a link whose `confidence` field is ABSENT yields NaN,
 * and `NaN < threshold` is false — so the chain passed the threshold test and
 * reported "Chain is evidenced, reviewed, contiguous, and above threshold."
 * A row selected without the column, or a JSON payload from a form, produced a
 * submittable chain out of nothing.
 *
 * Every field is now proven present and well-formed rather than assumed.
 */
function validateLinkIntegrity(links: readonly AuthorityLink[]): string[] {
  const problems: string[] = []

  links.forEach((link, index) => {
    const where = `link ${link.sequence ?? `#${index + 1}`}`

    if (typeof link.confidence !== 'number' || !Number.isFinite(link.confidence)) {
      problems.push(
        `${where} has no usable confidence value (got ${JSON.stringify(link.confidence)}). ` +
          'A missing confidence must never read as passing.',
      )
    } else if (link.confidence < 0 || link.confidence > 1) {
      problems.push(`${where} has confidence ${link.confidence}, outside [0,1].`)
    }

    // An evidence id that is null, undefined, or blank is NO EVIDENCE. The
    // original check compared against the empty string only.
    if (
      typeof link.evidenceDocumentId !== 'string' ||
      link.evidenceDocumentId.trim() === ''
    ) {
      problems.push(
        `${where} is asserted without an evidence document ` +
          `(got ${JSON.stringify(link.evidenceDocumentId)}). No link may be ` +
          'asserted without one.',
      )
    }

    if (typeof link.sequence !== 'number' || !Number.isInteger(link.sequence) || link.sequence < 1) {
      problems.push(`${where} has an invalid sequence ${JSON.stringify(link.sequence)}.`)
    }

    if (typeof link.assertedBy !== 'string' || link.assertedBy.trim() === '') {
      problems.push(`${where} records no asserting staff member.`)
    }
  })

  return problems
}

/**
 * Evaluate a chain. Pure — takes the links, returns the verdict.
 *
 * Fails CLOSED on malformed input: anything it cannot verify is a reason to
 * refuse, never a reason to pass.
 */
export function evaluateChain(
  links: readonly AuthorityLink[],
  threshold: number = DEFAULT_MINIMUM_CONFIDENCE,
  shape?: ClaimShape,
): ChainEvaluation {
  if (!Array.isArray(links) || links.length === 0) {
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

  // A threshold we cannot trust is a threshold that cannot gate anything.
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return {
      submittable: false,
      chainConfidence: null,
      threshold,
      requiresManualReview: true,
      reasons: [`Invalid chain threshold ${JSON.stringify(threshold)}; refusing to evaluate.`],
    }
  }

  const reasons: string[] = [...validateLinkIntegrity(links)]

  // Only compute a confidence once every link's own value is known good.
  const chainConfidence = reasons.length === 0
    // THE MINIMUM, NOT THE MEAN. One weak link is a weak chain.
    ? Math.min(...links.map((l) => l.confidence))
    : null

  if (links.some((l) => l.evidenceInvalidated === true)) {
    reasons.push('A link rests on evidence later invalidated (forged, superseded, or wrong).')
  }

  const rejected = links.filter((l) => l.reviewStatus === 'rejected').length
  if (rejected > 0) reasons.push(`${rejected} link(s) rejected on review.`)

  // Anything that is not explicitly 'reviewed' counts as unreviewed — an
  // unrecognised status must never read as approval.
  const unreviewed = links.filter((l) => l.reviewStatus !== 'reviewed' && l.reviewStatus !== 'rejected')
  if (unreviewed.length > 0) {
    reasons.push(`${unreviewed.length} link(s) never reviewed by a second person.`)
  }

  // SELF-REVIEW IS NOT REVIEW. The point of the second pair of eyes is that
  // they belong to someone else.
  const selfReviewed = links.filter(
    (l) => l.reviewStatus === 'reviewed' &&
      (l.reviewedBy === null || l.reviewedBy === undefined || l.reviewedBy === l.assertedBy),
  )
  if (selfReviewed.length > 0) {
    reasons.push(
      `${selfReviewed.length} link(s) were reviewed by the same person who ` +
        'asserted them, or by nobody. Self-review does not satisfy the ' +
        'second-person requirement.',
    )
  }

  // Sequence must be contiguous from 1: a gap means a step was skipped.
  const sequences = links.map((l) => l.sequence).sort((a, b) => a - b)
  if (!sequences.every((s, i) => s === i + 1)) {
    reasons.push('Chain sequence has a gap — a step was skipped.')
  }

  // Any entity status other than active blocks auto-progression. DOR publishes
  // NOTHING on dissolved or merged entity requirements — DOR-QUESTIONS #3.
  const nonActive = links
    .map((l) => l.entityStatus)
    .filter((s): s is EntityStatus => s !== null && s !== undefined && s !== 'active')
  const requiresManualReview = nonActive.length > 0
  if (requiresManualReview) {
    reasons.push(
      `Entity status ${[...new Set(nonActive)].join(', ')} is not active. DOR ` +
        'publishes NO dissolved/merged requirements (DOR-QUESTIONS #3); a named ' +
        'human must review.',
    )
  }

  // COMPLETENESS. Without this a lone individual_identity link satisfies an
  // entity-owned claim needing owner_name_to_entity → entity_status →
  // authorized_signer → signer_identity.
  if (shape !== undefined) {
    const missing = missingLinks(links, requiredLinks(shape))
    if (missing.length > 0) {
      reasons.push(
        `Chain is incomplete for a ${shape.ownerDeceased ? 'deceased-owner' : shape.ownerClass} ` +
          `claim. Missing: ${missing.join(', ')}.`,
      )
    }
  }

  if (chainConfidence !== null && chainConfidence < threshold) {
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
  shape?: ClaimShape,
): void {
  const evaluation = evaluateChain(links, threshold, shape)
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

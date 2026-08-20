/**
 * Claim submission.
 *
 * THERE IS NO CDR E-FILING PORTAL. Completed claims are emailed as PDFs to
 * ucp.cdr.claims@dor.ga.gov (addendums to the same address; registration to
 * ucp.cdr.registration@dor.ga.gov).
 *
 * So submission is modelled as an outbound email with an idempotency key and a
 * stored copy of the exact bytes sent. If DOR later disputes what it received,
 * the answer must be a retrieval, not a reconstruction.
 */

import { createHash } from 'node:crypto'
import { assertRegistered, type RegistrationState } from '@/lib/compliance/registration'
import { assertChainSubmittable, type AuthorityLink } from '@/lib/locate/authorityChain'
import type { Cents } from '@/lib/compliance/money'

export const DOR_CLAIMS_EMAIL = 'ucp.cdr.claims@dor.ga.gov'
export const DOR_REGISTRATION_EMAIL = 'ucp.cdr.registration@dor.ga.gov'
export const DOR_BACKGROUNDS_EMAIL = 'unclaimedpropertybackgrounds@dor.ga.gov'

/** § 44-12-220(b) and (d)(3). */
export const DECISION_WINDOW_DAYS = 90
export const PAYMENT_WINDOW_DAYS = 60
/** § 44-12-221 — appeal to Superior Court of Fulton County. */
export const APPEAL_WINDOW_DAYS = 90
/** § 44-12-221 — appeal route when DOR fails to act at all. */
export const NO_ACTION_APPEAL_DAYS = 180

export interface ClaimAttachment {
  filename: string
  bytes: Uint8Array
  contentType: string
}

export interface SubmitClaimInput {
  claimId: string
  agreementId: string
  propertyIds: readonly string[]
  attachments: readonly ClaimAttachment[]
  authorityLinks: readonly AuthorityLink[]
  /** Required on a UP-CDR4 purchase. § 44-12-224(d)(2). */
  isPurchaseAgreement: boolean
  proofOfPaymentAttached: boolean
  registration?: RegistrationState
}

export interface SubmissionEnvelope {
  idempotencyKey: string
  recipient: typeof DOR_CLAIMS_EMAIL
  subject: string
  body: string
  attachments: readonly ClaimAttachment[]
  /** Hash over the exact bytes of every attachment, in order. */
  payloadSha256: string
}

export class SubmissionBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubmissionBlockedError'
  }
}

/**
 * Deterministic from the claim and its exact payload. Re-submitting the SAME
 * bytes is a no-op; re-submitting DIFFERENT bytes produces a new key, which is
 * correct — a corrected claim is a new filing.
 */
export function idempotencyKey(claimId: string, payloadSha256: string): string {
  return `claim-${claimId}-${payloadSha256.slice(0, 16)}`
}

export function hashPayload(attachments: readonly ClaimAttachment[]): string {
  const hash = createHash('sha256')
  for (const attachment of attachments) {
    hash.update(attachment.filename, 'utf8')
    hash.update(attachment.bytes)
  }
  return hash.digest('hex')
}

export function buildSubmission(input: SubmitClaimInput): SubmissionEnvelope {
  // Registration gates claim filing as well as soliciting.
  assertRegistered('submit_claim', input.registration)

  if (input.attachments.length === 0) {
    throw new SubmissionBlockedError(
      'REFUSING TO SUBMIT: no attachments. A claim submitted without the ' +
        'agreement is void (UP-CDR2: "Claims that are submitted without this ' +
        'Agreement or with an incomplete Agreement are void").',
    )
  }

  // § 44-12-224(d)(2): a Purchase Agreement claim is VOID without proof of
  // payment to the seller FILED WITH THE CLAIM. Not "on request", not "later".
  if (input.isPurchaseAgreement && !input.proofOfPaymentAttached) {
    throw new SubmissionBlockedError(
      'REFUSING TO SUBMIT: a UP-CDR4 purchase claim requires proof of payment to ' +
        'the seller filed WITH the claim. § 44-12-224(d)(2) makes the claim VOID ' +
        'without it.',
    )
  }

  // "Complete" under § 44-12-220(g) means ENTITLEMENT ESTABLISHED. A fast
  // incomplete filing loses to a slower complete one, so this gate is not
  // merely defensive — it is how the conflicting-claims rule is won.
  assertChainSubmittable(input.propertyIds.join(','), input.authorityLinks)

  const payloadSha256 = hashPayload(input.attachments)

  return {
    idempotencyKey: idempotencyKey(input.claimId, payloadSha256),
    recipient: DOR_CLAIMS_EMAIL,
    subject: `Claimant's Designated Representative Claim — ${input.propertyIds.join(', ')}`,
    body: [
      'Please find attached a claim submitted by a registered Claimant\'s',
      'Designated Representative under O.C.G.A. § 44-12-224.',
      '',
      `Property ID(s): ${input.propertyIds.join(', ')}`,
      `Attachments: ${input.attachments.map((a) => a.filename).join(', ')}`,
    ].join('\n'),
    attachments: input.attachments,
    payloadSha256,
  }
}

export interface ClaimClocks {
  decisionDueAt: Date
  /** Available under § 44-12-221 if DOR simply fails to act. */
  noActionAppealAvailableAt: Date
}

export function computeClaimClocks(submittedAt: Date): ClaimClocks {
  const day = 86_400_000
  return {
    decisionDueAt: new Date(submittedAt.getTime() + DECISION_WINDOW_DAYS * day),
    noActionAppealAvailableAt: new Date(submittedAt.getTime() + NO_ACTION_APPEAL_DAYS * day),
  }
}

export function computePaymentDue(approvedAt: Date): Date {
  return new Date(approvedAt.getTime() + PAYMENT_WINDOW_DAYS * 86_400_000)
}

export function computeAppealDeadline(deniedAt: Date): Date {
  return new Date(deniedAt.getTime() + APPEAL_WINDOW_DAYS * 86_400_000)
}

/**
 * § 44-12-220(g) conflicting claims, ranked.
 *
 * Encoded because two consequences change how we operate:
 *   1. "Complete" means entitlement established, NOT submitted — so optimise
 *      the evidence step, never the submit button.
 *   2. Against a competing CDR, the LOWER FEE WINS outright. Fee percentage is
 *      therefore a per-claim strategic variable with a documented floor.
 */
export type ClaimantKind = 'claimant' | 'cdr' | 'buyer'

export interface CompetingClaim {
  kind: ClaimantKind
  completeAt: Date
  feePct: number | null
  agreementExecutedAt: Date | null
}

export function whoWins(a: CompetingClaim, b: CompetingClaim): CompetingClaim | 'tie' {
  const dayOf = (d: Date) => d.toISOString().slice(0, 10)

  // Rank 1: first COMPLETE claim.
  if (dayOf(a.completeAt) !== dayOf(b.completeAt)) {
    return a.completeAt < b.completeAt ? a : b
  }

  // Same day. Rank 3 first: a buyer beats a claimant or a CDR.
  if (a.kind === 'buyer' && b.kind !== 'buyer') return a
  if (b.kind === 'buyer' && a.kind !== 'buyer') return b

  // Rank 2: a claimant beats a CDR.
  if (a.kind === 'claimant' && b.kind === 'cdr') return a
  if (b.kind === 'claimant' && a.kind === 'cdr') return b

  // Rank 4: buyer v buyer — earliest executed agreement.
  if (a.kind === 'buyer' && b.kind === 'buyer') {
    if (a.agreementExecutedAt === null || b.agreementExecutedAt === null) return 'tie'
    if (a.agreementExecutedAt.getTime() === b.agreementExecutedAt.getTime()) return 'tie'
    return a.agreementExecutedAt < b.agreementExecutedAt ? a : b
  }

  // Rank 5: CDR v CDR — LOWEST FEE WINS; tie broken by earliest agreement.
  if (a.kind === 'cdr' && b.kind === 'cdr') {
    if (a.feePct !== null && b.feePct !== null && a.feePct !== b.feePct) {
      return a.feePct < b.feePct ? a : b
    }
    if (a.agreementExecutedAt !== null && b.agreementExecutedAt !== null &&
        a.agreementExecutedAt.getTime() !== b.agreementExecutedAt.getTime()) {
      return a.agreementExecutedAt < b.agreementExecutedAt ? a : b
    }
  }

  return 'tie'
}

/**
 * CLAIM SUBMISSION AND CLOCKS — build spec §6.4, §7.5.
 */

import { describe, expect, it } from 'vitest'
import {
  buildSubmission, idempotencyKey, hashPayload, whoWins,
  computeClaimClocks, computePaymentDue, computeAppealDeadline,
  DOR_CLAIMS_EMAIL, SubmissionBlockedError,
  DECISION_WINDOW_DAYS, PAYMENT_WINDOW_DAYS, NO_ACTION_APPEAL_DAYS,
  type SubmitClaimInput, type CompetingClaim,
} from '@/lib/claims/submit'
import type { AuthorityLink } from '@/lib/locate/authorityChain'
import type { RegistrationState } from '@/lib/compliance/registration'

const ACTIVE: RegistrationState = {
  status: 'active', registrationNumber: 'CDR-000123', expiresAt: new Date('2030-01-01'),
}

const CHAIN: AuthorityLink[] = [1, 2].map((sequence) => ({
  sequence, linkType: 'individual_identity' as const, fromRef: null, toRef: null,
  evidenceDocumentId: `doc-${sequence}`, evidenceInvalidated: false,
  confidence: 0.9, reviewStatus: 'reviewed' as const, entityStatus: null,
  assertedBy: 's1', reviewedBy: 's2',
}))

function submission(overrides: Partial<SubmitClaimInput> = {}): SubmitClaimInput {
  return {
    claimId: 'claim-1',
    agreementId: 'agr-1',
    propertyIds: ['GA0004821993'],
    attachments: [{ filename: 'UP-CDR2.pdf', bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }],
    authorityLinks: CHAIN,
    isPurchaseAgreement: false,
    proofOfPaymentAttached: false,
    registration: ACTIVE,
    ...overrides,
  }
}

describe('§6.4 submission is an email pipeline, not an API', () => {
  it('addresses the Unclaimed Property Section and nowhere else', () => {
    expect(buildSubmission(submission()).recipient).toBe(DOR_CLAIMS_EMAIL)
    expect(DOR_CLAIMS_EMAIL).toBe('ucp.cdr.claims@dor.ga.gov')
  })

  it('refuses to submit while unregistered', () => {
    const unregistered: RegistrationState = { status: 'unregistered', registrationNumber: null, expiresAt: null }
    expect(() => buildSubmission(submission({ registration: unregistered }))).toThrow()
  })

  it('refuses a claim with no attachments — an agreement-less claim is void', () => {
    expect(() => buildSubmission(submission({ attachments: [] })))
      .toThrow(SubmissionBlockedError)
  })

  it('refuses a UP-CDR4 purchase without proof of payment — § 44-12-224(d)(2)', () => {
    expect(() => buildSubmission(submission({
      isPurchaseAgreement: true, proofOfPaymentAttached: false,
    }))).toThrow(/VOID without it/)

    expect(() => buildSubmission(submission({
      isPurchaseAgreement: true, proofOfPaymentAttached: true,
    }))).not.toThrow()
  })

  it('refuses when the authority chain is not submittable', () => {
    expect(() => buildSubmission(submission({ authorityLinks: [] }))).toThrow()
  })
})

describe('§6.4 idempotency is over the exact bytes sent', () => {
  it('produces the same key for identical payloads', () => {
    expect(buildSubmission(submission()).idempotencyKey)
      .toBe(buildSubmission(submission()).idempotencyKey)
  })

  it('produces a DIFFERENT key when the payload changes — a correction is a new filing', () => {
    const original = buildSubmission(submission())
    const corrected = buildSubmission(submission({
      attachments: [{ filename: 'UP-CDR2.pdf', bytes: new Uint8Array([9, 9, 9]), contentType: 'application/pdf' }],
    }))
    expect(corrected.idempotencyKey).not.toBe(original.idempotencyKey)
  })

  it('hashes filenames as well as bytes, so a rename is a different payload', () => {
    const a = hashPayload([{ filename: 'a.pdf', bytes: new Uint8Array([1]), contentType: 'application/pdf' }])
    const b = hashPayload([{ filename: 'b.pdf', bytes: new Uint8Array([1]), contentType: 'application/pdf' }])
    expect(a).not.toBe(b)
  })

  it('derives the key from claim id and payload hash together', () => {
    expect(idempotencyKey('claim-1', 'abcdef0123456789ff')).toBe('claim-claim-1-abcdef0123456789')
  })
})

describe('statutory clocks', () => {
  const submitted = new Date('2026-08-20T00:00:00Z')

  it('runs the 90-day decision window from submission — § 44-12-220(b)', () => {
    expect(DECISION_WINDOW_DAYS).toBe(90)
    expect(computeClaimClocks(submitted).decisionDueAt.toISOString().slice(0, 10)).toBe('2026-11-18')
  })

  it('opens the no-action appeal route at 180 days — § 44-12-221', () => {
    expect(NO_ACTION_APPEAL_DAYS).toBe(180)
    expect(computeClaimClocks(submitted).noActionAppealAvailableAt.toISOString().slice(0, 10))
      .toBe('2027-02-16')
  })

  it('runs the 60-day payment window from approval — § 44-12-220(d)(3)', () => {
    expect(PAYMENT_WINDOW_DAYS).toBe(60)
    expect(computePaymentDue(new Date('2026-09-01T00:00:00Z')).toISOString().slice(0, 10))
      .toBe('2026-10-31')
  })

  it('runs the 90-day appeal window from denial', () => {
    expect(computeAppealDeadline(new Date('2026-09-01T00:00:00Z')).toISOString().slice(0, 10))
      .toBe('2026-11-30')
  })
})

describe('§7.5 conflicting claims — § 44-12-220(g)', () => {
  function claim(overrides: Partial<CompetingClaim> = {}): CompetingClaim {
    return {
      kind: 'cdr',
      completeAt: new Date('2026-09-01T10:00:00Z'),
      feePct: 30,
      agreementExecutedAt: new Date('2026-08-01T00:00:00Z'),
      ...overrides,
    }
  }

  it('rank 1: the first COMPLETE claim wins', () => {
    const earlier = claim({ completeAt: new Date('2026-09-01T00:00:00Z') })
    const later = claim({ completeAt: new Date('2026-09-05T00:00:00Z') })
    expect(whoWins(earlier, later)).toBe(earlier)
  })

  it('rank 2: same day, the CLAIMANT beats a CDR', () => {
    const owner = claim({ kind: 'claimant', feePct: null })
    const us = claim({ kind: 'cdr' })
    expect(whoWins(us, owner)).toBe(owner)
  })

  it('rank 3: same day, a BUYER beats a claimant or a CDR', () => {
    const buyer = claim({ kind: 'buyer', feePct: null })
    expect(whoWins(claim({ kind: 'claimant', feePct: null }), buyer)).toBe(buyer)
    expect(whoWins(claim({ kind: 'cdr' }), buyer)).toBe(buyer)
  })

  it('rank 4: buyer v buyer — earliest executed agreement', () => {
    const early = claim({ kind: 'buyer', feePct: null, agreementExecutedAt: new Date('2026-07-01') })
    const late = claim({ kind: 'buyer', feePct: null, agreementExecutedAt: new Date('2026-08-01') })
    expect(whoWins(late, early)).toBe(early)
  })

  it('rank 5: CDR v CDR — THE LOWER FEE WINS, outright', () => {
    // This is why fee_pct is a per-claim strategic variable and not a constant
    // pinned at 30. Pinning it is a decision to lose every contested claim.
    const cheaper = claim({ feePct: 22 })
    const dearer = claim({ feePct: 30 })
    expect(whoWins(dearer, cheaper)).toBe(cheaper)
  })

  it('rank 5 tiebreak: equal fees fall back to the earliest executed agreement', () => {
    const early = claim({ feePct: 25, agreementExecutedAt: new Date('2026-07-01') })
    const late = claim({ feePct: 25, agreementExecutedAt: new Date('2026-08-01') })
    expect(whoWins(late, early)).toBe(early)
  })

  it('reports a genuine tie rather than inventing a winner', () => {
    const identical = claim({ feePct: 25, agreementExecutedAt: new Date('2026-07-01') })
    expect(whoWins(identical, { ...identical })).toBe('tie')
  })

  it('a LATER-completing claim at a lower fee still LOSES on rank 1', () => {
    // "Complete" means entitlement established. Optimise the evidence step,
    // not the price — being cheap does not rescue being late.
    const fastExpensive = claim({ feePct: 30, completeAt: new Date('2026-09-01') })
    const slowCheap = claim({ feePct: 10, completeAt: new Date('2026-09-10') })
    expect(whoWins(slowCheap, fastExpensive)).toBe(fastExpensive)
  })
})

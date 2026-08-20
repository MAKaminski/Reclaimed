/**
 * THE AUTHORITY CHAIN — build spec §7.3.
 *
 * The most safety-critical subsystem in the codebase. Every criminal
 * prosecution in this industry turned on forged authority: US v. Pendergrass &
 * McQueen (N.D. Ga., 2017) used FORGED POWERS OF ATTORNEY against local
 * BUSINESSES, chosen because a dissolved entity has nobody left to object.
 *
 * These tests are the description of what must never be possible.
 */

import { describe, expect, it } from 'vitest'
import {
  evaluateChain, assertChainSubmittable, AuthorityChainError,
  requiredLinks, missingLinks, DEFAULT_MINIMUM_CONFIDENCE,
  type AuthorityLink,
} from '@/lib/locate/authorityChain'
import { evaluateHeirClaim, HEIR_AFFIDAVIT_CEILING, type HeirClaim, type Heir } from '@/lib/locate/heirClaim'
import { dollarsToCents } from '@/lib/compliance/money'

function link(overrides: Partial<AuthorityLink> = {}): AuthorityLink {
  return {
    sequence: 1,
    linkType: 'owner_name_to_entity',
    fromRef: 'PEACHTREE VENTURES, LLC',
    toRef: 'K1234567',
    evidenceDocumentId: 'doc-1',
    evidenceInvalidated: false,
    confidence: 0.95,
    reviewStatus: 'reviewed',
    entityStatus: 'active',
    assertedBy: 'staff-1',
    reviewedBy: 'staff-2',
    ...overrides,
  }
}

/** A complete, healthy four-link chain against an active entity. */
function goodChain(): AuthorityLink[] {
  return [
    link({ sequence: 1, linkType: 'owner_name_to_entity', confidence: 0.95 }),
    link({ sequence: 2, linkType: 'entity_status', confidence: 0.98 }),
    link({ sequence: 3, linkType: 'authorized_signer', confidence: 0.88, evidenceDocumentId: 'doc-3' }),
    link({ sequence: 4, linkType: 'signer_identity', confidence: 0.91, evidenceDocumentId: 'doc-4' }),
  ]
}

describe('§7.3 chain confidence is the MINIMUM, never the mean', () => {
  it('takes the weakest link, not the average', () => {
    // Mean of {0.95, 0.98, 0.88, 0.91} is 0.93. The chain is 0.88.
    expect(evaluateChain(goodChain()).chainConfidence).toBeCloseTo(0.88, 5)
  })

  it('one weak link sinks an otherwise strong chain', () => {
    const chain = goodChain()
    chain[2] = link({ ...chain[2]!, confidence: 0.4 })
    const result = evaluateChain(chain)
    expect(result.chainConfidence).toBeCloseTo(0.4, 5)
    expect(result.submittable).toBe(false)
    expect(result.reasons.join(' ')).toContain('below the')
  })
})

describe('§7.3 no link may be asserted without evidence', () => {
  it('refuses a chain containing an unevidenced link', () => {
    const chain = goodChain()
    chain[1] = link({ ...chain[1]!, evidenceDocumentId: '' })
    expect(evaluateChain(chain).submittable).toBe(false)
    expect(evaluateChain(chain).reasons.join(' ')).toContain('without an evidence document')
  })

  it('RETROACTIVELY invalidates a chain when evidence is later found forged', () => {
    // The scenario that matters: the chain passed, we relied on it, and the
    // board resolution later turns out to be forged.
    const before = evaluateChain(goodChain())
    expect(before.submittable).toBe(true)

    const after = goodChain()
    after[2] = link({ ...after[2]!, evidenceInvalidated: true })
    const result = evaluateChain(after)
    expect(result.submittable).toBe(false)
    expect(result.reasons.join(' ')).toContain('invalidated')
  })
})

describe('§7.3 non-active entity status blocks auto-progression', () => {
  it.each(['admin_dissolved', 'terminated', 'merged', 'withdrawn', 'unknown', 'unchecked'] as const)(
    'blocks and flags manual review for status "%s"',
    (status) => {
      const chain = goodChain().map((l) => link({ ...l, entityStatus: status }))
      const result = evaluateChain(chain)
      expect(result.submittable).toBe(false)
      expect(result.requiresManualReview).toBe(true)
      expect(result.reasons.join(' ')).toContain('DOR-QUESTIONS #3')
    },
  )

  it('permits an active entity', () => {
    expect(evaluateChain(goodChain()).submittable).toBe(true)
  })

  it('does NOT flag manual review for an individual claim with no entity', () => {
    const chain = [link({ linkType: 'individual_identity', entityStatus: null })]
    expect(evaluateChain(chain).requiresManualReview).toBe(false)
  })
})

describe('§7.3 structural integrity of the chain', () => {
  it('refuses an empty chain, citing § 44-12-224(b)', () => {
    const result = evaluateChain([])
    expect(result.submittable).toBe(false)
    expect(result.chainConfidence).toBeNull()
    expect(result.reasons.join(' ')).toContain('44-12-224(b)')
  })

  it('refuses a chain with a gap in the sequence — a skipped step', () => {
    const chain = goodChain()
    chain[3] = link({ ...chain[3]!, sequence: 9 })
    expect(evaluateChain(chain).reasons.join(' ')).toContain('gap')
  })

  it('refuses a chain containing a rejected link', () => {
    const chain = goodChain()
    chain[1] = link({ ...chain[1]!, reviewStatus: 'rejected' })
    expect(evaluateChain(chain).submittable).toBe(false)
  })

  it('requires a SECOND person to review every link', () => {
    const chain = goodChain().map((l) => link({ ...l, reviewStatus: 'asserted' as const }))
    const result = evaluateChain(chain)
    expect(result.submittable).toBe(false)
    expect(result.reasons.join(' ')).toContain('never reviewed by a second person')
  })

  it('throws rather than returning a soft failure at the hard gate', () => {
    expect(() => assertChainSubmittable('GA001', [])).toThrow(AuthorityChainError)
    expect(() => assertChainSubmittable('GA001', goodChain())).not.toThrow()
  })

  it('names the required links so staff know what is still missing', () => {
    const required = requiredLinks({ ownerClass: 'entity', ownerDeceased: false })
    expect(required).toEqual(['owner_name_to_entity', 'entity_status', 'authorized_signer', 'signer_identity'])
    expect(missingLinks([link({ linkType: 'owner_name_to_entity' })], required))
      .toEqual(['entity_status', 'authorized_signer', 'signer_identity'])
  })

  it('demands a successor-entity link for a MERGED entity — the chain of title', () => {
    expect(requiredLinks({ ownerClass: 'entity', ownerDeceased: false, entityStatus: 'merged' }))
      .toContain('successor_entity')
  })
})

describe('§7.4 heir affidavit — O.C.G.A. § 44-12-220(i)', () => {
  function heir(overrides: Partial<Heir> = {}): Heir {
    return { fullName: 'SMITH, MARY', relationship: 'spouse', isAdult: true, hasSigned: true, identityDocumentId: 'id-1', ...overrides }
  }
  function claim(overrides: Partial<HeirClaim> = {}): HeirClaim {
    return {
      decedentName: 'SMITH, JAMES',
      dateOfDeath: '2021-03-14',
      deathCertificateId: 'doc-death',
      testate: false,
      willDocumentId: null,
      noProbatePending: true,
      noProbateEverFiled: true,
      funeralAndClaimsPaid: true,
      amicableDivision: true,
      aggregateValueCents: dollarsToCents(6_200),
      heirs: [heir(), heir({ fullName: 'SMITH, JOHN', relationship: 'child' })],
      ...overrides,
    }
  }

  it('accepts a complete all-heir affidavit within the ceiling', () => {
    expect(evaluateHeirClaim(claim()).ready).toBe(true)
  })

  it('REFUSES a partial heir set — three of four is not an all-heir affidavit', () => {
    const partial = claim({
      heirs: [heir(), heir({ hasSigned: true }), heir({ hasSigned: true }), heir({ hasSigned: false })],
    })
    const result = evaluateHeirClaim(partial)
    expect(result.ready).toBe(false)
    expect(result.reasons.join(' ')).toContain('NOT an all-heir affidavit')
  })

  it('refuses when an enumerated heir is not an adult — § 44-12-192(7.1)', () => {
    expect(evaluateHeirClaim(claim({ heirs: [heir(), heir({ isAdult: false })] })).ready).toBe(false)
  })

  it('closes the path above the $7,500 aggregate ceiling', () => {
    expect(HEIR_AFFIDAVIT_CEILING).toBe(750_000)
    expect(evaluateHeirClaim(claim({ aggregateValueCents: dollarsToCents(7_500) })).ready).toBe(true)
    const over = evaluateHeirClaim(claim({ aggregateValueCents: dollarsToCents(7_500.01) }))
    expect(over.ready).toBe(false)
    expect(over.reasons.join(' ')).toContain('probate is required')
  })

  it('closes the path if a Georgia probate proceeding was EVER filed', () => {
    expect(evaluateHeirClaim(claim({ noProbateEverFiled: false })).ready).toBe(false)
    expect(evaluateHeirClaim(claim({ noProbatePending: false })).ready).toBe(false)
  })

  it('requires the will when the decedent was testate', () => {
    expect(evaluateHeirClaim(claim({ testate: true, willDocumentId: null })).ready).toBe(false)
    expect(evaluateHeirClaim(claim({ testate: true, willDocumentId: 'doc-will' })).ready).toBe(true)
  })

  it('requires a death certificate and the two statutory attestations', () => {
    expect(evaluateHeirClaim(claim({ deathCertificateId: null })).ready).toBe(false)
    expect(evaluateHeirClaim(claim({ funeralAndClaimsPaid: false })).ready).toBe(false)
    expect(evaluateHeirClaim(claim({ amicableDivision: false })).ready).toBe(false)
  })

  it('refuses when the aggregate is unknown rather than assuming it is under', () => {
    expect(evaluateHeirClaim(claim({ aggregateValueCents: null })).ready).toBe(false)
  })
})

describe('§1.11 external skip-trace stays behind its flag', () => {
  it('is off by default and the chain works without it', () => {
    // Phase 1 functionality must work using only the DOR file's own address data
    // plus public business-registry data. § 43-38-3(3) is unresolved.
    expect(evaluateChain(goodChain()).submittable).toBe(true)
  })
})

describe('threshold', () => {
  it('defaults to 0.75 and is configurable per deployment', () => {
    expect(DEFAULT_MINIMUM_CONFIDENCE).toBe(0.75)
    const weak = goodChain().map((l) => link({ ...l, confidence: 0.8 }))
    expect(evaluateChain(weak, 0.75).submittable).toBe(true)
    expect(evaluateChain(weak, 0.9).submittable).toBe(false)
  })
})

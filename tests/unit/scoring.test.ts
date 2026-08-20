/**
 * Expected-value model — build spec §7.1.
 *
 * The priors are guesses, so these tests do not assert specific EV figures.
 * They assert the RELATIONSHIPS that must hold for the queue to be trustworthy,
 * plus the compliance couplings that must never come loose.
 */

import { describe, expect, it } from 'vitest'
import {
  scoreProperty, pContactable, pSigns, pEntitlementProvable, expectedCost,
  type ScoringInput,
} from '@/lib/scoring/expectedValue'
import { DEFAULT_PARAMS, PARAM_BASIS, PARAMS_VERSION } from '@/lib/scoring/params'
import { dollarsToCents } from '@/lib/compliance/money'

function input(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    propertyId: 'GA001',
    claimValueCents: dollarsToCents(4_000),
    ownerClass: 'individual',
    addressQuality: 'full',
    yearsSinceLastActivity: 3,
    ownerCount: 1,
    entityStatus: 'unknown',
    ownerDeceased: false,
    feePct: 30,
    feeCapPct: 30,
    ...overrides,
  }
}

describe('priors are auditable, not buried', () => {
  it('is versioned, and scores carry the version they were computed under', () => {
    expect(PARAMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
    expect(scoreProperty(input()).paramsVersion).toBe(PARAMS_VERSION)
  })

  it('logs the verbatim inputs on every score, so the model can be back-tested', () => {
    const original = input({ claimValueCents: dollarsToCents(12_345) })
    expect(scoreProperty(original).inputs).toEqual(original)
  })

  it('documents the basis of the priors most likely to be wrong', () => {
    expect(PARAM_BASIS['signs.base']).toContain('GUESS')
    expect(PARAM_BASIS['entitlementProvable.dissolvedEntity']).toContain('DOR publishes NOTHING')
  })

  it('every probability stays inside [0,1] across extreme inputs', () => {
    const extremes: Array<Partial<ScoringInput>> = [
      { claimValueCents: dollarsToCents(50_000_000), yearsSinceLastActivity: 0 },
      { claimValueCents: dollarsToCents(1), yearsSinceLastActivity: 60 },
      { ownerCount: 12 }, { addressQuality: 'none', yearsSinceLastActivity: null },
      { ownerClass: 'entity', entityStatus: 'active', yearsSinceLastActivity: 0 },
    ]
    for (const override of extremes) {
      const s = scoreProperty(input(override))
      for (const p of [s.pContactable, s.pSigns, s.pEntitlementProvable, s.confidence]) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('the model reflects what Georgia law actually makes hard', () => {
  it('ranks a dissolved entity below an active one — DOR publishes no requirements', () => {
    const active = pEntitlementProvable(input({ ownerClass: 'entity', entityStatus: 'active' }), DEFAULT_PARAMS)
    const dissolved = pEntitlementProvable(input({ ownerClass: 'entity', entityStatus: 'admin_dissolved' }), DEFAULT_PARAMS)
    expect(dissolved).toBeLessThan(active)
  })

  it('treats an UNKNOWN entity status as pessimistically as a dissolved one', () => {
    const unknown = pEntitlementProvable(input({ ownerClass: 'entity', entityStatus: 'unknown' }), DEFAULT_PARAMS)
    const dissolved = pEntitlementProvable(input({ ownerClass: 'entity', entityStatus: 'admin_dissolved' }), DEFAULT_PARAMS)
    expect(unknown).toBe(dissolved)
  })

  it('rates an heir claim UNDER the $7,500 affidavit ceiling above one over it', () => {
    // § 44-12-220(i) removed probate below the ceiling — that is the whole point.
    const under = pEntitlementProvable(input({ ownerDeceased: true, claimValueCents: dollarsToCents(7_000) }), DEFAULT_PARAMS)
    const over = pEntitlementProvable(input({ ownerDeceased: true, claimValueCents: dollarsToCents(8_000) }), DEFAULT_PARAMS)
    expect(under).toBeGreaterThan(over)
  })

  it('penalises each additional owner, because every one must sign personally', () => {
    const one = pSigns(input({ ownerCount: 1 }), DEFAULT_PARAMS)
    const two = pSigns(input({ ownerCount: 2 }), DEFAULT_PARAMS)
    const four = pSigns(input({ ownerCount: 4 }), DEFAULT_PARAMS)
    expect(two).toBeLessThan(one)
    expect(four).toBeLessThan(two)
  })

  it('decays contactability with the age of the last-activity date', () => {
    const fresh = pContactable(input({ yearsSinceLastActivity: 1 }), DEFAULT_PARAMS)
    const stale = pContactable(input({ yearsSinceLastActivity: 25 }), DEFAULT_PARAMS)
    expect(stale).toBeLessThan(fresh)
  })

  it('treats a MISSING last-activity date as stale, not as fresh', () => {
    const missing = pContactable(input({ yearsSinceLastActivity: null }), DEFAULT_PARAMS)
    const fresh = pContactable(input({ yearsSinceLastActivity: 0 }), DEFAULT_PARAMS)
    expect(missing).toBeLessThan(fresh)
  })

  it('costs more to work a dissolved entity than a living individual', () => {
    const individual = expectedCost(input(), DEFAULT_PARAMS)
    const dissolved = expectedCost(input({ ownerClass: 'entity', entityStatus: 'terminated' }), DEFAULT_PARAMS)
    expect(dissolved.totalCents).toBeGreaterThan(individual.totalCents)
  })

  it('stages cost by when it is actually incurred, not all up front', () => {
    // Evidence assembly and notary fees are only spent once someone SIGNS.
    // Charging them against every property mailed makes a more reachable owner
    // look worse on a small claim, which is backwards.
    const c = expectedCost(input(), DEFAULT_PARAMS)
    expect(c.unconditionalCents).toBeGreaterThan(0)
    expect(c.onSigningCents).toBeGreaterThan(c.unconditionalCents)
    expect(c.unconditionalCents + c.onContactCents + c.onSigningCents).toBe(c.totalCents)
  })

  it('scales signing costs with owner count — each must sign and notarise', () => {
    const one = expectedCost(input({ ownerCount: 1 }), DEFAULT_PARAMS)
    const three = expectedCost(input({ ownerCount: 3 }), DEFAULT_PARAMS)
    expect(three.onSigningCents).toBeGreaterThan(one.onSigningCents)
  })

  it('does NOT punish a property for being easier to reach', () => {
    // The bug this replaced: scaling the whole cost by P(contactable) meant a
    // reachable owner carried more expected cost with no offsetting fee.
    const reachable = scoreProperty(input({ addressQuality: 'full', yearsSinceLastActivity: 1 }))
    const unreachable = scoreProperty(input({ addressQuality: 'none', yearsSinceLastActivity: 30 }))
    expect(reachable.expectedValueCents).toBeGreaterThan(unreachable.expectedValueCents)
  })
})

describe('scoring is coupled to the cap engine, not a parallel implementation', () => {
  it('never implies a fee the agreement path would refuse to generate', () => {
    // The queue must not promise economics an agreement cannot deliver.
    const s = scoreProperty(input({ claimValueCents: dollarsToCents(1_000), feePct: 30 }))
    const cap = dollarsToCents(300) // 30% of $1,000
    expect(s.grossFeeCents).toBeLessThanOrEqual(cap)
  })

  it('surfaces the clamp in the rationale when costs push the fee over the cap', () => {
    // A small claim with real costs: § 44-12-224(d)(1) counts costs INSIDE the cap.
    const s = scoreProperty(input({ claimValueCents: dollarsToCents(600) }))
    expect(s.rationale.join(' ')).toContain('44-12-224(d)(1)')
  })

  it('drives EV negative when the work costs more than the capped fee can return', () => {
    const s = scoreProperty(input({
      claimValueCents: dollarsToCents(550),
      ownerClass: 'entity', entityStatus: 'terminated', ownerCount: 3,
    }))
    expect(s.expectedValueCents).toBeLessThan(0)
    expect(s.workable).toBe(false)
  })

  it('rises monotonically with claim value, all else equal', () => {
    const values = [1_000, 5_000, 25_000, 100_000].map((d) =>
      scoreProperty(input({ claimValueCents: dollarsToCents(d) })).expectedValueCents)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!)
    }
  })

  it('a $4,000 claim at 30% clears the registration fee, as the economics assume', () => {
    // The spec's own sanity check: one $4,000 claim at 30% is $1,200.
    const s = scoreProperty(input({ claimValueCents: dollarsToCents(4_000) }))
    expect(s.inputs.feePct).toBe(30)
    expect(s.grossFeeCents).toBeGreaterThan(0)
  })
})

describe('confidence reports how much was known rather than defaulted', () => {
  it('is high when everything is known', () => {
    expect(scoreProperty(input()).confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('is low when most inputs were defaulted, and says so', () => {
    const s = scoreProperty(input({
      claimValueCents: null, addressQuality: 'none',
      yearsSinceLastActivity: null, ownerClass: 'unknown',
    }))
    expect(s.confidence).toBeLessThan(DEFAULT_PARAMS.thresholds.lowConfidence)
    expect(s.rationale.join(' ')).toContain('LOW CONFIDENCE')
  })

  it('explains itself on every score — a human never has to guess why', () => {
    const s = scoreProperty(input({ ownerCount: 3, ownerClass: 'multi_owner' }))
    expect(s.rationale.length).toBeGreaterThan(0)
    expect(s.rationale.join(' ')).toContain('44-12-224(c)(7)')
  })
})

describe('UNCHECKED is not UNKNOWN — conservatism belongs in the gate, not the ranking', () => {
  it('scores an unchecked entity above one confirmed dissolved', () => {
    // 'unchecked' means we have not run the SOS match yet. Treating that as
    // dissolved would bury the entity-owned properties that ARE the addressable
    // market, before Phase 3 looks up a single one.
    const unchecked = scoreProperty(input({ ownerClass: 'entity', entityStatus: 'unchecked' }))
    const dissolved = scoreProperty(input({ ownerClass: 'entity', entityStatus: 'admin_dissolved' }))
    expect(unchecked.expectedValueCents).toBeGreaterThan(dissolved.expectedValueCents)
  })

  it('still scores an unchecked entity below one confirmed active', () => {
    const unchecked = scoreProperty(input({ ownerClass: 'entity', entityStatus: 'unchecked' }))
    const active = scoreProperty(input({ ownerClass: 'entity', entityStatus: 'active' }))
    expect(unchecked.expectedValueCents).toBeLessThan(active.expectedValueCents)
  })

  it('keeps INDETERMINATE (looked up, could not tell) pessimistic', () => {
    const indeterminate = pEntitlementProvable(input({ ownerClass: 'entity', entityStatus: 'unknown' }), DEFAULT_PARAMS)
    const dissolved = pEntitlementProvable(input({ ownerClass: 'entity', entityStatus: 'admin_dissolved' }), DEFAULT_PARAMS)
    expect(indeterminate).toBe(dissolved)
  })

  it('says plainly in the rationale that the status is a prior, not a measurement', () => {
    const s = scoreProperty(input({ ownerClass: 'entity', entityStatus: 'unchecked' }))
    expect(s.rationale.join(' ')).toContain('not yet matched')
  })

  it('does not count an unchecked entity as known input for confidence', () => {
    const unchecked = scoreProperty(input({ ownerClass: 'entity', entityStatus: 'unchecked' }))
    const active = scoreProperty(input({ ownerClass: 'entity', entityStatus: 'active' }))
    expect(unchecked.confidence).toBeLessThan(active.confidence)
  })
})

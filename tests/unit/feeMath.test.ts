/**
 * Property-based tests for the fee cap — build spec §10.2.
 *
 * Over randomised inputs, assert the invariant that actually matters:
 *   total fees AND costs <= 30% of min(claimedAmount, propertyValue)
 * always holds, and no float ever creeps into the arithmetic.
 */

import { describe, expect, it } from 'vitest'
import { computeFee, computePathBSplit, assertFeeAgreementEligible } from '@/lib/compliance/computeFee'
import { cents, dollarsToCents, percentOf, formatUsd, formatAmount, type Cents } from '@/lib/compliance/money'
import { getStateRules } from '@/lib/compliance/stateRules'

const CAP = getStateRules('GA').feeCapPct as number

/** Deterministic PRNG so a failure is reproducible from the seed. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260820)
const randCents = (maxDollars: number): Cents =>
  cents(Math.floor(rand() * maxDollars * 100))

describe('fee cap invariant holds over 20,000 randomised inputs', () => {
  it('total fees and costs never exceed 30% of min(claimed, value)', () => {
    for (let i = 0; i < 20_000; i++) {
      const claimedAmount = randCents(250_000)
      const hasValue = rand() > 0.2
      const propertyValue = hasValue ? randCents(250_000) : null
      const costs = randCents(2_000)
      const requestedFeePct = rand() * 60 // deliberately includes over-cap requests

      const r = computeFee({ claimedAmount, propertyValue, costs, requestedFeePct, feeCapPct: CAP })

      const expectedBasis =
        propertyValue === null ? claimedAmount : Math.min(claimedAmount, propertyValue)
      const ceiling = percentOf(cents(expectedBasis), CAP)

      expect(r.capBasis, `basis at i=${i}`).toBe(expectedBasis)
      expect(r.feeDollars, `fee ${r.feeDollars} > ceiling ${ceiling} at i=${i}`)
        .toBeLessThanOrEqual(ceiling)
      expect(r.feeExcludingCosts + r.costs).toBe(r.feeDollars)
      expect(Number.isInteger(r.feeDollars), `integer cents at i=${i}`).toBe(true)
      expect(Number.isInteger(r.netToClaimant)).toBe(true)
    }
  })

  it('an over-cap request always sets capBinding and clamps to exactly the ceiling', () => {
    for (let i = 0; i < 5_000; i++) {
      const amount = cents(Math.floor(rand() * 5_000_000) + 100)
      const r = computeFee({
        claimedAmount: amount, propertyValue: amount, costs: cents(0),
        requestedFeePct: CAP + 1 + rand() * 40, feeCapPct: CAP,
      })
      expect(r.capBinding).toBe(true)
      expect(r.feeDollars).toBe(percentOf(amount, CAP))
    }
  })

  it('a within-cap request is never clamped', () => {
    for (let i = 0; i < 5_000; i++) {
      const amount = cents(Math.floor(rand() * 5_000_000) + 100_000)
      const pct = rand() * (CAP - 1)
      const r = computeFee({
        claimedAmount: amount, propertyValue: amount, costs: cents(0),
        requestedFeePct: pct, feeCapPct: CAP,
      })
      expect(r.capBinding).toBe(false)
      expect(r.feeDollars).toBe(percentOf(amount, pct))
    }
  })

  it('claimant net plus our total always reconstructs the claimed amount', () => {
    for (let i = 0; i < 5_000; i++) {
      const claimedAmount = randCents(100_000)
      const r = computeFee({
        claimedAmount, propertyValue: claimedAmount, costs: randCents(500),
        feeCapPct: CAP,
      })
      expect(r.netToClaimant + r.feeDollars).toBe(claimedAmount)
    }
  })

  it('assertFeeAgreementEligible accepts every clamped computation', () => {
    for (let i = 0; i < 5_000; i++) {
      const claimedAmount = cents(Math.floor(rand() * 1_000_000) + 50_000)
      const r = computeFee({
        claimedAmount, propertyValue: claimedAmount, costs: randCents(300),
        requestedFeePct: rand() * 60, feeCapPct: CAP,
      })
      expect(() => assertFeeAgreementEligible(r, CAP)).not.toThrow()
    }
  })
})

describe('Path B percentages sum to exactly 100 over randomised inputs', () => {
  it('B1 + B2 === 100 for every representable fee percentage', () => {
    for (let i = 0; i < 10_000; i++) {
      const pct = rand() * CAP
      const { cdrPct, claimantPct } = computePathBSplit(pct, CAP)
      expect(cdrPct + claimantPct, `B1+B2 at pct=${pct}`).toBe(100)
      expect(cdrPct).toBeLessThanOrEqual(CAP)
      expect(cdrPct).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('money primitives refuse anything that is not integer cents', () => {
  it('rejects a float', () => {
    expect(() => cents(10.5)).toThrow(TypeError)
  })

  it('rejects NaN and Infinity', () => {
    expect(() => cents(Number.NaN)).toThrow(TypeError)
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })

  it('converts dollars without float drift on the classic cases', () => {
    expect(dollarsToCents(0.1 + 0.2)).toBe(30)
    // 1.005 is stored as 1.00499999...; naive Math.round(d*100) yields 100.
    expect(dollarsToCents(1.005)).toBe(101)
    expect(dollarsToCents(2.675)).toBe(268)
    expect(dollarsToCents(4_000)).toBe(400_000)
  })

  it('accepts an exact decimal string, which is the preferred input', () => {
    expect(dollarsToCents('1234.56')).toBe(123_456)
    expect(dollarsToCents('$1,234.56')).toBe(123_456)
    expect(dollarsToCents('0.005')).toBe(1)
    expect(dollarsToCents('0.004')).toBe(0)
    expect(dollarsToCents('-42.50')).toBe(-4_250)
    expect(dollarsToCents('7')).toBe(700)
  })

  it('refuses an unparseable amount rather than guessing', () => {
    expect(() => dollarsToCents('twelve dollars')).toThrow(TypeError)
    expect(() => dollarsToCents('1.2.3')).toThrow(TypeError)
  })

  it('rounds percentages DOWN, so the cap can only be approached from below', () => {
    // 33 cents at 30% is 9.9 cents; rounding up would breach the ceiling.
    expect(percentOf(cents(33), 30)).toBe(9)
  })

  it('formats for the DOR forms', () => {
    expect(formatUsd(cents(400_000))).toBe('$4,000.00')
    expect(formatUsd(cents(5))).toBe('$0.05')
    expect(formatUsd(cents(120_050))).toBe('$1,200.50')
  })
})

describe('form-field amount formatting', () => {
  it('omits the currency symbol, because the DOR cell prints its own', () => {
    // Emitting "$" here renders "$ $63,825.50" on a document DOR reviews.
    expect(formatAmount(cents(6_382_550))).toBe('63,825.50')
    expect(formatAmount(cents(5))).toBe('0.05')
    expect(formatUsd(cents(6_382_550))).toBe('$63,825.50')
  })
})

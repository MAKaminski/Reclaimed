/**
 * THE COMPLIANCE SUITE.
 *
 * One named test per §1 guardrail, each citing the statute it enforces. This
 * suite is a distinct, always-green gate: `pnpm test:compliance`.
 *
 * If you are here because a test failed, do not weaken the test. Every
 * assertion below maps to a sanctionable act under O.C.G.A. § 44-12-239.2 at up
 * to $2,000 PER ACT, with revocation and referral to the Attorney General.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { computeFee, assertFeeAgreementEligible, computePathBSplit } from '@/lib/compliance/computeFee'
import { cents, dollarsToCents } from '@/lib/compliance/money'
import {
  SOLICITATION_LEGEND_GA,
  requiredLegendPointSize,
  isLegendVerified,
  assertLegendUsable,
  LegendUnverifiedError,
  renderLegend,
  legendSha256,
} from '@/lib/compliance/legend'
import { assertBrandCompliant, checkBrandString, BrandGuardError } from '@/lib/compliance/brandGuard'
import {
  assertRegistered,
  checkRegistration,
  NotRegisteredError,
  readRegistrationState,
  type RegistrationState,
} from '@/lib/compliance/registration'
import { computeEnforceability, windowAppliesToAgreement } from '@/lib/compliance/windows'
import { assertHostAllowed, isBlockedHost, BlockedHostError } from '@/lib/compliance/blockedHosts'
import { getStateRules, UnverifiedStateRulesError, UnknownStateError } from '@/lib/compliance/stateRules'
import { CHANNEL_POLICY, assertChannelPermitted, isWithinCallingWindow } from '@/lib/compliance/channels'
import { ENABLE_EXTERNAL_SKIPTRACE, isFlagEnabled } from '@/lib/compliance/featureFlags'

const GA = getStateRules('GA')
const CAP = GA.feeCapPct as number

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.1 NO ADVANCE FEES — O.C.G.A. § 44-12-239.2(a)(12)', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

  const BANNED = [
    'stripe', '@stripe/stripe-js', '@stripe/react-stripe-js',
    'braintree', 'square', '@paypal/checkout-server-sdk', 'paypal-rest-sdk',
    'razorpay', 'adyen', '@lemonsqueezy/lemonsqueezy.js', 'paddle-sdk',
  ]

  it('ships no payment SDK, because receipt OR SOLICITATION of advance consideration is prohibited', () => {
    const installed = { ...pkg.dependencies, ...pkg.devDependencies }
    const found = BANNED.filter((name) => name in installed)
    expect(
      found,
      `Payment SDK(s) ${found.join(', ')} present. § 44-12-239.2(a)(12) bans ` +
        '"receipt or SOLICITATION of consideration to be paid in advance of the ' +
        'approval of a claim". There is no payments integration in v1. Revenue is ' +
        'a paper check from DOR, modelled as an expected_receipt.',
    ).toEqual([])
  })

  it('records that advance fees are impermissible in the GA rules', () => {
    expect(GA.advanceFeesPermitted).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.2 MANDATORY SOLICITATION LEGEND — O.C.G.A. § 44-12-239(f)', () => {
  it('holds the legend at its exact byte length so a silent edit fails the build', () => {
    expect(Buffer.byteLength(SOLICITATION_LEGEND_GA, 'utf8')).toBe(192)
  })

  it('holds the legend at its exact sha256 so a silent edit fails the build', () => {
    expect(legendSha256()).toBe(
      'c7ec9f78253442b54183c57ba33e670b83ebaa791e15f90a1219ecb872c8e7c2',
    )
  })

  it('is entirely upper case, as the statute requires', () => {
    expect(SOLICITATION_LEGEND_GA).toBe(SOLICITATION_LEGEND_GA.toUpperCase())
  })

  it('states all three required disclosures', () => {
    expect(SOLICITATION_LEGEND_GA).toContain('THIS IS A SOLICITATION')
    expect(SOLICITATION_LEGEND_GA).toContain('HAS NOT BEEN SENT BY THE STATE OF GEORGIA')
    expect(SOLICITATION_LEGEND_GA).toContain('YOU ARE NOT REQUIRED TO USE THE SERVICES')
  })

  it('computes the point size as max(12, body+1) — "WHICHEVER IS LARGER" is not a constant', () => {
    expect(requiredLegendPointSize(8)).toBe(12)   // floor applies
    expect(requiredLegendPointSize(10)).toBe(12)  // floor applies
    expect(requiredLegendPointSize(12)).toBe(13)  // must EXCEED the body, not match it
    expect(requiredLegendPointSize(14)).toBe(15)  // 12pt here would be non-compliant
    expect(requiredLegendPointSize(24)).toBe(25)
  })

  it('never returns a size merely equal to the body font', () => {
    for (let body = 1; body <= 72; body++) {
      expect(requiredLegendPointSize(body)).toBeGreaterThan(body)
    }
  })

  it('FAILS CLOSED: rendering throws while the legend is not byte-verified', () => {
    // Until `pnpm verify:legend` attests the string against a primary source,
    // every outbound render path must refuse. One wrong word makes the notice
    // non-compliant, and we cannot yet prove the wording.
    if (!isLegendVerified()) {
      expect(() => assertLegendUsable()).toThrow(LegendUnverifiedError)
      expect(() => renderLegend(12)).toThrow(LegendUnverifiedError)
    } else {
      expect(renderLegend(12)).toMatchObject({ pointSizePt: 13, allCaps: true })
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.3 NAME AND BRAND RESTRICTION — O.C.G.A. § 44-12-239(g)', () => {
  it('rejects names implying a government agency', () => {
    expect(() => assertBrandCompliant({ entityName: 'Georgia Recovery Bureau' })).toThrow(BrandGuardError)
    expect(() => assertBrandCompliant({ entityName: 'State of Georgia Asset Division' })).toThrow(BrandGuardError)
    expect(() => assertBrandCompliant({ dba: 'National Treasury Recovery' })).toThrow(BrandGuardError)
    expect(() => assertBrandCompliant({ domains: ['unclaimed.gov.co'] })).toThrow(BrandGuardError)
  })

  it('catches denied terms hidden behind separators and casing', () => {
    expect(checkBrandString('georgia-revenue-recovery', 'domain')).not.toHaveLength(0)
    expect(checkBrandString('GeorgiaRecovery', 'entity_name')).not.toHaveLength(0)
    expect(checkBrandString('Georgia_Official_Claims', 'dba')).not.toHaveLength(0)
  })

  it('permits a neutral private brand', () => {
    expect(() =>
      assertBrandCompliant({
        entityName: 'Reclaimed Holdings LLC',
        dba: 'Reclaimed',
        domains: ['reclaimed.example'],
        emailFromNames: ['Reclaimed Claims Team'],
      }),
    ).not.toThrow()
  })

  it('requires a substantive written justification before honouring an override', () => {
    const thin = [{ value: 'Georgia Recovery', term: 'georgia', justification: 'ok', approvedBy: 'MK', approvedAt: '2026-08-20' }]
    expect(checkBrandString('Georgia Recovery', 'entity_name', thin)).not.toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.4 NO SOLICITATION BEFORE REGISTRATION — O.C.G.A. § 44-12-239.2(a)(10)', () => {
  const active = (over: Partial<RegistrationState> = {}): RegistrationState => ({
    status: 'active',
    registrationNumber: 'CDR-0001',
    expiresAt: new Date('2030-01-01'),
    ...over,
  })

  it('DEFAULTS TO UNREGISTERED so a fresh clone cannot send', () => {
    const state = readRegistrationState({})
    expect(state.status).toBe('unregistered')
    expect(state.registrationNumber).toBeNull()
  })

  it('blocks every gated action while unregistered', () => {
    const state = active({ status: 'unregistered' })
    for (const action of ['solicit', 'generate_agreement', 'submit_claim', 'receive_data'] as const) {
      expect(() => assertRegistered(action, state)).toThrow(NotRegisteredError)
    }
  })

  it('blocks soliciting while merely pending, suspended, or revoked', () => {
    for (const status of ['pending', 'suspended', 'revoked'] as const) {
      expect(() => assertRegistered('solicit', active({ status }))).toThrow(NotRegisteredError)
    }
  })

  it('blocks soliciting on an expired registration', () => {
    const expired = active({ expiresAt: new Date('2020-01-01') })
    expect(() => assertRegistered('solicit', expired)).toThrow(NotRegisteredError)
  })

  it('refuses to generate an agreement without a CDR Identification Number — § 44-12-224(c)(6)', () => {
    const noNumber = active({ registrationNumber: null })
    expect(() => assertRegistered('generate_agreement', noNumber)).toThrow(NotRegisteredError)
    // ...but soliciting is permissible once registration itself is active.
    expect(() => assertRegistered('solicit', noNumber)).not.toThrow()
  })

  it('permits gated actions only when active, unexpired, and numbered', () => {
    expect(checkRegistration('generate_agreement', active()).permitted).toBe(true)
  })

  it('refuses to interpret an unrecognised status as permissive', () => {
    expect(() =>
      readRegistrationState({ CDR_REGISTRATION_STATUS: 'totally-fine' }),
    ).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.5 THE FEE CAP IS COMPUTED — O.C.G.A. § 44-12-224(d)(1)', () => {
  it('uses min(claimedAmount, propertyValue) as the basis — "WHICHEVER IS LOWER"', () => {
    const r = computeFee({
      claimedAmount: dollarsToCents(10_000),
      propertyValue: dollarsToCents(4_000),
      costs: cents(0),
      feeCapPct: CAP,
    })
    expect(r.capBasis).toBe(dollarsToCents(4_000))
    expect(r.feeDollars).toBe(dollarsToCents(1_200)) // 30% of 4,000, not of 10,000
  })

  it('counts COSTS inside the cap — the statute says "fees AND costs"', () => {
    const r = computeFee({
      claimedAmount: dollarsToCents(1_000),
      propertyValue: dollarsToCents(1_000),
      costs: dollarsToCents(50),
      feeCapPct: CAP,
    })
    // 30% of 1,000 is 300. Fee+costs may not exceed 300 in total.
    expect(r.feeDollars).toBe(dollarsToCents(300))
    expect(r.capBinding).toBe(true)
    expect(r.costs).toBe(dollarsToCents(50))
    expect(r.feeExcludingCosts).toBe(dollarsToCents(250))
  })

  it('CLAMPS rather than throwing, so the UI can explain what the cap did', () => {
    const r = computeFee({
      claimedAmount: dollarsToCents(1_000),
      propertyValue: dollarsToCents(1_000),
      costs: cents(0),
      requestedFeePct: 50,
      feeCapPct: CAP,
    })
    expect(r.capBinding).toBe(true)
    expect(r.feePct).toBeCloseTo(CAP, 6)
    expect(r.feeDollars).toBe(dollarsToCents(300))
  })

  it('never lets costs alone breach the cap', () => {
    const r = computeFee({
      claimedAmount: dollarsToCents(1_000),
      propertyValue: dollarsToCents(1_000),
      costs: dollarsToCents(900),
      requestedFeePct: 0,
      feeCapPct: CAP,
    })
    expect(r.feeDollars).toBeLessThanOrEqual(r.capCeiling)
    expect(r.costs).toBe(dollarsToCents(300))
  })

  it('refuses to produce an agreement above the cap', () => {
    const overCap = {
      feePct: 50, feeDollars: dollarsToCents(500), feeExcludingCosts: dollarsToCents(500),
      costs: cents(0), netToClaimant: dollarsToCents(500),
      capBasis: dollarsToCents(1_000), capCeiling: dollarsToCents(300),
      capBinding: false, requiresPathB: false,
    }
    expect(() => assertFeeAgreementEligible(overCap, CAP)).toThrow(/exceed the 30% cap/)
  })

  it('flags Path B when the holder reported no value — § 44-12-224(c)(3)', () => {
    const r = computeFee({
      claimedAmount: dollarsToCents(5_000),
      propertyValue: null,
      costs: cents(0),
      feeCapPct: CAP,
    })
    expect(r.requiresPathB).toBe(true)
  })

  it('produces Path B percentages that sum to exactly 100, as UP-CDR2 requires', () => {
    for (const pct of [0, 7.5, 10, 22.33, 29.99, 30]) {
      const { cdrPct, claimantPct } = computePathBSplit(pct, CAP)
      expect(cdrPct + claimantPct).toBe(100)
    }
  })

  it('refuses a Path B split above the statutory cap', () => {
    expect(() => computePathBSplit(31, CAP)).toThrow(RangeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.6 THE 120-DAY UNENFORCEABILITY WINDOW — O.C.G.A. § 44-12-220(d.1)(4)', () => {
  it('RESOLVES CONSERVATIVELY when the delivery date is unknown', () => {
    const r = computeEnforceability({ precision: 'unknown' })
    expect(r.insideWindow).toBe(true)
    expect(r.assumedConservatively).toBe(true)
  })

  it('RESOLVES CONSERVATIVELY when the date is only year-precise, using 31 December', () => {
    // The bulk file gives "year property was reported" — year-precise at best.
    const r = computeEnforceability({ precision: 'year', year: 2026 }, new Date('2027-01-15'))
    expect(r.insideWindow).toBe(true)
    expect(r.assumedConservatively).toBe(true)
    expect(r.enforceableOn?.toISOString().slice(0, 10)).toBe('2027-04-30')
  })

  it('computes enforceability exactly when the delivery date is known', () => {
    const r = computeEnforceability(
      { precision: 'exact', date: new Date('2026-07-01T00:00:00Z') },
      new Date('2026-12-01T00:00:00Z'),
    )
    expect(r.enforceableOn?.toISOString().slice(0, 10)).toBe('2026-10-29')
    expect(r.insideWindow).toBe(false)
    expect(r.assumedConservatively).toBe(false)
  })

  it('holds a property inside the window right up to the boundary', () => {
    const delivered = new Date('2026-07-01T00:00:00Z')
    const dayBefore = new Date('2026-10-28T23:59:59Z')
    expect(computeEnforceability({ precision: 'exact', date: delivered }, dayBefore).insideWindow).toBe(true)
  })

  it('applies only to agreements entered into on or after 2026-07-01', () => {
    expect(windowAppliesToAgreement(new Date('2026-06-30'))).toBe(false)
    expect(windowAppliesToAgreement(new Date('2026-07-01'))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.7 NO SCRAPING OF PROTECTED HOSTS', () => {
  it('blocks the reCAPTCHA-protected DOR public search site', () => {
    expect(isBlockedHost('gaclaims.unclaimedproperty.com')).toBe(true)
    expect(() => assertHostAllowed('https://gaclaims.unclaimedproperty.com/search')).toThrow(BlockedHostError)
  })

  it('blocks the Cloudflare-protected GA SOS corporations site', () => {
    expect(isBlockedHost('ecorp.sos.ga.gov')).toBe(true)
    expect(() => assertHostAllowed('https://ecorp.sos.ga.gov/BusinessSearch')).toThrow(BlockedHostError)
  })

  it('blocks subdomains of blocked hosts', () => {
    expect(isBlockedHost('api.gaclaims.unclaimedproperty.com')).toBe(true)
  })

  it('permits the DOR forms host, which is the legitimate source', () => {
    expect(() => assertHostAllowed('https://dor.georgia.gov/media/34076/download')).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.8 DATA USE IS SOLICITATION-ONLY — O.C.G.A. § 44-12-239.1(b)', () => {
  it('records that redistribution of the CDR file is prohibited', () => {
    expect(GA.dataRedistributionPermitted).toBe(false)
  })

  it('exposes no public read surface over properties (enforced by RLS + CI in Phase 1)', () => {
    // The route-level CI gate lives in scripts/verify-no-public-properties.ts.
    // This test asserts the rule is recorded so it cannot be quietly dropped.
    expect(String(GA.dataRedistributionCitation)).toContain('44-12-239.1(b)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.9 NEVER TAKE CUSTODY OF CLAIMANT FUNDS — O.C.G.A. § 44-12-220', () => {
  it('records that DOR pays both parties directly', () => {
    expect(GA.payeeModel).toBe('state_pays_both_parties_directly')
    expect(GA.custodyOfClaimantFundsPermitted).toBe(false)
  })

  it('records that safe-deposit contents go to the claimant, never the CDR — § 44-12-220(e)', () => {
    expect(GA.safeDepositContentsGoDirectlyToClaimant).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.10 OUTBOUND CHANNEL POLICY — TCPA 47 U.S.C. § 227', () => {
  it('enables mail and email only', () => {
    expect(CHANNEL_POLICY.mail.enabled).toBe(true)
    expect(CHANNEL_POLICY.email.enabled).toBe(true)
    expect(CHANNEL_POLICY.phone.enabled).toBe(false)
    expect(CHANNEL_POLICY.sms.enabled).toBe(false)
  })

  it('SHIPS NO SMS IMPLEMENTATION — the classic class-action vector', () => {
    expect(CHANNEL_POLICY.sms.implemented).toBe(false)
    expect(() => assertChannelPermitted('sms')).toThrow(/not implemented/)
  })

  it('refuses phone until it is deliberately enabled behind a DNC scrub', () => {
    expect(() => assertChannelPermitted('phone')).toThrow()
    expect(CHANNEL_POLICY.phone.requiresDncScrub).toBe(true)
  })

  it('hard-limits any calling window to 8am–8pm recipient local time', () => {
    expect(isWithinCallingWindow('phone', 7)).toBe(false)
    expect(isWithinCallingWindow('phone', 8)).toBe(true)
    expect(isWithinCallingWindow('phone', 19)).toBe(true)
    expect(isWithinCallingWindow('phone', 20)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§1.11 PI-LICENSE OPEN QUESTION — O.C.G.A. § 43-38-3(3)', () => {
  it('defaults external skip-trace to OFF', () => {
    expect(ENABLE_EXTERNAL_SKIPTRACE.defaultValue).toBe(false)
    expect(isFlagEnabled(ENABLE_EXTERNAL_SKIPTRACE, {})).toBe(false)
  })

  it('carries a startup warning citing the unresolved licensing question', () => {
    expect(ENABLE_EXTERNAL_SKIPTRACE.warning).toContain('43-38')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('§4 RULES ENGINE — unverified rules must throw, never default silently', () => {
  it('serves Georgia, which is verified', () => {
    expect(getStateRules('GA').feeCapPct).toBe(30)
  })

  it('THROWS on every researched-but-unverified state', () => {
    for (const code of ['CA', 'TX', 'FL', 'NY', 'OH', 'MD', 'WA', 'CO']) {
      expect(() => getStateRules(code), `${code} must throw`).toThrow(UnverifiedStateRulesError)
    }
  })

  it('throws on a state with no rules at all', () => {
    expect(() => getStateRules('ZZ')).toThrow(UnknownStateError)
  })

  it('never silently substitutes a default fee cap', () => {
    let threw = false
    try { getStateRules('MD') } catch { threw = true }
    expect(threw, 'MD has NO statutory cap; a silent default would be catastrophic').toBe(true)
  })
})

describe('§1.5 the cap is not a caller preference — O.C.G.A. § 44-12-224(d)(1)', () => {
  it('REFUSES an agreement computed against a fee cap above the statutory one', () => {
    // feeCapPct has to be a parameter, because the cap is per-state. That means
    // a wrong value would propagate through BOTH the clamp and the check meant
    // to validate it — the agreement would look internally consistent while
    // being over the statutory cap. The gate re-derives the cap from the rules.
    const permissive = computeFee({
      claimedAmount: dollarsToCents(10_000),
      propertyValue: dollarsToCents(10_000),
      costs: cents(0),
      requestedFeePct: 60,
      feeCapPct: 60,          // <- a caller inventing its own ceiling
    })
    // computeFee itself is happy: 60% of 10,000, clamped to its own 60% cap.
    expect(permissive.capBinding).toBe(false)
    expect(permissive.feeDollars).toBe(dollarsToCents(6_000))

    // The agreement gate is not.
    expect(() => assertFeeAgreementEligible(permissive, 60, 'GA'))
      .toThrow(/statutory cap for GA is 30/)
  })

  it('accepts a cap at or below the statutory one', () => {
    const conservative = computeFee({
      claimedAmount: dollarsToCents(10_000),
      propertyValue: dollarsToCents(10_000),
      costs: cents(0),
      requestedFeePct: 15,
      feeCapPct: 20,
      })
    expect(() => assertFeeAgreementEligible(conservative, 20, 'GA')).not.toThrow()
    expect(() => assertFeeAgreementEligible(conservative, 30, 'GA')).not.toThrow()
  })

  it('throws on an unverified state rather than reading its cap', () => {
    const anything = computeFee({
      claimedAmount: dollarsToCents(1_000), propertyValue: dollarsToCents(1_000),
      costs: cents(0), feeCapPct: 10,
    })
    expect(() => assertFeeAgreementEligible(anything, 10, 'CA')).toThrow(UnverifiedStateRulesError)
  })
})

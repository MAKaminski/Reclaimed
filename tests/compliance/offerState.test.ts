/**
 * OFFER STATE — what the public surface may say, and when.
 *
 * § 44-12-239.2(a)(10) reaches "making a solicitation to enter into" an
 * agreement while unregistered. The position (ADR-0010) is that a page which
 * expressly declines to accept clients is not soliciting. These tests hold the
 * mechanical half of that position: while unregistered nothing on the public
 * surface may invite engagement, capture contact details, or assert an
 * available service.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  getOfferState, assertMayInviteEngagement, OfferStateViolationError,
} from '@/lib/compliance/offerState'
import type { RegistrationState } from '@/lib/compliance/registration'
import {
  PRE_REGISTRATION_DISCLOSURE, STANDING_DISCLOSURES, DISCLOSURE_HEADLINE,
  EXPRESS_DECLINATION,
} from '@/lib/public/disclosure'
import { SOLICITATION_LEGEND_GA } from '@/lib/compliance/legend'
import { LEGEND_SURFACES, seedLegendSurfaces, requiresLegend } from '@/lib/compliance/legendSurfaces'
import { CHANNELS } from '@/lib/compliance/channels'

const LIVE: RegistrationState = {
  status: 'active', registrationNumber: 'CDR-000123', expiresAt: new Date('2030-01-01'),
}
const UNREGISTERED: RegistrationState = {
  status: 'unregistered', registrationNumber: null, expiresAt: null,
}

afterEach(() => { vi.restoreAllMocks() })

describe('§ 44-12-239.2(a)(10) — offer state is DERIVED from registration', () => {
  it('is pre_registration while unregistered', () => {
    expect(getOfferState(UNREGISTERED).state).toBe('pre_registration')
  })

  it('is offering once registration is active and the legend is verified', () => {
    expect(getOfferState(LIVE).state).toBe('offering')
  })

  it.each(['pending', 'suspended', 'revoked'] as const)(
    'stays pre_registration on status "%s"', (status) => {
      expect(getOfferState({ ...LIVE, status }).state).toBe('pre_registration')
    },
  )

  it('returns to pre_registration on an EXPIRED registration', () => {
    expect(getOfferState({ ...LIVE, expiresAt: new Date('2020-01-01') }).state)
      .toBe('pre_registration')
  })

  it('there is no override — state cannot be forced without registration', () => {
    const forged = {
      ...UNREGISTERED,
      state: 'offering', offerState: 'offering', mayInviteEngagement: true,
      indexable: true, forceState: 'offering', override: true,
    } as unknown as RegistrationState
    expect(getOfferState(forged).state).toBe('pre_registration')
    expect(getOfferState(forged).mayInviteEngagement).toBe(false)
  })
})

describe('pre_registration withholds every invitation', () => {
  const s = getOfferState(UNREGISTERED)

  it('permits no call to action', () => { expect(s.mayInviteEngagement).toBe(false) })
  it('permits no contact capture', () => { expect(s.mayCaptureContact).toBe(false) })
  it('permits no structured-data offering', () => { expect(s.mayAssertOffering).toBe(false) })

  it('renders the pre-registration disclosure, NOT the statutory legend', () => {
    expect(s.notice).toBe('pre_registration_disclosure')
  })

  it('is nonetheless indexable — describing the law is not soliciting', () => {
    expect(s.indexable).toBe(true)
  })

  it('assertMayInviteEngagement throws, citing the statute', () => {
    expect(() => assertMayInviteEngagement('landing page CTA', UNREGISTERED))
      .toThrow(OfferStateViolationError)
    expect(() => assertMayInviteEngagement('landing page CTA', UNREGISTERED))
      .toThrow(/44-12-239\.2\(a\)\(10\)/)
  })

  it('assertMayInviteEngagement permits it once registered', () => {
    expect(() => assertMayInviteEngagement('landing page CTA', LIVE)).not.toThrow()
  })
})

describe('the fail-closed third state', () => {
  it('is `unavailable` when registered but the legend is unverified', async () => {
    const legend = await import('@/lib/compliance/legend')
    vi.spyOn(legend, 'isLegendVerified').mockReturnValue(false)
    const s = getOfferState(LIVE)

    expect(s.state).toBe('unavailable')
    // It must NOT claim to be unregistered. That would be false, and a false
    // statement on a commercial page is § 44-12-239.2(a)(5).
    expect(s.state).not.toBe('pre_registration')
    expect(s.notice).toBe('none')
    // It takes itself out of the index rather than say something untrue.
    expect(s.indexable).toBe(false)
    expect(s.mayInviteEngagement).toBe(false)
  })
})

describe('§ 44-12-239.2(a)(5) — the disclosure must not assert the legend’s premise', () => {
  const all = [DISCLOSURE_HEADLINE, ...PRE_REGISTRATION_DISCLOSURE, ...STANDING_DISCLOSURES].join(' ')

  it('never says "THIS IS A SOLICITATION" — on this page that is false', () => {
    expect(all).not.toMatch(/THIS IS A SOLICITATION/i)
    expect(all).not.toContain(SOLICITATION_LEGEND_GA)
  })

  it('carries the express declination verbatim', () => {
    expect(all).toContain(EXPRESS_DECLINATION)
  })

  it.each([
    ['not a government agency', /not a government agency/i],
    ['not sent by the State of Georgia', /not been sent[^.]*State of Georgia/i],
    ['not required to use a representative', /never required to use a representative/i],
    ['the free self-file route', /gaclaims\.unclaimedproperty\.com/],
    ['the not-registered fact', /not currently registered/i],
    ['the advance-fee ban', /44-12-239\.2\(a\)\(12\)/],
  ])('carries the %s element', (_label, pattern) => {
    expect(all).toMatch(pattern)
  })

  it('the headline states a fact about conduct, not a legal conclusion', () => {
    expect(DISCLOSURE_HEADLINE).toMatch(/NOT ACCEPTING CLIENTS/)
    expect(DISCLOSURE_HEADLINE).not.toMatch(/NOT A SOLICITATION/i)
  })
})

describe('§ 44-12-224 — standing disclosures survive registration', () => {
  const standing = STANDING_DISCLOSURES.join(' ')

  it('states the 30% cap AND that costs count inside it', () => {
    expect(standing).toMatch(/30%/)
    expect(standing).toMatch(/costs count inside the cap/i)
    expect(standing).toMatch(/44-12-224\(d\)\(1\)/)
  })

  it('states the revocation right', () => {
    expect(standing).toMatch(/44-12-224\(e\)/)
  })

  it('states that we never handle the owner’s money', () => {
    expect(standing).toMatch(/never receives, holds, or handles/i)
  })
})

describe('§ 44-12-239(f) — legend surfaces cannot drift from the seed', () => {
  it('matches the seed exactly', () => {
    expect([...LEGEND_SURFACES].sort()).toEqual([...seedLegendSurfaces()].sort())
  })

  it('includes landing_page — a web page needs the legend once we are offering', () => {
    expect(requiresLegend('landing_page')).toBe(true)
  })

  it('documents the intentional asymmetries with transmission channels', () => {
    // A phone call is a channel but has no printed notice to carry a legend.
    expect((CHANNELS as readonly string[]).includes('phone')).toBe(true)
    expect(requiresLegend('phone')).toBe(false)
    // A page and a PDF need the legend but are not channels — they are surfaces.
    for (const surface of ['landing_page', 'pdf']) {
      expect(requiresLegend(surface)).toBe(true)
      expect((CHANNELS as readonly string[]).includes(surface)).toBe(false)
    }
  })
})

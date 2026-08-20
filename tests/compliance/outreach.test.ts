/**
 * OUTBOUND SEND GATE — build spec §1.2, §1.4, §1.10.
 *
 * Nothing may reach an owner unless registration is active, the legend is
 * byte-verified and present, the channel is permitted, the recipient is not
 * suppressed, and the property has no hold.
 */

import { describe, expect, it } from 'vitest'
import {
  authoriseSend, normaliseIdentifier, SendBlockedError,
  type SendRequest, type Recipient,
} from '@/lib/outreach/send'
import { SOLICITATION_LEGEND_GA } from '@/lib/compliance/legend'
import type { RegistrationState } from '@/lib/compliance/registration'

const ACTIVE: RegistrationState = {
  status: 'active', registrationNumber: 'CDR-000123', expiresAt: new Date('2030-01-01'),
}
const UNREGISTERED: RegistrationState = {
  status: 'unregistered', registrationNumber: null, expiresAt: null,
}

const never = () => false

function request(overrides: Partial<SendRequest> = {}): SendRequest {
  return {
    propertyId: 'GA0004821993',
    channel: 'mail',
    recipient: { identifier: 'owner@example.test', kind: 'email' },
    renderedContent: `${SOLICITATION_LEGEND_GA}\n\nDear owner, ...`,
    bodyMaxPointSize: 11,
    registration: ACTIVE,
    ...overrides,
  }
}

describe('§1.4 nothing sends before registration — § 44-12-239.2(a)(10)', () => {
  it('blocks a send while unregistered', async () => {
    await expect(authoriseSend(request({ registration: UNREGISTERED }), never, never))
      .rejects.toThrow(SendBlockedError)
  })

  it('blocks on a suspended or revoked registration', async () => {
    for (const status of ['pending', 'suspended', 'revoked'] as const) {
      await expect(authoriseSend(
        request({ registration: { ...ACTIVE, status } }), never, never,
      )).rejects.toThrow(SendBlockedError)
    }
  })

  it('blocks on an expired registration', async () => {
    await expect(authoriseSend(
      request({ registration: { ...ACTIVE, expiresAt: new Date('2020-01-01') } }), never, never,
    )).rejects.toThrow(SendBlockedError)
  })

  it('permits a send once registration is active', async () => {
    await expect(authoriseSend(request(), never, never)).resolves.toMatchObject({ permitted: true })
  })
})

describe('§1.2 the legend must be present and verified', () => {
  it('blocks content that does not carry the legend verbatim', async () => {
    await expect(authoriseSend(
      request({ renderedContent: 'Dear owner, we found your money.' }), never, never,
    )).rejects.toThrow(/does not carry the .* legend/)
  })

  it('blocks a PARAPHRASED legend — one wrong word makes it non-compliant', async () => {
    const paraphrased = SOLICITATION_LEGEND_GA.replace('OFFICIAL GOVERNMENT', 'GOVERNMENTAL')
    await expect(authoriseSend(
      request({ renderedContent: `${paraphrased}\n\nDear owner...` }), never, never,
    )).rejects.toThrow(SendBlockedError)
  })

  it('returns the computed legend size — max(12, body+1), not a constant', async () => {
    expect((await authoriseSend(request({ bodyMaxPointSize: 11 }), never, never)).legendPointSize).toBe(12)
    expect((await authoriseSend(request({ bodyMaxPointSize: 14 }), never, never)).legendPointSize).toBe(15)
  })
})

describe('§1.10 channel policy — TCPA 47 U.S.C. § 227', () => {
  it('blocks SMS outright — it is not implemented and must not be', async () => {
    await expect(authoriseSend(request({ channel: 'sms' }), never, never))
      .rejects.toThrow(SendBlockedError)
  })

  it('blocks phone until deliberately enabled behind a DNC scrub', async () => {
    await expect(authoriseSend(request({ channel: 'phone' }), never, never))
      .rejects.toThrow(SendBlockedError)
  })

  it('permits mail and email', async () => {
    for (const channel of ['mail', 'email'] as const) {
      await expect(authoriseSend(request({ channel }), never, never)).resolves.toBeTruthy()
    }
  })
})

describe('§1.10 suppression is cross-channel and permanent', () => {
  it('blocks a suppressed recipient', async () => {
    const suppressed = () => true
    await expect(authoriseSend(request(), suppressed, never))
      .rejects.toThrow(/suppressed/)
  })

  it('normalises identifiers so an opt-out cannot be evaded by casing or spacing', () => {
    expect(normaliseIdentifier({ identifier: '  Owner@Example.COM ', kind: 'email' }).identifier)
      .toBe('owner@example.com')
    expect(normaliseIdentifier({ identifier: '(404) 555-0100', kind: 'phone' }).identifier)
      .toBe('4045550100')
    expect(normaliseIdentifier({ identifier: '  120  Peachtree   St ', kind: 'postal' }).identifier)
      .toBe('120 peachtree st')
  })

  it('checks the SAME normalised identifier the suppression list would hold', async () => {
    const seen: Recipient[] = []
    const capture = (r: Recipient) => { seen.push(r); return false }
    await authoriseSend(
      request({ recipient: { identifier: ' Owner@Example.COM ', kind: 'email' } }),
      capture, never,
    )
    expect(seen[0]?.identifier).toBe('owner@example.com')
  })
})

describe('a held property is never solicited', () => {
  it('blocks when the property has an active hold', async () => {
    const held = () => true
    await expect(authoriseSend(request(), never, held))
      .rejects.toThrow(/active hold/)
  })
})

describe('failures are reported together, not one at a time', () => {
  it('lists every blocking reason so a fix is one pass, not five', async () => {
    try {
      await authoriseSend(
        request({
          registration: UNREGISTERED,
          channel: 'sms',
          renderedContent: 'no legend here',
        }),
        () => true,
        () => true,
      )
      throw new Error('should have thrown')
    } catch (error) {
      const reasons = (error as SendBlockedError).reasons
      expect(reasons.length).toBeGreaterThanOrEqual(4)
      const joined = reasons.join(' ')
      expect(joined).toContain('44-12-239.2(a)(10)')
      expect(joined).toContain('suppressed')
      expect(joined).toContain('active hold')
    }
  })
})

describe('the authorisation records what made the send lawful', () => {
  it('captures the legend hash, computed size, content hash, and check time', async () => {
    const auth = await authoriseSend(request(), never, never)
    expect(auth.legendSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(auth.renderedSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(Date.parse(auth.suppressionCheckedAt)).not.toBeNaN()
  })
})

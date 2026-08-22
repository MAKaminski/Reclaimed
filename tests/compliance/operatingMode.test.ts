/**
 * OPERATING MODE — the line between a compliance gate and a product limit.
 *
 * Exactly two things wait for registration: a solicitation reaching an owner,
 * and a claim reaching DOR. Everything else runs now. These tests hold that
 * line in both directions — nothing transmits early, and nothing else is
 * needlessly withheld.
 */

import { describe, expect, it } from 'vitest'
import {
  getOperatingMode, isRehearsal, assertMayTransmit,
  LiveActionBlockedError, REHEARSAL_WATERMARK,
} from '@/lib/compliance/operatingMode'
import type { RegistrationState } from '@/lib/compliance/registration'

const LIVE: RegistrationState = {
  status: 'active', registrationNumber: 'CDR-000123', expiresAt: new Date('2030-01-01'),
}
const UNREGISTERED: RegistrationState = {
  status: 'unregistered', registrationNumber: null, expiresAt: null,
}

describe('mode is DERIVED from registration, never set independently', () => {
  it('is rehearsal while unregistered', () => {
    expect(getOperatingMode(UNREGISTERED).mode).toBe('rehearsal')
    expect(isRehearsal(UNREGISTERED)).toBe(true)
  })

  it('is live once registration is active', () => {
    expect(getOperatingMode(LIVE).mode).toBe('live')
    expect(isRehearsal(LIVE)).toBe(false)
  })

  it.each(['pending', 'suspended', 'revoked'] as const)(
    'stays in rehearsal on status "%s"', (status) => {
      expect(getOperatingMode({ ...LIVE, status }).mode).toBe('rehearsal')
    },
  )

  it('returns to rehearsal on an EXPIRED registration', () => {
    expect(getOperatingMode({ ...LIVE, expiresAt: new Date('2020-01-01') }).mode).toBe('rehearsal')
  })

  it('there is no override — mode cannot be forced without registration', () => {
    // Deliberately no "pretend I am registered" flag. A gate that the person it
    // constrains can switch off is not a gate.
    const forced = { ...UNREGISTERED } as RegistrationState & { mode?: string }
    forced.mode = 'live'
    expect(getOperatingMode(forced).mode).toBe('rehearsal')
  })
})

describe('exactly three actions are withheld, and they all transmit', () => {
  it('names them', () => {
    const withheld = getOperatingMode(UNREGISTERED).withheld
    expect(withheld).toHaveLength(3)
    const joined = withheld.join(' ')
    expect(joined).toMatch(/solicitation/i)
    expect(joined).toMatch(/agreement/i)
    expect(joined).toMatch(/dor\.ga\.gov/i)
  })

  it('withholds nothing when live', () => {
    expect(getOperatingMode(LIVE).withheld).toEqual([])
  })

  it('assertMayTransmit throws in rehearsal and passes when live', () => {
    expect(() => assertMayTransmit('post the solicitation', UNREGISTERED))
      .toThrow(LiveActionBlockedError)
    expect(() => assertMayTransmit('post the solicitation', LIVE)).not.toThrow()
  })

  it('the refusal explains that everything else still runs', () => {
    try {
      assertMayTransmit('file the claim', UNREGISTERED)
      throw new Error('should have thrown')
    } catch (error) {
      expect((error as Error).message).toMatch(/rest of the pipeline runs now/i)
    }
  })
})

describe('the rehearsal watermark is a safety control, not a label', () => {
  it('says do not send, because a rehearsal agreement is otherwise valid-looking', () => {
    // A rehearsal UP-CDR2 is a perfectly formed agreement. Printing one and
    // posting it WOULD be an unregistered solicitation.
    expect(REHEARSAL_WATERMARK).toMatch(/DO NOT SEND/i)
    expect(REHEARSAL_WATERMARK).toMatch(/NOT A VALID AGREEMENT/i)
  })
})

/**
 * STAFF ACCESS — O.C.G.A. § 44-12-239(d) and § 44-12-239.1(b).
 *
 * Two questions that are NOT the same:
 *   · is there a signed-in account?   → authentication
 *   · is that account STAFF?          → authorisation
 *
 * An authenticated account with no `staff` row is a real Supabase user who must
 * see nothing. Conflating the two is how the CDR file leaks.
 */

import { describe, expect, it } from 'vitest'
import { hasRole, mayTouchClaims, CAN_WRITE, CAN_REVIEW, CAN_ADMINISTER, type StaffMember } from '@/lib/db/auth'

function member(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'uuid-1',
    email: 'analyst@example.test',
    full_name: 'Screened Analyst',
    role: 'analyst',
    dor_designated_agent: true,
    background_check_cleared_at: '2026-08-01T00:00:00Z',
    deactivated_at: null,
    ...overrides,
  }
}

describe('§44-12-239(d) only a screened, designated agent may touch a claim', () => {
  it('permits a designated agent with a recorded clearance', () => {
    expect(mayTouchClaims(member())).toBe(true)
  })

  it('REFUSES a designated agent with NO clearance date', () => {
    // The database refuses to store this combination at all; this is the read
    // side of the same rule. A single unscreened designation is entity-fatal.
    expect(mayTouchClaims(member({ background_check_cleared_at: null }))).toBe(false)
  })

  it('refuses a screened person who is not a designated agent', () => {
    expect(mayTouchClaims(member({ dor_designated_agent: false }))).toBe(false)
  })

  it('refuses an account with no staff row at all', () => {
    expect(mayTouchClaims(null)).toBe(false)
  })

  it('an ADMIN is not automatically a designated agent', () => {
    // Administering the software and being named to DOR are different things.
    expect(mayTouchClaims(member({
      role: 'admin', dor_designated_agent: false, background_check_cleared_at: null,
    }))).toBe(false)
  })
})

describe('role gates mirror the RLS policies', () => {
  it('admin and analyst may write; reviewer and readonly may not', () => {
    expect(hasRole(member({ role: 'admin' }), CAN_WRITE)).toBe(true)
    expect(hasRole(member({ role: 'analyst' }), CAN_WRITE)).toBe(true)
    expect(hasRole(member({ role: 'reviewer' }), CAN_WRITE)).toBe(false)
    expect(hasRole(member({ role: 'readonly' }), CAN_WRITE)).toBe(false)
  })

  it('admin and reviewer may review authority links; analyst may not', () => {
    // The analyst asserts links; a different person reviews them. Self-review
    // does not satisfy the second-person requirement (§7.3).
    expect(hasRole(member({ role: 'reviewer' }), CAN_REVIEW)).toBe(true)
    expect(hasRole(member({ role: 'analyst' }), CAN_REVIEW)).toBe(false)
  })

  it('only admin may administer', () => {
    expect(hasRole(member({ role: 'admin' }), CAN_ADMINISTER)).toBe(true)
    for (const role of ['analyst', 'reviewer', 'readonly'] as const) {
      expect(hasRole(member({ role }), CAN_ADMINISTER)).toBe(false)
    }
  })

  it('a null staff member has no role at all', () => {
    for (const roles of [CAN_WRITE, CAN_REVIEW, CAN_ADMINISTER]) {
      expect(hasRole(null, roles)).toBe(false)
    }
  })
})

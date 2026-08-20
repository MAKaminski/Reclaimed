/**
 * Staff session resolution.
 *
 * Two questions that are NOT the same, and conflating them is how an
 * unauthorised read happens:
 *
 *   · is there a signed-in account?        → Supabase auth
 *   · is that account STAFF?               → a row in `staff`
 *
 * An account with no `staff` row is a real, authenticated Supabase user who can
 * see nothing. That is deliberate: § 44-12-239.1(b) permits distributing the CDR
 * file only to solicit owners, so access is granted by an admin in advance and
 * never self-service.
 */

import { createClient } from './supabase'

export type StaffRole = 'admin' | 'analyst' | 'reviewer' | 'readonly'

export interface StaffMember {
  id: string
  email: string
  full_name: string
  role: StaffRole
  /** § 44-12-239(d) — only a designated, screened agent may touch a claim. */
  dor_designated_agent: boolean
  background_check_cleared_at: string | null
  deactivated_at: string | null
}

export interface SessionState {
  /** A signed-in Supabase account, staff or not. */
  accountEmail: string | null
  accountId: string | null
  /** Null when the account has no staff row — i.e. not authorised. */
  staff: StaffMember | null
}

export async function getSessionState(): Promise<SessionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user === null) {
    return { accountEmail: null, accountId: null, staff: null }
  }

  // RLS lets a user read only their own staff row, so this doubles as the
  // authorisation check.
  const { data } = await supabase
    .from('staff')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<StaffMember>()

  const staff = data !== null && data.deactivated_at === null ? data : null
  return { accountEmail: user.email ?? null, accountId: user.id, staff }
}

/** Roles permitted to perform an action. Mirrors the RLS policies. */
export const CAN_WRITE: StaffRole[] = ['admin', 'analyst']
export const CAN_REVIEW: StaffRole[] = ['admin', 'reviewer']
export const CAN_ADMINISTER: StaffRole[] = ['admin']

export function hasRole(staff: StaffMember | null, roles: readonly StaffRole[]): boolean {
  return staff !== null && roles.includes(staff.role)
}

/**
 * § 44-12-239(d): only an agent designated to DOR and cleared against the
 * 20-year dishonesty bar may submit or process a claim. The database refuses to
 * record a designation without a clearance date; this is the read side.
 */
export function mayTouchClaims(staff: StaffMember | null): boolean {
  return staff !== null
    && staff.dor_designated_agent
    && staff.background_check_cleared_at !== null
}

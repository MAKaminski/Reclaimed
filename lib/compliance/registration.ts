/**
 * CDR registration kill switch, O.C.G.A. § 44-12-239.2(a)(10).
 *
 * The prohibition reaches "entering into, OR MAKING A SOLICITATION TO ENTER INTO,
 * an agreement to file a claim … unless such person is registered."
 *
 * You may BUILD before registering. You may not SEND before registering.
 *
 * Registration also gates: filing claims, receiving distribution of fees and
 * costs, and obtaining information about unclaimed property held by DOR.
 *
 * Default is `unregistered` so a fresh clone cannot send.
 */

import type { EnvLike } from './env'

export const REGISTRATION_STATUSES = [
  'unregistered',
  'pending',
  'active',
  'suspended',
  'revoked',
] as const

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number]

export interface RegistrationState {
  status: RegistrationStatus
  /** CDR Identification Number issued by DOR. Required on UP-CDR2 §IV. */
  registrationNumber: string | null
  /** § 44-12-239(a) — four-year term. */
  expiresAt: Date | null
}

function parseStatus(raw: string | undefined): RegistrationStatus {
  if (raw === undefined || raw === '') return 'unregistered'
  if ((REGISTRATION_STATUSES as readonly string[]).includes(raw)) {
    return raw as RegistrationStatus
  }
  // An unrecognised value must never be treated as permissive.
  throw new Error(
    `CDR_REGISTRATION_STATUS has unrecognised value "${raw}". ` +
      `Expected one of: ${REGISTRATION_STATUSES.join(', ')}`,
  )
}

export function readRegistrationState(
  env: EnvLike = process.env,
): RegistrationState {
  const expiresRaw = env.CDR_REGISTRATION_EXPIRES_AT
  let expiresAt: Date | null = null
  if (expiresRaw !== undefined && expiresRaw !== '') {
    const parsed = new Date(expiresRaw)
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `CDR_REGISTRATION_EXPIRES_AT is not a valid date: "${expiresRaw}"`,
      )
    }
    expiresAt = parsed
  }

  const number = env.CDR_REGISTRATION_NUMBER
  return {
    status: parseStatus(env.CDR_REGISTRATION_STATUS),
    registrationNumber: number !== undefined && number !== '' ? number : null,
    expiresAt,
  }
}

export type GatedAction =
  | 'solicit'
  | 'generate_agreement'
  | 'submit_claim'
  | 'receive_data'

export class NotRegisteredError extends Error {
  constructor(action: GatedAction, reason: string) {
    super(
      `REFUSING TO ${action.toUpperCase()}: ${reason}. ` +
        'Acting as a CDR — including SOLICITING — while unregistered violates ' +
        'O.C.G.A. § 44-12-239.2(a)(10), sanctionable at up to $2,000 per act with ' +
        'revocation and referral to the Attorney General.',
    )
    this.name = 'NotRegisteredError'
  }
}

export interface RegistrationCheck {
  permitted: boolean
  reason: string
}

export function checkRegistration(
  action: GatedAction,
  state: RegistrationState = readRegistrationState(),
  now: Date = new Date(),
): RegistrationCheck {
  if (state.status !== 'active') {
    return {
      permitted: false,
      reason: `CDR registration status is "${state.status}", not "active"`,
    }
  }
  if (state.expiresAt === null) {
    return {
      permitted: false,
      reason: 'CDR registration expiry is not configured (CDR_REGISTRATION_EXPIRES_AT)',
    }
  }
  if (state.expiresAt.getTime() <= now.getTime()) {
    return {
      permitted: false,
      reason: `CDR registration expired on ${state.expiresAt.toISOString()}`,
    }
  }
  // Every agreement must carry the CDR Identification Number — § 44-12-224(c)(6),
  // form UP-CDR2 §IV. Without it the agreement is defective and § 44-12-224(b)
  // voids our claim.
  if (
    (action === 'generate_agreement' || action === 'submit_claim') &&
    state.registrationNumber === null
  ) {
    return {
      permitted: false,
      reason:
        'CDR Identification Number is not configured (CDR_REGISTRATION_NUMBER); ' +
        '§ 44-12-224(c)(6) requires it on every agreement',
    }
  }
  return { permitted: true, reason: 'CDR registration is active' }
}

/** Hard gate. Every outbound send and every agreement generation calls this. */
export function assertRegistered(
  action: GatedAction,
  state: RegistrationState = readRegistrationState(),
  now: Date = new Date(),
): void {
  const check = checkRegistration(action, state, now)
  if (!check.permitted) throw new NotRegisteredError(action, check.reason)
}

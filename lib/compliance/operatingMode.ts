/**
 * Operating mode — the line between a compliance gate and a product limit.
 *
 * A COMPLIANCE GATE stops something LEAVING THE BUILDING. There are exactly
 * two in this system: a solicitation reaching an owner, and a claim reaching
 * the Department. Both are § 44-12-239.2(a)(10) acts at up to $2,000 each.
 *
 * EVERYTHING ELSE IS PRODUCT. Scoring, locating, building an authority chain,
 * generating an agreement, recording a signature, assembling a claim packet,
 * reconciling a receipt — none of these touch an owner or DOR, so none of them
 * wait for registration.
 *
 * So the whole pipeline is exercisable today. Mode is DERIVED from registration
 * state, never set independently: there is deliberately no "pretend I am
 * registered" switch, because the point of the gate is that it cannot be
 * turned off by the person it constrains.
 */

import { readRegistrationState, checkRegistration, type RegistrationState } from './registration'

export type OperatingMode = 'rehearsal' | 'live'

export interface ModeState {
  mode: OperatingMode
  /** Plain-language reason, shown wherever the mode matters. */
  reason: string
  /** Actions withheld in this mode. Everything else runs. */
  withheld: string[]
}

export function getOperatingMode(
  registration: RegistrationState = readRegistrationState(),
): ModeState {
  const solicit = checkRegistration('solicit', registration)

  if (solicit.permitted) {
    return {
      mode: 'live',
      reason: 'CDR registration is active. Outbound transmission is permitted.',
      withheld: [],
    }
  }

  return {
    mode: 'rehearsal',
    reason:
      `${solicit.reason}. Every stage still runs and produces its real artifact — ` +
      'only transmission is withheld.',
    withheld: [
      'Posting a solicitation to an owner',
      'Posting an agreement to a claimant',
      'Emailing a claim to ucp.cdr.claims@dor.ga.gov',
    ],
  }
}

export function isRehearsal(registration?: RegistrationState): boolean {
  return getOperatingMode(registration).mode === 'rehearsal'
}

/**
 * Stamped across every artifact generated in rehearsal.
 *
 * This is a safety control, not a label. A rehearsal UP-CDR2 is a perfectly
 * formed agreement — printing one and posting it WOULD be an unregistered
 * solicitation. The watermark is what stops a practice run being mistaken for
 * the real thing on a desk.
 */
export const REHEARSAL_WATERMARK = 'REHEARSAL — NOT A VALID AGREEMENT — DO NOT SEND'

export class LiveActionBlockedError extends Error {
  constructor(action: string, reason: string) {
    super(
      `REFUSING TO ${action.toUpperCase()}: ${reason}\n\n` +
        'This is the only class of action that waits for registration. The rest of ' +
        'the pipeline runs now — generate the artifact, walk the stages, and the ' +
        'same button sends for real the moment CDR_REGISTRATION_STATUS is active.',
    )
    this.name = 'LiveActionBlockedError'
  }
}

/** Call immediately before anything actually leaves the building. */
export function assertMayTransmit(action: string, registration?: RegistrationState): void {
  const state = getOperatingMode(registration)
  if (state.mode !== 'live') {
    throw new LiveActionBlockedError(action, state.reason)
  }
}

/**
 * Outbound channel policy.
 *
 * DIRECT MAIL IS THE PRIMARY CHANNEL. There is no autodialer and no SMS blast in
 * this codebase, by design.
 *
 * Cold-calling owners with no prior express written consent is the largest
 * UNCAPPED liability in this model: TCPA statutory damages are $500 per
 * violation, trebled to $1,500 for willful, and it is the classic class-action
 * vector. Georgia folded its state no-call list into the federal registry, so
 * the federal DNC scrub IS the Georgia scrub.
 *
 * Direct mail carries no TCPA exposure at all.
 */

export const CHANNELS = ['mail', 'email', 'phone', 'sms'] as const
export type Channel = (typeof CHANNELS)[number]

export interface ChannelPolicy {
  enabled: boolean
  /** Implemented in this codebase at all. */
  implemented: boolean
  requiresDncScrub: boolean
  /** Local-time window, 24h clock, when the channel may be used. */
  allowedHoursLocal: readonly [number, number] | null
  rationale: string
}

export const CHANNEL_POLICY: Readonly<Record<Channel, ChannelPolicy>> = Object.freeze({
  mail: {
    enabled: true,
    implemented: true,
    requiresDncScrub: false,
    allowedHoursLocal: null,
    rationale:
      'Primary channel. No TCPA exposure. What § 44-12-239(f) plainly contemplates ' +
      'when it specifies point sizes for a printed legend.',
  },
  email: {
    enabled: true,
    implemented: true,
    requiresDncScrub: false,
    allowedHoursLocal: null,
    rationale:
      'CAN-SPAM: valid physical postal address, functioning opt-out honored within ' +
      '10 business days, no deceptive subject lines, clear ad identification.',
  },
  phone: {
    enabled: false,
    implemented: false,
    requiresDncScrub: true,
    allowedHoursLocal: [8, 20],
    rationale:
      'Manual-dial only if ever enabled, and only after a federal DNC scrub. ' +
      'Feature-flagged off. TCPA $500/violation, trebled to $1,500 willful.',
  },
  sms: {
    enabled: false,
    implemented: false,
    requiresDncScrub: true,
    allowedHoursLocal: [8, 20],
    rationale:
      'NOT IMPLEMENTED and not to be implemented in v1. The classic class-action ' +
      'vector against cold outbound.',
  },
})

export class ChannelNotPermittedError extends Error {
  constructor(channel: Channel, reason: string) {
    super(`REFUSING TO SEND via "${channel}": ${reason}`)
    this.name = 'ChannelNotPermittedError'
  }
}

export function assertChannelPermitted(channel: Channel): void {
  const policy = CHANNEL_POLICY[channel]
  if (!policy.implemented) {
    throw new ChannelNotPermittedError(
      channel,
      `channel is not implemented in this codebase. ${policy.rationale}`,
    )
  }
  if (!policy.enabled) {
    throw new ChannelNotPermittedError(channel, `channel is disabled. ${policy.rationale}`)
  }
}

/** Calling-window check for any channel that has one. */
export function isWithinCallingWindow(channel: Channel, localHour: number): boolean {
  const window = CHANNEL_POLICY[channel].allowedHoursLocal
  if (window === null) return true
  const [start, end] = window
  return localHour >= start && localHour < end
}

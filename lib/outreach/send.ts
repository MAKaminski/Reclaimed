/**
 * The outbound send gate.
 *
 * NOTHING SENDS unless every one of these holds:
 *   1. CDR registration is active and unexpired   — § 44-12-239.2(a)(10)
 *   2. the § 44-12-239(f) legend is byte-verified — else the notice may be
 *      non-compliant, a § 44-12-239.2(a)(5) violation at $2,000 per act
 *   3. the channel is implemented and enabled     — no SMS, no autodialer
 *   4. the recipient is not suppressed on ANY channel
 *   5. the property has no active hold
 *   6. the rendered content actually carries the legend
 *
 * This is ONE function on purpose. A second send path is a second place to
 * forget one of these.
 */

import { createHash } from 'node:crypto'
import { assertRegistered, type RegistrationState } from '@/lib/compliance/registration'
import { assertLegendUsable, requiredLegendPointSize, legendSha256, SOLICITATION_LEGEND_GA } from '@/lib/compliance/legend'
import { assertChannelPermitted, isWithinCallingWindow, type Channel } from '@/lib/compliance/channels'

export type IdentifierKind = 'email' | 'phone' | 'postal' | 'owner_name' | 'property_id'

export interface Recipient {
  identifier: string
  kind: IdentifierKind
}

export interface SendRequest {
  propertyId: string
  channel: Channel
  recipient: Recipient
  /** Fully rendered content, legend included. */
  renderedContent: string
  /** Largest font used in the body, for the computed legend size. */
  bodyMaxPointSize: number
  /** Recipient local hour, for channels with a contact window. */
  recipientLocalHour?: number
  registration?: RegistrationState
}

export type SuppressionLookup =
  (recipient: Recipient, propertyId: string) => Promise<boolean> | boolean
export type HoldLookup = (propertyId: string) => Promise<boolean> | boolean

export interface SendAuthorisation {
  permitted: true
  legendSha256: string
  legendPointSize: number
  renderedSha256: string
  suppressionCheckedAt: string
}

export class SendBlockedError extends Error {
  readonly reasons: string[]
  constructor(propertyId: string, reasons: string[]) {
    super(
      `REFUSING TO SEND for property ${propertyId}:\n` +
        reasons.map((r) => `  · ${r}`).join('\n'),
    )
    this.name = 'SendBlockedError'
    this.reasons = reasons
  }
}

/**
 * Normalise an identifier before the suppression lookup.
 *
 * An opt-out recorded as "Owner@Example.com " must suppress "owner@example.com".
 * A suppression evadable by whitespace or casing is not a suppression.
 */
export function normaliseIdentifier(recipient: Recipient): Recipient {
  const raw = recipient.identifier.trim()
  switch (recipient.kind) {
    case 'email':
      return { ...recipient, identifier: raw.toLowerCase() }
    case 'phone':
      return { ...recipient, identifier: raw.replace(/\D/g, '') }
    case 'postal':
    case 'owner_name':
      return { ...recipient, identifier: raw.toLowerCase().replace(/\s+/g, ' ') }
    default:
      return { ...recipient, identifier: raw }
  }
}

export async function authoriseSend(
  request: SendRequest,
  isSuppressed: SuppressionLookup,
  hasHold: HoldLookup,
): Promise<SendAuthorisation> {
  const reasons: string[] = []

  try {
    assertRegistered('solicit', request.registration)
  } catch (error) {
    reasons.push((error as Error).message)
  }

  try {
    assertLegendUsable()
  } catch (error) {
    reasons.push((error as Error).message)
  }

  try {
    assertChannelPermitted(request.channel)
  } catch (error) {
    reasons.push((error as Error).message)
  }

  if (
    request.recipientLocalHour !== undefined &&
    !isWithinCallingWindow(request.channel, request.recipientLocalHour)
  ) {
    reasons.push(
      `Outside the permitted contact window for ${request.channel} ` +
        `(recipient local hour ${request.recipientLocalHour}).`,
    )
  }

  const recipient = normaliseIdentifier(request.recipient)
  if (await isSuppressed(recipient, request.propertyId)) {
    reasons.push('Recipient or property is suppressed. Suppression is cross-channel and permanent.')
  }

  if (await hasHold(request.propertyId)) {
    reasons.push('Property has an active hold — it may already have been claimed.')
  }

  if (!request.renderedContent.includes(SOLICITATION_LEGEND_GA)) {
    reasons.push(
      'Rendered content does not carry the § 44-12-239(f) legend verbatim. Every ' +
        'solicitation to an owner or apparent owner must carry it.',
    )
  }

  if (reasons.length > 0) throw new SendBlockedError(request.propertyId, reasons)

  return {
    permitted: true,
    legendSha256: legendSha256(),
    legendPointSize: requiredLegendPointSize(request.bodyMaxPointSize),
    renderedSha256: createHash('sha256').update(request.renderedContent, 'utf8').digest('hex'),
    suppressionCheckedAt: new Date().toISOString(),
  }
}

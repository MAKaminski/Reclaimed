/**
 * Where the § 44-12-239(f) legend must appear.
 *
 * This is deliberately NOT `channels.ts`. Those four model TRANSMISSION and
 * carry transmission semantics — DNC scrubs, calling windows, opt-out duties.
 * A web page is a PUBLICATION SURFACE: it has no recipient, no calling window,
 * and nothing to opt out of. Adding `landing_page` to `CHANNELS` would make
 * `assertChannelPermitted('landing_page')` callable, which reads as though a
 * page gets "sent".
 *
 * The two sets overlap without either containing the other, and both
 * asymmetries are meaningful:
 *
 *   phone        is a channel, needs no legend  (a call has no printed notice)
 *   landing_page needs the legend, is no channel
 *   pdf          needs the legend, is no channel (it rides on one)
 *
 * The seed is authoritative; the test asserts this list equals it exactly, so
 * the two can never drift.
 */

import { getStateRules } from './stateRules'

export const LEGEND_SURFACES = ['mail', 'email', 'sms', 'landing_page', 'pdf'] as const
export type LegendSurface = (typeof LEGEND_SURFACES)[number]

export function requiresLegend(surface: string): surface is LegendSurface {
  return (LEGEND_SURFACES as readonly string[]).includes(surface)
}

/** The seed's own list, for the drift test. */
export function seedLegendSurfaces(): readonly string[] {
  const raw = getStateRules('GA').solicitationLegendChannels
  return Array.isArray(raw) ? (raw as string[]) : []
}

/**
 * The mandatory solicitation legend, O.C.G.A. § 44-12-239(f).
 *
 * Every solicitation to an owner or apparent owner must carry this notice in ALL
 * CAPITAL LETTERS, in at least 12-point type OR in a font larger than the font
 * used in the solicitation, WHICHEVER IS LARGER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VERIFICATION STATUS
 *
 * verifiedAgainst: ENROLLED SB 103 (2023-2024 session), Georgia General Assembly
 *                  https://www.legis.ga.gov/api/legislation/document/20232024/219683
 *                  Verified 2026-08-20 by `pnpm verify:legend`.
 *                  sha256 c7ec9f78253442b54183c57ba33e670b83ebaa791e15f90a1219ecb872c8e7c2
 *                  192 bytes.
 *
 * SUBSECTION AND POINT SIZE verified 2026-08-21 against the same enrolled act.
 * The surrounding text reads, verbatim:
 *
 *   "(f) Any solicitation from a claimant's designated representative to an
 *    owner or apparent owner of unclaimed property shall include the following
 *    notice in all capital letters in at least 12 point type or in a font
 *    larger than the font utilized in the solicitation, whichever is larger:"
 *
 * So the legend is subsection (f), the floor is 12 point, and "whichever is
 * larger" is confirmed as statutory language rather than a paraphrase. The
 * naming prohibition immediately following it is subsection (g).
 *
 * The enrolled act carries sequential line numbers in its left margin, which PDF
 * extraction interleaves into the body ("...NOT A BILL OR OFFICIAL538 GOVERNMENT
 * DOCUMENT..."). Those, and PDF line breaks, are the ONLY differences between the
 * text below and the primary source. Every other character matches exactly.
 *
 * ONE WRONG WORD MAKES THE NOTICE NON-COMPLIANT, and a defective solicitation is
 * a § 44-12-239.2(a)(5) violation at up to $2,000 PER ACT. This module therefore
 * FAILS CLOSED: if the constant below drifts from the attestation in
 * data/seed/legend-attestation.json, isLegendVerified() returns false and every
 * outbound render path throws. Re-run `pnpm verify:legend` after any edit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHash } from 'node:crypto'
import attestation from '@/data/seed/legend-attestation.json' with { type: 'json' }

/**
 * The legend text. Exactly one definition of this string exists in the codebase.
 * Do not inline it, do not re-type it, do not "fix" its punctuation.
 */
export const SOLICITATION_LEGEND_GA =
  'THIS IS A SOLICITATION. THIS IS NOT A BILL OR OFFICIAL GOVERNMENT DOCUMENT AND ' +
  'HAS NOT BEEN SENT BY THE STATE OF GEORGIA. YOU ARE NOT REQUIRED TO USE THE ' +
  'SERVICES OFFERED IN THIS SOLICITATION.'

/** Statutory floor in points. § 44-12-239(f). */
export const LEGEND_MIN_POINT_SIZE = 12

export interface LegendAttestation {
  status: 'verified' | 'unverified'
  sha256: string | null
  byteLength: number | null
  source: string | null
  verifiedAt: string | null
  note: string
}

export function legendSha256(text: string = SOLICITATION_LEGEND_GA): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function getLegendAttestation(): LegendAttestation {
  return attestation as LegendAttestation
}

/**
 * True only when a primary-source attestation exists AND still matches the
 * constant above. Any drift in either direction reverts to unverified.
 */
export function isLegendVerified(): boolean {
  const a = getLegendAttestation()
  if (a.status !== 'verified') return false
  if (a.sha256 === null) return false
  if (a.sha256 !== legendSha256()) return false
  if (a.byteLength !== Buffer.byteLength(SOLICITATION_LEGEND_GA, 'utf8')) return false
  return true
}

/**
 * Compute the required legend point size.
 *
 * § 44-12-239(f): "at least 12 point type OR in a font larger than the font
 * utilized in the solicitation, WHICHEVER IS LARGER."
 *
 * This is a COMPUTED value, not a constant. If body copy is 14pt, the legend
 * must be LARGER THAN 14pt — 12pt would be non-compliant.
 */
export function requiredLegendPointSize(maxBodyPointSize: number): number {
  if (!Number.isFinite(maxBodyPointSize) || maxBodyPointSize <= 0) {
    throw new RangeError(
      `Max body point size must be a positive finite number, received ${maxBodyPointSize}`,
    )
  }
  // "larger than" is strict, so the smallest compliant size exceeds the body.
  const largerThanBody = Math.floor(maxBodyPointSize) + 1
  return Math.max(LEGEND_MIN_POINT_SIZE, largerThanBody)
}

export class LegendUnverifiedError extends Error {
  constructor() {
    super(
      'REFUSING TO RENDER OUTBOUND CONTENT: the § 44-12-239(f) solicitation legend ' +
        'has not been byte-verified against a primary source. Run `pnpm verify:legend`. ' +
        'Shipping an unverified legend risks a § 44-12-239.2(a)(5) violation at up to ' +
        '$2,000 per act.',
    )
    this.name = 'LegendUnverifiedError'
  }
}

/**
 * Gate called by every outbound render path — mail, email, landing page, PDF.
 * Throws unless the legend is verified.
 */
export function assertLegendUsable(): void {
  if (!isLegendVerified()) throw new LegendUnverifiedError()
}

export interface RenderedLegend {
  text: string
  pointSizePt: number
  allCaps: true
}

/**
 * Produce the legend for a document whose largest body font is `maxBodyPointSize`.
 * Throws if the legend is unverified.
 */
export function renderLegend(maxBodyPointSize: number): RenderedLegend {
  assertLegendUsable()
  return {
    text: SOLICITATION_LEGEND_GA,
    pointSizePt: requiredLegendPointSize(maxBodyPointSize),
    allCaps: true,
  }
}

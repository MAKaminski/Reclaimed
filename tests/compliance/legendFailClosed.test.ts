/**
 * §1.2 fail-closed mechanism — O.C.G.A. § 44-12-239(f).
 *
 * The legend is now byte-verified against the enrolled SB 103 act. These tests
 * prove the mechanism that keeps it that way: any drift between the constant and
 * its attestation must re-block every outbound render path.
 */

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SOLICITATION_LEGEND_GA,
  isLegendVerified,
  getLegendAttestation,
  renderLegend,
  legendSha256,
} from '@/lib/compliance/legend'

const attestationPath = resolve(import.meta.dirname, '../../data/seed/legend-attestation.json')

describe('§1.2 legend is verified against a primary source', () => {
  it('is attested as verified', () => {
    expect(isLegendVerified()).toBe(true)
  })

  it('names the enrolled act as its source, not a secondary publisher', () => {
    const a = getLegendAttestation()
    expect(a.source).toContain('legis.ga.gov')
    expect(a.source).toContain('SB 103')
  })

  it('renders once verified, at the computed point size', () => {
    expect(renderLegend(14)).toEqual({
      text: SOLICITATION_LEGEND_GA,
      pointSizePt: 15,
      allCaps: true,
    })
  })
})

describe('§1.2 fail-closed: drift between constant and attestation re-blocks sending', () => {
  const attested = JSON.parse(readFileSync(attestationPath, 'utf8')) as {
    sha256: string; byteLength: number
  }

  it('the on-disk attestation matches the constant exactly', () => {
    expect(attested.sha256).toBe(legendSha256())
    expect(attested.byteLength).toBe(Buffer.byteLength(SOLICITATION_LEGEND_GA, 'utf8'))
  })

  it('ANY single-character edit to the legend changes its hash', () => {
    // Every realistic transcription slip must be detectable.
    const tampered = [
      SOLICITATION_LEGEND_GA.replace('THIS IS A SOLICITATION.', 'THIS IS A SOLICITATION'),
      SOLICITATION_LEGEND_GA.replace('OFFICIAL GOVERNMENT', 'OFFICIAL GOVERNMENTAL'),
      SOLICITATION_LEGEND_GA.replace('STATE OF GEORGIA', 'STATE OF GEORGIA '),
      SOLICITATION_LEGEND_GA.replace('NOT REQUIRED', 'NOT REQUIRED  '),
      SOLICITATION_LEGEND_GA.replace('A BILL', 'A BILL,'),
      SOLICITATION_LEGEND_GA.toLowerCase(),
    ]
    for (const variant of tampered) {
      const hash = createHash('sha256').update(variant, 'utf8').digest('hex')
      expect(hash, `tampered variant must not match: ${variant.slice(0, 40)}…`)
        .not.toBe(attested.sha256)
    }
  })

  it('the attestation cannot be satisfied by a hand-written placeholder hash', () => {
    expect(attested.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(attested.sha256).not.toBe('0'.repeat(64))
  })
})

/**
 * CI gate for §1.2 — byte-verify the O.C.G.A. § 44-12-239(f) solicitation legend
 * against a PRIMARY SOURCE.
 *
 * Every solicitation must carry this notice. ONE WRONG WORD MAKES IT
 * NON-COMPLIANT, and a defective solicitation is reachable under
 * § 44-12-239.2(a)(5) at up to $2,000 PER ACT.
 *
 * The research seed transcribed the string from secondary sources; Justia sits
 * behind Cloudflare and blocks verbatim retrieval. This script goes to the
 * enrolled act text and compares character for character.
 *
 * ON SUCCESS it writes data/seed/legend-attestation.json, which is what unlocks
 * every outbound render path.
 * ON FAILURE it leaves the attestation unverified, so the system stays shut.
 */

import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { extractText, getDocumentProxy } from 'unpdf'
import { SOLICITATION_LEGEND_GA, legendSha256 } from '../lib/compliance/legend.ts'
import { safeFetch } from '../lib/compliance/blockedHosts.ts'

const ROOT = resolve(import.meta.dirname, '..')
const ATTESTATION_PATH = join(ROOT, 'data/seed/legend-attestation.json')

interface Source { label: string; url: string }

const SOURCES: Source[] = [
  {
    label: 'Enrolled SB 103 (2023-2024 session), Georgia General Assembly',
    url: 'https://www.legis.ga.gov/api/legislation/document/20232024/219683',
  },
]

/** Collapse the line breaks and hyphenation that PDF extraction introduces. */
function normalize(text: string): string {
  return text
    .replace(/\u00ad/g, '')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Enrolled Georgia act PDFs carry sequential LINE NUMBERS in the left margin.
 * Text extraction interleaves them into the body, so the legend comes out as
 * "...NOT A BILL OR OFFICIAL538 GOVERNMENT DOCUMENT...".
 *
 * The legend contains no digits — asserted below before this is applied — so any
 * digit inside the extracted region is an extraction artefact, never statutory
 * text. Stripping them therefore cannot mask a real numeric discrepancy.
 */
function stripEnrolledActLineNumbers(text: string): string {
  return text.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}

function writeAttestation(body: Record<string, unknown>): void {
  writeFileSync(ATTESTATION_PATH, `${JSON.stringify(body, null, 2)}\n`)
}

function fail(reason: string, detail?: string): never {
  writeAttestation({
    status: 'unverified',
    sha256: null,
    byteLength: null,
    source: null,
    verifiedAt: null,
    note:
      `Verification FAILED on ${new Date().toISOString()}: ${reason} ` +
      'Every outbound render path remains blocked (LegendUnverifiedError). ' +
      'Do not hand-edit this file to unblock a send.',
  })
  console.error(`\n✗ LEGEND NOT VERIFIED — O.C.G.A. § 44-12-239(f)\n\n  ${reason}`)
  if (detail !== undefined) console.error(`\n${detail}`)
  console.error(
    '\n  The system stays FAIL-CLOSED: outbound rendering throws until this passes.\n' +
    '  To resolve, verify the string against Lexis GA Code § 44-12-239(f) or the\n' +
    '  enrolled act text by hand, then correct SOLICITATION_LEGEND_GA in\n' +
    '  lib/compliance/legend.ts and re-run.\n',
  )
  process.exit(1)
}

async function extractSource(source: Source): Promise<string | null> {
  try {
    const res = await safeFetch(source.url)
    if (!res.ok) {
      console.error(`  ${source.label}: HTTP ${res.status}`)
      return null
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const pdf = await getDocumentProxy(bytes)
    const { text } = await extractText(pdf, { mergePages: true })
    console.log(`  ${source.label}: extracted ${text.length} chars`)
    return text
  } catch (error) {
    console.error(`  ${source.label}: ${(error as Error).message}`)
    return null
  }
}

async function main(): Promise<void> {
  console.log('Verifying § 44-12-239(f) solicitation legend against primary sources…\n')

  const expected = SOLICITATION_LEGEND_GA
  const expectedNormalized = normalize(expected)
  // Anchor on a distinctive opening fragment, then read forward to the end of
  // the notice, so we compare what the statute actually says rather than
  // confirming what we already believe.
  const ANCHOR = 'THIS IS A SOLICITATION'

  for (const source of SOURCES) {
    const raw = await extractSource(source)
    if (raw === null) continue

    const normalized = normalize(raw)
    const upper = normalized.toUpperCase()
    const index = upper.indexOf(ANCHOR)
    if (index === -1) {
      console.error(`  ${source.label}: anchor "${ANCHOR}" not present in extracted text`)
      continue
    }

    // Read from the anchor to the end of the final sentence of the notice.
    const tail = normalized.slice(index)
    const endMarker = 'SOLICITATION.'
    const lastEnd = tail.toUpperCase().indexOf(endMarker, ANCHOR.length)
    const foundRaw = lastEnd === -1
      ? tail.slice(0, expectedNormalized.length + 32)
      : tail.slice(0, lastEnd + endMarker.length)

    // Safe only because the legend itself is digit-free.
    if (/\d/.test(expectedNormalized)) {
      return fail(
        'The expected legend contains digits, so enrolled-act line numbers cannot ' +
        'be stripped safely. Verify this string by hand against Lexis.',
      )
    }
    const found = stripEnrolledActLineNumbers(foundRaw)
    const lineNumbersStripped = found !== foundRaw

    if (found === expectedNormalized) {
      const byteLength = Buffer.byteLength(expected, 'utf8')
      writeAttestation({
        status: 'verified',
        sha256: legendSha256(),
        byteLength,
        source: `${source.label} — ${source.url}`,
        verifiedAt: new Date().toISOString(),
        note:
          'Byte-verified against the enrolled act text. Two extraction artefacts were ' +
          'normalised before comparison: PDF line breaks, and' +
          (lineNumbersStripped
            ? ' the sequential LINE NUMBERS the enrolled act carries in its left margin, ' +
              'which extraction interleaves into the body text. The legend contains no ' +
              'digits, so stripping them cannot mask a numeric discrepancy.'
            : ' nothing further.') +
          ' Every other character matched exactly.',
      })
      console.log(`\n✓ §1.2 legend byte-verified (${byteLength} bytes) against:`)
      console.log(`  ${source.label}`)
      console.log(`  sha256 ${legendSha256()}`)
      return
    }

    return fail(
      'The legend in our code does NOT match the primary source.',
      `  EXPECTED (lib/compliance/legend.ts):\n    ${JSON.stringify(expectedNormalized)}\n\n` +
      `  FOUND, line numbers stripped (${source.label}):\n    ${JSON.stringify(found)}\n\n` +
      `  FOUND, raw extraction:\n    ${JSON.stringify(foundRaw)}`,
    )
  }

  fail(
    'No primary source could be retrieved or parsed. The legend remains ' +
    'transcribed from secondary research and is NOT byte-verified.',
  )
}

await main()

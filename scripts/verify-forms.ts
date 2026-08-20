/**
 * CI gate for §6.2 / §10.3 — the DOR form hash pin.
 *
 * The DOR forms are the authoritative layout and must never be re-typeset.
 * § 44-12-224(b): "the failure of a claimant's designated representative to use
 * such agreement or agreements as required by this subsection SHALL VOID the
 * claimant's designated representative's claim."
 *
 * DOR revised UP-CDR2 on 2025-04-09 and will do so again. A silent revision
 * would leave us filling a superseded form — producing void claims at full loss.
 * So the live PDFs are hashed on every CI run and a change BREAKS THE BUILD
 * rather than flowing silently into production.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { safeFetch } from '../lib/compliance/blockedHosts.ts'

const ROOT = resolve(import.meta.dirname, '..')
const PIN_PATH = join(ROOT, 'data/seed/form-hashes.json')
const CACHE_DIR = join(ROOT, 'data/forms')

interface FormSpec { id: string; name: string; url: string }
interface Pin { sha256: string; byteLength: number; pinnedAt: string; rev: string }

const FORMS: FormSpec[] = [
  { id: 'UP-CDR1', name: 'CDR Registration Form', url: 'https://dor.georgia.gov/media/34076/download' },
  { id: 'UP-CDR2', name: 'Unclaimed Property Standard Recovery Agreement', url: 'https://dor.georgia.gov/document/document/cdr2-recovery-agreementpdf/download' },
  { id: 'UP-CDR3', name: 'Unclaimed Property Agreement Addendum', url: 'https://dor.georgia.gov/document/document/cdr3-agreement-addendumpdf/download' },
  { id: 'UP-CDR4', name: 'Unclaimed Property Purchase Agreement', url: 'https://dor.georgia.gov/document/document/cdr4-purchase-agreementpdf/download' },
]

function loadPins(): Record<string, Pin> {
  try { return JSON.parse(readFileSync(PIN_PATH, 'utf8')) as Record<string, Pin> }
  catch { return {} }
}

async function main(): Promise<void> {
  const updateMode = process.argv.includes('--update')
  const pins = loadPins()
  mkdirSync(CACHE_DIR, { recursive: true })

  const drift: string[] = []
  const next: Record<string, Pin> = {}

  for (const form of FORMS) {
    let bytes: Buffer
    try {
      const res = await safeFetch(form.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      bytes = Buffer.from(await res.arrayBuffer())
    } catch (error) {
      console.error(`✗ ${form.id}: could not fetch — ${(error as Error).message}`)
      process.exitCode = 1
      continue
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    writeFileSync(join(CACHE_DIR, `${form.id}.pdf`), bytes)

    const existing = pins[form.id]
    next[form.id] = {
      sha256,
      byteLength: bytes.byteLength,
      pinnedAt: existing?.pinnedAt ?? new Date().toISOString(),
      rev: existing?.rev ?? 'unknown',
    }

    if (existing === undefined) {
      console.log(`+ ${form.id}: newly pinned ${sha256.slice(0, 16)}… (${bytes.byteLength} bytes)`)
    } else if (existing.sha256 !== sha256) {
      next[form.id]!.pinnedAt = new Date().toISOString()
      drift.push(
        `  ${form.id} (${form.name})\n` +
        `    pinned: ${existing.sha256}  (${existing.byteLength} bytes, ${existing.pinnedAt})\n` +
        `    live:   ${sha256}  (${bytes.byteLength} bytes)`,
      )
    } else {
      console.log(`✓ ${form.id}: unchanged (${bytes.byteLength} bytes)`)
    }
  }

  if (drift.length > 0 && !updateMode) {
    console.error('\n✗ DOR FORM REVISION DETECTED — O.C.G.A. § 44-12-224(b)\n')
    console.error(drift.join('\n'))
    console.error(
      '\n  Using a superseded form VOIDS the representative\'s claim. Before pinning\n' +
      '  the new hash you must:\n' +
      '    1. Diff the new PDF against the cached copy in data/forms/\n' +
      '    2. Re-run the field-discovery pass (scripts/discover-form-fields.ts)\n' +
      '    3. Re-generate the golden-file reference for UP-CDR2\n' +
      '    4. Confirm the 15/5 property limits and the $2,000 addendum threshold\n' +
      '  Then re-run with --update.\n',
    )
    process.exit(1)
  }

  writeFileSync(PIN_PATH, `${JSON.stringify(next, null, 2)}\n`)
  if (drift.length > 0) console.log('\n⚠ Hashes UPDATED. Re-verify the form layout before shipping.')
  console.log(`\n✓ §6.2 form hashes verified against ${FORMS.length} live DOR PDFs`)
}

await main()

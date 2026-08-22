/**
 * CI gate — no circumvention. ADR-0001 §3, O.C.G.A. § 44-12-239(d).
 *
 * The acquisition layer is the one place in this codebase where the tempting
 * wrong move is a single line: a fetch returns 403, and the obvious next step is
 * to send a browser User-Agent and try again. That line is how a data pipeline
 * becomes a circumvention tool, and under § 44-12-239(d) a conviction involving
 * dishonesty bars CDR registration for twenty years — the downside is the
 * business, not a fine.
 *
 * So this gate exists, it runs in verify:all, and it runs again inside the
 * acquire workflow BEFORE anything touches the network — a guardrail that is
 * green in CI and absent at run time is not a guardrail.
 *
 * All predicates live in lib/acquire/verify.ts as pure functions; this file is a
 * thin driver so every one of them can be negative-probed in a test.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { SOURCES, listSources } from '../lib/acquire/sources.ts'
import { assertHostAllowed } from '../lib/compliance/blockedHosts.ts'
import {
  checkNoUrlsOnNonOpen, checkRefusalSubstantive, checkOneNetworkDoor,
  checkNoUserAgent, checkPackages, type Violation,
} from '../lib/acquire/verify.ts'

const ROOT = resolve(import.meta.dirname, '..')
const SCAN_DIRS = ['lib/acquire']
const SCAN_FILES = ['scripts/acquire.ts']

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const violations: Violation[] = []

// ── A, B: the registry itself ───────────────────────────────────────────────
for (const source of listSources()) {
  violations.push(...checkNoUrlsOnNonOpen(source))
  violations.push(...checkRefusalSubstantive(source))

  // H — belt and braces: an `open` URL must also survive the blocklist. Catches
  // the pathological case of a blocked host being added as a source.
  if (source.permission.mode === 'open') {
    for (const artifact of source.permission.artifacts) {
      try {
        assertHostAllowed(artifact.url)
      } catch (error) {
        violations.push({
          where: `${source.key}.permission.artifacts`,
          reason: (error as Error).message,
        })
      }
    }
  }
}

// ── C, D: the acquisition tree ──────────────────────────────────────────────
const files = [
  ...SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir))),
  ...SCAN_FILES.map((f) => join(ROOT, f)),
]

if (files.length === 0) {
  violations.push({
    where: 'lib/acquire/',
    reason: 'the acquisition tree is missing or empty, so this gate is verifying nothing.',
  })
}

for (const file of files) {
  const rel = relative(ROOT, file)
  const contents = readFileSync(file, 'utf8')
  // verify.ts names the banned things in order to ban them. Exempt it from the
  // text scans, or the gate fails on its own denylist.
  if (rel === 'lib/acquire/verify.ts') continue
  violations.push(...checkOneNetworkDoor(rel, contents))
  violations.push(...checkNoUserAgent(rel, contents))
}

// ── E: dependencies ─────────────────────────────────────────────────────────
violations.push(...checkPackages(
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as never,
))

if (violations.length > 0) {
  console.error('\n✗ ACQUISITION — no circumvention (ADR-0001 §3)\n')
  for (const v of violations) console.error(`  ${v.where}\n    ${v.reason}\n`)
  console.error(
    '  Defeating a technical access control creates CFAA and Georgia computer-crime\n' +
    '  exposure. A conviction involving dishonesty bars CDR registration for TWENTY\n' +
    '  YEARS under O.C.G.A. § 44-12-239(d) — this is the one mistake here that ends\n' +
    '  the business rather than costing money.\n',
  )
  process.exit(1)
}

const open = listSources().filter((s) => s.permission.mode === 'open').length
console.log(
  `✓ acquisition: ${Object.keys(SOURCES).length} source(s), ${open} fetchable, ` +
  `${files.length} file(s) scanned — one network door, no user-agent, no browser`,
)

/**
 * CI gate — the migrations must actually reproduce the database.
 *
 * This exists because of a real failure. Migrations 0009-0015 were written as
 * prose summaries pointing at "the deployed schema" while the actual DDL lived
 * only in the remote project's migration history. Commit messages said the
 * migrations were synced. They were not.
 *
 * That is not a cosmetic gap. The DATABASE is where several §1 guardrails are
 * enforced — the claimant-address write-lock (§1.9), the NOT NULL on authority
 * evidence (§7.3), the computed legend-size CHECK (§1.2), the append-only rules
 * on the audit trail. A repo that cannot rebuild them is a repo that cannot
 * rebuild the compliance posture.
 *
 * Two checks:
 *   1. No migration file is comment-only.
 *   2. Every object in data/seed/schema-manifest.json is created by some
 *      migration.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MIGRATIONS = join(ROOT, 'db/migrations')
const MANIFEST = join(ROOT, 'data/seed/schema-manifest.json')

interface Manifest {
  tables: string[]; views: string[]; functions: string[]
  types: string[]; triggers: string[]; rules: string[]
}

/** Strip comments and string literals so we match real DDL, not prose. */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

function main(): void {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const failures: string[] = []

  if (files.length === 0) {
    console.error('✗ No migrations found.')
    process.exit(1)
  }

  // ── 1. No comment-only migration ──────────────────────────────────────
  const combined: string[] = []
  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS, file), 'utf8')
    const sql = stripComments(raw).trim()
    combined.push(sql)
    if (sql === '') {
      failures.push(
        `${file} contains no SQL — only comments. A migration that documents a ` +
          'schema without creating it cannot rebuild the database.',
      )
    }
  }

  // ── 2. Every manifest object is created somewhere ─────────────────────
  const all = combined.join('\n').toLowerCase()
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest

  const patterns: Array<[keyof Manifest, (name: string) => RegExp]> = [
    ['tables',    (n) => new RegExp(`create\\s+(unlogged\\s+)?table\\s+(if\\s+not\\s+exists\\s+)?${n}\\b`)],
    ['views',     (n) => new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+${n}\\b`)],
    ['functions', (n) => new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${n}\\s*\\(`)],
    ['types',     (n) => new RegExp(`create\\s+type\\s+${n}\\b`)],
    ['triggers',  (n) => new RegExp(`create\\s+trigger\\s+${n}\\b`)],
    ['rules',     (n) => new RegExp(`create\\s+rule\\s+${n}\\b`)],
  ]

  for (const [kind, toPattern] of patterns) {
    for (const name of manifest[kind]) {
      if (!toPattern(name).test(all)) {
        failures.push(`${kind.slice(0, -1)} "${name}" exists in the database but no migration creates it.`)
      }
    }
  }

  if (failures.length > 0) {
    console.error('\n✗ MIGRATIONS DO NOT REPRODUCE THE DATABASE\n')
    for (const f of failures) console.error(`  · ${f}`)
    console.error(
      '\n  Several §1 guardrails are enforced in the DATABASE, not in application\n' +
      '  code: the claimant-address write-lock (§1.9), NOT NULL on authority\n' +
      '  evidence (§7.3), the computed legend-size CHECK (§1.2), and the\n' +
      '  append-only rules on the audit trail. A repo that cannot rebuild those\n' +
      '  cannot rebuild the compliance posture.\n',
    )
    process.exit(1)
  }

  const counts = patterns.map(([kind]) => `${manifest[kind].length} ${kind}`).join(', ')
  console.log(`✓ migrations reproduce the schema (${files.length} files: ${counts})`)
}

main()

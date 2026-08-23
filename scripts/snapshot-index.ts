/**
 * Write the public index snapshot.
 *
 *   pnpm snapshot:index
 *
 * The public pages want to say how much we have indexed. They cannot read the
 * database to find out, for two independent reasons, and it is worth being clear
 * that the second is the real one:
 *
 *   1. Mechanically, the public tree may not import `@/lib/db` (verify:templates)
 *      and may not query the property tables (verify:no-public-data). A public
 *      page renders as `anon`, which 0005_harden.sql revokes everything from.
 *
 *   2. Substantively, an aggregate count over the Georgia file may or may not be
 *      "distributing such information" under § 44-12-239.1(b). Nothing in the
 *      statute, in a rule, or in any bulletin answers it. Georgia's own seed
 *      notes that aggregate operational statistics are not owner-identifying and
 *      so § 44-12-225 should not shield them — which is a reasonable reading and
 *      not an authority.
 *
 * So the snapshot is scoped to ONE source and it is not Georgia's. California
 * publishes its file openly and its Controller says in terms that it does so for
 * locators to conduct outreach. Counting rows we obtained from a file the state
 * hands to anyone is not redistribution of a file another state restricts.
 *
 * `--all-sources` exists so this refusal is a deliberate act rather than an
 * oversight, and it prints a warning naming the statute.
 */

import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeSql, getSql } from '@/lib/db/client'
import { getSource } from '@/lib/acquire/sources'
import { cents, formatUsd } from '@/lib/compliance/money'
import { parseArgs } from './lib/args'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'data/seed/index-snapshot.json')

/** The only source whose publisher invites this use. */
const PUBLISHABLE_SOURCE = 'CA-SCO-UPD-500'

const SPEC = {
  'all-sources': {
    type: 'boolean',
    describe: 'Include every source, not just the openly-published one. Read the header first.',
  },
} as const

interface Row {
  source_key: string
  live_rows: string
  total_cash_cents: string | null
  multi_owner_rows: string
  entity_rows: string
  contested_rows: string
}

async function main(): Promise<void> {
  const args = parseArgs(SPEC, 'pnpm snapshot:index')
  const sql = getSql()

  if (args['all-sources'] === true) {
    console.warn(
      '\n  ⚠ --all-sources includes restricted files. § 44-12-239.1(b) permits\n' +
      '    distributing the Department\'s file only to solicit the owners it names,\n' +
      '    and publishing an aggregate over it has never been construed. Do not\n' +
      '    commit the result to a public page without deciding that deliberately.\n',
    )
  }

  const rows = args['all-sources'] === true
    ? await sql<Row[]>`
        select source_key, live_rows::text, total_cash_cents::text,
               multi_owner_rows::text, entity_rows::text, contested_rows::text
        from acquisition_inventory`
    : await sql<Row[]>`
        select source_key, live_rows::text, total_cash_cents::text,
               multi_owner_rows::text, entity_rows::text, contested_rows::text
        from acquisition_inventory where source_key = ${PUBLISHABLE_SOURCE}`

  if (rows.length === 0) {
    console.error(
      `\n✗ No rows for ${PUBLISHABLE_SOURCE}. Run the acquisition and ingest first.\n`,
    )
    process.exit(1)
  }

  const total = (k: keyof Row): number =>
    rows.reduce((sum, r) => sum + Number(r[k] ?? 0), 0)

  const source = getSource(PUBLISHABLE_SOURCE)
  const artifactUrl = source.permission.mode === 'open'
    ? source.permission.artifacts[0]?.url ?? ''
    : ''

  const snapshot = {
    // Date only. A timestamp would churn the diff on every run and teach a
    // reader that the number is fresher than it is.
    capturedAt: new Date().toISOString().slice(0, 10),
    sourceKey: PUBLISHABLE_SOURCE,
    sourceLabel: source.label,
    sourceUrl: artifactUrl,
    properties: total('live_rows'),
    reportedValueUsd: formatUsd(cents(total('total_cash_cents'))),
    multiOwner: total('multi_owner_rows'),
    entityOwned: total('entity_rows'),
    alreadyBeingClaimed: total('contested_rows'),
    note:
      'Counts of records we have indexed, not claims filed. Scoped to a file the ' +
      'publishing state distributes openly. Regenerate with `pnpm snapshot:index`.',
  }

  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n')

  console.log('\n  Index snapshot\n')
  for (const [k, v] of Object.entries(snapshot)) {
    if (k === 'note') continue
    console.log(`    ${k.padEnd(20)} ${String(v)}`)
  }
  console.log(`\n  Wrote ${OUT.replace(ROOT + '/', '')}\n`)

  await closeSql()
}

void main()

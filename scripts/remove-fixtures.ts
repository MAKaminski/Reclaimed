/**
 * Delete the synthetic demo properties.
 *
 *   pnpm fixtures:remove --dry-run
 *   pnpm fixtures:remove
 *
 * The FIXTURE-DEMO rows existed so the pipeline had something to render before
 * real data arrived. Real data has arrived, and they now do active harm: they are
 * the only rows in `properties_workable`, so every board number was computed from
 * six invented Georgia properties while 3,433 real Californian ones sat one table
 * away. A demo row that is indistinguishable from production data on the screen
 * is worse than an empty screen — an empty screen is at least true.
 *
 * Scoped by `source_key = 'FIXTURE-DEMO'` and nothing else. This script cannot
 * touch a real record, because a real record carries a real source key.
 *
 * Order matters: children before parents, or the foreign keys refuse. There is no
 * ON DELETE CASCADE on these relations by design — cascade deletion of claim-
 * adjacent data is exactly what you do not want to be one typo away from.
 */

import { closeSql, getSql } from '@/lib/db/client'
import { parseArgs } from './lib/args'

const FIXTURE_SOURCE = 'FIXTURE-DEMO'

const SPEC = {
  'dry-run': { type: 'boolean', describe: 'Report what would be deleted; change nothing' },
} as const

/**
 * Children first. `properties` last.
 *
 * `property_events` is included deliberately: those rows describe the appearance
 * and valuation history of properties that never existed, and leaving them would
 * put invented history in an audit surface.
 */
const CHILDREN = [
  'property_workflow',
  'property_scores',
  'property_events',
  'property_holds',
] as const

async function main(): Promise<void> {
  const args = parseArgs(SPEC, 'pnpm fixtures:remove')
  const dryRun = args['dry-run'] === true
  const sql = getSql()

  const [fixtureRow] = await sql<Array<{ count: string }>>`
    select count(*)::text as count from properties where source_key = ${FIXTURE_SOURCE}`
  const fixtureCount = fixtureRow?.count ?? '0'

  if (Number(fixtureCount) === 0) {
    console.log('\n  No FIXTURE-DEMO rows. Nothing to do.\n')
    await closeSql()
    return
  }

  console.log(`\n  ${fixtureCount} fixture propert${Number(fixtureCount) === 1 ? 'y' : 'ies'}\n`)

  for (const table of CHILDREN) {
    const [row] = await sql<Array<{ count: string }>>`
      select count(*)::text as count
      from ${sql(table)} c
      join properties p on p.property_id = c.property_id
      where p.source_key = ${FIXTURE_SOURCE}`
    console.log(`    ${table.padEnd(20)} ${row?.count ?? '0'}`)
  }

  // Anything that would be orphaned rather than deleted is a stop, not a warning:
  // an agreement or claim referencing a fixture means somebody built real work on
  // top of demo data, and that needs a human, not a cascade.
  const [agreementRow] = await sql<Array<{ count: string }>>`
    select count(*)::text as count from agreements a
    where exists (
      select 1 from properties p
      where p.property_id = any(a.property_ids) and p.source_key = ${FIXTURE_SOURCE})`
  const agreementCount = agreementRow?.count ?? '0'

  if (Number(agreementCount) > 0) {
    console.error(
      `\n✗ ${agreementCount} agreement(s) reference a fixture property.\n\n` +
      '  Refusing to delete. An agreement built on demo data is a real problem that\n' +
      '  a cascade would hide. Resolve those first.\n',
    )
    process.exit(1)
  }

  if (dryRun) {
    console.log('\n  --dry-run: nothing deleted.\n')
    await closeSql()
    return
  }

  const deleted = await sql.begin(async (tx) => {
    const counts: Record<string, number> = {}
    for (const table of CHILDREN) {
      const rows = await tx`
        delete from ${tx(table)} c
        using properties p
        where p.property_id = c.property_id and p.source_key = ${FIXTURE_SOURCE}
        returning c.property_id`
      counts[table] = rows.length
    }
    const props = await tx`
      delete from properties where source_key = ${FIXTURE_SOURCE} returning property_id`
    counts['properties'] = props.length
    return counts
  })

  console.log('\n  Deleted\n')
  for (const [table, n] of Object.entries(deleted)) {
    console.log(`    ${table.padEnd(20)} ${n}`)
  }

  const [after] = await sql<Array<{ workable: string; queue: string; live: string }>>`
    select (select count(*)::text from properties_workable) as workable,
           (select count(*)::text from work_queue)          as queue,
           (select count(*)::text from properties)          as live`

  console.log(
    `\n  Now: ${after?.live} properties, ${after?.workable} workable, ${after?.queue} queued.\n` +
    '  A zero here is the honest number, not a regression.\n',
  )

  await closeSql()
}

void main()

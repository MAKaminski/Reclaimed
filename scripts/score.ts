/**
 * Score the workable property set.
 *
 * Runs over properties_priority — the categories SB 403's ≤$500 auto-pay cannot
 * reach — rather than the whole file, because those are the only rows a human
 * should ever be offered.
 *
 *   pnpm score              score everything currently unscored or stale
 *   pnpm score --rescore    re-score everything under the current params version
 *   pnpm score --limit 500  cap the run
 */

import { getSql, closeSql } from '../lib/db/client.ts'
import { scoreProperty, type ScoringInput, type AddressQuality, type OwnerClass } from '../lib/scoring/expectedValue.ts'
import { DEFAULT_PARAMS, PARAMS_VERSION } from '../lib/scoring/params.ts'
import { getStateRules } from '../lib/compliance/stateRules.ts'
import { cents, formatUsd } from '../lib/compliance/money.ts'

const GA = getStateRules('GA')
const FEE_CAP_PCT = GA.feeCapPct as number

interface QueueRow {
  property_id: string
  owner_name: string | null
  owner_class: OwnerClass
  cash_amount_cents: string | null
  last_known_address_line1: string | null
  last_known_city: string | null
  last_known_state: string | null
  date_of_last_activity: string | null
  year_reported: number | null
}

function addressQuality(row: QueueRow): AddressQuality {
  const hasStreet = row.last_known_address_line1 !== null
  const hasCityState = row.last_known_city !== null && row.last_known_state !== null
  if (hasStreet && hasCityState) return 'full'
  if (hasStreet || hasCityState) return 'partial'
  return 'none'
}

function yearsSince(row: QueueRow): number | null {
  const iso = row.date_of_last_activity
  if (iso !== null) {
    return (Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000)
  }
  if (row.year_reported !== null) {
    return new Date().getUTCFullYear() - row.year_reported
  }
  return null
}

/**
 * Count distinct owners from the name string. Crude on purpose — the authority
 * chain (Phase 3) establishes this properly with evidence. This is only good
 * enough to rank.
 */
function ownerCount(name: string | null, ownerClass: OwnerClass): number {
  if (name === null) return 1
  if (ownerClass !== 'multi_owner') return 1
  const separators = (name.match(/ & | AND /gi) ?? []).length
  return Math.min(1 + separators, 6)
}

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === undefined || !arg.startsWith('--')) continue
    const key = arg.replace(/^--/, '')
    const next = process.argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++ }
    else out[key] = 'true'
  }
  return out
}

async function main(): Promise<void> {
  const args = parseArgs()
  const rescore = args.rescore === 'true'
  const limit = args.limit !== undefined ? Number(args.limit) : null

  const sql = getSql()
  try {
    const rows = await sql<QueueRow[]>`
      select p.property_id, p.owner_name, p.owner_class, p.cash_amount_cents,
             p.last_known_address_line1, p.last_known_city, p.last_known_state,
             p.date_of_last_activity, p.year_reported
      from properties_priority p
      ${rescore ? sql`` : sql`
        where not exists (
          select 1 from property_scores_latest s
          where s.property_id = p.property_id and s.params_version = ${PARAMS_VERSION}
        )
      `}
      ${limit !== null ? sql`limit ${limit}` : sql``}
    `

    if (rows.length === 0) {
      console.log(`Nothing to score. Every priority property already has a score under ${PARAMS_VERSION}.`)
      return
    }

    console.log(`Scoring ${rows.length.toLocaleString()} priority properties under params ${PARAMS_VERSION}…`)

    let written = 0
    let positive = 0

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      const scores = batch.map((row) => {
        const input: ScoringInput = {
          propertyId: row.property_id,
          claimValueCents: row.cash_amount_cents === null ? null : cents(Number(row.cash_amount_cents)),
          ownerClass: row.owner_class,
          addressQuality: addressQuality(row),
          yearsSinceLastActivity: yearsSince(row),
          ownerCount: ownerCount(row.owner_name, row.owner_class),
          // Entity status arrives with the SOS match in Phase 3. Until then
          // 'unchecked' — we have NOT looked, which is not the same as dissolved.
          entityStatus: 'unchecked',
          ownerDeceased: false,
          feePct: FEE_CAP_PCT,
          feeCapPct: FEE_CAP_PCT,
        }
        return scoreProperty(input, DEFAULT_PARAMS)
      })

      await sql`
        insert into property_scores ${sql(
          scores.map((s) => ({
            property_id: s.propertyId,
            params_version: s.paramsVersion,
            p_contactable: s.pContactable,
            p_signs: s.pSigns,
            p_entitlement_provable: s.pEntitlementProvable,
            gross_fee_cents: s.grossFeeCents,
            expected_cost_cents: s.expectedCostCents,
            expected_value_cents: s.expectedValueCents,
            confidence: s.confidence,
            inputs: JSON.stringify(s.inputs),
            rationale: JSON.stringify(s.rationale),
          })),
        )}
      `
      written += scores.length
      positive += scores.filter((s) => s.expectedValueCents > 0).length
      process.stdout.write(`\r  ${written.toLocaleString()} / ${rows.length.toLocaleString()}…`)
    }
    process.stdout.write('\r' + ' '.repeat(50) + '\r')

    const [summary] = await sql<Array<{ n: string; total: string; top: string }>>`
      select count(*) as n,
             coalesce(sum(expected_value_cents), 0) as total,
             coalesce(max(expected_value_cents), 0) as top
      from work_queue
    `

    console.log(`✓ ${written.toLocaleString()} scored · ${positive.toLocaleString()} with positive expected value`)
    if (summary !== undefined) {
      console.log(`\n  Work queue: ${Number(summary.n).toLocaleString()} properties`)
      console.log(`  Total expected value: ${formatUsd(cents(Number(summary.total)))}`)
      console.log(`  Best single property: ${formatUsd(cents(Number(summary.top)))}`)
    }
    console.log('\n  Priors are documented GUESSES (lib/scoring/params.ts).')
    console.log('  Back-test and correct them from observed conversion once claims close.\n')
  } finally {
    await closeSql()
  }
}

await main()

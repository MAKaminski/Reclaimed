/**
 * Weekly bulk-file ingest CLI.
 *
 * The DOR file is >1GB and refreshed weekly (§ 44-12-239.1(a)). That is far too
 * large for a serverless function, so this is a first-class pnpm script designed
 * to run on a workstation or in a container.
 *
 *   pnpm ingest --file <path> --dry-run      parse and report, load nothing
 *   pnpm ingest --file <path>                parse, stage, diff, emit events
 *
 * --dry-run is not a developer convenience. It is how you validate a weekly
 * delivery BEFORE it touches the properties table: if DOR changes the format
 * without notice, the manifest tells you before the data does.
 */

import { createReadStream, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, basename } from 'node:path'
import { parseFile, type ParsedProperty, type ParseResult } from '../lib/ingest/parse.ts'
import { getSql, closeSql } from '../lib/db/client.ts'
import {
  StagingLoader, applyDiff, createIngestRun, markRunFailed,
  recordInference, setRowsStaged,
} from '../lib/ingest/load.ts'
import { assertRegistered } from '../lib/compliance/registration.ts'

/** Hash the delivery so an accidental re-load of the same file is visible. */
async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
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

function formatDuration(ms: number): string {
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`
}

function reportInference(result: ParseResult, sizeBytes: number): void {
  const { inference, mapping } = result

  console.log('\n── Format inference ──────────────────────────────────────────')
  console.log(`  delimiter     ${inference.delimiterName}  (confidence ${inference.delimiterConfidence})`)
  console.log(`  encoding      ${inference.encoding}  (${inference.encodingBasis})`)
  console.log(`  line ending   ${JSON.stringify(inference.lineEnding)}`)
  console.log(`  header row    ${inference.hasHeader}  (confidence ${inference.headerConfidence})`)
  console.log(`                ${inference.headerBasis}`)
  console.log(`  quoting       ${inference.quoteChar ?? 'none'}`)
  console.log(`  fields/row    ${inference.fieldCount}`)

  console.log('\n── Column mapping ────────────────────────────────────────────')
  console.log(`  basis         ${mapping.basis}`)
  for (const [field, index] of Object.entries(mapping.mapping)) {
    const header = inference.columns?.[index as number] ?? `(position ${index})`
    console.log(`  ${field.padEnd(28)} ← [${String(index).padStart(2)}] ${header}`)
  }
  if (mapping.missing.length > 0) {
    console.log(`\n  ⚠ NOT FOUND: ${mapping.missing.join(', ')}`)
    console.log('    Every field is "if provided by the holder" (§ 44-12-239.1(a)),')
    console.log('    so absence may be legitimate — but confirm against the delivery.')
  }
  if (mapping.unmapped.length > 0) {
    console.log(`\n  ⚠ UNRECOGNISED COLUMNS: ${mapping.unmapped.map((u) => `[${u.index}] ${u.header}`).join(', ')}`)
    console.log('    DOR may have added fields. Update lib/ingest/columnMap.ts.')
  }

  console.log('\n── Throughput ────────────────────────────────────────────────')
  const mb = sizeBytes / 1e6
  const seconds = result.elapsedMs / 1000
  console.log(`  size          ${mb.toFixed(1)} MB`)
  console.log(`  elapsed       ${formatDuration(result.elapsedMs)}`)
  console.log(`  rate          ${(mb / seconds).toFixed(1)} MB/s · ${Math.round(result.rowsRead / seconds).toLocaleString()} rows/s`)
  const projected = (1000 / (mb / seconds))
  console.log(`  1 GB would take ${formatDuration(projected * 1000)}  ${projected < 600 ? '✓ under the 10-minute target' : '✗ OVER the 10-minute target'}`)

  console.log('\n── Rows ──────────────────────────────────────────────────────')
  console.log(`  read          ${result.rowsRead.toLocaleString()}`)
  console.log(`  parsed        ${result.rowsParsed.toLocaleString()}`)
  console.log(`  rejected      ${result.rowsRejected.toLocaleString()}` +
    (result.rowsRead > 0 ? `  (${((result.rowsRejected / result.rowsRead) * 100).toFixed(3)}%)` : ''))

  if (result.rejectSamples.length > 0) {
    console.log('\n  Reject samples (first few):')
    for (const sample of result.rejectSamples.slice(0, 5)) {
      console.log(`    line ${sample.lineNumber}: ${sample.reason}`)
      console.log(`      ${sample.excerpt.slice(0, 110)}`)
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const file = args.file
  if (file === undefined) {
    console.error('Usage: pnpm ingest --file <path> [--dry-run]')
    process.exit(1)
  }

  const path = resolve(file)
  const sizeBytes = statSync(path).size
  const dryRun = args['dry-run'] === 'true'

  // § 44-12-239.1(a) entitles a REGISTERED CDR to this database. Receiving and
  // using it before registration is § 44-12-239.2(a)(10) territory, so the load
  // path is gated exactly like the send path. --dry-run parses only and touches
  // no data, so it stays available while unregistered.
  if (!dryRun) {
    assertRegistered('receive_data')
  }

  console.log(`Ingesting ${path}`)
  console.log(`${(sizeBytes / 1e6).toFixed(1)} MB${dryRun ? '  · DRY RUN — nothing will be written' : ''}`)

  const sample: ParsedProperty[] = []
  let batches = 0

  if (dryRun) {
    const result = await parseFile(path, {
      batchSize: 5_000,
      onBatch: (rows) => {
        batches++
        if (sample.length < 3) sample.push(...rows.slice(0, 3 - sample.length))
      },
      progressEvery: 500_000,
      onProgress: (rows, bytes) => {
        process.stdout.write(`\r  ${rows.toLocaleString()} rows · ${(bytes / 1e6).toFixed(0)} MB…`)
      },
    })
    process.stdout.write('\r' + ' '.repeat(60) + '\r')
    reportInference(result, sizeBytes)

    if (sample.length > 0) {
      console.log('\n── Sample parsed rows ────────────────────────────────────────')
      for (const row of sample) {
        console.log(`  ${row.property_id}  ${(row.owner_name ?? '—').padEnd(34).slice(0, 34)}  ` +
          `${row.cash_amount_cents === null ? 'no value reported' : (row.cash_amount_cents / 100).toFixed(2)}`)
      }
    }
    console.log(`\n  ${batches.toLocaleString()} batches\n`)
    return
  }

  // ── Live load ────────────────────────────────────────────────────────────
  console.log('  hashing delivery…')
  const sha256 = await sha256File(path)

  const sql = getSql()
  const run = await createIngestRun(sql, { filename: basename(path), bytes: sizeBytes, sha256 })
  console.log(`  ingest run ${run.id}`)

  const loader = new StagingLoader(sql, run.id)

  try {
    const result = await parseFile(path, {
      batchSize: 5_000,
      onBatch: async (rows) => {
        batches++
        if (sample.length < 3) sample.push(...rows.slice(0, 3 - sample.length))
        await loader.write(rows)
      },
      progressEvery: 250_000,
      onProgress: (rows, bytes) => {
        process.stdout.write(`\r  staging ${rows.toLocaleString()} rows · ${(bytes / 1e6).toFixed(0)} MB…`)
      },
    })
    await loader.flush()
    process.stdout.write('\r' + ' '.repeat(70) + '\r')

    await recordInference(sql, run.id, result)
    await setRowsStaged(sql, run.id, loader.rowsStaged)

    reportInference(result, sizeBytes)

    console.log('\n── Applying diff ─────────────────────────────────────────────')
    const diffStart = Date.now()
    const counts = await applyDiff(sql, run.id)
    console.log(`  appeared        ${counts.appeared.toLocaleString()}`)
    console.log(`  value changed   ${counts.value_changed.toLocaleString()}`)
    console.log(`  reappeared      ${counts.reappeared.toLocaleString()}`)
    console.log(`  DISAPPEARED     ${counts.disappeared.toLocaleString()}`)
    if (counts.disappeared > 0) {
      console.log('')
      console.log('  ⚠ Disappearance usually means the property was CLAIMED — by the owner,')
      console.log('    or by a competing CDR under the § 44-12-220(g) first-complete rule.')
      console.log('    A hold is now active on each, halting outreach and agreements.')
    }
    console.log(`\n  diff applied in ${formatDuration(Date.now() - diffStart)}`)
    console.log(`\n✓ ingest run ${run.id} succeeded\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markRunFailed(sql, run.id, message)
    console.error(`\n✗ ingest run ${run.id} FAILED: ${message}\n`)
    process.exitCode = 1
  } finally {
    await closeSql()
  }
}

await main()

/**
 * Weekly bulk-file ingest CLI.
 *
 * The DOR file is >1GB and refreshed weekly (§ 44-12-239.1(a)). That is far too
 * large for a serverless function, so this is a first-class pnpm script designed
 * to run on a workstation or in a container.
 *
 *   pnpm ingest --source <key> --file <path> --dry-run       parse, load nothing
 *   pnpm ingest --source <key> --manifest <acquisition.json>  load what acquire fetched
 *
 * --source is REQUIRED. "Which source is this file" is exactly the fact
 * properties.source_key needs, nobody can infer it from a path, and it is a
 * compliance fact rather than bookkeeping: § 44-12-239.1(b) restricts what the
 * Georgia CDR file may be used for, so provenance governs what may lawfully be
 * done with a row. It also scopes the disappearance anti-join — without it,
 * loading California would retire every Georgia row for being absent from a
 * California file.
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
import { getSource, requiresRegistration } from '../lib/acquire/sources.ts'
import { parseArgs as parseFlags, ArgumentError } from './lib/args.ts'
import { readFileSync } from 'node:fs'

/** Hash the delivery so an accidental re-load of the same file is visible. */
async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

const SPEC = {
  source: { type: 'string', required: true, describe: 'Registered source key', placeholder: 'KEY' },
  file: { type: 'string', describe: 'A single delivered file', placeholder: 'PATH' },
  manifest: { type: 'string', describe: 'acquisition.json written by `pnpm acquire`', placeholder: 'PATH' },
  'dry-run': { type: 'boolean', describe: 'Parse and report; write nothing' },
  'accept-mapping-change': { type: 'boolean', describe: 'Proceed despite a column-mapping change' },
  'keep-raw': {
    type: 'boolean',
    describe: 'Persist the exact source line per row. Roughly doubles disk',
  },
  limit: {
    type: 'number',
    describe: 'Stop after N rows. For proving the live path on a small database',
    placeholder: 'N',
  },
} as const

function formatDuration(ms: number): string {
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`
}

function reportInference(
  result: ParseResult,
  sizeBytes: number,
  /**
   * Totals across EVERY file in the run.
   *
   * Without these the summary printed the last file's numbers: a run over four
   * California files reported "parsed 740,689 / rejected 2" when the truth was
   * 3,740,689 and 32. That matters more than a cosmetic miscount — the dry run
   * exists to catch a format change before it reaches the properties table, and
   * a break confined to files 1-3 was being under-reported by the very check
   * meant to catch it.
   */
  totals?: {
    rowsRead: number
    rowsParsed: number
    rowsRejected: number
    rejectSamples: ParseResult['rejectSamples']
    elapsedMs: number
  },
): void {
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
  // Totals across every file in the run. Reporting one file's row count against
  // all four files' bytes produced a nonsense 570 MB/s.
  const elapsedMs = totals?.elapsedMs ?? result.elapsedMs
  const rowsRead = totals?.rowsRead ?? result.rowsRead
  const seconds = elapsedMs / 1000
  console.log(`  size          ${mb.toFixed(1)} MB`)
  console.log(`  elapsed       ${formatDuration(elapsedMs)}`)
  console.log(`  rate          ${(mb / seconds).toFixed(1)} MB/s · ${Math.round(rowsRead / seconds).toLocaleString()} rows/s`)
  const projected = (1000 / (mb / seconds))
  console.log(`  1 GB would take ${formatDuration(projected * 1000)}  ${projected < 600 ? '✓ under the 10-minute target' : '✗ OVER the 10-minute target'}`)

  console.log('\n── Rows ──────────────────────────────────────────────────────')
  if (totals !== undefined) console.log(`  read          ${totals.rowsRead.toLocaleString()}  (all files)`)
  else console.log(`  read          ${result.rowsRead.toLocaleString()}`)
  const parsed = totals?.rowsParsed ?? result.rowsParsed
  const rejected = totals?.rowsRejected ?? result.rowsRejected
  console.log(`  parsed        ${parsed.toLocaleString()}`)
  console.log(`  rejected      ${rejected.toLocaleString()}` +
    (rowsRead > 0 ? `  (${((rejected / rowsRead) * 100).toFixed(3)}%)` : ''))

  const samples = totals?.rejectSamples ?? result.rejectSamples
  if (samples.length > 0) {
    console.log('\n  Reject samples (first few):')
    for (const sample of samples.slice(0, 5)) {
      console.log(`    line ${sample.lineNumber}: ${sample.reason}`)
      console.log(`      ${sample.excerpt.slice(0, 110)}`)
    }
  }
}

interface Manifest {
  sourceKey: string
  acquisitionId: number | null
  sha256: string
  files: string[]
}

async function main(): Promise<void> {
  let args
  try {
    args = parseFlags(SPEC, 'pnpm ingest')
  } catch (error) {
    if (error instanceof ArgumentError) { console.error(`\n${error.message}\n`); process.exit(1) }
    throw error
  }

  const source = getSource(args.source!)
  const dryRun = args['dry-run']

  // One run may span N files: California ships four CSVs in one archive, and
  // DOR-QUESTIONS #5 lists "one file or several" as unknown for Georgia. They
  // are sniffed INDEPENDENTLY — concatenating is wrong precisely because each
  // may carry its own header row.
  let paths: string[]
  let acquisitionId: number | null = null
  let deliverySha: string | null = null

  if (args.manifest !== undefined) {
    const manifest = JSON.parse(readFileSync(resolve(args.manifest), 'utf8')) as Manifest
    if (manifest.sourceKey !== source.key) {
      console.error(
        `\nManifest is for source "${manifest.sourceKey}" but --source says "${source.key}".\n`,
      )
      process.exit(1)
    }
    paths = manifest.files.map((f) => resolve(f))
    acquisitionId = manifest.acquisitionId
    deliverySha = manifest.sha256
  } else if (args.file !== undefined) {
    paths = [resolve(args.file)]
  } else {
    console.error('\nPass either --manifest <acquisition.json> or --file <path>.\n')
    process.exit(1)
  }

  const sizeBytes = paths.reduce((n, p) => n + statSync(p).size, 0)

  /**
   * Row budget across the whole run.
   *
   * Exists because the free Supabase tier is a 500 MB database and the full
   * California file needs roughly 5.7 GB once `raw` jsonb, the merge and nine
   * indexes are counted — about 11x over. Hitting that mid-COPY puts the
   * project into read-only and takes the staff and audit tables down with it.
   *
   * A bounded load proves the same code path — COPY, server-side diff, events,
   * disappearance holds — at a size the tier can hold. The GA statutory file
   * will need real capacity regardless; that is a spend decision, not a reason
   * to leave the live path unexercised until then.
   */
  const rowLimit = args.limit ?? Infinity
  const keepRaw = args['keep-raw']
  let rowsBudgeted = 0

  // Registration gates the GEORGIA entitlement, not every source. § 44-12-239.1(a)
  // is what entitles us to DOR's file, so receiving it before registration is
  // § 44-12-239.2(a)(10) territory. California's file is public and carries no
  // such condition — gating it would put public data behind something $1,200 and
  // 4-8 weeks away for no reason. DERIVED from the source, never declared.
  if (!dryRun && requiresRegistration(source)) {
    assertRegistered('receive_data')
  }

  console.log(`\nIngesting ${source.key} — ${source.label}`)
  console.log(`  ${paths.length} file(s) · ${(sizeBytes / 1e6).toFixed(1)} MB` +
    `${dryRun ? '  · DRY RUN — nothing will be written' : ''}` +
    `${Number.isFinite(rowLimit) ? `  · LIMIT ${rowLimit.toLocaleString()} rows` : ''}` +
    `${keepRaw ? '  · keeping raw source lines' : ''}`)
  if (source.columnOverrides !== null) {
    console.log(`  column mapping: PINNED (${Object.keys(source.columnOverrides).length} fields)`)
  }

  const sample: ParsedProperty[] = []
  let batches = 0

  if (dryRun) {
    let result!: ParseResult
    let totalRows = 0
    let totalParsed = 0
    let totalRejected = 0
    const allSamples: ParseResult['rejectSamples'] = []
    const started = Date.now()
    for (const [i, file] of paths.entries()) {
      process.stdout.write(`  [${i + 1}/${paths.length}] ${basename(file)}\n`)
      result = await parseFile(file, {
        batchSize: 5_000,
        columnOverrides: source.columnOverrides,
        onBatch: (rows) => {
          batches++
          if (sample.length < 3) sample.push(...rows.slice(0, 3 - sample.length))
        },
        progressEvery: 500_000,
        onProgress: (rows, bytes) => {
          process.stdout.write(`\r      ${rows.toLocaleString()} rows · ${(bytes / 1e6).toFixed(0)} MB…`)
        },
      })
      process.stdout.write('\r' + ' '.repeat(70) + '\r')
      totalRows += result.rowsRead
      totalParsed += result.rowsParsed
      totalRejected += result.rowsRejected
      // Keep a few samples from EVERY file — last-file-only samples mean a
      // malformed first file shows no evidence at all.
      allSamples.push(...result.rejectSamples.slice(0, 3))
      console.log(`      ${result.rowsRead.toLocaleString()} rows · ${result.rowsRejected.toLocaleString()} rejected`)
    }
    console.log(`\n  TOTAL ${totalRows.toLocaleString()} rows across ${paths.length} file(s)`)
    reportInference(result, sizeBytes, {
      rowsRead: totalRows, rowsParsed: totalParsed, rowsRejected: totalRejected,
      rejectSamples: allSamples, elapsedMs: Date.now() - started,
    })

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
  // The acquisition already hashed the artifact; don't read 1GB twice.
  const sha256 = deliverySha ?? await sha256File(paths[0]!)

  const sql = getSql()
  const run = await createIngestRun(sql, {
    filename: paths.map((f) => basename(f)).join(', '),
    bytes: sizeBytes,
    sha256,
  })
  await sql`
    update ingest_runs
    set source_key = ${source.key}, acquisition_id = ${acquisitionId},
        source_file_count = ${paths.length}
    where id = ${run.id}
  `
  console.log(`  ingest run ${run.id}`)

  const loader = new StagingLoader(sql, run.id)

  try {
    let result!: ParseResult
    let staged = 0
    for (const [i, file] of paths.entries()) {
      if (rowsBudgeted >= rowLimit) {
        console.log(`  [${i + 1}/${paths.length}] ${basename(file)} — skipped, row limit reached`)
        continue
      }
      console.log(`  [${i + 1}/${paths.length}] ${basename(file)}`)
      result = await parseFile(file, {
        batchSize: 5_000,
        columnOverrides: source.columnOverrides,
        onBatch: async (rows) => {
          if (rowsBudgeted >= rowLimit) return
          const room = rowLimit - rowsBudgeted
          const take = room < rows.length ? rows.slice(0, room) : rows
          rowsBudgeted += take.length
          batches++
          if (sample.length < 3) sample.push(...take.slice(0, 3 - sample.length))
          await loader.write(take.map((r) => ({
            ...r,
            // `raw` exists so a parser bug is recoverable without waiting a week
            // for the next delivery — genuinely valuable on the Georgia
            // entitlement file. It is also about half the storage: roughly
            // 2.2 GB of the 5.7 GB a full California load would need. Off by
            // default, on when the delivery is expensive to re-obtain.
            raw: keepRaw ? r.raw : null,
            source_key: source.key,
          })))
        },
        progressEvery: 250_000,
        onProgress: (rows, bytes) => {
          process.stdout.write(`\r      staging ${rows.toLocaleString()} rows · ${(bytes / 1e6).toFixed(0)} MB…`)
        },
      })
      process.stdout.write('\r' + ' '.repeat(70) + '\r')
      staged += result.rowsRead
      console.log(`      ${result.rowsRead.toLocaleString()} rows`)
    }
    await loader.flush()
    void staged
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

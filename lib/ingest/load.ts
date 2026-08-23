/**
 * Load parsed rows into Postgres and apply the weekly diff.
 *
 * Strategy is FULL REFRESH WITH DIFFING, not incremental polling:
 *   1. stage every row of the delivery into properties_staging via COPY
 *   2. call apply_ingest_diff(), which emits property_events and updates
 *      properties in ONE transaction
 *
 * Step 2 is server-side deliberately. The events and the state they describe
 * must never be able to disagree — in particular `disappeared`, which places a
 * hold that stops all outreach on a property that was probably just claimed.
 */

import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { Sql } from '@/lib/db/client'
import type { ParsedProperty, ParseResult } from './parse'

/** Column order for the COPY. Must match the encoder below exactly. */
const COPY_COLUMNS = [
  'ingest_run_id', 'property_id', 'owner_name', 'insured_name', 'beneficiary_name',
  'last_known_address_line1', 'last_known_address_line2', 'last_known_city',
  'last_known_state', 'last_known_postal', 'naupa_relation_code', 'naupa_property_type',
  'cash_amount_cents', 'share_count', 'issuer_name', 'cusip', 'safe_deposit_contents',
  'date_of_last_activity', 'year_reported', 'holder_name', 'holder_contact',
  'raw', 'source_key',
] as const

/**
 * Escape a value for COPY's default TEXT format.
 *
 * Text format is used rather than CSV because its NULL representation (\N) is
 * unambiguous: an empty CSV field cannot distinguish "" from NULL, and that
 * distinction matters here. A null cash_amount_cents means the holder reported
 * NO VALUE, which forces UP-CDR2 Path B under § 44-12-224(c)(3) — very
 * different from a reported zero.
 */
function encodeCopyValue(value: string | number | null): string {
  if (value === null) return '\\N'
  if (typeof value === 'number') return String(value)
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

export function encodeCopyRow(runId: string, row: ParsedProperty): string {
  const values: Array<string | number | null> = [
    runId,
    row.property_id,
    row.owner_name,
    row.insured_name,
    row.beneficiary_name,
    row.last_known_address_line1,
    row.last_known_address_line2,
    row.last_known_city,
    row.last_known_state,
    row.last_known_postal,
    row.naupa_relation_code,
    row.naupa_property_type,
    row.cash_amount_cents,
    row.share_count,
    row.issuer_name,
    row.cusip,
    row.safe_deposit_contents,
    row.date_of_last_activity,
    row.year_reported,
    row.holder_name,
    row.holder_contact,
    // properties.raw is JSONB, so the source line has to be a valid JSON value.
    // Writing the bare delimited line put `invalid input syntax for type json`
    // in the middle of a COPY — a bug that only a live load could surface,
    // because the dry run never encodes anything.
    row.raw === null || row.raw === undefined ? null : JSON.stringify(row.raw),
    row.source_key ?? null,
  ]
  return values.map(encodeCopyValue).join('\t') + '\n'
}

export interface IngestRunRecord {
  id: string
}

export async function createIngestRun(
  sql: Sql,
  meta: { filename: string; bytes: number; sha256: string | null },
): Promise<IngestRunRecord> {
  const [row] = await sql<IngestRunRecord[]>`
    insert into ingest_runs (source_filename, source_bytes, source_sha256, status)
    values (${meta.filename}, ${meta.bytes}, ${meta.sha256}, 'running')
    returning id
  `
  if (row === undefined) throw new Error('Failed to create ingest run')
  return row
}

/**
 * Record every format inference on the run.
 *
 * This is not telemetry. DOR "cannot offer any assistance in using this
 * database", so if a delivery is misparsed the manifest is the only way to see
 * it — before the data does the telling.
 */
export async function recordInference(
  sql: Sql,
  runId: string,
  result: Pick<ParseResult, 'inference' | 'mapping' | 'rowsRead' | 'rowsRejected' | 'rejectSamples'>,
): Promise<void> {
  const { inference, mapping } = result
  await sql`
    update ingest_runs set
      inferred_delimiter   = ${inference.delimiterName},
      inferred_encoding    = ${inference.encoding},
      inferred_has_header  = ${inference.hasHeader},
      inferred_line_ending = ${JSON.stringify(inference.lineEnding)},
      inference_confidence = ${JSON.stringify({
        delimiter: inference.delimiterConfidence,
        header: inference.headerConfidence,
        headerBasis: inference.headerBasis,
        encodingBasis: inference.encodingBasis,
        fieldCount: inference.fieldCount,
        quoteChar: inference.quoteChar,
        sampleLineCount: inference.sampleLineCount,
      })}::jsonb,
      column_mapping = ${JSON.stringify({
        basis: mapping.basis,
        mapping: mapping.mapping,
        missing: mapping.missing,
        unmapped: mapping.unmapped,
        headers: inference.columns,
      })}::jsonb,
      rows_read      = ${result.rowsRead},
      rows_rejected  = ${result.rowsRejected},
      reject_samples = ${JSON.stringify(result.rejectSamples)}::jsonb
    where id = ${runId}
  `
}

/**
 * A COPY sink that accepts batches from the parser and streams them into
 * staging. Backpressure propagates, so peak memory stays flat regardless of
 * file size.
 */
export class StagingLoader {
  private readonly chunks: string[] = []
  private staged = 0

  constructor(
    private readonly sql: Sql,
    private readonly runId: string,
  ) {}

  async write(rows: ParsedProperty[]): Promise<void> {
    for (const row of rows) this.chunks.push(encodeCopyRow(this.runId, row))
    this.staged += rows.length
    if (this.chunks.length >= 50_000) await this.flush()
  }

  async flush(): Promise<void> {
    if (this.chunks.length === 0) return
    const payload = this.chunks.splice(0, this.chunks.length)
    const writable = await this.sql`
      copy properties_staging (${this.sql.unsafe(COPY_COLUMNS.join(', '))})
      from stdin
    `.writable()
    await pipeline(Readable.from(payload), writable)
  }

  get rowsStaged(): number {
    return this.staged
  }
}

export interface DiffCounts {
  appeared: number
  value_changed: number
  disappeared: number
  reappeared: number
}

export async function applyDiff(sql: Sql, runId: string): Promise<DiffCounts> {
  const [row] = await sql<DiffCounts[]>`select * from apply_ingest_diff(${runId})`
  if (row === undefined) throw new Error('apply_ingest_diff returned no rows')
  return row
}

export async function markRunFailed(sql: Sql, runId: string, error: string): Promise<void> {
  await sql`
    update ingest_runs
    set status = 'failed', finished_at = now(), error_detail = ${error}
    where id = ${runId}
  `
}

export async function setRowsStaged(sql: Sql, runId: string, count: number): Promise<void> {
  await sql`update ingest_runs set rows_staged = ${count} where id = ${runId}`
}

/**
 * Streaming parser for the DOR bulk file.
 *
 * The file is >1GB. It must be STREAMED, never buffered — target is a full
 * parse and load in under 10 minutes on a laptop.
 *
 * Design notes:
 *   · Lines are split from raw Buffers with indexOf on the newline byte, which
 *     is materially faster than readline for a file this size.
 *   · A malformed row is REJECTED and sampled, never fatal. A weekly delivery
 *     with one bad line must not lose the other four million.
 *   · Every inference and every reject is surfaced on the result, so a misparse
 *     shows up in the manifest instead of quietly corrupting the table.
 */

import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { inferFormat, splitLine, stripBom, type FormatInference } from './sniff'
import {
  mapColumnsFromHeader,
  mapColumnsPositionally,
  mapColumnsFromOverrides,
  type ColumnMapping,
  type MappingResult,
  type PropertyField,
} from './columnMap'
import {
  coerceCents, coerceCusip, coerceDate, coerceDecimal,
  coerceInteger, coerceState, coerceText, coerceYear,
} from './coerce'

export interface ParsedProperty {
  property_id: string
  owner_name: string | null
  insured_name: string | null
  beneficiary_name: string | null
  last_known_address_line1: string | null
  last_known_address_line2: string | null
  last_known_city: string | null
  last_known_state: string | null
  last_known_postal: string | null
  naupa_relation_code: string | null
  naupa_property_type: string | null
  cash_amount_cents: number | null
  share_count: number | null
  issuer_name: string | null
  cusip: string | null
  safe_deposit_contents: string | null
  date_of_last_activity: string | null
  year_reported: number | null
  holder_name: string | null
  holder_contact: string | null
  pending_claims_count: number | null
  paid_claims_count: number | null
  declared_owner_count: number | null
  /**
   * The exact source line.
   *
   * properties.raw exists so "a parser bug is recoverable without a
   * re-delivery" — but nothing was populating it: COPY_COLUMNS omitted the
   * column and ParsedProperty had no field, so the line was discarded at parse
   * time. On a >1GB weekly entitlement file that made every parser bug cost a
   * full week's wait for the next delivery.
   */
  raw: string | null
  /** Which registered source this row came from. Set by the ingest CLI. */
  source_key?: string | null
}

export interface RejectSample {
  lineNumber: number
  reason: string
  excerpt: string
}

export interface ParseResult {
  inference: FormatInference
  mapping: MappingResult
  rowsRead: number
  rowsParsed: number
  rowsRejected: number
  rejectSamples: RejectSample[]
  elapsedMs: number
}

const MAX_REJECT_SAMPLES = 50
/** Trailing empties are commonly trimmed by exporters; this many is tolerated. */
const MAX_MISSING_TRAILING_FIELDS = 2
const SNIFF_BYTES = 256 * 1024

/** Read the head of the file to infer its format before streaming it. */
export async function sniffFile(path: string): Promise<FormatInference> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
    return inferFormat(buffer.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

function buildMapping(
  inference: FormatInference,
  overrides?: Readonly<Partial<Record<PropertyField, string>>> | null,
): MappingResult {
  // A pinned mapping wins over inference. Where we have read a source's real
  // header, guessing is strictly worse than knowing — see the note on
  // mapColumnsFromOverrides about CASH_REPORTED landing in year_reported.
  if (overrides != null && inference.hasHeader && inference.columns !== null) {
    return mapColumnsFromOverrides(inference.columns, overrides)
  }
  return inference.hasHeader && inference.columns !== null
    ? mapColumnsFromHeader(inference.columns)
    : mapColumnsPositionally(inference.fieldCount)
}

function at(fields: string[], mapping: ColumnMapping, field: PropertyField): string | undefined {
  const index = mapping[field]
  return index === undefined ? undefined : fields[index]
}

export type RowRejection = { reason: string }
export type ParsedRow =
  | { ok: true; row: ParsedProperty }
  | { ok: false; rejection: RowRejection }

export function parseRow(
  fields: string[],
  mapping: ColumnMapping,
  /** The original line, preserved on the row so a parser bug is recoverable. */
  rawLine?: string,
): ParsedRow {
  const propertyId = coerceText(at(fields, mapping, 'property_id'))
  // The Property ID is the join key and is required on UP-CDR2 §I. A row
  // without one cannot be claimed, so it cannot be worked.
  if (propertyId === null) {
    return { ok: false, rejection: { reason: 'missing property_id (the join key, required on UP-CDR2 §I)' } }
  }

  const cash = coerceCents(at(fields, mapping, 'cash_amount_cents'))

  // A NEGATIVE amount is not a claim. Nobody is owed less than nothing, so this
  // is a data error or a reversal entry in the holder's system.
  //
  // It must be caught HERE. `properties` carries `check (cash_amount_cents >= 0)`,
  // so a negative reaching apply_ingest_diff aborts the whole transaction — one
  // bad line in a weekly delivery would lose the other four million. Rejecting
  // at parse time makes it one sampled row on the manifest instead.
  //
  // It would also poison the fee basis: min(claimedAmount, propertyValue) over a
  // negative is meaningless, and § 44-12-224(d)(1) computes the cap from it.
  if (cash !== null && cash < 0) {
    return {
      ok: false,
      rejection: {
        reason: `negative cash amount (${cash} cents) — nobody is owed less than nothing; ` +
          'likely a reversal entry or a data error in the holder\'s report',
      },
    }
  }

  return { ok: true, row: {
    property_id: propertyId,
    owner_name: coerceText(at(fields, mapping, 'owner_name')),
    insured_name: coerceText(at(fields, mapping, 'insured_name')),
    beneficiary_name: coerceText(at(fields, mapping, 'beneficiary_name')),
    last_known_address_line1: coerceText(at(fields, mapping, 'last_known_address_line1')),
    last_known_address_line2: coerceText(at(fields, mapping, 'last_known_address_line2')),
    last_known_city: coerceText(at(fields, mapping, 'last_known_city')),
    last_known_state: coerceState(at(fields, mapping, 'last_known_state')),
    last_known_postal: coerceText(at(fields, mapping, 'last_known_postal')),
    naupa_relation_code: coerceText(at(fields, mapping, 'naupa_relation_code')),
    naupa_property_type: coerceText(at(fields, mapping, 'naupa_property_type')),
    cash_amount_cents: cash,
    share_count: coerceDecimal(at(fields, mapping, 'share_count')),
    issuer_name: coerceText(at(fields, mapping, 'issuer_name')),
    cusip: coerceCusip(at(fields, mapping, 'cusip')),
    safe_deposit_contents: coerceText(at(fields, mapping, 'safe_deposit_contents')),
    date_of_last_activity: coerceDate(at(fields, mapping, 'date_of_last_activity')),
    year_reported: coerceYear(at(fields, mapping, 'year_reported')),
    raw: rawLine ?? null,
    holder_name: coerceText(at(fields, mapping, 'holder_name')),
    holder_contact: coerceText(at(fields, mapping, 'holder_contact')),
    pending_claims_count: coerceInteger(at(fields, mapping, 'pending_claims_count')),
    paid_claims_count: coerceInteger(at(fields, mapping, 'paid_claims_count')),
    declared_owner_count: coerceInteger(at(fields, mapping, 'declared_owner_count')),
  } }
}

export interface ParseOptions {
  /** Called for each batch of parsed rows. Backpressure is respected. */
  onBatch: (rows: ParsedProperty[]) => Promise<void> | void
  batchSize?: number
  /** Progress callback, invoked roughly every `progressEvery` rows. */
  onProgress?: (rowsRead: number, bytesRead: number) => void
  progressEvery?: number
  /** Pinned header->field mapping for a known source. Overrides inference. */
  columnOverrides?: Readonly<Partial<Record<PropertyField, string>>> | null
}

/**
 * Stream, parse, and hand batches to `onBatch`.
 *
 * Splits on the newline BYTE against raw buffers rather than decoding the whole
 * file, then decodes only the completed line. That keeps peak memory at one
 * chunk plus one partial line regardless of file size.
 */
export async function parseFile(
  path: string,
  options: ParseOptions,
): Promise<ParseResult> {
  const startedAt = Date.now()
  const batchSize = options.batchSize ?? 5_000
  const progressEvery = options.progressEvery ?? 250_000

  const inference = await sniffFile(path)
  const mapping = buildMapping(inference, options.columnOverrides)

  const rejectSamples: RejectSample[] = []
  let rowsRead = 0
  let rowsParsed = 0
  let rowsRejected = 0
  let bytesRead = 0

  let batch: ParsedProperty[] = []
  let leftover = ''
  let isFirstLine = true

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    await options.onBatch(batch)
    batch = []
  }

  const handleLine = async (line: string): Promise<void> => {
    if (isFirstLine) {
      isFirstLine = false
      if (inference.hasHeader) return // header row is not data
    }
    if (line.trim() === '') return

    rowsRead++
    const fields = splitLine(line, inference.delimiter, inference.quoteChar)

    // Field-count mismatch handling is asymmetric, deliberately.
    //
    // TOO MANY fields means an unescaped delimiter appeared inside a value. That
    // SHIFTS every subsequent column, so the cash amount would be read from the
    // wrong position — a misaligned value flowing straight into the
    // § 44-12-224(d)(1) cap basis. Reject: a null is recoverable, a wrong number
    // is not.
    //
    // TOO FEW fields is usually just trailing empties trimmed by the exporter,
    // which is harmless because earlier columns are still aligned. Accept a
    // small shortfall and let the coercions return null.
    const surplus = fields.length - inference.fieldCount
    if (surplus > 0 || surplus < -MAX_MISSING_TRAILING_FIELDS) {
      rowsRejected++
      if (rejectSamples.length < MAX_REJECT_SAMPLES) {
        rejectSamples.push({
          lineNumber: rowsRead,
          reason:
            surplus > 0
              ? `${fields.length} fields, expected ${inference.fieldCount} — ` +
                'surplus fields shift every later column, so values would misalign'
              : `${fields.length} fields, expected ${inference.fieldCount} — too many missing`,
          excerpt: line.slice(0, 200),
        })
      }
      return
    }

    const parsed = parseRow(fields, mapping.mapping, line)
    if (!parsed.ok) {
      rowsRejected++
      if (rejectSamples.length < MAX_REJECT_SAMPLES) {
        rejectSamples.push({
          lineNumber: rowsRead,
          reason: parsed.rejection.reason,
          excerpt: line.slice(0, 200),
        })
      }
      return
    }

    rowsParsed++
    batch.push(parsed.row)
    if (batch.length >= batchSize) await flush()

    if (options.onProgress && rowsRead % progressEvery === 0) {
      options.onProgress(rowsRead, bytesRead)
    }
  }

  const stream = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })

  for await (const chunk of stream) {
    const buf = chunk as Buffer
    bytesRead += buf.length

    let text = buf.toString(inference.encoding)
    if (leftover !== '') text = leftover + text

    let start = 0
    let index = text.indexOf('\n', start)
    while (index !== -1) {
      let line = text.slice(start, index)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (rowsRead === 0 && isFirstLine) line = stripBom(line)
      await handleLine(line)
      start = index + 1
      index = text.indexOf('\n', start)
    }
    leftover = text.slice(start)
  }

  if (leftover.trim() !== '') await handleLine(leftover.replace(/\r$/, ''))
  await flush()

  return {
    inference,
    mapping,
    rowsRead,
    rowsParsed,
    rowsRejected,
    rejectSamples,
    elapsedMs: Date.now() - startedAt,
  }
}

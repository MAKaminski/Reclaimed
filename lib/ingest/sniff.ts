/**
 * Format inference for the DOR bulk file.
 *
 * DOR states explicitly that it "cannot offer any assistance in using this
 * database." We do not know the delimiter, the encoding, whether there is a
 * header row, the line ending, or the quoting convention — and the file is
 * >1GB, refreshed weekly, and may change without notice.
 *
 * So the loader SNIFFS, and records every inference on the ingest_runs row.
 * A wrong guess must be VISIBLE in the manifest rather than silently corrupting
 * the properties table.
 */

/** Candidates in rough order of likelihood for a government-issued extract. */
const DELIMITER_CANDIDATES = ['|', '\t', ',', ';', '~', '\x01', '\x1f'] as const

export type Encoding = 'utf8' | 'utf16le' | 'latin1'

export interface FormatInference {
  delimiter: string
  delimiterName: string
  /** 0–1. Consistency of the field count across sampled lines. */
  delimiterConfidence: number
  encoding: Encoding
  encodingBasis: 'bom' | 'null-byte-heuristic' | 'utf8-validation' | 'default'
  hasHeader: boolean
  headerConfidence: number
  headerBasis: string
  lineEnding: '\n' | '\r\n'
  quoteChar: '"' | null
  fieldCount: number
  /** Header values when hasHeader, else null. */
  columns: string[] | null
  /** Lines examined to reach these conclusions. */
  sampleLineCount: number
}

const DELIMITER_NAMES: Record<string, string> = {
  '|': 'pipe',
  '\t': 'tab',
  ',': 'comma',
  ';': 'semicolon',
  '~': 'tilde',
  '\x01': 'SOH (0x01)',
  '\x1f': 'unit separator (0x1F)',
}

/** Detect encoding from a byte-order mark, then from byte statistics. */
export function detectEncoding(head: Buffer): { encoding: Encoding; basis: FormatInference['encodingBasis'] } {
  if (head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    return { encoding: 'utf8', basis: 'bom' }
  }
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xfe) {
    return { encoding: 'utf16le', basis: 'bom' }
  }

  // UTF-16LE without a BOM shows a high density of zero bytes in ASCII text.
  const sample = head.subarray(0, Math.min(head.length, 4096))
  let zeroBytes = 0
  for (const byte of sample) if (byte === 0) zeroBytes++
  if (sample.length > 0 && zeroBytes / sample.length > 0.25) {
    return { encoding: 'utf16le', basis: 'null-byte-heuristic' }
  }

  // Valid UTF-8? If decoding round-trips losslessly, treat it as UTF-8.
  // Otherwise fall back to latin1, which never throws and never loses bytes.
  const decoded = sample.toString('utf8')
  if (!decoded.includes('�')) {
    return { encoding: 'utf8', basis: 'utf8-validation' }
  }
  return { encoding: 'latin1', basis: 'utf8-validation' }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Split a delimited line, honouring double-quote wrapping and "" escapes.
 * Written by hand rather than pulled from a CSV library because we must handle
 * an arbitrary single-character delimiter and malformed rows without throwing.
 */
export function splitLine(line: string, delimiter: string, quoteChar: '"' | null): string[] {
  if (quoteChar === null) return line.split(delimiter)

  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (inQuotes) {
      if (char === quoteChar) {
        if (line[i + 1] === quoteChar) { current += quoteChar; i++ }
        else inQuotes = false
      } else current += char
    } else if (char === quoteChar) {
      inQuotes = true
    } else if (char === delimiter) {
      fields.push(current); current = ''
    } else current += char
  }
  fields.push(current)
  return fields
}

/** Mean and population variance, used to score delimiter consistency. */
function stats(values: number[]): { mean: number; variance: number } {
  if (values.length === 0) return { mean: 0, variance: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return { mean, variance }
}

/**
 * Pick the delimiter by CONSISTENCY, not by raw frequency.
 *
 * Frequency alone is wrong: a comma-heavy address field beats a genuine pipe
 * delimiter on count. The real signal is that the true delimiter produces the
 * SAME field count on every line. So we score by mean count penalised by
 * variance, and require the count to be stable across the sample.
 */
export function detectDelimiter(lines: string[]): {
  delimiter: string
  confidence: number
  fieldCount: number
} {
  let best = { delimiter: ',', confidence: 0, fieldCount: 1 }

  for (const candidate of DELIMITER_CANDIDATES) {
    const counts = lines.map((line) => line.split(candidate).length)
    const { mean, variance } = stats(counts)
    if (mean < 2) continue // never appears; not a delimiter

    // Perfect consistency scores 1; any variance drags it down sharply.
    const consistency = 1 / (1 + variance)
    // Prefer more fields when consistency ties, so a delimiter that genuinely
    // splits the row beats one that appears once by chance.
    const score = consistency * Math.min(1, Math.log2(mean) / 4)

    if (score > best.confidence) {
      best = {
        delimiter: candidate,
        confidence: Number(score.toFixed(4)),
        fieldCount: Math.round(mean),
      }
    }
  }
  return best
}

const NUMERIC = /^-?[$]?[\d,]+(\.\d+)?$/
const DATE_LIKE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$|^\d{4}$/

function looksTypedNotLabel(value: string): boolean {
  const v = value.trim().replace(/^"|"$/g, '')
  if (v === '') return false
  return NUMERIC.test(v) || DATE_LIKE.test(v)
}

/**
 * Detect a header by TYPE INFERENCE: compare row 1 against rows 2–50.
 *
 * If a column holds numbers or dates in the body but text in row 1, row 1 is a
 * label. Comparing types beats looking for known field names, because we do not
 * know what DOR calls its columns.
 */
export function detectHeader(
  rows: string[][],
): { hasHeader: boolean; confidence: number; basis: string } {
  if (rows.length < 2) {
    return { hasHeader: false, confidence: 0, basis: 'too few rows to infer' }
  }

  const first = rows[0]!
  const body = rows.slice(1)
  const width = first.length

  let typedColumns = 0
  let labelledColumns = 0

  for (let col = 0; col < width; col++) {
    const bodyValues = body
      .map((r) => r[col])
      .filter((v): v is string => v !== undefined && v.trim() !== '')
    if (bodyValues.length < 3) continue

    const bodyTypedRatio =
      bodyValues.filter(looksTypedNotLabel).length / bodyValues.length
    const headerIsTyped = looksTypedNotLabel(first[col] ?? '')

    // Body is strongly numeric/date but row 1 is not → row 1 is a label.
    if (bodyTypedRatio >= 0.8) {
      typedColumns++
      if (!headerIsTyped) labelledColumns++
    }
  }

  if (typedColumns === 0) {
    // No typed columns to compare. Fall back to a weak signal: headers rarely
    // repeat values, and are usually short and word-like.
    const distinct = new Set(first.map((f) => f.trim().toLowerCase()))
    const looksLikeLabels =
      distinct.size === first.length && first.every((f) => f.trim().length > 0 && f.trim().length < 64)
    return {
      hasHeader: looksLikeLabels,
      confidence: looksLikeLabels ? 0.4 : 0.2,
      basis: 'no typed columns; used distinctness and label-shape heuristic',
    }
  }

  const ratio = labelledColumns / typedColumns
  return {
    hasHeader: ratio >= 0.75,
    confidence: Number(ratio.toFixed(4)),
    basis: `${labelledColumns}/${typedColumns} typed columns have a non-typed row 1`,
  }
}

export function detectLineEnding(text: string): '\n' | '\r\n' {
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length
  return crlf > lf / 2 ? '\r\n' : '\n'
}

export function detectQuoteChar(lines: string[]): '"' | null {
  const quoted = lines.filter((l) => /(^|[|,;\t~])"/.test(l)).length
  return quoted > lines.length * 0.1 ? '"' : null
}

/** Full inference from the head of the file. */
export function inferFormat(head: Buffer, sampleLineCount = 100): FormatInference {
  const { encoding, basis: encodingBasis } = detectEncoding(head)
  const text = stripBom(head.toString(encoding))

  const lineEnding = detectLineEnding(text)
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim() !== '')

  // Drop the last line: on a chunk boundary it is probably truncated, and a
  // truncated line would poison the field-count variance.
  const lines = rawLines.slice(0, Math.max(1, Math.min(sampleLineCount, rawLines.length - 1)))

  const quoteChar = detectQuoteChar(lines)
  const { delimiter, confidence: delimiterConfidence, fieldCount } = detectDelimiter(lines)
  const rows = lines.map((l) => splitLine(l, delimiter, quoteChar))
  const header = detectHeader(rows)

  return {
    delimiter,
    delimiterName: DELIMITER_NAMES[delimiter] ?? JSON.stringify(delimiter),
    delimiterConfidence,
    encoding,
    encodingBasis,
    hasHeader: header.hasHeader,
    headerConfidence: header.confidence,
    headerBasis: header.basis,
    lineEnding,
    quoteChar,
    fieldCount,
    columns: header.hasHeader ? (rows[0] ?? null) : null,
    sampleLineCount: lines.length,
  }
}

/**
 * Value coercion from the bulk file.
 *
 * Every function here returns null rather than throwing. A malformed cell must
 * never abort a 1GB load — it is recorded as a reject sample on the manifest and
 * the row continues. But a cell that parses WRONG is far worse than one that
 * parses to null, so each coercion is deliberately strict about what it accepts.
 */

import { dollarsToCents, type Cents } from '@/lib/compliance/money'

export function coerceText(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const trimmed = raw.trim().replace(/^"|"$/g, '').trim()
  if (trimmed === '') return null
  // Placeholder nulls seen across government extracts.
  if (/^(n\/?a|null|none|unknown|-{1,3}|\.)$/i.test(trimmed)) return null
  return trimmed
}

/**
 * Money. Returns integer cents, or null.
 *
 * Strict on purpose: a value we cannot read exactly must be null, because a
 * misread amount flows straight into the § 44-12-224(d)(1) cap basis.
 */
export function coerceCents(raw: string | undefined): Cents | null {
  const text = coerceText(raw)
  if (text === null) return null

  // Accounting negatives: (1,234.56)
  const negated = /^\((.*)\)$/.exec(text)
  const body = negated ? `-${negated[1]}` : text

  const cleaned = body.replace(/[$\s]/g, '').replace(/,/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null

  try {
    return dollarsToCents(cleaned)
  } catch {
    return null
  }
}

export function coerceInteger(raw: string | undefined): number | null {
  const text = coerceText(raw)
  if (text === null) return null
  const cleaned = text.replace(/,/g, '')
  if (!/^-?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) ? value : null
}

export function coerceDecimal(raw: string | undefined): number | null {
  const text = coerceText(raw)
  if (text === null) return null
  const cleaned = text.replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** Four-digit year, sanity-bounded. */
export function coerceYear(raw: string | undefined): number | null {
  const value = coerceInteger(raw)
  if (value === null) return null
  // Georgia's act dates to 1990; anything outside a wide band is a misparse.
  return value >= 1900 && value <= 2200 ? value : null
}

/**
 * Date. Accepts ISO, US, and compact forms, and returns an ISO date string.
 * Ambiguous two-digit years are rejected rather than guessed.
 */
export function coerceDate(raw: string | undefined): string | null {
  const text = coerceText(raw)
  if (text === null) return null

  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text)
  if (match) return isoDate(+match[1]!, +match[2]!, +match[3]!)

  match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text)
  if (match) return isoDate(+match[3]!, +match[1]!, +match[2]!)

  match = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  if (match) return isoDate(+match[1]!, +match[2]!, +match[3]!)

  return null
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (year < 1900 || year > 2200) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  // Reject impossible dates that Date silently rolls over (e.g. 31 February).
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** Two-letter USPS state code, or null. */
export function coerceState(raw: string | undefined): string | null {
  const text = coerceText(raw)
  if (text === null) return null
  const upper = text.toUpperCase()
  return /^[A-Z]{2}$/.test(upper) ? upper : null
}

export function coerceCusip(raw: string | undefined): string | null {
  const text = coerceText(raw)
  if (text === null) return null
  const upper = text.toUpperCase().replace(/\s/g, '')
  return /^[0-9A-Z]{9}$/.test(upper) ? upper : null
}

/**
 * Money is ALWAYS integer cents in this codebase.
 *
 * O.C.G.A. § 44-12-224(d)(1) caps total fees and costs at 30% of the claim basis.
 * A float rounding error on the wrong side of that line is an over-cap agreement,
 * which § 44-12-224(d)(1) reduces by force and which sits one step away from
 * "willful imposition of illegal or excessive charges" under § 44-12-239.2.
 *
 * No float may touch a fee calculation. `Cents` is branded so a bare number
 * cannot be passed where cents are expected.
 */

export type Cents = number & { readonly __brand: 'Cents' }

/** Construct Cents from an integer. Throws on non-integer or non-finite input. */
export function cents(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Money must be finite, received ${value}`)
  }
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `Money must be integer cents, received ${value}. ` +
        'Use dollarsToCents() to convert, never a float.',
    )
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money exceeds safe integer range: ${value}`)
  }
  return value as Cents
}

export const ZERO = cents(0)

/**
 * Convert a dollar figure to cents, exactly.
 *
 * Prefer passing a STRING ("1234.56"). A JavaScript number cannot represent most
 * decimal amounts exactly — 1.005 is stored as 1.00499999999999989..., so the
 * naive `Math.round(dollars * 100)` silently returns 100 cents instead of 101.
 * A one-cent error on the wrong side of the § 44-12-224(d)(1) ceiling is an
 * over-cap agreement.
 *
 * Numbers are therefore normalised through a fixed-precision decimal string
 * before conversion, and the parse below is exact decimal arithmetic on digits.
 * Rounds half away from zero, the convention the DOR forms use.
 */
export function dollarsToCents(dollars: number | string): Cents {
  let text: string
  if (typeof dollars === 'number') {
    if (!Number.isFinite(dollars)) {
      throw new TypeError(`Dollars must be finite, received ${dollars}`)
    }
    // 10 decimal places recovers the intended decimal from the stored double
    // for every amount this system will ever see.
    text = dollars.toFixed(10)
  } else {
    text = dollars.trim().replace(/[$,\s]/g, '')
  }

  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(text)
  if (match === null) {
    throw new TypeError(`Cannot parse "${dollars}" as a dollar amount`)
  }
  const [, sign, intPart = '0', fracPart = ''] = match

  const wholeCents = BigInt(intPart) * 100n + BigInt((fracPart + '00').slice(0, 2))

  // Round half away from zero on the remaining digits.
  const remainder = fracPart.slice(2)
  const roundsUp = remainder.length > 0 && remainder[0] !== undefined && remainder[0] >= '5'
  const total = roundsUp ? wholeCents + 1n : wholeCents

  const signed = sign === '-' ? -total : total
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Dollar amount ${dollars} exceeds safe integer cents`)
  }
  return cents(Number(signed))
}

export function add(a: Cents, b: Cents): Cents {
  return cents(a + b)
}

export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

export function min(a: Cents, b: Cents): Cents {
  return a <= b ? a : b
}

export function max(a: Cents, b: Cents): Cents {
  return a >= b ? a : b
}

/**
 * Multiply cents by a percentage, rounding DOWN.
 *
 * Rounding down is deliberate and is a compliance decision, not a style choice:
 * this function computes our fee, and the statutory cap is a ceiling. Rounding
 * down can only ever move the fee further inside the cap. Never change this to
 * round-half-up without re-reading § 44-12-224(d)(1).
 */
export function percentOf(amount: Cents, pct: number): Cents {
  if (!Number.isFinite(pct) || pct < 0) {
    throw new RangeError(`Percentage must be finite and non-negative, received ${pct}`)
  }
  // Scale by 10_000 so integer arithmetic carries two decimal places of percent
  // (e.g. 27.55%) without floating point entering the result.
  const pctBasisPoints = Math.round(pct * 100)
  return cents(Math.floor((amount * pctBasisPoints) / 10_000))
}

/**
 * Format cents WITHOUT a currency symbol, for form fields whose printed cell
 * already carries a "$". The DOR forms print the symbol themselves, so emitting
 * one here renders "$ $63,825.50" on a document DOR reviews.
 */
export function formatAmount(amount: Cents): string {
  return formatUsd(amount).replace('$', '')
}

/** Format cents for display, with the currency symbol. */
export function formatUsd(amount: Cents): string {
  const negative = amount < 0
  const abs = Math.abs(amount)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  const body = `$${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`
  return negative ? `-${body}` : body
}

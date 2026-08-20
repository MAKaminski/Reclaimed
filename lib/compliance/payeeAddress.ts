/**
 * Payee address validation — §1.9, O.C.G.A. § 44-12-220(d)(3).
 *
 * DOR pays the claimant DIRECTLY, at the address on the signed agreement.
 * Redirecting that address is the mechanism in every criminal prosecution in
 * this industry:
 *
 *   Commonwealth v. Stayman  (MA AG, 2025) — PO boxes and mail forwarding
 *   People v. Michaud        (IL AG, 2024) — changed victims' postal addresses
 *   US v. Badea & Gal        (D. Nev., 2021)
 *   US v. Pendergrass        (N.D. Ga., 2017) — forged POAs against businesses
 *
 * This module exists because the original check covered only the primary
 * claimant. UP-CDR2 §III has a SECOND address block (the co-claimant, form
 * field "8 Mailing Address") which was written to the PDF with no validation at
 * all. Every payee address now goes through here.
 */

export interface PayeeAddressCheck {
  ok: boolean
  /** Blocking problems. */
  errors: string[]
  /** Non-blocking, but a named human must look. */
  flags: string[]
}

/** Collapse to comparable form: casing, punctuation, and spacing are noise. */
function core(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Strip unit designators before comparison.
 *
 * "900 Recovery Way, Decatur GA 30030" and "900 Recovery Way Ste 2, Decatur GA
 * 30030" are the same building and very likely the same mailbox. Comparing raw
 * strings treats them as different, which is exactly the evasion to catch.
 */
function withoutUnit(address: string): string {
  return core(
    address.replace(
      // Two subtleties, both of which were live bugs:
      //   · `#` cannot take a leading \b — both sides are non-word characters,
      //     so "\b#" never matches at all.
      //   · longest alternative first, and a trailing \b — otherwise "fl"
      //     matches inside "Floor", consuming "Fl" and leaving "oor 3" to be
      //     partly eaten, so the unit number survives the strip.
      /(?:\b(?:suite|ste|apartment|apt|unit|room|rm|floor|fl)\b\.?|#)\s*[a-z0-9-]+/gi,
      ' ',
    ),
  )
}

const PO_BOX = /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|postal\s+box|p\.?o\.?b\.?)\b/i
/** Commercial mail-receiving agencies: a PMB is a mail drop, not a residence. */
const MAIL_DROP = /\b(pmb|private\s+mail\s*box|mailbox\s*(#|no\.?)\s*\d|c\/o\s|care\s+of\s)\b/i

export interface PayeeAddressContext {
  /** The CDR's own registered address. */
  cdrAddress: string
  /**
   * Any other address the CDR controls: agents, offices, mail services,
   * previously-used drops. Every one is a redirect vector.
   */
  cdrControlledAddresses?: readonly string[]
  /** Label used in error messages, e.g. "claimant" or "co-claimant". */
  label: string
}

/**
 * Validate one payee address.
 *
 * Returns rather than throws so a caller can surface every problem across
 * several payees at once. `assertPayeeAddress` is the throwing gate.
 */
export function checkPayeeAddress(
  address: string,
  context: PayeeAddressContext,
): PayeeAddressCheck {
  const errors: string[] = []
  const flags: string[] = []
  const trimmed = address.trim()

  if (trimmed === '') {
    return {
      ok: false,
      errors: [`${context.label} mailing address is empty. DOR pays at this address.`],
      flags: [],
    }
  }

  const controlled = [context.cdrAddress, ...(context.cdrControlledAddresses ?? [])]
    .filter((a) => a.trim() !== '')

  for (const ours of controlled) {
    // Exact, and unit-insensitive: same building is the same mailbox risk.
    if (core(trimmed) === core(ours) || withoutUnit(trimmed) === withoutUnit(ours)) {
      errors.push(
        `${context.label} mailing address resolves to an address the CDR controls ` +
          `("${ours}"). DOR pays the claimant directly at this address ` +
          '(§ 44-12-220(d)(3)). Redirecting it is the conduct behind every ' +
          'criminal prosecution in this industry.',
      )
      break
    }
  }

  // §1.9 requires PO boxes be flagged for manual review — not blocked, because
  // rural and small-business claimants legitimately use them, but never waved
  // through: a PO box is how Stayman intercepted cheques.
  if (PO_BOX.test(trimmed)) {
    flags.push(
      `${context.label} address is a PO box. Legitimate for many claimants, but ` +
        'a mail drop is how payments get intercepted — confirm it belongs to the ' +
        'claimant before sending.',
    )
  }

  if (MAIL_DROP.test(trimmed)) {
    flags.push(
      `${context.label} address looks like a commercial mail-receiving agency or ` +
        'a care-of address. Confirm the claimant actually receives mail there.',
    )
  }

  return { ok: errors.length === 0, errors, flags }
}

export class PayeeAddressError extends Error {
  readonly errors: string[]
  constructor(errors: string[]) {
    super(
      'REFUSING TO GENERATE — payee address (§ 44-12-220(d)(3)):\n' +
        errors.map((e) => `  · ${e}`).join('\n'),
    )
    this.name = 'PayeeAddressError'
    this.errors = errors
  }
}

/** Hard gate over EVERY payee on an agreement. */
export function assertPayeeAddresses(
  payees: ReadonlyArray<{ address: string; label: string }>,
  cdrAddress: string,
  cdrControlledAddresses: readonly string[] = [],
): { flags: string[] } {
  const errors: string[] = []
  const flags: string[] = []

  for (const payee of payees) {
    const result = checkPayeeAddress(payee.address, {
      cdrAddress,
      cdrControlledAddresses,
      label: payee.label,
    })
    errors.push(...result.errors)
    flags.push(...result.flags)
  }

  if (errors.length > 0) throw new PayeeAddressError(errors)
  return { flags }
}

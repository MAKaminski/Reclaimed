/**
 * The 120-day unenforceability window.
 *
 * SB 403 (eff. 2026-07-01) → O.C.G.A. § 44-12-220(d.1)(4): agreements entered
 * into on or after 2026-07-01 "and reported and delivered to the commissioner
 * under this article" are UNENFORCEABLE for 120 days after the date of payment
 * or the delivery of property to the commissioner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO(DOR-CONFIRM-120)
 *
 * THE TRIGGER DATE IS AMBIGUOUS AND DOR HAS PUBLISHED NO CONSTRUCTION.
 *
 * Read most naturally it runs from the HOLDER's remittance to DOR, making it a
 * cooling-off on newly-reported property rather than on aged inventory. The
 * competing reading anchors it to the agreement date.
 *
 * We resolve CONSERVATIVELY: where the delivery date is unknown or only
 * year-precise, the property is treated as INSIDE the window until proven
 * otherwise. Enforcing an agreement inside the window is unenforceable by
 * statute — meaning the work is done for nothing — so a false "outside" is far
 * more expensive than a false "inside".
 *
 * When DOR answers in writing, change UNENFORCEABILITY_ANCHOR below. That is the
 * only line that should need to move.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import rules from '@/data/seed/state-rules.seed.json' with { type: 'json' }

export const UNENFORCEABILITY_DAYS = rules.states.GA.unenforceabilityDays
export const UNENFORCEABILITY_APPLIES_ON_OR_AFTER = new Date(
  rules.states.GA.unenforceabilityAppliesToAgreementsOnOrAfter,
)

/** Single switch point. Flip only on a written DOR construction. */
export type UnenforceabilityAnchor =
  | 'date_paid_or_delivered_to_commissioner'
  | 'agreement_date'

export const UNENFORCEABILITY_ANCHOR: UnenforceabilityAnchor =
  'date_paid_or_delivered_to_commissioner'

const MS_PER_DAY = 86_400_000

/**
 * How precisely we know when the holder delivered the property to DOR.
 *
 * The CDR bulk file gives "year property was reported" (§ 44-12-239.1(a)), which
 * is year-precise at best — and it is unconfirmed whether that means the
 * holder's report year or DOR's receipt year. Hence 'year'.
 */
export type DeliveryDatePrecision = 'exact' | 'year' | 'unknown'

export interface DeliveryDate {
  precision: DeliveryDatePrecision
  /** Full date when precision is 'exact'. */
  date?: Date
  /** Calendar year when precision is 'year'. */
  year?: number
}

export interface EnforceabilityResult {
  /** Date on and after which the agreement is enforceable, when computable. */
  enforceableOn: Date | null
  /** True when the property is (or must be assumed) inside the 120-day window. */
  insideWindow: boolean
  /** True when we assumed rather than computed. */
  assumedConservatively: boolean
  reason: string
}

/**
 * Latest possible delivery date consistent with what we know. Using the LATEST
 * possible date is what makes the resolution conservative: it pushes
 * enforceability as far out as the data permits.
 */
function latestPossibleDelivery(d: DeliveryDate): Date | null {
  if (d.precision === 'exact') return d.date ?? null
  if (d.precision === 'year') {
    if (d.year === undefined) return null
    // 23:59:59.999 on 31 December of that year.
    return new Date(Date.UTC(d.year, 11, 31, 23, 59, 59, 999))
  }
  return null
}

export function computeEnforceability(
  delivery: DeliveryDate,
  now: Date = new Date(),
): EnforceabilityResult {
  const latest = latestPossibleDelivery(delivery)

  if (latest === null) {
    // Unknown delivery date: assume inside the window. We cannot prove otherwise.
    return {
      enforceableOn: null,
      insideWindow: true,
      assumedConservatively: true,
      reason:
        'Delivery date to the commissioner is unknown; treating the property as ' +
        'inside the 120-day window under § 44-12-220(d.1)(4). TODO(DOR-CONFIRM-120)',
    }
  }

  const enforceableOn = new Date(latest.getTime() + UNENFORCEABILITY_DAYS * MS_PER_DAY)
  const insideWindow = now.getTime() < enforceableOn.getTime()

  return {
    enforceableOn,
    insideWindow,
    assumedConservatively: delivery.precision !== 'exact',
    reason:
      delivery.precision === 'exact'
        ? `Delivered ${latest.toISOString()}; enforceable from ${enforceableOn.toISOString()}`
        : `Delivery known only to year ${delivery.year}; assuming the latest possible ` +
          `date (${latest.toISOString()}), enforceable from ${enforceableOn.toISOString()}. ` +
          'TODO(DOR-CONFIRM-120)',
  }
}

/**
 * Does the window apply to this agreement at all?
 * § 44-12-220(d.1)(4) reaches agreements entered into on or after 2026-07-01.
 */
export function windowAppliesToAgreement(agreementDate: Date): boolean {
  return agreementDate.getTime() >= UNENFORCEABILITY_APPLIES_ON_OR_AFTER.getTime()
}

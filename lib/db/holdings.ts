import { createClient } from '@/lib/db/supabase'
import { getSessionState } from '@/lib/db/auth'

/**
 * What the holdings are made of.
 *
 * Three dimensions, and each is here because it decides something rather than
 * because it is available:
 *
 *   class   decides whether the STATE pays it out for free. SB 403 auto-pay
 *           (§ 44-12-220(d.1)(1)) reaches sole-owner natural-person cash only, so
 *           `multi_owner` and `entity` are structurally outside it. Georgia is
 *           systematically draining the tier we cannot serve and leaving the tier
 *           we can — the class mix IS the addressable market.
 *
 *   type    decides the documentary burden, and whether it is cash at all.
 *           Securities carry a CUSIP and a valuation date and may have been sold;
 *           safe deposit contents are often auctioned and replaced by proceeds;
 *           insurance and mineral proceeds each need different evidence. Type
 *           also drives is_material_non_cash(), the only route by which a
 *           NULL-valued row becomes workable.
 *
 *   holder  decides leverage and provenance difficulty. One holder with hundreds
 *           of records is one documentation practice to learn rather than
 *           hundreds; a dissolved or merged holder is a chain-of-title problem
 *           before any owner-side work starts.
 *
 * Reads `holdings_composition`, which aggregates server-side. Doing this in the
 * page would mean pulling every row to count them.
 */

export interface CompositionRow {
  label: string
  rows: number
  totalCents: number
  multiOwnerRows: number
  entityRows: number
}

export type CompositionDimension = 'class' | 'type' | 'holder'

/**
 * Returns null for a caller with no staff row rather than an empty array, so a
 * surface cannot render "no holdings" at somebody who simply is not authorised.
 * RLS would return nothing anyway; this makes the difference legible.
 */
export async function getComposition(
  dimension: CompositionDimension,
  { sourceKey, limit = 10 }: { sourceKey?: string; limit?: number } = {},
): Promise<CompositionRow[] | null> {
  const { staff } = await getSessionState()
  if (staff === null) return null

  const supabase = await createClient()
  let query = supabase
    .from('holdings_composition')
    .select('label,rows,total_cents,multi_owner_rows,entity_rows')
    .eq('dimension', dimension)
    .order('total_cents', { ascending: false })
    .limit(limit)

  if (sourceKey !== undefined && sourceKey !== '') query = query.eq('source_key', sourceKey)

  const { data, error } = await query.returns<Array<Record<string, unknown>>>()
  if (error !== null) return []

  return (data ?? []).map((r) => ({
    label: String(r.label),
    rows: Number(r.rows ?? 0),
    totalCents: Number(r.total_cents ?? 0),
    multiOwnerRows: Number(r.multi_owner_rows ?? 0),
    entityRows: Number(r.entity_rows ?? 0),
  }))
}

/**
 * The highest-value records we actually hold, for the board.
 *
 * Deliberately NOT the work queue. These are indexed, not workable — but a board
 * that shows only six fixtures while 3,433 real records sit one table away is
 * showing the wrong thing, and the fixtures are the part that is not real.
 */
export interface TopHolding {
  propertyId: string
  ownerName: string | null
  ownerClass: string
  ownerCount: number | null
  cashAmountCents: number | null
  naupaPropertyType: string | null
  holderName: string | null
  sourceKey: string | null
}

export async function getTopHoldings(limit = 8): Promise<TopHolding[]> {
  const { staff } = await getSessionState()
  if (staff === null) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .select(
      'property_id,owner_name,owner_class,owner_count,cash_amount_cents,' +
      'naupa_property_type,holder_name,source_key',
    )
    .is('retired_at', null)
    .order('cash_amount_cents', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<Array<Record<string, unknown>>>()

  if (error !== null) return []

  return (data ?? []).map((r) => ({
    propertyId: String(r.property_id),
    ownerName: (r.owner_name as string | null) ?? null,
    ownerClass: String(r.owner_class),
    ownerCount: r.owner_count === null ? null : Number(r.owner_count),
    cashAmountCents: r.cash_amount_cents === null ? null : Number(r.cash_amount_cents),
    naupaPropertyType: (r.naupa_property_type as string | null) ?? null,
    holderName: (r.holder_name as string | null) ?? null,
    sourceKey: (r.source_key as string | null) ?? null,
  }))
}

/**
 * Sortable columns, and the database column each maps to.
 *
 * An allowlist rather than passing the parameter through: `order()` takes a
 * column name, and a query string that reaches it unchecked lets a visitor sort
 * by any column on the table — including ones deliberately absent from the
 * select list. RLS would still bound what comes back, but ordering by a column
 * you cannot see is an information leak in its own right.
 */
export const SORTABLE = {
  value: { column: 'cash_amount_cents', label: 'Reported', numeric: true },
  owner: { column: 'owner_name', label: 'Owner', numeric: false },
  class: { column: 'owner_class', label: 'Class', numeric: false },
  owners: { column: 'owner_count', label: 'Owners', numeric: true },
  type: { column: 'naupa_property_type', label: 'Type', numeric: false },
  holder: { column: 'holder_name', label: 'Holder', numeric: false },
} as const

export type SortKey = keyof typeof SORTABLE

export function resolveSort(raw: string | undefined): SortKey {
  // Object.hasOwn, NOT `in`. `in` walks the prototype chain, so `?sort=toString`
  // and `?sort=constructor` both pass an `in` check, resolve to a SORTABLE entry
  // that does not exist, and reach `.order(undefined)`. Pinned by a test.
  return raw !== undefined && Object.hasOwn(SORTABLE, raw) ? (raw as SortKey) : 'value'
}

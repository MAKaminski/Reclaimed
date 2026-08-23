import Link from 'next/link'
import { createClient } from '@/lib/db/supabase'
import { getSessionState } from '@/lib/db/auth'
import { cents, formatUsd } from '@/lib/compliance/money'
import { lookupFor } from '@/lib/acquire/stateLookup'
import { CopyId } from '@/components/CopyId'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

/**
 * Holdings — what we have LOADED, which is deliberately not what we may WORK.
 *
 * The board, the workflow and the queue all descend from `properties_workable`.
 * That is correct for deciding what to do next and useless for answering "did
 * the load actually land", because a source can be fully ingested and still
 * contribute zero workable rows. When California's 3,433 rows arrived, every
 * staff surface kept reading zero and there was no screen that could tell the
 * difference between "nothing loaded" and "loaded, not actionable".
 *
 * This page reports holdings and names the blocking predicate. It has no
 * actions on it, by design: `acquisition_inventory` is not a queue, and the
 * remedy for a blocked source is verifying that state's rules, never relaxing
 * the filter.
 */

interface InventoryRow {
  source_key: string
  live_rows: number
  retired_rows: number
  multi_owner_rows: number
  entity_rows: number
  valued_rows: number
  above_autopay_rows: number
  total_cash_cents: string | number | null
  max_cash_cents: string | number | null
  dated_rows: number
  past_window_rows: number
  first_loaded_at: string | null
  last_seen_at: string | null
  workable_rows: number
  workable_blocked_by: string | null
  contested_rows: number
  previously_paid_rows: number
  owner_count_disputes: number
}

interface PropertyRow {
  property_id: string
  owner_name: string | null
  owner_class: string
  owner_count: number | null
  co_owner_names: string[] | null
  last_known_city: string | null
  last_known_state: string | null
  cash_amount_cents: string | number | null
  naupa_property_type: string | null
  holder_name: string | null
  source_key: string | null
}

/**
 * Why a source contributes nothing to the queue, in the terms of the actual
 * predicate rather than a reassuring paraphrase.
 */
const BLOCKED_EXPLANATION: Record<string, { headline: string; detail: string }> = {
  no_delivery_date: {
    headline: 'No delivery date in the file',
    detail:
      'enforceable_on() needs either a delivery date or a year reported to compute ' +
      'the § 44-12-220(d.1)(4) window. This file supplies neither, so the function ' +
      'returns NULL and the workable filter excludes every row. Do not "fix" the ' +
      'NULL: that window is Georgia law, and applying it to another state would ' +
      'assert an enforceability date nothing supports.',
  },
  inside_dor_window: {
    headline: 'Still inside the 120-day window',
    detail:
      'The Department has not yet had § 44-12-220(d.1)(4)’s 120 days to pay these ' +
      'owners directly. They become workable on their own.',
  },
  below_autopay_ceiling: {
    headline: 'Below the auto-pay ceiling',
    detail:
      'Every row is under $500 with no material non-cash content, so § 44-12-220(d.1)(1) ' +
      'auto-pay reaches them and there is no service to sell.',
  },
  other_filter: {
    headline: 'Excluded by a hold, agreement or suppression',
    detail:
      'Rows exist and clear the date and value tests, but each is held, already ' +
      'under an agreement, or suppressed.',
  },
}

function num(v: string | number | null | undefined): number {
  return v === null || v === undefined ? 0 : Number(v)
}

export default async function HoldingsPage({ searchParams }: {
  searchParams: Promise<{ source?: string; q?: string; page?: string }>
}) {
  const supabase = await createClient()
  const { staff } = await getSessionState()
  const { source, q, page } = await searchParams

  if (staff === null) {
    return (
      <>
        <h1 style={{ fontSize: '1.5rem' }}>Holdings</h1>
        <p style={{ color: '#57534e' }}>
          Staff access required. There is no public view of this data by design
          — § 44-12-239.1(b) permits distributing the file only for soliciting
          owners, and RLS denies every unauthorised read.
        </p>
      </>
    )
  }

  const { data: invData, error: invError } = await supabase
    .from('acquisition_inventory')
    .select('*')
    .order('live_rows', { ascending: false })
    .returns<InventoryRow[]>()

  if (invError !== null) {
    return (
      <>
        <h1 style={{ fontSize: '1.5rem' }}>Holdings</h1>
        <p style={{ color: '#b91c1c' }}>{invError.message}</p>
      </>
    )
  }

  const inventory = invData ?? []
  const totalLive = inventory.reduce((s, r) => s + num(r.live_rows), 0)
  const totalWorkable = inventory.reduce((s, r) => s + num(r.workable_rows), 0)
  const totalCash = inventory.reduce((s, r) => s + num(r.total_cash_cents), 0)

  // The row listing is a separate read because it is paged and filtered, and
  // because the summary must render even if the listing is empty.
  const pageNum = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)
  const from = (pageNum - 1) * PAGE_SIZE

  let rowQuery = supabase
    .from('properties')
    .select(
      'property_id,owner_name,owner_class,owner_count,co_owner_names,' +
      'last_known_city,last_known_state,cash_amount_cents,naupa_property_type,' +
      'holder_name,source_key',
      { count: 'exact' },
    )
    .is('retired_at', null)
    .order('cash_amount_cents', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1)

  if (source !== undefined && source !== '') rowQuery = rowQuery.eq('source_key', source)
  if (q !== undefined && q.trim() !== '') rowQuery = rowQuery.ilike('owner_name', `%${q.trim()}%`)

  const { data: rowData, count, error: rowError } = await rowQuery.returns<PropertyRow[]>()
  const rows = rowData ?? []
  const matched = count ?? 0
  const lastPage = Math.max(1, Math.ceil(matched / PAGE_SIZE))

  const qs = (over: Record<string, string | undefined>): string => {
    const p = new URLSearchParams()
    const merged = { source, q, page: String(pageNum), ...over }
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== '' && !(k === 'page' && v === '1')) p.set(k, v)
    }
    const s = p.toString()
    return s === '' ? '/holdings' : `/holdings?${s}`
  }

  return (
    <>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Holdings</h1>
      <p style={{ color: '#57534e', marginTop: 0 }}>
        Every row we have loaded, by source. {totalLive.toLocaleString()} properties ·{' '}
        {formatUsd(cents(totalCash))} reported value · {totalWorkable.toLocaleString()} workable.
      </p>
      <p style={{ color: '#57534e', marginTop: 0, fontSize: '0.875rem' }}>
        Loaded is not workable. The <Link href="/dashboard">board</Link> and{' '}
        <Link href="/queue">queue</Link> read the workable tier only; a source can be
        fully ingested and contribute nothing to either. This page says which, and why.
      </p>

      {/* ── Per-source inventory ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
        {inventory.map((inv) => {
          const blocked = inv.workable_blocked_by
          const explain = blocked === null ? null : BLOCKED_EXPLANATION[blocked]
          const active = source === inv.source_key
          return (
            <div
              key={inv.source_key}
              style={{
                border: `1px solid ${active ? '#1c1917' : '#e7e5e4'}`,
                borderRadius: '0.5rem',
                padding: '1rem 1.25rem',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '0.9375rem' }}>{inv.source_key}</strong>
                <Link
                  href={active ? qs({ source: undefined, page: '1' }) : qs({ source: inv.source_key, page: '1' })}
                  style={{ fontSize: '0.8125rem' }}
                >
                  {active ? 'clear filter' : 'show these rows'}
                </Link>
                <span style={{ marginLeft: 'auto', color: '#78716c', fontSize: '0.75rem' }}>
                  loaded {inv.first_loaded_at?.slice(0, 10) ?? '—'}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))',
                  gap: '0.75rem 1.5rem',
                  marginTop: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                <Stat label="Loaded" value={num(inv.live_rows).toLocaleString()} />
                <Stat label="Reported value" value={formatUsd(cents(num(inv.total_cash_cents)))} />
                <Stat label="Largest" value={formatUsd(cents(num(inv.max_cash_cents)))} />
                <Stat label="Multi-owner" value={num(inv.multi_owner_rows).toLocaleString()} />
                <Stat label="Entity-owned" value={num(inv.entity_rows).toLocaleString()} />
                <Stat
                  label="Already claimed"
                  value={num(inv.contested_rows).toLocaleString()}
                  title="A claim is already in flight at the state. Excluded from the workable tier — the owner is engaged, possibly by a competing CDR holding a signed agreement."
                  emphasis={num(inv.contested_rows) > 0 ? 'warn' : 'muted'}
                />
                <Stat
                  label="Workable"
                  value={num(inv.workable_rows).toLocaleString()}
                  emphasis={num(inv.workable_rows) === 0 ? 'muted' : 'normal'}
                />
              </div>

              {num(inv.owner_count_disputes) > 0 && (
                <p style={{
                  marginTop: '0.75rem', marginBottom: 0,
                  fontSize: '0.75rem', color: '#a16207',
                }}>
                  {num(inv.owner_count_disputes).toLocaleString()} row(s) where the
                  state&rsquo;s declared owner count disagrees with the count derived
                  from the file&rsquo;s own rows. A defect in their export, not ours —
                  but if this number jumps, suspect the multi-owner collapse first.
                </p>
              )}

              {explain !== undefined && explain !== null && (
                <div
                  style={{
                    marginTop: '0.875rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #f5f5f4',
                    fontSize: '0.8125rem',
                    color: '#57534e',
                  }}
                >
                  <strong style={{ color: '#1c1917' }}>
                    0 workable — {explain.headline}
                  </strong>
                  <p style={{ margin: '0.375rem 0 0' }}>{explain.detail}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Row listing ──────────────────────────────────────────────── */}
      <h2 style={{ fontSize: '1.125rem', marginTop: '2.5rem', marginBottom: '0.25rem' }}>
        {source !== undefined && source !== '' ? source : 'All sources'}
      </h2>

      <form method="get" action="/holdings" style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0 1rem' }}>
        {source !== undefined && source !== '' && (
          <input type="hidden" name="source" value={source} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search owner name"
          style={{
            flex: '1 1 16rem', padding: '0.4rem 0.6rem', fontSize: '0.875rem',
            border: '1px solid #d6d3d1', borderRadius: '0.25rem',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '0.4rem 0.9rem', fontSize: '0.875rem', cursor: 'pointer',
            border: '1px solid #d6d3d1', borderRadius: '0.25rem', background: '#fafaf9',
          }}
        >
          Search
        </button>
      </form>

      {rowError !== null ? (
        <p style={{ color: '#b91c1c' }}>{rowError.message}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#57534e' }}>No rows match.</p>
      ) : (
        <>
          <p style={{ color: '#78716c', fontSize: '0.8125rem', margin: '0 0 0.5rem' }}>
            {matched.toLocaleString()} matching · showing {(from + 1).toLocaleString()}–
            {(from + rows.length).toLocaleString()} · ranked by reported value
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#78716c', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.5rem 0.75rem 0.5rem 0' }}>Owner</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Class</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Reported</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Type</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Holder</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Verify</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.property_id} style={{ borderTop: '1px solid #e7e5e4', verticalAlign: 'top' }}>
                    <td style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>
                      <div style={{ fontWeight: 500, color: '#1c1917' }}>{row.owner_name ?? '—'}</div>
                      <div style={{ color: '#a8a29e', fontSize: '0.75rem' }}>
                        <CopyId id={row.property_id} />
                        {row.last_known_city !== null &&
                          ` · ${row.last_known_city}, ${row.last_known_state ?? ''}`}
                      </div>
                      {row.co_owner_names !== null && row.co_owner_names.length > 0 && (
                        <div style={{ color: '#78716c', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                          + {row.co_owner_names.join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#57534e' }}>
                      {row.owner_class}
                      {num(row.owner_count) > 1 && (
                        <div style={{ color: '#a8a29e', fontSize: '0.75rem' }}>
                          {row.owner_count} owners
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>
                      {row.cash_amount_cents === null
                        ? <span style={{ color: '#a8a29e', fontWeight: 400 }}>—</span>
                        : formatUsd(cents(num(row.cash_amount_cents)))}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#57534e' }}>
                      {row.naupa_property_type ?? '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#57534e', maxWidth: '16rem' }}>
                      {row.holder_name ?? '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <StateLookupLink sourceKey={row.source_key} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lastPage > 1 && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.875rem' }}>
              {pageNum > 1 && <Link href={qs({ page: String(pageNum - 1) })}>← Previous</Link>}
              <span style={{ color: '#78716c' }}>Page {pageNum} of {lastPage.toLocaleString()}</span>
              {pageNum < lastPage && <Link href={qs({ page: String(pageNum + 1) })}>Next →</Link>}
            </div>
          )}
        </>
      )}

      <p style={{ marginTop: '2rem', fontSize: '0.8125rem', color: '#78716c' }}>
        Read-only. § 44-12-239.1(b) permits distributing this file solely to solicit
        the owners it names; there is no export here and none is coming.
      </p>
    </>
  )
}

function Stat({ label, value, emphasis = 'normal', title }: {
  label: string
  value: string
  emphasis?: 'normal' | 'muted' | 'warn'
  title?: string
}) {
  const colour = emphasis === 'muted' ? '#a8a29e' : emphasis === 'warn' ? '#a16207' : '#1c1917'
  return (
    <div title={title}>
      <div style={{ color: '#78716c', fontSize: '0.75rem', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 600, color: colour, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

/**
 * California publishes no per-property URL — verified by driving the real form
 * (see lib/acquire/stateLookup.ts). So this links to the authority's search and
 * says what to paste, rather than dressing a generic form up as a deep link.
 */
function StateLookupLink({ sourceKey }: { sourceKey: string | null }) {
  const lookup = lookupFor(sourceKey)
  if (lookup === null) {
    return <span style={{ color: '#d6d3d1', fontSize: '0.75rem' }}>—</span>
  }
  return (
    <a
      href={lookup.url}
      target="_blank"
      rel="noopener noreferrer"
      title={
        `Opens the ${lookup.authority} search. ${lookup.note} ` +
        `Click the ID at left to copy it, then paste into "${lookup.idFieldLabel}".`
      }
      style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
    >
      look up ↗
    </a>
  )
}

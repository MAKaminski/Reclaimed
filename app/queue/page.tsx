import { createClient } from '@/lib/db/supabase'
import { getSessionState } from '@/lib/db/auth'
import { cents, formatUsd } from '@/lib/compliance/money'
import type { WorkQueueRow } from '@/lib/db/supabase'

export const dynamic = 'force-dynamic'

const REASON_LABEL: Record<string, string> = {
  entity_owned: 'Entity-owned',
  multi_owner: 'Multi-owner',
  securities: 'Securities',
  safe_deposit: 'Safe deposit',
  cash_above_autopay_ceiling: 'Cash > $500',
  other: 'Other',
}

export default async function QueuePage() {
  const supabase = await createClient()
  const { staff } = await getSessionState()

  if (staff === null) {
    return (
      <>
        <h1 style={{ fontSize: '1.5rem' }}>Work queue</h1>
        <p style={{ color: '#57534e' }}>
          Staff access required. There is no public view of this data by design
          — § 44-12-239.1(b) permits distributing the CDR file only for
          soliciting owners, and RLS denies every unauthorised read. An
          administrator grants access in advance; it is never self-service.
        </p>
      </>
    )
  }

  const { data, error } = await supabase
    .from('work_queue')
    .select('*')
    .limit(200)
    .returns<WorkQueueRow[]>()

  if (error !== null) {
    return (
      <>
        <h1 style={{ fontSize: '1.5rem' }}>Work queue</h1>
        <p style={{ color: '#b91c1c' }}>{error.message}</p>
        <p style={{ color: '#57534e', fontSize: '0.875rem' }}>
          If this reads as a permission error, the signed-in user has no row in
          `staff`. That is RLS working, not a bug.
        </p>
      </>
    )
  }

  const rows = data ?? []
  const totalEv = rows.reduce((sum, r) => sum + Number(r.expected_value_cents), 0)

  return (
    <>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Work queue</h1>
      <p style={{ color: '#57534e', marginTop: 0 }}>
        Ranked by expected value across the priority tier — the categories
        § 44-12-220(d.1)(1) auto-pay cannot reach. {rows.length} properties ·{' '}
        {formatUsd(cents(totalEv))} total expected value.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: '#57534e' }}>
          Nothing queued. Run <code>pnpm ingest</code> then <code>pnpm score</code>.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#78716c', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.5rem 0.75rem 0.5rem 0' }}>Owner</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Tier</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Claim</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>EV</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }} title="P(contactable) × P(signs) × P(entitlement provable)">
                  P(c)·P(s)·P(e)
                </th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Why it ranks here</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.property_id} style={{ borderTop: '1px solid #e7e5e4', verticalAlign: 'top' }}>
                  <td style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>
                    <a href={`/property/${row.property_id}`} style={{ fontWeight: 500, color: '#1c1917' }}>
                      {row.owner_name ?? '—'}
                    </a>
                    <div style={{ color: '#a8a29e', fontSize: '0.75rem' }}>
                      {row.property_id}
                      {row.last_known_city !== null && ` · ${row.last_known_city}, ${row.last_known_state ?? ''}`}
                    </div>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#57534e' }}>
                    {REASON_LABEL[row.priority_reason] ?? row.priority_reason}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                    {row.cash_amount_cents === null
                      ? <span style={{ color: '#a8a29e' }}>no value reported</span>
                      : formatUsd(cents(Number(row.cash_amount_cents)))}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>
                    {formatUsd(cents(Number(row.expected_value_cents)))}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#57534e', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(row.p_contactable).toFixed(2)} · {Number(row.p_signs).toFixed(2)} · {Number(row.p_entitlement_provable).toFixed(2)}
                    <div style={{ fontSize: '0.7rem', color: '#a8a29e' }}>
                      conf {Number(row.confidence).toFixed(2)}
                    </div>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#57534e', maxWidth: '26rem' }}>
                    {row.rationale.length === 0
                      ? <span style={{ color: '#a8a29e' }}>No flags</span>
                      : <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                          {row.rationale.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: '2rem', fontSize: '0.8125rem', color: '#78716c' }}>
        Scored under params <code>{rows[0]?.params_version ?? '—'}</code>. Every
        prior in <code>lib/scoring/params.ts</code> is a documented guess, kept
        with its inputs so it can be corrected from observed conversion once
        claims start closing.
      </p>
    </>
  )
}

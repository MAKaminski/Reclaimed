import Link from 'next/link'
import type { StuckRow } from '@/lib/db/workflow'
import { formatUsd, cents } from '@/lib/compliance/money'
import { THRESHOLDS } from '@/lib/pipeline/thresholds'

/**
 * Oldest in stage. Today this is aging; when there are enough closed claims to
 * set targets it becomes aging-vs-SLA with no change to the layout.
 */
export function StuckList({ rows }: { rows: readonly StuckRow[] }) {
  if (rows.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-small)' }}>
        Nothing is in flight yet. Items appear here once you start working them.
      </p>
    )
  }

  return (
    <div className="scroll-x">
      <table className="fact-table">
        <thead>
          <tr><th>Owner</th><th>Stage</th><th>Days</th><th>Expected value</th><th>Why prioritised</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stale = r.days_in_stage > THRESHOLDS.staleAfterDays
            return (
              <tr key={r.property_id}>
                <td>
                  <Link href={`/property/${r.property_id}`}>
                    {r.owner_name ?? r.property_id}
                  </Link>
                </td>
                <td style={{ color: 'var(--muted)' }}>{r.stage.replace(/_/g, ' ')}</td>
                <td style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: stale ? 'var(--stop-fg)' : 'var(--muted)',
                  fontWeight: stale ? 700 : 400,
                }}>{r.days_in_stage}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatUsd(cents(r.expected_value_cents))}
                </td>
                <td style={{ color: 'var(--faint)' }}>
                  {r.priority_reason?.replace(/_/g, ' ') ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

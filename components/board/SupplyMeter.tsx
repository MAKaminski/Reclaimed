import { formatUsd } from '@/lib/compliance/money'
import { cents } from '@/lib/compliance/money'
import type { PipelineSupply } from '@/lib/db/workflow'
import { THRESHOLDS } from '@/lib/pipeline/thresholds'

/**
 * "How full is my pipeline" — the first question, answered on one line.
 *
 * This is the count of SCORED OPPORTUNITIES NOBODY HAS TOUCHED. It is not a
 * stage count: property_workflow rows only exist once a human acts, so a fresh
 * database with 50,000 scored properties has zero stage counts and a very full
 * pipeline. Conflating the two is how a dashboard reports an empty business
 * that is actually just unstarted.
 */
export function SupplyMeter({ supply, scoreAgeDays }: {
  supply: PipelineSupply
  scoreAgeDays: number | null
}) {
  const stale = scoreAgeDays !== null && scoreAgeDays > THRESHOLDS.scoreStaleAfterDays

  return (
    <div className="card" style={{ marginTop: '0.75rem' }}>
      <div className="stat-row">
        <span><strong style={{ color: 'var(--ink)', fontSize: 'var(--fs-h3)' }}>{supply.unworkedCount.toLocaleString()}</strong> unworked opportunities</span>
        <span><strong style={{ color: 'var(--ink)' }}>{formatUsd(cents(supply.unworkedExpectedValueCents))}</strong> expected value</span>
        <span><strong style={{ color: 'var(--ink)' }}>{supply.highValueCount.toLocaleString()}</strong> above $500 EV</span>
        <span style={{ color: stale ? 'var(--stop-fg)' : 'var(--faint)' }}>
          {scoreAgeDays === null
            ? 'never scored'
            : `last scored ${scoreAgeDays === 0 ? 'today' : `${scoreAgeDays}d ago`}`}
          {stale && ' — stale'}
        </span>
      </div>
    </div>
  )
}

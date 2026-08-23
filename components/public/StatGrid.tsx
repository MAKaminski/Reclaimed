import type { Stat } from '@/lib/public/marketStats'

/**
 * A grid of figures, each carrying its own provenance.
 *
 * The source line is not a footnote and is not optional. This site has a page
 * teaching people how to spot a dishonest unclaimed-property firm, and one of
 * the tells it lists is an unverifiable number. Publishing our own bare
 * statistics would refute that page.
 *
 * A `secondary` figure renders its caveat inline rather than in a legend at the
 * bottom, because a legend is where a qualification goes to be ignored.
 */
export function StatGrid({ stats, columns = 'auto' }: {
  stats: readonly Stat[]
  columns?: 'auto' | 'two'
}) {
  return (
    <dl className={columns === 'two' ? 'stat-grid stat-grid--two' : 'stat-grid'}>
      {stats.map((stat) => (
        <div className="stat" key={stat.label}>
          <dt className="stat__label">{stat.label}</dt>
          <dd className="stat__value">
            {stat.value}
            {stat.quality === 'secondary' && (
              <span className="stat__flag" title="Reported by a credible source, not stated by the body itself">
                {' '}approx.
              </span>
            )}
          </dd>
          <p className="stat__detail">{stat.detail}</p>
          <p className="stat__source">
            {stat.quality === 'secondary' && <>Secondary source. </>}
            <a href={stat.sourceUrl} rel="noopener noreferrer">{stat.source}</a>
            {' · '}
            {stat.asOf}
          </p>
        </div>
      ))}
    </dl>
  )
}

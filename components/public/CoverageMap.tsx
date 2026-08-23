import { listAllJurisdictions, type RuleStatus } from '@/lib/compliance/stateRules'

/**
 * Where we may operate, as a tile grid.
 *
 * A tile grid rather than real geography, for three reasons: it needs no basemap
 * and no licence, every jurisdiction gets equal visual weight regardless of land
 * area (Rhode Island matters as much as Montana here, because the question is
 * legal not geographic), and it stays legible at phone width where a projected
 * map collapses into mush.
 *
 * The honest headline is that ONE of fifty-one is verified. That is the point of
 * showing it. A recovery firm operating in states whose rules it has not read is
 * how over-cap agreements get signed, and the seed's own warning records that
 * published aggregator fee tables were found materially wrong on six states.
 */

/** Rows of the grid, laid out in the conventional US tile arrangement. */
const GRID: readonly (readonly (string | null)[])[] = [
  ['AK', null, null, null, null, null, null, null, null, null, null, 'ME'],
  [null, null, null, null, null, null, null, null, null, null, 'VT', 'NH'],
  [null, 'WA', 'ID', 'MT', 'ND', 'MN', 'IL', 'WI', null, 'MI', 'NY', 'MA'],
  [null, 'OR', 'NV', 'WY', 'SD', 'IA', 'IN', 'OH', 'PA', 'NJ', 'CT', 'RI'],
  [null, 'CA', 'UT', 'CO', 'NE', 'MO', 'KY', 'WV', 'VA', 'MD', 'DE', null],
  [null, null, 'AZ', 'NM', 'KS', 'AR', 'TN', 'NC', 'SC', 'DC', null, null],
  [null, null, null, null, 'OK', 'LA', 'MS', 'AL', 'GA', null, null, null],
  ['HI', null, null, 'TX', null, null, null, null, 'FL', null, null, null],
]

const STATUS_LABEL: Readonly<Record<RuleStatus, string>> = Object.freeze({
  verified: 'Verified — we can operate here',
  researched_not_verified_for_build: 'Researched, not verified for build',
  blocked: 'Not researched',
})

const STATUS_CLASS: Readonly<Record<RuleStatus, string>> = Object.freeze({
  verified: 'tile tile--verified',
  researched_not_verified_for_build: 'tile tile--researched',
  blocked: 'tile tile--unresearched',
})

export function CoverageMap() {
  const jurisdictions = listAllJurisdictions()
  const byCode = new Map(jurisdictions.map((j) => [j.code, j]))

  const counts = jurisdictions.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      <div className="tile-grid" role="img" aria-label={coverageSummary(counts)}>
        {GRID.map((row, y) =>
          row.map((code, x) => {
            if (code === null) {
              return <span className="tile tile--empty" key={`${y}-${x}`} aria-hidden="true" />
            }
            const j = byCode.get(code)
            // A code in the grid but not in the seed would silently render as
            // unresearched, which is the wrong default for a data-quality bug.
            if (j === undefined) {
              return (
                <span className="tile tile--missing" key={code} title={`${code}: not in the rules seed`}>
                  {code}
                </span>
              )
            }
            const capText = j.feeCapPct === null
              ? 'no statutory percentage cap'
              : `${j.feeCapPct}% cap`
            return (
              <span
                className={STATUS_CLASS[j.status]}
                key={code}
                title={`${code} — ${STATUS_LABEL[j.status]} · ${capText}`}
              >
                {code}
              </span>
            )
          }),
        )}
      </div>

      <ul className="tile-legend">
        <li><span className="tile tile--verified tile--swatch" aria-hidden="true" />
          Verified — <strong>{counts.verified ?? 0}</strong>
        </li>
        <li><span className="tile tile--researched tile--swatch" aria-hidden="true" />
          Researched, not built — <strong>{counts.researched_not_verified_for_build ?? 0}</strong>
        </li>
        <li><span className="tile tile--unresearched tile--swatch" aria-hidden="true" />
          Not researched — <strong>{counts.blocked ?? 0}</strong>
        </li>
      </ul>
    </div>
  )
}

function coverageSummary(counts: Record<string, number>): string {
  return (
    `Jurisdiction coverage map. ${counts.verified ?? 0} verified, ` +
    `${counts.researched_not_verified_for_build ?? 0} researched but not built, ` +
    `${counts.blocked ?? 0} not researched.`
  )
}

/**
 * The statutory fee ceiling by state, for the states we have actually read.
 *
 * Rendered as a table rather than a second map because the null case — a state
 * with NO percentage cap — is the most important cell and a colour scale cannot
 * express it. Blank would read as zero, and zero is the opposite of the truth.
 */
export function FeeCapTable() {
  const researched = listAllJurisdictions().filter((j) => j.status !== 'blocked')

  const buckets = new Map<string, string[]>()
  for (const j of researched) {
    const key = j.feeCapPct === null ? 'none' : String(j.feeCapPct)
    buckets.set(key, [...(buckets.get(key) ?? []), j.code])
  }

  const ordered = [...buckets.entries()].sort((a, b) => {
    if (a[0] === 'none') return 1
    if (b[0] === 'none') return -1
    return Number(b[0]) - Number(a[0])
  })

  return (
    <div className="scroll-x">
      <table className="fact-table">
        <thead>
          <tr>
            <th scope="col">Statutory ceiling</th>
            <th scope="col">States</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(([cap, codes]) => (
            <tr key={cap}>
              <th scope="row">
                {cap === 'none' ? 'No percentage cap' : `${cap}%`}
              </th>
              <td>{codes.sort().join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

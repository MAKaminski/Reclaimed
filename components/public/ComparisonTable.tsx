import {
  ATTRIBUTES, ATTRIBUTE_LABEL, ATTRIBUTE_WHY, RECLAIMED, claimFor,
  type Alternative,
} from '@/lib/public/comparison'

/**
 * One alternative beside us, attribute by attribute.
 *
 * The other firm's column comes FIRST. That is not politeness — it is the
 * reading order that stops the table becoming a sales sheet, and it puts our
 * "Not registered" cell where a reader will actually see it rather than after
 * they have absorbed a column of green ticks.
 *
 * Each row carries the reason it matters, because a comparison table without one
 * is just a list of ways we happen to differ.
 */
export function ComparisonTable({ them }: { them: Alternative }) {
  return (
    <div className="scroll-x">
      <table className="fact-table compare-table">
        <thead>
          <tr>
            <th scope="col">&nbsp;</th>
            <th scope="col">{them.name}</th>
            <th scope="col" className="col-us">Reclaimed</th>
          </tr>
        </thead>
        <tbody>
          {ATTRIBUTES.map((attribute) => {
            const theirs = claimFor(them, attribute)
            const ours = claimFor(RECLAIMED, attribute)
            return (
              <tr key={attribute}>
                <th scope="row">
                  {ATTRIBUTE_LABEL[attribute]}
                  <span className="compare-why">{ATTRIBUTE_WHY[attribute]}</span>
                </th>
                <td>
                  <Cell value={theirs?.value ?? '—'} detail={theirs?.detail} />
                </td>
                <td className="col-us">
                  <Cell value={ours?.value ?? '—'} detail={ours?.detail} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The whole survey at once. Attributes down, alternatives across.
 *
 * Only the two rows a reader can act on — what it costs and whether the
 * registration can be checked — because a seven-row matrix across seven columns
 * is unreadable on a phone and nobody scrolls it twice.
 */
export function ComparisonSummary({ alternatives }: { alternatives: readonly Alternative[] }) {
  const rows = ['fee', 'registration_published'] as const

  return (
    <div className="scroll-x">
      <table className="fact-table compare-table">
        <thead>
          <tr>
            <th scope="col">&nbsp;</th>
            {rows.map((r) => <th scope="col" key={r}>{ATTRIBUTE_LABEL[r]}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...alternatives, RECLAIMED].map((alt) => (
            <tr key={alt.slug} className={alt.kind === 'us' ? 'col-us' : undefined}>
              <th scope="row">
                {alt.kind === 'us' ? alt.name : (
                  <a href={`/compare/${alt.slug}`}>{alt.name}</a>
                )}
              </th>
              {rows.map((r) => {
                const claim = claimFor(alt, r)
                return <td key={r}><Cell value={claim?.value ?? '—'} /></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ value, detail }: { value: string; detail?: string }) {
  return (
    <>
      <span className="compare-value">{value}</span>
      {detail !== undefined && <span className="compare-detail">{detail}</span>}
    </>
  )
}

/**
 * Where each observation came from, listed under the table it supports.
 *
 * This exists because `/is-this-letter-real` teaches readers that an
 * unverifiable claim is a warning sign. Making claims about named firms without
 * showing our working would fail our own test.
 */
export function ComparisonSources({ them }: { them: Alternative }) {
  const seen = new Set<string>()
  const sources = them.claims
    .filter((c) => {
      if (seen.has(c.sourceUrl)) return false
      seen.add(c.sourceUrl)
      return true
    })

  return (
    <p className="source-line">
      Every row above records what a page stated on the date shown, not a judgement
      about the firm. Not publishing a rate is not unlawful, and Georgia does not
      require it. Read for yourself:{' '}
      {sources.map((s, i) => (
        <span key={s.sourceUrl}>
          {i > 0 && ' · '}
          <a href={s.sourceUrl} rel="nofollow noopener noreferrer">{s.sourceUrl}</a>{' '}
          ({s.asOf})
        </span>
      ))}
    </p>
  )
}

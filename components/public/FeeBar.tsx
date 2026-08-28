import { cents, formatUsd, type Cents } from '@/lib/compliance/money'

/**
 * The fee cap, drawn.
 *
 * The trap in § 44-12-224(d)(1) is that fees **and costs** share one ceiling —
 * costs come out of the fee rather than being added on top. That sentence is easy
 * to read past and impossible to misread as a picture, which is the whole reason
 * this component exists rather than another paragraph.
 *
 * Form: a single stacked bar of one claim. Not three bars, because the reader's
 * question is "how is this ONE amount divided", which is composition.
 *
 * Colour: an ORDINAL ramp, one hue in monotone lightness steps — these are parts
 * of a whole with an order, not three unrelated identities. Every segment is also
 * directly labelled, so nothing is carried by colour alone.
 *
 * Anatomy follows the house rules: 4px rounded ends anchored to the bar, a 2px
 * surface gap between fills so adjacent segments read as separate, and a native
 * `<title>` per segment for hover without shipping any JavaScript to a page that
 * currently ships none.
 */

export function FeeBar({
  claim, feeExcludingCosts, costs, netToClaimant,
}: {
  claim: Cents
  feeExcludingCosts: Cents
  costs: Cents
  netToClaimant: Cents
}) {
  const total = Number(claim)
  if (total <= 0) return null

  const pct = (v: Cents) => (Number(v) / total) * 100

  const segments = [
    { key: 'net',   label: 'The owner keeps', value: netToClaimant,     fill: 'var(--viz-1)' },
    { key: 'fee',   label: 'Our fee',         value: feeExcludingCosts, fill: 'var(--viz-2)' },
    { key: 'costs', label: 'Costs',           value: costs,             fill: 'var(--viz-3)' },
  ]
    .map((s) => ({ ...s, width: pct(s.value) }))
    .filter((s) => s.width > 0)

  return (
    <figure className="chart">
      <figcaption>A {formatUsd(claim)} claim at the statutory ceiling</figcaption>

      {/*
        Flex rather than SVG, deliberately. An SVG bar with
        preserveAspectRatio="none" stretches its own corner radii into ellipses
        and makes a 2px gap mean different things at different viewport widths.
        Boxes give real pixels for both, and the row is still one element per
        segment with a native tooltip.
      */}
      <div
        role="img"
        aria-label={
          `Of a ${formatUsd(claim)} claim, the owner keeps ${formatUsd(netToClaimant)}, ` +
          `the representative's fee is ${formatUsd(feeExcludingCosts)}, and costs are ` +
          `${formatUsd(costs)}. Fee and costs together sit under one 30% ceiling.`
        }
        style={{ display: 'flex', gap: '2px', height: '2.75rem' }}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${formatUsd(s.value)} (${s.width.toFixed(1)}%)`}
            style={{
              flexGrow: s.width,
              flexBasis: 0,
              minWidth: '2px',
              background: s.fill,
              borderRadius: '4px',
            }}
          />
        ))}
      </div>

      {/* Direct labels below the bar rather than inside it: the costs segment is
          far too narrow to hold text, and a label that appears only when a
          segment happens to be wide enough is worse than no label at all. */}
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '0.6rem 0 0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.35rem 1.5rem',
          fontSize: 'var(--fs-small)',
        }}
      >
        {segments.map((s) => (
          <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span
              aria-hidden="true"
              style={{
                width: '0.7rem', height: '0.7rem', borderRadius: '0.15rem',
                background: s.fill, flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--ink-dim)' }}>{s.label}</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUsd(s.value)}</strong>
            <span style={{ color: 'var(--ink-faint)' }}>{s.width.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/**
 * The comparison that actually decides whether to hire anyone.
 *
 * The median claim paid across every state programme is $144.30; the mean is
 * $1,780. Written down that is two numbers. Drawn on one axis it is a twelvefold
 * gap, and the reader sees immediately that "the average claim" is a number
 * almost nobody receives.
 *
 * One shared axis, deliberately. Two scales would flatter the median bar and
 * destroy the only thing this chart is for.
 */
export function ClaimSpread({
  medianUsd, meanUsd, feePct,
}: {
  medianUsd: number
  meanUsd: number
  feePct: number
}) {
  const max = Math.max(medianUsd, meanUsd)
  const rows = [
    { key: 'median', label: 'Median claim', value: medianUsd, fill: 'var(--viz-3)' },
    { key: 'mean', label: 'Average claim', value: meanUsd, fill: 'var(--viz-1)' },
  ]

  const feeOnMedian = medianUsd * (feePct / 100)

  return (
    <figure className="chart">
      <figcaption>Half of all claims are smaller than the first bar</figcaption>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: 'grid', gap: '0.25rem' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 'var(--fs-small)',
            }}>
              <span style={{ color: 'var(--ink-dim)' }}>{r.label}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${r.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
            <span className="share-track" style={{ height: '0.85rem' }}>
              <span
                className="share-fill"
                style={{ width: `${(r.value / max) * 100}%`, background: r.fill }}
              />
            </span>
          </div>
        ))}
      </div>

      <p className="chart-note">
        A {feePct}% fee on the median claim is{' '}
        <strong>{formatUsd(cents(Math.round(feeOnMedian * 100)))}</strong> — to fill in a
        form the owner could have filed themselves in about five minutes. The gap
        between the two bars is the entire reason this business is about the hard
        tail rather than about volume.
      </p>
    </figure>
  )
}

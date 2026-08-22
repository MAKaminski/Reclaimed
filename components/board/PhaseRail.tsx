import Link from 'next/link'
import { PHASES, phaseOf, type Phase } from '@/lib/pipeline/phases'
import type { StageAvailability, StageBoardRow } from '@/lib/db/workflow'
import { formatUsd, cents } from '@/lib/compliance/money'

/**
 * Five phase cards, equal width, left to right.
 *
 * Deliberately NOT funnel-shaped. At single-digit counts a tapering silhouette
 * is a lie with good art direction — it implies a conversion story the data
 * cannot support yet.
 *
 * Held phases stay at FULL SIZE, in position, with their counts visible. The
 * framing is "held", not "blocked", and the count of proved-but-unsent work is
 * read as a stockpile rather than a wall. That inversion is the whole antidote
 * to a dashboard that makes a legally-required wait feel like failure — and it
 * costs nothing, because it is the same number with the right label.
 */
export function PhaseRail({ stages, board, activePhase }: {
  stages: readonly StageAvailability[]
  board: readonly StageBoardRow[]
  activePhase: string
}) {
  const byStage = new Map(board.map((b) => [b.stage, b]))

  return (
    <div className="phase-rail" style={{ marginTop: '0.75rem' }}>
      {PHASES.map((phase) => {
        const inPhase = stages.filter((s) => phaseOf(s.rule)?.key === phase.key)
        const count = inPhase.reduce((n, s) => n + s.count, 0)
        const ev = inPhase.reduce(
          (n, s) => n + (byStage.get(s.rule.stage)?.expected_value_cents ?? 0), 0,
        )
        const anyPermitted = inPhase.some((s) => s.permitted)
        const theirs = inPhase.every((s) => s.rule.owner !== 'Reclaimed')
        const held = !anyPermitted && !theirs

        return (
          <PhaseCard
            key={phase.key}
            phase={phase}
            count={count}
            evCents={ev}
            state={theirs ? 'waiting' : held ? 'held' : 'workable'}
            active={activePhase === phase.key}
            stages={inPhase}
          />
        )
      })}
    </div>
  )
}

const STATE_STYLE = {
  workable: { bg: 'var(--card)', border: 'var(--rule)', chip: 'var(--ok-fg)', chipBg: 'var(--ok-bg)', label: 'Workable' },
  held: { bg: 'var(--held-bg)', border: 'var(--held-border)', chip: 'var(--held-fg)', chipBg: 'transparent', label: 'Held' },
  waiting: { bg: 'var(--card)', border: 'var(--rule)', chip: 'var(--dor-fg)', chipBg: 'var(--dor-bg)', label: 'Waiting on them' },
} as const

function PhaseCard({ phase, count, evCents, state, active, stages }: {
  phase: Phase
  count: number
  evCents: number
  state: keyof typeof STATE_STYLE
  active: boolean
  stages: readonly StageAvailability[]
}) {
  const tone = STATE_STYLE[state]

  return (
    <div style={{
      background: tone.bg,
      border: `1px solid ${active ? 'var(--ink)' : tone.border}`,
      borderRadius: 'var(--radius)', padding: '0.9rem',
      display: 'flex', flexDirection: 'column', gap: '0.35rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
        <strong style={{ fontSize: 'var(--fs-h3)' }}>{phase.label}</strong>
        <span style={{
          marginLeft: 'auto', fontSize: '0.625rem', textTransform: 'uppercase',
          letterSpacing: '0.06em', color: tone.chip, background: tone.chipBg,
          padding: '0.1rem 0.4rem', borderRadius: '999px', whiteSpace: 'nowrap',
        }}>{tone.label}</span>
      </div>

      <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: 'var(--muted)' }}>{phase.question}</p>

      <p style={{ margin: '0.25rem 0 0', fontSize: '1.6rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </p>
      <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: 'var(--faint)' }}>
        {evCents > 0 ? formatUsd(cents(evCents)) : '—'}
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'grid', gap: '0.2rem' }}>
        {stages.map((s) => (
          <li key={s.rule.stage} style={{
            fontSize: '0.6875rem', color: 'var(--muted)',
            display: 'flex', gap: '0.4rem', justifyContent: 'space-between',
          }}>
            <Link href={`/queue?stage=${s.rule.stage}`} style={{ color: 'inherit' }}>
              {s.rule.stage.replace(/_/g, ' ')}
            </Link>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--faint)' }}>{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

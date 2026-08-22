import type { ComplianceGate } from '@/lib/db/workflow'

/**
 * What is held, and the one thing that releases each.
 *
 * Lifted from the philosophy in StageActions.tsx: a missing control teaches
 * nothing; a control that explains its refusal teaches the rule. At dashboard
 * level that means naming the gate, what it unlocks, and whose move it is.
 *
 * Amber, not red. Red is reserved for the kill-switch banner and genuine errors —
 * if everything on the board is red then nothing is.
 */
export function BlockedRail({ gates }: { gates: readonly ComplianceGate[] }) {
  const open = gates.filter((g) => g.blocked_today.length > 0)

  if (open.length === 0) {
    return (
      <div className="notice notice--ok">
        <p style={{ margin: 0 }}>Every gate is cleared. Nothing is being withheld.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      {open.map((g) => (
        <div key={g.gate_key} className="notice notice--held">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 'var(--fs-h3)' }}>{g.gate_name}</strong>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.75 }}>{g.statute}</span>
          </div>

          <p style={{ margin: '0.5rem 0 0.2rem', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.75 }}>
            Holding
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 'var(--fs-small)' }}>
            {g.blocked_today.map((b) => <li key={b}>{b}</li>)}
          </ul>

          <p style={{ margin: '0.5rem 0 0.2rem', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.75 }}>
            Releases
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 'var(--fs-small)' }}>
            {g.unlocks.map((u) => <li key={u}>{u}</li>)}
          </ul>

          {g.available_in_rehearsal && (
            <p style={{ margin: '0.6rem 0 0', fontSize: 'var(--fs-small)', fontWeight: 600 }}>
              ✓ Exercisable in rehearsal — you can walk this whole path today, it
              just does not transmit.
            </p>
          )}
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', opacity: 0.7 }}>{g.penalty}</p>
        </div>
      ))}
    </div>
  )
}

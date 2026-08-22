import Link from 'next/link'
import type { NextAction } from '@/lib/pipeline/nextAction'

/**
 * The single most prominent element on the dashboard, and deliberately a
 * SENTENCE rather than a number.
 *
 * A dashboard whose top element is a metric makes the reader derive an action
 * from it. A verb-first imperative removes the derivation. The page is then
 * ordered so it degrades correctly: read only the top three inches and you still
 * know what to do.
 */
export function NextActionCard({ action }: { action: NextAction }) {
  return (
    <section
      data-next-action={action.kind}
      style={{
        background: 'var(--ink)', color: 'var(--paper)',
        borderRadius: 'var(--radius)', padding: '1.5rem 1.6rem', marginTop: '1rem',
      }}
    >
      <p style={{
        margin: 0, fontSize: '0.6875rem', textTransform: 'uppercase',
        letterSpacing: '0.12em', opacity: 0.6,
      }}>
        Do this next
      </p>
      <h2 style={{ margin: '0.4rem 0 0', fontSize: 'var(--fs-h1)', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
        {action.headline}
      </h2>
      <p style={{ margin: '0.6rem 0 0', opacity: 0.85, maxWidth: '46rem', fontSize: 'var(--fs-small)' }}>
        {action.detail}
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>
        <Link href={action.href} style={{
          background: 'var(--paper)', color: 'var(--ink)', padding: '0.55rem 1rem',
          borderRadius: 'var(--radius-sm)', textDecoration: 'none', fontWeight: 600,
          fontSize: 'var(--fs-small)',
        }}>
          {action.cta} →
        </Link>
        {action.secondary !== undefined && (
          <Link href={action.secondary.href} style={{
            border: '1px solid rgba(255,255,255,0.35)', color: 'var(--paper)',
            padding: '0.55rem 1rem', borderRadius: 'var(--radius-sm)',
            textDecoration: 'none', fontSize: 'var(--fs-small)',
          }}>
            {action.secondary.label}
          </Link>
        )}
      </div>
    </section>
  )
}

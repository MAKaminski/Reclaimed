/**
 * Numbered section label.
 *
 * With this many sections on a page, a numbered eyebrow is what lets a reader
 * re-locate themselves after scrolling away. Mono, uppercase, tracked out.
 */
export function Eyebrow({ index, children }: { index?: string; children: React.ReactNode }) {
  return (
    <p className="t-label" style={{ marginBottom: 'var(--space-xs)' }}>
      {index !== undefined && (
        <span style={{ color: 'var(--ink-faint)', marginRight: '0.75rem' }}>{index}</span>
      )}
      {children}
    </p>
  )
}

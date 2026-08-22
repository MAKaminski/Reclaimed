/**
 * The section heading used across the staff pages.
 *
 * Extracted because this exact function was duplicated VERBATIM in four page
 * files. Four copies of a nine-line helper is not a crisis, but it is the
 * mechanism by which four pages slowly stop looking like each other.
 */
export function Section({ title, children, action }: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
        <h2 style={{
          fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--label)', margin: 0,
        }}>
          {title}
        </h2>
        {action !== undefined && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      <div style={{ marginTop: '0.6rem' }}>{children}</div>
    </section>
  )
}

/** Table cell styles, previously redeclared per page. */
export const th: React.CSSProperties = { padding: '0.5rem 0.75rem 0.5rem 0' }
export const td: React.CSSProperties = { padding: '0.6rem 0.75rem 0.6rem 0', verticalAlign: 'top' }

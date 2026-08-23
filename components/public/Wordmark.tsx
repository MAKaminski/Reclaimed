import { SITE_NAME } from '@/lib/public/site'

/**
 * The mark plus the name.
 *
 * Same return-path glyph as `app/icon.svg`, drawn inline rather than as an
 * `<img>` so it inherits `currentColor` and survives the dark-mode swap on
 * `.public-shell` without a second asset.
 *
 * `size="sm"` is the header, `"lg"` the footer.
 */
export function Wordmark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 28 : 22

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'lg' ? '0.55rem' : '0.45rem',
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width={box}
        height={box}
        aria-hidden="true"
        focusable="false"
        style={{ display: 'block', flexShrink: 0 }}
      >
        <rect width="32" height="32" rx="7.5" fill="var(--accent)" />
        <g
          fill="none"
          stroke="var(--bg)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 22.5V16a7 7 0 0 1 14 0v4" />
          <path d="M19 20l4 4.5 4-4.5" />
        </g>
      </svg>
      <span
        style={{
          fontWeight: 600,
          letterSpacing: '-0.02em',
          fontSize: size === 'lg' ? 'var(--fs-h3)' : 'inherit',
        }}
      >
        {SITE_NAME}
      </span>
    </span>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { getOfferState } from '@/lib/compliance/offerState'
import { SITE_MISSION, SITE_NAME, SITE_URL } from '@/lib/public/site'
import { navPages, pagesInSection } from '@/lib/public/pages'
import { Wordmark } from '@/components/public/Wordmark'
import { OfferStateBanner } from '@/components/public/OfferStateBanner'
import { StandingDisclosures } from '@/components/public/StandingDisclosures'
import { JsonLd } from '@/components/public/JsonLd'
import { organizationLd, webSiteLd } from '@/lib/public/structuredData'

/**
 * The public surface.
 *
 * This is the ONLY layout in the app that opts into indexing, and it must never
 * import from @/lib/db — no session, no cookies, no Supabase. That keeps these
 * pages statically renderable (a crawler hit costs us nothing) and satisfies
 * §1.8 structurally rather than by review.
 */
export async function generateMetadata(): Promise<Metadata> {
  const offer = getOfferState()
  return {
    metadataBase: SITE_URL,
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
    // Relative canonical: each segment resolves against metadataBase, so every
    // page gets a correct self-canonical without repeating the host.
    alternates: { canonical: './' },
    robots: offer.indexable
      ? {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
        }
      : { index: false, follow: false },
    openGraph: { type: 'website', locale: 'en_US', siteName: SITE_NAME },
    // X/Twitter falls back to OG without this, which works but renders the small
    // card. The OG image is 1200x630 and deserves the large one.
    twitter: { card: 'summary_large_image', title: SITE_NAME },
  }
}

/**
 * Footer columns, derived from the registry rather than hand-listed. A page
 * added to `PUBLIC_PAGES` appears here automatically; one removed disappears.
 * Hand-maintaining a second list of links is how a footer ends up advertising a
 * 404 that the sitemap no longer knows about.
 */
const FOOTER_COLUMNS = [
  { heading: 'Claim it', pages: pagesInSection('core') },
  { heading: 'Compare', pages: pagesInSection('compare') },
  { heading: 'Hard cases', pages: pagesInSection('complex') },
  { heading: 'Company', pages: [...pagesInSection('company'), ...pagesInSection('status')] },
  { heading: 'Legal', pages: pagesInSection('legal') },
]

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <JsonLd data={[organizationLd(), webSiteLd()]} />

      <header style={{
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg)',
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'saturate(180%) blur(12px)',
      }}>
        <div style={{
          maxWidth: 'var(--page)', margin: '0 auto',
          padding: 'var(--space-sm) var(--gutter)',
        }}>
          <div className="public-nav">
            <Link href="/" style={{
              textDecoration: 'none', marginRight: 'var(--space-sm)',
              color: 'var(--ink)',
            }}>
              <Wordmark />
            </Link>
            {navPages().map((p) => (
              <Link key={p.href} href={p.href} style={{ fontSize: 'var(--fs-small)' }}>
                {p.navLabel}
              </Link>
            ))}
            <Link
              href="/signin"
              style={{ marginLeft: 'auto', fontSize: 'var(--fs-label)', color: 'var(--ink-faint)' }}
            >
              Staff
            </Link>
          </div>
        </div>
      </header>

      <main className="public-main">
        <OfferStateBanner />
        {children}
      </main>

      <footer style={{ background: 'var(--bg-2)', borderTop: '1px solid var(--line)' }}>
        <div style={{
          maxWidth: 'var(--page)', margin: '0 auto',
          padding: 'var(--space-lg) var(--gutter)',
        }}>
          <StandingDisclosures />

          <nav
            aria-label="Footer"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
              gap: 'var(--grid-gap)',
              marginTop: 'var(--space-lg)',
              paddingTop: 'var(--space-md)',
              borderTop: '1px solid var(--line)',
            }}
          >
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.heading}>
                <h3 className="t-label" style={{ marginBottom: '0.6rem' }}>{col.heading}</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.35rem' }}>
                  {col.pages.map((p) => (
                    <li key={p.href}>
                      <Link href={p.href} style={{ fontSize: 'var(--fs-small)' }}>
                        {p.navLabel}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div style={{ marginTop: 'var(--space-lg)' }}>
            <Wordmark size="lg" />
            <p style={{
              margin: '0.4rem 0 0', fontSize: 'var(--fs-small)',
              color: 'var(--ink-dim)', maxWidth: '34ch',
            }}>
              {SITE_MISSION}
            </p>
          </div>

          <p className="source-line" style={{ marginTop: 'var(--space-md)' }}>
            {SITE_NAME} is not a government agency and is not affiliated with the State
            of Georgia or the Georgia Department of Revenue.{' '}
            <Link href="/legal/disclosures">Disclosures</Link> ·{' '}
            <Link href="/legal/privacy">Privacy</Link> ·{' '}
            <Link href="/registration-status">Registration status</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}

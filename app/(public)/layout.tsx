import type { Metadata } from 'next'
import Link from 'next/link'
import { getOfferState } from '@/lib/compliance/offerState'
import { SITE_NAME, SITE_URL } from '@/lib/public/site'
import { navPages } from '@/lib/public/pages'
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
  }
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <JsonLd data={[organizationLd(), webSiteLd()]} />

      <header style={{ borderBottom: '1px solid var(--rule)', background: 'var(--card)' }}>
        <div style={{ maxWidth: 'var(--page)', margin: '0 auto', padding: '0.9rem 1.25rem' }}>
          <div className="public-nav">
            <Link href="/" style={{ fontWeight: 700, textDecoration: 'none', marginRight: '0.5rem' }}>
              {SITE_NAME}
            </Link>
            {navPages().map((p) => (
              <Link key={p.href} href={p.href} style={{ fontSize: 'var(--fs-small)', color: 'var(--muted)' }}>
                {p.navLabel}
              </Link>
            ))}
            <Link
              href="/signin"
              style={{ marginLeft: 'auto', fontSize: 'var(--fs-small)', color: 'var(--faint)' }}
            >
              Staff sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="public-main">
        <OfferStateBanner />
        {children}
      </main>

      <footer style={{ background: 'var(--card)', borderTop: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: 'var(--page)', margin: '0 auto', padding: '2rem 1.25rem' }}>
          <StandingDisclosures />
          <p className="source-line" style={{ marginTop: '1.5rem' }}>
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

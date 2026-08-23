import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { ComparisonTable, ComparisonSources } from '@/components/public/ComparisonTable'
import { getAlternative } from '@/lib/public/comparison'

const page = PUBLIC_PAGES.find((p) => p.href === '/compare/reclaim-georgia')!
export const metadata: Metadata = { title: page.title, description: page.description }

const them = getAlternative('reclaim-georgia')!

export default function ComparisonPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        breadcrumbLd([
          { name: 'Home', href: '/' },
          { name: 'Compare', href: '/compare' },
          { name: page.navLabel, href: '/compare/reclaim-georgia' },
        ]),
      ]} />

      <p style={{ margin: 0 }}>
        <Link href="/compare" style={{ fontSize: 'var(--fs-small)' }}>← All comparisons</Link>
      </p>

      <h1>Reclaimed vs Reclaim Georgia LLC</h1>
      <p className="lede">Reclaim Georgia LLC publishes a 15% rate and a Georgia registration number. On the two rows hardest for a consumer to verify, it is the strongest of the firms we surveyed.</p>

      <SelfFileCallout />

      <h2>Side by side</h2>
      <ComparisonTable them={them} />
      <ComparisonSources them={them} />

      <h2>What they do that we would rather more firms did</h2>
      <p>
        They publish the number. Georgia has required registration since 1 July 2024
        and maintains no public list, so a consumer’s only realistic check is to ring
        the Department and read out a registration number — which requires the firm
        to have published one. Reclaim Georgia LLC publishes <strong>CDR
        #202400088</strong> together with the Department’s verification line.
      </p>
      <p>
        They also publish the rate as a figure rather than a promise, and they link
        the state’s free portal and describe the self-filing route. That is three of
        the four things we would tell anyone to look for.
      </p>

      <h2>Where we are honestly behind</h2>
      <p>
        They are registered and we are not. Until the Department issues our
        registration we may not act for anyone on a claim, and no comparison changes
        that. If you have a Georgia claim today and want a representative today, we
        are not an option and they are.
      </p>

      <h2>Where we think we differ</h2>
      <p>
        Focus. Full-service recovery is a discovery-plus-paperwork business, and
        discovery is worth very little when the state’s database is free and public.
        We are built for the cases where entitlement is the obstacle — a dead owner,
        a dissolved company, four names on one record — and the whole system is
        organised around proving who may sign rather than around finding the money.
      </p>

      <h2>Where they are the better choice</h2>
      <div className="notice notice--ok">
        <p style={{ margin: 0 }}>Reclaim Georgia LLC is registered, publishes its rate, and points people at the free route. If you want a representative in Georgia now, they meet the tests we would apply.</p>
      </div>

      <h2>And where we are not an option at all</h2>
      <p>
        Reclaimed is <strong>not registered</strong> in Georgia and is not accepting
        clients. We may not act for anyone on a claim today. Our{' '}
        <Link href="/registration-status">registration status</Link> is derived from
        our own systems rather than written by hand, so it cannot go stale.
      </p>

      <p className="source-line">
        Observed 23 August 2026 from public pages. Fee cap per O.C.G.A.
        § 44-12-224(d)(1). Registration requirement per O.C.G.A. § 44-12-239.
      </p>
    </div>
  )
}

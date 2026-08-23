import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { ComparisonTable, ComparisonSources } from '@/components/public/ComparisonTable'
import { getAlternative } from '@/lib/public/comparison'

const page = PUBLIC_PAGES.find((p) => p.href === '/compare/ga-unclaimed-property-locators')!
export const metadata: Metadata = { title: page.title, description: page.description }

const them = getAlternative('ga-unclaimed-property-locators')!

export default function ComparisonPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        breadcrumbLd([
          { name: 'Home', href: '/' },
          { name: 'Compare', href: '/compare' },
          { name: page.navLabel, href: '/compare/ga-unclaimed-property-locators' },
        ]),
      ]} />

      <p style={{ margin: 0 }}>
        <Link href="/compare" style={{ fontSize: 'var(--fs-small)' }}>← All comparisons</Link>
      </p>

      <h1>Reclaimed vs Georgia Unclaimed Property Locators</h1>
      <p className="lede">Georgia Unclaimed Property Locators works no-result-no-fee and states that cheques are issued to the claimant rather than to the firm — which is the safest arrangement there is.</p>

      <SelfFileCallout />

      <h2>Side by side</h2>
      <ComparisonTable them={them} />
      <ComparisonSources them={them} />

      <h2>The row they win outright</h2>
      <p>
        Payment. Their page states that recovered funds are issued directly to the
        claimant rather than routed through the firm. That is the arrangement we
        would want for a relative, because money that never passes through an
        intermediary cannot be delayed by one, deducted from by one, or lost by one.
      </p>

      <h2>What their page does not state</h2>
      <p>
        A percentage, and a Georgia registration number. “No results, no fee” tells
        you when you pay, not how much — and since 1 July 2024 anyone representing a
        claimant in Georgia has had to be registered.
      </p>
      <p>
        Again, publishing neither is not unlawful. It just leaves you doing the
        checking by telephone.
      </p>

      <h2>Where we differ</h2>
      <p>
        Locating is the part of this that the state already does for free. Our system
        is built around the documentary chain that proves who may sign, and it
        refuses to treat a property as workable until that chain is evidenced,
        reviewed, and unbroken.
      </p>

      <h2>Where they are the better choice</h2>
      <div className="notice notice--ok">
        <p style={{ margin: 0 }}>Having the state pay the claimant directly is the safest payment arrangement in this industry, and they state it plainly.</p>
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

import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { ComparisonTable, ComparisonSources } from '@/components/public/ComparisonTable'
import { getAlternative } from '@/lib/public/comparison'

const page = PUBLIC_PAGES.find((p) => p.href === '/compare/we-seek-you-claim')!
export const metadata: Metadata = { title: page.title, description: page.description }

const them = getAlternative('we-seek-you-claim')!

export default function ComparisonPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        breadcrumbLd([
          { name: 'Home', href: '/' },
          { name: 'Compare', href: '/compare' },
          { name: page.navLabel, href: '/compare/we-seek-you-claim' },
        ]),
      ]} />

      <p style={{ margin: 0 }}>
        <Link href="/compare" style={{ fontSize: 'var(--fs-small)' }}>← All comparisons</Link>
      </p>

      <h1>Reclaimed vs We Seek You Claim</h1>
      <p className="lede">We Seek You Claim works on contingency and states plainly that it is not a government agency. The page we reviewed gave no rate and no registration number.</p>

      <SelfFileCallout />

      <h2>Side by side</h2>
      <ComparisonTable them={them} />
      <ComparisonSources them={them} />

      <h2>What their page states</h2>
      <p>
        That there are no upfront fees, that you only pay when you are paid, and that
        the firm “is not a government agency”. That last line matters more than it
        looks: impersonating a government agency is the most common fraud pattern in
        unclaimed property, and § 44-12-239(g) restricts business names that suggest
        one.
      </p>

      <h2>What it does not state</h2>
      <p>
        A percentage, and a registration number. The page describes its team as
        licensed Claimant Designated Representatives without giving a number to
        check, and Georgia publishes no list you could check it against.
      </p>
      <p>
        Neither omission is unlawful. Georgia does not require a firm to publish its
        rate. But a rate you cannot see until you have made contact is a rate you
        will discuss after someone has told you how much money is waiting for you,
        and that is a bad moment to start negotiating.
      </p>

      <h2>What to ask them</h2>
      <ul>
        <li>What percentage, and does it include costs? Georgia caps fees <em>and</em> costs together at 30%.</li>
        <li>What is your Georgia registration number?</li>
        <li>Does the Department pay me directly?</li>
      </ul>

      <h2>Where they are the better choice</h2>
      <div className="notice notice--ok">
        <p style={{ margin: 0 }}>They state clearly that they are not a government agency and take nothing upfront, which are the two things that most often go wrong in this industry.</p>
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

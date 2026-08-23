import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { ComparisonTable, ComparisonSources } from '@/components/public/ComparisonTable'
import { getAlternative } from '@/lib/public/comparison'

const page = PUBLIC_PAGES.find((p) => p.href === '/compare/probate-attorneys')!
export const metadata: Metadata = { title: page.title, description: page.description }

const them = getAlternative('probate-attorneys')!

export default function ComparisonPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        breadcrumbLd([
          { name: 'Home', href: '/' },
          { name: 'Compare', href: '/compare' },
          { name: page.navLabel, href: '/compare/probate-attorneys' },
        ]),
      ]} />

      <p style={{ margin: 0 }}>
        <Link href="/compare" style={{ fontSize: 'var(--fs-small)' }}>← All comparisons</Link>
      </p>

      <h1>Reclaimed vs a probate or estate attorney</h1>
      <p className="lede">Above Georgia’s $7,500 heir affidavit ceiling, or wherever the heirs disagree, an attorney is the right answer and a representative is not. This is the one comparison we expect to lose on merit.</p>

      <SelfFileCallout />

      <h2>Side by side</h2>
      <ComparisonTable them={them} />
      <ComparisonSources them={them} />

      <h2>When an attorney is simply correct</h2>
      <ul>
        <li>The estate needs administering anyway. The claim is then a small part of a job already being done.</li>
        <li>The total exceeds Georgia’s $7,500 aggregate ceiling for the heir affidavit route under O.C.G.A. § 44-12-220(i).</li>
        <li>Probate has already been opened, or a will exists.</li>
        <li>The heirs do not agree, or cannot all be found. No affidavit route survives a missing signature.</li>
      </ul>

      <h2>Where a representative fits instead</h2>
      <p>
        Below the ceiling, with every heir cooperative and no probate opened, Georgia
        allows an affidavit route that needs no court. Paying hourly rates for that is
        usually worse value than a capped contingent fee, because the work is
        documentary rather than adversarial.
      </p>
      <p>
        A representative is also capped in a way an attorney is not: 30% of the lesser
        of the amount claimed or the property value, costs included, under
        O.C.G.A. § 44-12-224(d)(1). An hourly engagement carries no such ceiling.
      </p>

      <h2>The honest split</h2>
      <p>
        If the estate is going through probate regardless, use the attorney. If the
        only thing between an heir and the money is a documentary chain under the
        affidavit ceiling, that is our part of the problem.
      </p>

      <h2>Where they are the better choice</h2>
      <div className="notice notice--ok">
        <p style={{ margin: 0 }}>For estates that need administering anyway, or above the $7,500 affidavit ceiling, an attorney is the right professional and we are not a substitute.</p>
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

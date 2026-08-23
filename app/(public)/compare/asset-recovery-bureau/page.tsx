import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { ComparisonTable, ComparisonSources } from '@/components/public/ComparisonTable'
import { getAlternative } from '@/lib/public/comparison'

const page = PUBLIC_PAGES.find((p) => p.href === '/compare/asset-recovery-bureau')!
export const metadata: Metadata = { title: page.title, description: page.description }

const them = getAlternative('asset-recovery-bureau')!

export default function ComparisonPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        breadcrumbLd([
          { name: 'Home', href: '/' },
          { name: 'Compare', href: '/compare' },
          { name: page.navLabel, href: '/compare/asset-recovery-bureau' },
        ]),
      ]} />

      <p style={{ margin: 0 }}>
        <Link href="/compare" style={{ fontSize: 'var(--fs-small)' }}>← All comparisons</Link>
      </p>

      <h1>Reclaimed vs Asset Recovery Bureau</h1>
      <p className="lede">Asset Recovery Bureau serves Georgia claimants. The page we reviewed stated no rate, no registration number, and no notice that the firm is not a government agency.</p>

      <SelfFileCallout />

      <h2>Side by side</h2>
      <ComparisonTable them={them} />
      <ComparisonSources them={them} />

      <h2>What their page states</h2>
      <p>
        That you never pay upfront, that there is no out-of-pocket cost, and that
        “the state will send your payment directly to you”, after which the state
        pays the firm a percentage. Direct payment to the claimant is the safe
        arrangement and worth crediting.
      </p>

      <h2>The three things we could not find</h2>
      <ul>
        <li>A percentage. “A small percentage” is not a figure.</li>
        <li>A Georgia registration number.</li>
        <li>A statement that the firm is not a government agency.</li>
      </ul>
      <p>
        On the last point, O.C.G.A. § 44-12-239(g) restricts a representative from
        holding itself out in a way that suggests a government agency, and Georgia’s
        own list of restricted terms includes words such as <em>bureau</em>,{' '}
        <em>agency</em> and <em>authority</em>. Whether any particular business name
        crosses that line is for the Department to decide and not for a competitor to
        assert. We mention the rule because it is the rule, and because it is the
        reason our own name and this site’s domain are checked against that list
        automatically at build time.
      </p>

      <h2>What to ask before you sign anything</h2>
      <ul>
        <li>What percentage, including costs?</li>
        <li>What is your Georgia registration number, so I can ring the Department?</li>
        <li>Will you send me the Department’s own agreement form?</li>
      </ul>

      <h2>Where they are the better choice</h2>
      <div className="notice notice--ok">
        <p style={{ margin: 0 }}>Their page states that the state pays the claimant directly and that nothing is owed upfront, both of which are the right way round.</p>
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

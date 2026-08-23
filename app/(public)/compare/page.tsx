import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { ComparisonSummary } from '@/components/public/ComparisonTable'
import { StatGrid } from '@/components/public/StatGrid'
import { ALTERNATIVES, COMPARISON_BOTTOM_LINE } from '@/lib/public/comparison'
import { GEORGIA_STATS } from '@/lib/public/marketStats'

const page = PUBLIC_PAGES.find((p) => p.href === '/compare')!
export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  {
    question: 'Do I need a recovery firm to claim Georgia unclaimed property?',
    answer: 'No. Georgia runs a free public search and claim portal, and the median claim paid across all states is about $144. For a claim like that, no percentage is worth paying.',
  },
  {
    question: 'How do I check whether a Georgia recovery firm is registered?',
    answer: 'Representation has required registration with the Department of Revenue since 1 July 2024, but Georgia publishes no public list of registered representatives. The only quick check is to telephone the Department with the firm’s registration number, which means the firm has to publish one.',
  },
  {
    question: 'What is the most a Georgia recovery firm can charge?',
    answer: 'Thirty per cent of the lesser of the amount claimed or the value of the property, under O.C.G.A. § 44-12-224(d)(1). Costs count inside that cap rather than on top of it, and no fee may be charged in advance.',
  },
  {
    question: 'Is Reclaimed registered?',
    answer: 'No. Reclaimed is not a registered representative, is not accepting clients, and may not act for anyone on a claim. Our current status is published and derived from our own systems.',
  },
]

export default function ComparePage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        faqLd(FAQS),
        breadcrumbLd([{ name: 'Home', href: '/' }, { name: 'Compare', href: '/compare' }]),
      ]} />

      <h1>Georgia unclaimed property recovery, compared</h1>
      <p className="lede">{COMPARISON_BOTTOM_LINE}</p>

      <SelfFileCallout heading="Start here, before you read any of the rest" />

      <h2>What it costs, and whether you can check the registration</h2>
      <p>
        Two rows decide almost everything. What a firm charges, and whether you can
        verify it is allowed to act for you at all. Georgia has required
        registration since 1 July 2024 and publishes no list, so a firm’s own
        number — with the Department’s telephone number beside it — is the only
        practical way to check in under a minute.
      </p>

      <ComparisonSummary alternatives={ALTERNATIVES} />

      <p className="source-line">
        Each row records what a page stated on the date shown. Not publishing a rate
        is not unlawful and Georgia does not require it. Follow a link for the full
        comparison and the sources.
      </p>

      <h2>The Georgia numbers</h2>
      <StatGrid stats={GEORGIA_STATS} />

      <h2>Every alternative</h2>
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        {ALTERNATIVES.map((alt) => (
          <Link className="card" href={`/compare/${alt.slug}`} key={alt.slug}>
            <strong style={{ fontSize: 'var(--fs-h3)' }}>{alt.name}</strong>
            <p style={{ margin: '0.4rem 0 0' }}>{alt.summary}</p>
          </Link>
        ))}
      </div>

      <h2>Why we publish a table we lose rows on</h2>
      <p>
        Reclaimed is not registered. One of the firms on this page is, and publishes
        its number; on that row it beats us outright and the table says so. A
        comparison you always win is not a comparison, and we would rather you
        trusted the rows where we do well because you can see we did not hide the
        ones where we do not.
      </p>
      <p>
        The same goes for the free route. Most people reading this should close the
        tab and use{' '}
        <Link href="/claim-it-yourself">Georgia’s own portal</Link>. We are built for
        the claims where proving who may legally sign is genuinely hard, and that is
        a much smaller group than the number of people with unclaimed property.
      </p>

      <p className="source-line">
        Observations made 23 August 2026 from each firm’s own public pages. Fee cap
        per O.C.G.A. § 44-12-224(d)(1).
      </p>
    </div>
  )
}

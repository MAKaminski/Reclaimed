import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { ComparisonTable, ComparisonSources } from '@/components/public/ComparisonTable'
import { getAlternative } from '@/lib/public/comparison'

const page = PUBLIC_PAGES.find((p) => p.href === '/compare/do-it-yourself')!
export const metadata: Metadata = { title: page.title, description: page.description }

const them = getAlternative('do-it-yourself')!

export default function ComparisonPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        breadcrumbLd([
          { name: 'Home', href: '/' },
          { name: 'Compare', href: '/compare' },
          { name: page.navLabel, href: '/compare/do-it-yourself' },
        ]),
      ]} />

      <p style={{ margin: 0 }}>
        <Link href="/compare" style={{ fontSize: 'var(--fs-small)' }}>← All comparisons</Link>
      </p>

      <h1>Reclaimed vs claiming it yourself</h1>
      <p className="lede">Georgia’s portal is free, public, and takes about five minutes. For most claims this is the right answer, and this page exists to talk you into it rather than out of it.</p>

      <SelfFileCallout />

      <h2>Side by side</h2>
      <ComparisonTable them={them} />
      <ComparisonSources them={them} />

      <h2>The arithmetic nobody in this industry puts on their front page</h2>
      <p>
        Across every state programme, the <strong>median</strong> claim paid is
        $144.30 while the <strong>average</strong> is $1,780. That gap is the whole
        story: half of all claims are small enough that any percentage fee is
        absurd, and the average is dragged upward by a thin tail of large, difficult
        ones.
      </p>
      <p>
        On a median claim, thirty per cent is about forty-three dollars to fill in a
        form you could have filled in yourself. Do not pay it.
      </p>

      <h2>When doing it yourself is straightforwardly correct</h2>
      <ul>
        <li>The property is in your own name and you can prove your identity.</li>
        <li>It is cash rather than securities or the contents of a safe deposit box.</li>
        <li>Nobody has died and no business has dissolved.</li>
        <li>You are the only owner named on the record.</li>
      </ul>
      <p>
        If all four are true you do not need a representative, and Georgia will pay
        you directly. Georgia also pays some property out automatically with no claim
        at all, under O.C.G.A. § 44-12-220(d.1)(1).
      </p>

      <h2>When it stops being straightforward</h2>
      <p>
        The Department does not refuse claims because the form was hard. It refuses
        them because the person signing cannot be shown to have the legal authority
        to sign. That is a documentary problem — articles of dissolution, letters
        testamentary, an unbroken chain of successor entities — and it is the only
        part of this we think is worth paying anyone for.
      </p>

      <h2>Where they are the better choice</h2>
      <div className="notice notice--ok">
        <p style={{ margin: 0 }}>Doing it yourself costs nothing and cannot be beaten on price. If your claim is simple, stop reading and go and file it.</p>
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

import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd } from '@/lib/public/structuredData'
import { SITE_POSTAL_ADDRESS, DOR_CLAIM_PORTAL } from '@/lib/public/site'

const page = PUBLIC_PAGES.find((p) => p.href === '/about')!
export const metadata: Metadata = { title: page.title, description: page.description }

export default function AboutPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page })]} />
      <h1>About Reclaimed</h1>
      <p className="lede">
        Reclaimed works on Georgia unclaimed property claims where proving legal
        entitlement is genuinely difficult — a deceased owner, a dissolved business,
        several co-owners. On simple claims we tell people to file themselves.
      </p>

      <h2>What we think this business is</h2>
      <p>
        Georgia publishes its unclaimed property database for free and anyone can
        search it in five minutes. <strong>Finding money is not a service worth
        paying for.</strong> Any firm charging primarily for discovery is charging
        for something you can do yourself before lunch.
      </p>
      <p>
        What is genuinely hard is the documentary chain proving that whoever signs
        has the legal authority to do so. Estates with multiple heirs. Companies that
        dissolved in 2009 and merged twice before that. Property held jointly by
        people who have since fallen out. That work takes weeks, the Department
        refuses claims over it, and it is the only part we think justifies a fee.
      </p>

      <h2>What we will not do</h2>
      <ul>
        <li>Charge anything before a claim is approved and paid. It is unlawful in Georgia and it is the single most common feature of a scam.</li>
        <li>Receive an owner’s money. The Department pays each party separately; we never touch your share.</li>
        <li>Take a case that should be filed directly. If your claim is simple, our letter says so and tells you how to file it yourself.</li>
        <li>Publish a name-search tool. O.C.G.A. § 44-12-239.1(b) forbids redistributing the Department’s file, and{' '}
          <a href={DOR_CLAIM_PORTAL} rel="noopener">the State already has one</a>.</li>
      </ul>

      <h2>Where we are</h2>
      <address style={{ fontStyle: 'normal', color: 'var(--muted)' }}>
        Reclaimed<br />
        {SITE_POSTAL_ADDRESS.streetAddress !== ''
          ? <>{SITE_POSTAL_ADDRESS.streetAddress}<br /></>
          : null}
        {SITE_POSTAL_ADDRESS.addressLocality}, {SITE_POSTAL_ADDRESS.addressRegion}
      </address>
      <p style={{ marginTop: '1rem' }}>
        We are not registered yet, so we cannot discuss a claim or accept an
        engagement. Any inquiry received before registration will be answered with
        exactly that.{' '}
        <Link href="/registration-status">Current registration status →</Link>
      </p>

      <p className="source-line">
        Reclaimed is not a government agency and is not affiliated with the State of
        Georgia or the Georgia Department of Revenue.
      </p>
    </div>
  )
}

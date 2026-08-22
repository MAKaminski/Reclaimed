import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, breadcrumbLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'

const page = PUBLIC_PAGES.find((p) => p.href === '/complex-claims')!
export const metadata: Metadata = { title: page.title, description: page.description }

const CASES = [
  { title: 'The owner has died', href: '/complex-claims/deceased-owner',
    body: 'Georgia allows heirs to claim up to $7,500 by affidavit without probate, effective 1 July 2026 — but every heir must sign, and no probate may ever have been opened. Above that, or with a will, probate is the route.' },
  { title: 'The owner was a business that dissolved or merged', href: null,
    body: 'The Department needs an unbroken chain from the reported entity to whoever signs today: articles of dissolution or merger, successor documentation, proof of authority, and the FEIN. Georgia publishes no documentation matrix for this — we have asked for one in writing.' },
  { title: 'Several people own it together', href: null,
    body: 'A joint account or jointly held property cannot be paid out automatically, and the Department will not pay one co-owner without addressing the others. Conflicting claims are resolved under O.C.G.A. § 44-12-222.' },
  { title: 'It is shares, not cash', href: null,
    body: 'Securities carry a CUSIP, a share count, and a valuation date. What the Department holds may have been sold, and what you receive may be proceeds rather than shares.' },
  { title: 'It is a safe deposit box', href: null,
    body: 'Contents are inventoried and often sold at auction, with the proceeds held instead. Establishing what was yours and what it became takes documentation the bank may no longer have.' },
]

export default function ComplexClaimsPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page }),
        breadcrumbLd([{ name: 'Home', href: '/' }, { name: 'Complex claims', href: '/complex-claims' }]),
      ]} />

      <h1>When a Georgia unclaimed property claim is not straightforward</h1>
      <p className="lede">
        Most Georgia unclaimed property claims are simple paperwork you should do
        yourself. A claim becomes genuinely difficult for one reason only: proving
        who is <em>legally entitled to sign</em> for the property. These are the
        five situations where that happens.
      </p>

      <SelfFileCallout heading="If none of these describe you, file it yourself" />

      <h2>The five hard cases</h2>
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        {CASES.map((c) => (
          <div key={c.title} className="card">
            <strong style={{ fontSize: 'var(--fs-h3)' }}>{c.title}</strong>
            <p style={{ margin: '0.4rem 0 0' }}>{c.body}</p>
            {c.href !== null && (
              <p style={{ margin: '0.5rem 0 0' }}>
                <Link href={c.href}><strong>Read more →</strong></Link>
              </p>
            )}
          </div>
        ))}
      </div>

      <h2>Why this is the hard part, and not finding the money</h2>
      <p>
        Georgia’s database is public and free to search. Finding unclaimed property
        is not a service worth paying for, and anyone charging you primarily for
        discovery is charging you for something you can do in five minutes.
      </p>
      <p>
        What is genuinely hard — and what the Department will refuse a claim over —
        is the documentary chain proving that the person signing has the legal
        authority to do so. That work is why representatives exist, and it is the
        only thing we think is worth paying for.
      </p>

      <p className="source-line">
        Last verified 22 August 2026 against O.C.G.A. §§ 44-12-220 and 44-12-222.
      </p>
    </div>
  )
}

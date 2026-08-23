import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { INDEX_SNAPSHOT } from '@/lib/public/marketStats'

const page = PUBLIC_PAGES.find((p) => p.href === '/engineering')!
export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  {
    question: 'What does “compliance as code” actually mean here?',
    answer: 'That a statutory rule is enforced by a database constraint, a type signature, or a CI gate rather than by a policy document. Twelve acts are sanctionable at $2,000 each under Georgia’s unclaimed property statute, and three of them are easy to commit by accident from ordinary product code, so each ships as a runtime-enforced invariant with a named test citing its statute.',
  },
  {
    question: 'Is there an unclaimed property API?',
    answer: 'No, and there will not be one. Georgia permits a registered representative to receive the state’s file only for soliciting the owners it names. A lookup API for third parties is the exact use the statute forecloses, so the product has no export and no public search.',
  },
  {
    question: 'What stack is this?',
    answer: 'Next.js on the App Router, Postgres with row-level security as the access boundary, and TypeScript with the compliance rules modelled as data rather than branches. The public tree cannot import the database client at all — CI fails the build if it does.',
  },
]

const LAYERS = [
  {
    n: '01',
    t: 'Database constraint',
    d: 'A computed CHECK sizes the statutory legend one point above the largest font on the page. A rule that lives in the schema cannot be forgotten by a future component.',
  },
  {
    n: '02',
    t: 'Row-level security',
    d: 'Every table storing owner data is readable only by an active staff row. Views run as the caller, not the owner — a distinction that hid a real hole until it was probed.',
  },
  {
    n: '03',
    t: 'Runtime assertion',
    d: 'Offer state and operating mode are pure functions of registration with no override. There is deliberately no flag that pretends we are registered, because that flag would be the whole bug.',
  },
  {
    n: '04',
    t: 'CI gate',
    d: 'Fifteen gates fail the build on an advance-fee code path, an unlegended template, a call to action before registration, or an unsourced claim about a competitor.',
  },
]

export default function EngineeringPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page }), faqLd(FAQS)]} />

      <h1>Compliance as code</h1>
      <p className="lede">
        Reclaimed is a regulated-recovery startup where the regulation is the product
        surface. Georgia’s statute makes twelve specific acts sanctionable at $2,000
        each, with registration revocation and referral to the Attorney General — so
        the interesting engineering problem is not finding money, it is making certain
        classes of mistake unrepresentable.
      </p>

      <h2>Four enforcement layers</h2>
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        {LAYERS.map((l) => (
          <div key={l.n} className="card">
            <span className="t-label">{l.n}</span>
            <strong style={{ display: 'block', fontSize: 'var(--fs-h3)' }}>{l.t}</strong>
            <p style={{ margin: '0.4rem 0 0' }}>{l.d}</p>
          </div>
        ))}
      </div>

      <h2>Three patterns worth stealing</h2>

      <h3>Derived state with no override</h3>
      <p>
        Whether the site may make an offer is a pure function of registration status.
        There is no environment variable that forces it, no admin toggle, and no test
        seam. Adding one would create a state where the product believes it is
        registered and the Department disagrees, which is the failure the whole design
        exists to prevent.
      </p>

      <h3>Making the illegal call untypeable</h3>
      <p>
        Data sources carry a discriminated union describing what the publisher permits.
        A source in <code>restricted</code> or <code>entitled</code> mode has no URL
        field at all, so fetching one is not a runtime error — it does not compile. The
        acquisition layer has exactly one network door, and it asserts the source is
        fetchable before opening it.
      </p>

      <h3>Append-only evidence</h3>
      <p>
        The chain proving who may legally sign is append-only at the database level.
        You cannot delete a link or the document behind it; you reject it on review,
        and the rejection is itself a record. This is a constraint that killed a
        convenience feature during development, which is roughly how you know it is
        real.
      </p>

      <h2>Scale, honestly stated</h2>
      <p>
        {INDEX_SNAPSHOT.properties.toLocaleString('en-US')} records indexed from a
        state file that its publisher distributes openly, exercising the parser, the
        multi-owner collapse, the change diff and source scoping at real volume. Zero
        claims filed, because registration has not issued. Those two facts sit next to
        each other on purpose.
      </p>

      <h2>Where the interesting problems are</h2>
      <ul>
        <li>
          Entitlement graphs. Owner name to entity, entity to successor, successor to
          authorised signer, signer to verified identity — scored, evidenced, and
          gated on a confidence threshold.
        </li>
        <li>
          Bulk ingest under a statutory ceiling, where a mis-mapped column silently
          becomes a dollar amount in a year field and changes an enforceability date.
        </li>
        <li>
          Publishing lawfully before you are licensed to sell. The public tree is
          indexable precisely <em>because</em> it declines clients, and CI holds that
          it keeps declining.
        </li>
      </ul>

      <div className="notice notice--held">
        <p style={{ margin: 0 }}>
          This page describes engineering, not an offer. Reclaimed is not registered
          and is not accepting clients — see{' '}
          <Link href="/registration-status">registration status</Link>.
        </p>
      </div>

      <p className="source-line">
        Statutory citations throughout are to O.C.G.A. §§ 44-12-190 to 44-12-239.2.
      </p>
    </div>
  )
}

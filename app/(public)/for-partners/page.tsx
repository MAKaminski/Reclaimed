import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'

const page = PUBLIC_PAGES.find((p) => p.href === '/for-partners')!
export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  {
    question: 'Is there a lookup endpoint?',
    answer:
      'No, and there will not be one. O.C.G.A. § 44-12-239.1(b) permits a representative to receive the state’s unclaimed property file only for the purpose of soliciting the owners it names. An endpoint answering "what do you hold for this name" is the exact use the statute forecloses.',
  },
  {
    question: 'Can I use the API today?',
    answer:
      'You can integrate against it today and it will refuse every referral with a 503, because Reclaimed is not registered. Poll /api/v1/status to see when that changes — the value is derived from registration state rather than configured, so it flips on its own.',
  },
  {
    question: 'What happens to a referral once it is accepted?',
    answer:
      'It is queued for triage by a named person. Nothing is sent to the claimant automatically. Any recovery still requires the claimant to sign the state’s own mandated agreement with us directly — a referral is an introduction, not an authority to act.',
  },
  {
    question: 'How is the fee handled?',
    answer:
      'Georgia caps a representative’s fees AND costs together at 30% of the lesser of the amount claimed or the property value, under O.C.G.A. § 44-12-224(d)(1). Costs count inside that ceiling rather than on top of it, and no fee may be charged in advance of a claim being approved.',
  },
]

export default function ForPartnersPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page }), faqLd(FAQS)]} />

      <h1>Refer a claim to us</h1>
      <p className="lede">
        An HTTP API for attorneys, fiduciaries, trustees and firms outside their own
        jurisdiction who want Reclaimed to do the recovery work on a claim they
        already hold. Two endpoints, no keys to request, and an OpenAPI spec.
      </p>

      <SelfFileCallout heading="If your client can simply file it themselves, have them do that" />

      <h2>Referrals in. Nothing out.</h2>
      <p>
        The direction of travel is the entire design, and it is worth being explicit
        because it is the first question anyone technical asks.
      </p>
      <p>
        <strong>There is no lookup endpoint and there will not be one.</strong>{' '}
        O.C.G.A. § 44-12-239.1(b) permits a representative to receive the state’s
        unclaimed property file only for the purpose of soliciting the owners it
        names. An endpoint that answers <em>“what do you hold for this name”</em> is
        the exact use the statute forecloses, so no response body from this API
        contains a property, a value, a holder, or a count. The only thing you ever
        get back is the reference you sent.
      </p>
      <p>
        That is enforced by shape rather than by policy: there is no read route, and
        the database role the API runs as holds <code>INSERT</code> and no{' '}
        <code>SELECT</code> on the referrals table at all.
      </p>

      <h2>The two endpoints</h2>

      <h3>Discover what we can do</h3>
      <pre><code>{`curl https://reclaimed-liart.vercel.app/api/v1/status`}</code></pre>
      <p>
        Always returns 200, including while we are closed. It reports whether
        referrals are being accepted, why not, which jurisdictions we can lawfully
        act in, and the statutory fee ceiling per state. Note that a{' '}
        <code>null</code> fee cap means that state has <em>no</em> percentage
        ceiling — it does not mean zero.
      </p>

      <h3>Refer a claim</h3>
      <pre><code>{`curl -X POST https://reclaimed-liart.vercel.app/api/v1/intake \\
  -H 'content-type: application/json' \\
  -d '{
    "reference": "your-matter-id-0001",
    "partner": { "name": "Doe & Partners LLP", "email": "referrals@example.com" },
    "jurisdiction": "GA",
    "claimant": {
      "name": "SMITH, JAMES",
      "kind": "estate",
      "relationship": "We act for the executor"
    },
    "property": { "description": "Uncashed dividend, reported by a transfer agent" },
    "claimantConsentAttested": true
  }'`}</code></pre>

      <p>
        <code>reference</code> is your idempotency key. Resending it returns 200 with{' '}
        <code>duplicate: true</code> rather than creating a second referral — a
        timed-out POST is the normal case, not an edge case.
      </p>
      <p>
        <code>claimantConsentAttested</code> must be literally <code>true</code>. You
        are attesting the claimant knows about and consents to the referral. An
        unattested referral is a cold contact, and a cold contact is the fact pattern
        § 44-12-239.2(a)(10) is about.
      </p>
      <p>
        There is deliberately no <code>property_id</code> field. Quoting one of our
        identifiers would mean you had our file, which is the thing this design
        exists to prevent.
      </p>

      <h2>Today it refuses everything</h2>
      <div className="notice notice--stop">
        <p style={{ margin: 0 }}>
          Reclaimed is <strong>not registered</strong>, so every referral is refused
          with <code>503 not_registered</code>. The registration check runs{' '}
          <em>before</em> the body is parsed: if we may not act on a referral, we do
          not read one either. Watch{' '}
          <Link href="/registration-status">our registration status</Link> or poll the
          status endpoint.
        </p>
      </div>

      <h2>Machine-readable</h2>
      <p>
        The full contract is at{' '}
        <a href="/api/openapi.json">/api/openapi.json</a> as OpenAPI 3.1.
      </p>

      <h2>Common questions</h2>
      <dl>
        {FAQS.map((f) => (
          <div key={f.question}>
            <dt><strong>{f.question}</strong></dt>
            <dd>{f.answer}</dd>
          </div>
        ))}
      </dl>

      <p className="source-line">
        Fee ceiling per O.C.G.A. § 44-12-224(d)(1). Data-use restriction per
        § 44-12-239.1(b). Solicitation-before-registration per § 44-12-239.2(a)(10).
      </p>
    </div>
  )
}

import type { Metadata } from 'next'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd } from '@/lib/public/structuredData'
import { getOfferState } from '@/lib/compliance/offerState'
import { DISCLOSURE_HEADLINE, PRE_REGISTRATION_DISCLOSURE } from '@/lib/public/disclosure'

const page = PUBLIC_PAGES.find((p) => p.href === '/legal/disclosures')!
export const metadata: Metadata = { title: page.title, description: page.description }

/**
 * The canonical long form. Note it COMPOSES the disclosure additively — it never
 * renders a "shorter variant". Every notice on this site is additive by
 * construction; there is no code path that subtracts one.
 */
export default function DisclosuresPage() {
  const offer = getOfferState()

  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page })]} />
      <h1>Disclosures</h1>

      {offer.state === 'pre_registration' && (
        <>
          <h2>Registration and offer status</h2>
          <p style={{ fontWeight: 700, textTransform: 'uppercase' }}>{DISCLOSURE_HEADLINE}</p>
          {PRE_REGISTRATION_DISCLOSURE.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
        </>
      )}

      <h2>Fees</h2>
      <p>
        Georgia caps a claimant’s designated representative’s total fees and costs at
        30% of the lesser of the amount claimed or the value of the property —
        O.C.G.A. § 44-12-224(d)(1). Costs count inside that ceiling. No fee may be
        charged or requested before a claim is approved and paid —
        O.C.G.A. § 44-12-239.2(a)(12).
      </p>

      <h2>Your right to claim directly, for free</h2>
      <p>
        You are never required to use a representative. Anyone may claim Georgia
        unclaimed property directly from the Department of Revenue at no cost. Using
        a representative does not make the Department pay faster.
      </p>

      <h2>Revocation</h2>
      <p>An owner may revoke an agreement with a representative — O.C.G.A. § 44-12-224(e).</p>

      <h2>Payment</h2>
      <p>
        The Department pays the owner and the representative separately, each to
        their own address. Reclaimed never receives, holds, or handles an owner’s
        money at any point.
      </p>

      <h2>No affiliation with government</h2>
      <p>
        Reclaimed is not a government agency and is not affiliated with, endorsed by,
        or acting on behalf of the State of Georgia or the Georgia Department of
        Revenue. Nothing on this site has been sent or approved by either.
      </p>

      <h2>No property data on this site</h2>
      <p>
        This site publishes no unclaimed property data and offers no name lookup.
        O.C.G.A. § 44-12-239.1(b) prohibits a representative from redistributing the
        Department’s unclaimed property file.
      </p>

      <h2>Not legal advice</h2>
      <p>
        Everything on this site is general information about Georgia’s unclaimed
        property procedure. It is not legal advice about your situation and no
        attorney-client or representative relationship arises from reading it.
      </p>
    </div>
  )
}

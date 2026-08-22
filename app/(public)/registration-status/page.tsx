import type { Metadata } from 'next'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { getOfferState } from '@/lib/compliance/offerState'
import { readRegistrationState } from '@/lib/compliance/registration'
import { DOR_UCP_PHONE, DOR_CLAIM_PORTAL } from '@/lib/public/site'

const page = PUBLIC_PAGES.find((p) => p.href === '/registration-status')!
export const metadata: Metadata = { title: page.title, description: page.description }

export default function RegistrationStatusPage() {
  const offer = getOfferState()
  const reg = readRegistrationState()
  const registered = offer.state === 'offering'

  const FAQS = [{
    question: 'Is Reclaimed a registered claimant’s designated representative in Georgia?',
    answer: registered
      ? `Yes. Reclaimed is registered with the Georgia Department of Revenue under O.C.G.A. § 44-12-239${reg.registrationNumber !== null ? `, registration number ${reg.registrationNumber}` : ''}.`
      : 'No. Reclaimed is not currently registered with the Georgia Department of Revenue as a claimant’s designated representative, and is not offering services or accepting clients.',
  }]

  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page }), faqLd(FAQS)]} />
      <h1>Is Reclaimed registered in Georgia?</h1>

      <div className={registered ? 'notice notice--ok' : 'notice notice--stop'} style={{ margin: '1rem 0' }}>
        <p style={{ margin: 0, fontSize: 'var(--fs-h3)', fontWeight: 700 }}>
          {registered ? 'Yes — registration is active.' : 'No. Not registered, and not accepting clients.'}
        </p>
      </div>

      <div className="scroll-x">
        <table className="fact-table">
          <tbody>
            <tr><td>Registration status</td><td><strong>{reg.status}</strong></td></tr>
            <tr><td>CDR identification number</td><td>{reg.registrationNumber ?? 'none issued'}</td></tr>
            <tr>
              <td>May solicit owners</td>
              <td>{offer.mayInviteEngagement ? 'yes' : 'no — § 44-12-239.2(a)(10)'}</td>
            </tr>
            <tr><td>Accepting clients</td><td>{registered ? 'yes' : 'no'}</td></tr>
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '1.25rem' }}>
        {registered
          ? 'You may verify this independently with the Georgia Department of Revenue Unclaimed Property Program.'
          : 'Until the Department of Revenue issues us a registration number we cannot lawfully solicit owners, file claims, receive fees, or obtain the Department’s unclaimed property data. We are not asking anyone to enter into an agreement, and we will not accept an inquiry, a signature, a document, or a payment before then.'}
      </p>

      <h2>How this page is produced</h2>
      <p>
        The status above is read from the same registration state that controls
        whether this system is permitted to send anything at all. It is derived, not
        written by hand — the identical value gates every outbound path in the
        software. Because the site is statically generated, it reflects the state at
        the last deployment.
      </p>

      <h2>Verify any representative, including us</h2>
      <p>
        Ask for the CDR identification number — Georgia requires it on every
        agreement, § 44-12-224(c)(6) — and confirm it with the Georgia Department of
        Revenue Unclaimed Property Program at {DOR_UCP_PHONE}. Or skip the question
        entirely and claim directly at{' '}
        <a href={DOR_CLAIM_PORTAL} rel="noopener">gaclaims.unclaimedproperty.com</a>, for free.
      </p>
    </div>
  )
}

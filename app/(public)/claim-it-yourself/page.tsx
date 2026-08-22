import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { DOR_CLAIM_PORTAL, DOR_UCP_PAGE, DOR_UCP_PHONE } from '@/lib/public/site'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, howToLd, faqLd } from '@/lib/public/structuredData'

const page = PUBLIC_PAGES.find((p) => p.href === '/claim-it-yourself')!

export const metadata: Metadata = { title: page.title, description: page.description }

const STEPS = [
  {
    name: 'Search the State’s own database',
    text: `Go to ${DOR_CLAIM_PORTAL} and search your name, former names, and any business you have owned. The search is free and requires no account. Search maiden names and misspellings — holders report what was on the account, not what is on your ID.`,
    url: DOR_CLAIM_PORTAL,
  },
  {
    name: 'Check whether Georgia will simply pay you',
    text: 'Since July 1, 2026, the Department may pay a claim of $500 or less to a sole owner without any claim being filed, where it can verify the owner’s identity and current address from its own records. If your property is under $500 and in your sole name, you may receive it without doing anything at all.',
  },
  {
    name: 'Start the claim online',
    text: 'Select the property and follow the prompts. The Department will tell you which documents it needs. For a straightforward claim in your own name that is typically photo identification and proof of the address associated with the property.',
  },
  {
    name: 'Prove you are the owner',
    text: 'Provide government photo identification and documentation linking you to the address or account the holder reported. If the reported address is one you lived at years ago, a document from that period — a utility bill, a tax return, an old bank statement — is what closes the gap.',
  },
  {
    name: 'Wait for the decision, then the payment',
    text: 'The Department must approve or deny within 90 days of a complete claim. On approval it must pay within 60 days. If the Department needs more information the clock restarts when you supply it.',
  },
]

const FAQS = [
  {
    question: 'Does it cost anything to claim Georgia unclaimed property yourself?',
    answer:
      'No. Filing a claim directly with the Georgia Department of Revenue is free. There is no filing fee, no processing fee, and no charge of any kind. A representative cannot make the Department pay you faster than filing yourself.',
  },
  {
    question: 'How long does a Georgia unclaimed property claim take?',
    answer:
      'The Department of Revenue must approve or deny a complete claim within 90 days, and must pay an approved claim within 60 days of approval. A claim that is missing documentation restarts the clock when the missing item arrives.',
  },
  {
    question: 'Do I need a lawyer or a finder to claim unclaimed property in Georgia?',
    answer:
      'No. Anyone may file their own claim. A representative is only worth considering when proving who may legally sign is genuinely difficult — for example when the owner has died, a business has dissolved, or several people share the property.',
  },
  {
    question: 'Is there a deadline to claim unclaimed property in Georgia?',
    answer:
      'No. Georgia holds unclaimed property indefinitely, and the owner’s right to claim it does not expire. There is no rush, and any communication implying a deadline should be treated with suspicion.',
  },
]

export default function ClaimItYourselfPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page, about: ['unclaimed property', 'Georgia Department of Revenue'] }),
        howToLd('Claim Georgia unclaimed property directly from the Department of Revenue', STEPS),
        faqLd(FAQS),
      ]} />

      <h1>How to claim Georgia unclaimed property yourself, for free</h1>
      <p className="lede">
        Anyone may claim Georgia unclaimed property directly from the Georgia
        Department of Revenue at no cost, at{' '}
        <a href={DOR_CLAIM_PORTAL} rel="noopener">gaclaims.unclaimedproperty.com</a>.
        No representative is required, no fee is charged, and using a representative
        does not make the Department pay faster.
      </p>

      <p>
        <strong>We are telling you this on our own website because it is true, and
        because most claims are simple.</strong> If your name is on the property, the
        address matches, and nobody has died or dissolved, this is an afternoon of
        paperwork. Do it yourself and keep all of the money.
      </p>

      <h2>The five steps</h2>
      <ol>
        {STEPS.map((s) => (
          <li key={s.name} style={{ marginBottom: '0.9rem' }}>
            <strong>{s.name}.</strong> {s.text}
          </li>
        ))}
      </ol>

      <h2>What Georgia unclaimed property is</h2>
      <p>
        Unclaimed property is money or property that a business is holding for
        someone it has lost contact with — a dormant bank account, an uncashed
        payroll cheque, an insurance payout, a utility deposit, shares of stock, or
        the contents of a safe deposit box. After a dormancy period the holder must
        report and deliver it to the Georgia Department of Revenue, which holds it
        for the owner under the Disposition of Unclaimed Property Act, O.C.G.A.
        § 44-12-190 et seq.
      </p>
      <p>
        The State never takes ownership. It holds the property indefinitely and
        the owner’s right to claim it does not expire.
      </p>

      <h2>Common questions</h2>
      <dl>
        {FAQS.map((f) => (
          <div key={f.question} style={{ marginBottom: '1rem' }}>
            <dt style={{ fontWeight: 700, color: 'var(--ink)' }}>{f.question}</dt>
            <dd style={{ margin: '0.3rem 0 0', color: 'var(--muted)' }}>{f.answer}</dd>
          </div>
        ))}
      </dl>

      <h2>When it is not this simple</h2>
      <p>
        Some claims are genuinely hard, and they are hard for one reason: proving
        who is legally entitled to sign. If the owner has died, if the owner was a
        business that has since dissolved or merged, or if several people share the
        property, the Department will require documentation establishing an unbroken
        chain of authority before it pays anyone.
      </p>
      <p>
        <Link href="/complex-claims"><strong>See what makes a claim complicated →</strong></Link>
      </p>

      <p className="source-line">
        Last verified 22 August 2026 against the Georgia Department of Revenue’s
        published guidance (<a href={DOR_UCP_PAGE} rel="noopener">dor.georgia.gov/unclaimed-property</a>)
        and O.C.G.A. § 44-12-190 et seq. Unclaimed Property Program: {DOR_UCP_PHONE}.
      </p>
    </div>
  )
}

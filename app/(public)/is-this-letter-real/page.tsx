import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { DOR_CLAIM_PORTAL, DOR_UCP_PHONE, DOR_UCP_PAGE } from '@/lib/public/site'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
// The legend has exactly one definition in this codebase. This page QUOTES it
// educationally — teaching a reader to recognise it is the whole point — so it
// imports the constant rather than retyping it. `verify:templates` exempts this
// file from the inline-legend ban on that condition.
import { SOLICITATION_LEGEND_GA, LEGEND_MIN_POINT_SIZE } from '@/lib/compliance/legend'

const page = PUBLIC_PAGES.find((p) => p.href === '/is-this-letter-real')!

export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  {
    question: 'What must a legitimate Georgia unclaimed property letter say?',
    answer:
      'Georgia requires every solicitation from a claimant’s designated representative to carry a specific notice, in capital letters, at least 12 point type or larger than any other font used: THIS IS A SOLICITATION. THIS IS NOT A BILL OR OFFICIAL GOVERNMENT DOCUMENT AND HAS NOT BEEN SENT BY THE STATE OF GEORGIA. YOU ARE NOT REQUIRED TO USE THE SERVICES OFFERED IN THIS SOLICITATION. O.C.G.A. § 44-12-239(f).',
  },
  {
    question: 'Is it legal for someone to ask me to pay upfront to recover unclaimed property?',
    answer:
      'No. In Georgia it is unlawful for a claimant’s designated representative to receive or even solicit any fee before a claim is approved and paid — O.C.G.A. § 44-12-239.2(a)(12). Any request for advance payment, a “processing fee”, or a “filing fee” is a violation and almost always a scam.',
  },
  {
    question: 'How much can a Georgia unclaimed property finder legally charge?',
    answer:
      'No more than 30% of the lesser of the amount claimed or the value of the property, and that ceiling includes their costs, not just their fee — O.C.G.A. § 44-12-224(d)(1). A letter quoting more than 30%, or quoting 30% plus expenses, is describing an unlawful agreement.',
  },
  {
    question: 'How do I check whether a Georgia unclaimed property representative is registered?',
    answer:
      `Ask for their CDR identification number — Georgia requires it on every agreement — and contact the Georgia Department of Revenue Unclaimed Property Program at ${DOR_UCP_PHONE} to confirm it. You can always bypass the question entirely by claiming directly at ${DOR_CLAIM_PORTAL}, for free.`,
  },
]

const RED_FLAGS = [
  ['Asks you to pay anything upfront', 'Unlawful in Georgia — § 44-12-239.2(a)(12). No exceptions, no matter what it is called.'],
  ['Has no solicitation notice', 'The § 44-12-239(f) legend is mandatory, in capitals, and must be the largest text or at least 12 point.'],
  ['Looks like it came from the State', 'A representative may not use a name suggesting a government agency — § 44-12-239(g). Georgia does not cold-call or cold-mail you about your property.'],
  ['Quotes more than 30%, or 30% "plus costs"', 'The cap is 30% INCLUDING costs — § 44-12-224(d)(1). "Plus expenses" is how the cap gets exceeded.'],
  ['Claims a deadline is approaching', 'There is no deadline. Georgia holds unclaimed property indefinitely and your right to claim never expires.'],
  ['Wants payment sent to their address', 'The Department pays the owner and the representative separately, each to their own address. Redirecting the owner’s payment is the fact pattern in essentially every prosecution in this industry.'],
  ['Won’t give a registration number', 'Georgia requires the CDR identification number on the agreement itself — § 44-12-224(c)(6).'],
]

export default function IsThisLetterRealPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page, citations: ['https://www.legis.ga.gov'] }), faqLd(FAQS)]} />

      <h1>How to tell whether a Georgia unclaimed property letter is legitimate</h1>
      <p className="lede">
        A lawful Georgia unclaimed property solicitation must carry a specific
        statutory notice in capital letters, must not ask you for any money
        upfront, and must not charge more than 30% including costs. A letter
        failing any of those three tests is not compliant with Georgia law.
      </p>

      <h2>The notice the law requires</h2>
      <p>
        O.C.G.A. § 44-12-239(f) requires this exact language on every solicitation,
        in capital letters, in {LEGEND_MIN_POINT_SIZE} point type or larger than any
        other font used in the letter — whichever is bigger:
      </p>
      <blockquote className="card" style={{ margin: '1rem 0', fontWeight: 600 }}>
        {SOLICITATION_LEGEND_GA}
      </blockquote>
      <p>
        If the letter you are holding does not say this, prominently, it does not
        comply with Georgia law. That alone tells you something about who sent it.
      </p>

      <h2>Seven red flags</h2>
      <div className="scroll-x">
        <table className="fact-table">
          <thead><tr><th>If the letter…</th><th>Why that is wrong</th></tr></thead>
          <tbody>
            {RED_FLAGS.map(([flag, why]) => (
              <tr key={flag}><td><strong>{flag}</strong></td><td>{why}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>The simplest response to any such letter</h2>
      <p>
        You do not have to engage with it at all. Search your own name at{' '}
        <a href={DOR_CLAIM_PORTAL} rel="noopener">gaclaims.unclaimedproperty.com</a>,
        the State’s own free database, and file the claim yourself. If the property
        is really there, you will find it, and you will keep 100% of it.
      </p>
      <p>
        <Link href="/claim-it-yourself"><strong>How to file it yourself, step by step →</strong></Link>
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

      <p className="source-line">
        Last verified 22 August 2026 against O.C.G.A. §§ 44-12-224, 44-12-239 and
        44-12-239.2 as amended by SB 103, and the Department’s published guidance
        (<a href={DOR_UCP_PAGE} rel="noopener">dor.georgia.gov/unclaimed-property</a>).
        To report a suspected violation, contact the Georgia Department of Revenue
        Unclaimed Property Program at {DOR_UCP_PHONE}.
      </p>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'

const page = PUBLIC_PAGES.find((p) => p.href === '/how-it-works')!
export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  { question: 'How long does a Georgia unclaimed property claim take?',
    answer: 'The Georgia Department of Revenue must approve or deny a complete claim within 90 days and must pay an approved claim within 60 days of approval — O.C.G.A. § 44-12-220. A claim missing documentation restarts the clock when the missing item arrives.' },
  { question: 'Can I sign an unclaimed property agreement electronically in Georgia?',
    answer: 'Generally no. Georgia requires the owner’s own manual signature on the representative agreement and the Department’s forms require notarisation. Georgia has not enacted general remote online notarisation, so in practice these are signed in wet ink before a notary.' },
  { question: 'Does the representative receive my money?',
    answer: 'No. The Department pays the owner and the representative separately, each to their own address. A representative who asks to receive the owner’s share should be refused — that arrangement is the fact pattern in essentially every prosecution in this industry.' },
]

const STAGES = [
  ['We identify the property', 'From the Department’s own published file of unclaimed property. We never see anything a registered representative is not entitled to receive.'],
  ['We work out who may legally sign', 'The hard part. For a living owner at a matching address this is trivial. For an estate, a dissolved company, or several co-owners it means assembling documentary proof of an unbroken chain of authority.'],
  ['We write to you', 'By post, carrying the notice Georgia requires on every solicitation. If your claim is simple enough to file yourself, the letter says so and tells you how.'],
  ['You decide', 'If you want to proceed, we send the Department’s own agreement form, UP-CDR2. You are never obliged to sign, and you may revoke afterwards — § 44-12-224(e).'],
  ['You sign before a notary and post it back', 'Georgia requires your own manual signature. There is no online signing flow, and any representative offering one should be asked which authority permits it.'],
  ['We file the claim', 'With the completed agreement and the entitlement evidence.'],
  ['The Department decides within 90 days', 'It may request more information, which restarts the clock.'],
  ['The Department pays within 60 days', 'It pays you and it pays us, separately. Our fee comes out of the Department’s distribution, never out of your pocket.'],
]

export default function HowItWorksPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page }), faqLd(FAQS)]} />
      <h1>What actually happens on a Georgia unclaimed property claim</h1>
      <p className="lede">
        The Georgia Department of Revenue must decide a complete unclaimed property
        claim within 90 days and pay an approved claim within 60 days. It pays the
        owner and any representative separately, each to their own address.
      </p>

      <SelfFileCallout />

      <h2>The eight steps, when a representative is involved</h2>
      <ol>
        {STAGES.map(([name, detail]) => (
          <li key={name} style={{ marginBottom: '0.9rem' }}>
            <strong>{name}.</strong> {detail}
          </li>
        ))}
      </ol>

      <h2>The notary reality, stated plainly</h2>
      <p>
        Georgia requires the owner’s own manual signature on a representative
        agreement, and the Department’s forms require notarisation. Georgia has
        <strong> not</strong> enacted general remote online notarisation. So despite
        what any website in this industry implies, the realistic path today is
        printing a form, signing it in front of a notary, and posting it back.
      </p>
      <p>
        We would rather tell you that now than after you have signed up expecting
        an app.
      </p>

      <h2>The forms Georgia uses</h2>
      <div className="scroll-x">
        <table className="fact-table">
          <thead><tr><th>Form</th><th>Purpose</th><th>Limit</th></tr></thead>
          <tbody>
            <tr><td>UP-CDR1</td><td>Representative’s registration application</td><td>—</td></tr>
            <tr><td>UP-CDR2</td><td>The recovery agreement between owner and representative</td><td>up to 15 properties</td></tr>
            <tr><td>UP-CDR3</td><td>Addendum, required for custom terms above $2,000</td><td>—</td></tr>
            <tr><td>UP-CDR4</td><td>Purchase agreement</td><td>up to 5 properties</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Using the wrong form voids the claim — O.C.G.A. § 44-12-224(b). A
        representative who sends you something that is not one of these is not
        following Georgia’s procedure.
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

      <p><Link href="/fees"><strong>What this costs, and the statutory cap →</strong></Link></p>
      <p className="source-line">Last verified 22 August 2026 against O.C.G.A. §§ 44-12-220 and 44-12-224.</p>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { computeFee } from '@/lib/compliance/computeFee'
import { dollarsToCents, formatUsd } from '@/lib/compliance/money'
import { getStateRules } from '@/lib/compliance/stateRules'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'

const page = PUBLIC_PAGES.find((p) => p.href === '/fees')!
export const metadata: Metadata = { title: page.title, description: page.description }

const GA = getStateRules('GA')
const CAP_PCT = GA.feeCapPct ?? 30

/**
 * The worked example is COMPUTED, not typed.
 *
 * Two reasons. First, the public page can then never drift from the engine that
 * generates real agreements — if the cap logic changes, this page changes with
 * it. Second, Georgia's FBPA gives a private right of action with treble damages
 * after a 30-day demand, so every number published here needs to be
 * substantiable from a primary source in this repo. This one is.
 */
const EXAMPLE = computeFee({
  claimedAmount: dollarsToCents(12_000),
  propertyValue: dollarsToCents(12_000),
  costs: dollarsToCents(85),
  feeCapPct: CAP_PCT,
})

const FAQS = [
  {
    question: 'How much can an unclaimed property finder charge in Georgia?',
    answer:
      `Georgia caps a claimant's designated representative at ${CAP_PCT}% of the lesser of the amount claimed or the value of the property. That ceiling includes the representative's costs, not only its fee — O.C.G.A. § 44-12-224(d)(1).`,
  },
  {
    question: 'Can a Georgia finder charge costs on top of their percentage?',
    answer:
      `No. This is the most common way the cap gets exceeded. Costs count INSIDE the ${CAP_PCT}% ceiling. An agreement quoting "${CAP_PCT}% plus expenses" describes an unlawful arrangement.`,
  },
  {
    question: 'Can a Georgia unclaimed property representative charge an upfront fee?',
    answer:
      'No. Receiving or even soliciting any consideration before a claim is approved and paid is prohibited by O.C.G.A. § 44-12-239.2(a)(12), sanctionable at up to $2,000 per act with revocation of registration.',
  },
  {
    question: 'Can I cancel an agreement with an unclaimed property representative?',
    answer:
      'Yes. An owner may revoke the agreement — O.C.G.A. § 44-12-224(e).',
  },
]

export default function FeesPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page }), faqLd(FAQS)]} />

      <h1>What a Georgia unclaimed property finder may charge</h1>
      <p className="lede">
        Georgia caps a claimant’s designated representative’s total fees <em>and
        costs</em> at {CAP_PCT}% of the lesser of the amount claimed or the value
        of the property — O.C.G.A. § 44-12-224(d)(1). Costs count inside that
        ceiling, not on top of it, and nothing at all may be charged before the
        claim is approved and paid.
      </p>

      <h2>The cap, precisely</h2>
      <div className="scroll-x">
        <table className="fact-table">
          <thead><tr><th>Rule</th><th>Value</th><th>Authority</th></tr></thead>
          <tbody>
            <tr><td>Maximum total take</td><td><strong>{CAP_PCT}%</strong></td><td>§ 44-12-224(d)(1)</td></tr>
            <tr><td>What the % applies to</td><td>the <em>lesser</em> of amount claimed or property value</td><td>§ 44-12-224(d)(1)</td></tr>
            <tr><td>Do costs count inside it?</td><td><strong>Yes</strong> — “fees and costs”</td><td>§ 44-12-224(d)(1)</td></tr>
            <tr><td>Fee before approval</td><td><strong>Prohibited</strong></td><td>§ 44-12-239.2(a)(12)</td></tr>
            <tr><td>Owner may revoke</td><td>Yes</td><td>§ 44-12-224(e)</td></tr>
            <tr><td>Who the State pays</td><td>owner and representative <em>separately</em></td><td>§ 44-12-220(c)(2)</td></tr>
          </tbody>
        </table>
      </div>

      <h2>A worked example</h2>
      <p>
        A $12,000 claim where the representative incurs {formatUsd(EXAMPLE.costs)} of
        recoverable costs, at the statutory maximum:
      </p>
      <div className="scroll-x">
        <table className="fact-table">
          <tbody>
            <tr><td>Amount claimed</td><td>{formatUsd(EXAMPLE.capBasis)}</td></tr>
            <tr><td>Cap ceiling ({CAP_PCT}% of the basis)</td><td><strong>{formatUsd(EXAMPLE.capCeiling)}</strong></td></tr>
            <tr><td>Costs, counted inside the ceiling</td><td>{formatUsd(EXAMPLE.costs)}</td></tr>
            <tr><td>Fee available after costs</td><td>{formatUsd(EXAMPLE.feeExcludingCosts)}</td></tr>
            <tr><td>Total to the representative</td><td>{formatUsd(EXAMPLE.feeDollars)}</td></tr>
            <tr style={{ fontWeight: 700 }}><td>Net to the owner</td><td>{formatUsd(EXAMPLE.netToClaimant)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="source-line">
        Computed by the same fee engine that generates our agreements
        (<code>lib/compliance/computeFee.ts</code>), not typed into this page.
      </p>

      <SelfFileCallout heading={`On a simple claim, ${formatUsd(EXAMPLE.feeDollars)} is a lot to pay for an afternoon of paperwork`} />

      <h2>What Reclaimed intends to charge</h2>
      <p>
        Reclaimed is not registered and is not accepting clients, so nothing here
        is an offer and no fee is being quoted for acceptance. For transparency:
        when we are registered we intend to work at the statutory maximum of{' '}
        {CAP_PCT}%, inclusive of costs, and only on claims where entitlement is
        genuinely difficult to prove.
      </p>
      <p>
        We charge nothing unless the Department approves the claim and pays it.
        There is no fee for an unsuccessful claim, because charging one would be
        unlawful.
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

      <p>
        <Link href="/is-this-letter-real"><strong>How to spot an unlawful solicitation →</strong></Link>
      </p>

      <p className="source-line">
        Last verified 22 August 2026 against O.C.G.A. § 44-12-224 and § 44-12-239.2
        as amended by SB 103. Note that DOR still publishes form UP-1061, which
        recites a repealed 10% regime; the current cap is {CAP_PCT}%.
      </p>
    </div>
  )
}

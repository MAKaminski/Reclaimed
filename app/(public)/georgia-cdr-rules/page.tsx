import type { Metadata } from 'next'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { getStateRules } from '@/lib/compliance/stateRules'

const page = PUBLIC_PAGES.find((p) => p.href === '/georgia-cdr-rules')!
export const metadata: Metadata = { title: page.title, description: page.description }

const GA = getStateRules('GA')
const CAP = GA.feeCapPct ?? 30
const FEE = GA.registrationFeeUsd ?? 1200
const TERM = GA.registrationTermYears ?? 4

const FAQS = [
  { question: 'What is a claimant’s designated representative in Georgia?',
    answer: 'A claimant’s designated representative (CDR) is a person registered with the Georgia Department of Revenue under O.C.G.A. § 44-12-239 to file unclaimed property claims on behalf of an owner in exchange for a fee. Registration is mandatory before soliciting owners, filing claims, or receiving fees.' },
  { question: 'Does Georgia require unclaimed property finders to register?',
    answer: `Yes. O.C.G.A. § 44-12-239 requires registration with the Department of Revenue. The fee is $${FEE} and the term is ${TERM} years. Acting as a representative — including merely soliciting owners — while unregistered violates § 44-12-239.2(a)(10).` },
  { question: 'What are the penalties for violating Georgia’s CDR rules?',
    answer: 'The Department may issue a cease and desist, require corrective action, revoke a registration with a bar on reapplying, impose probation or permanent conditions, and fine up to $2,000 for EACH act. It may also bar the person from being a director, officer, agent, employee or 10% owner of any representative, bring a civil action, and refer the matter to the Attorney General.' },
]

const PROHIBITED = [
  ['Fraudulent misrepresentation or concealment', '§ 44-12-239.2(a)(3) — actionable regardless of reliance by or damage to the owner. No injury need be shown.'],
  ['False, deceptive or misleading solicitation or advertising', '§ 44-12-239.2(a)(5) — reaches advertising, not only direct solicitation.'],
  ['Acting as a representative, including soliciting, while unregistered', '§ 44-12-239.2(a)(10)'],
  ['Charging or soliciting a fee before a claim is approved', '§ 44-12-239.2(a)(12)'],
  ['Imposing illegal or excessive charges', 'Any agreement above the 30% ceiling.'],
]

export default function GeorgiaCdrRulesPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page, citations: ['https://www.legis.ga.gov'], about: ['O.C.G.A. § 44-12-239'] }),
        faqLd(FAQS),
      ]} />

      <h1>Georgia’s rules for unclaimed property representatives, in plain English</h1>
      <p className="lede">
        A claimant’s designated representative (CDR) is a person registered with the
        Georgia Department of Revenue under O.C.G.A. § 44-12-239 to file unclaimed
        property claims on behalf of an owner in exchange for a fee. Registration is
        mandatory before soliciting an owner, filing a claim, receiving fees, or
        obtaining the Department’s unclaimed property data.
      </p>

      <h2>Registration</h2>
      <div className="scroll-x">
        <table className="fact-table">
          <thead><tr><th>Requirement</th><th>Detail</th><th>Authority</th></tr></thead>
          <tbody>
            <tr><td>Application fee</td><td>${FEE}, non-refundable</td><td>§ 44-12-239</td></tr>
            <tr><td>Term</td><td>{TERM} years</td><td>§ 44-12-239(a)</td></tr>
            <tr><td>Background screening</td><td>No conviction in the last 20 years involving dishonesty, deceit or fraud — for any officer, owner, or claim-submitting employee</td><td>§ 44-12-239(d)</td></tr>
            <tr><td>Also required</td><td>IRS Form W-9, Secretary of State registration, copy of each agent’s driver’s licence</td><td>§ 44-12-239</td></tr>
            <tr><td>Name restriction</td><td>May not use a name that could lead a reasonable person to think the representative is a government agency</td><td>§ 44-12-239(g)</td></tr>
            <tr><td>False information on the application</td><td>Felony</td><td>§ 44-12-239(c); § 16-10-20</td></tr>
          </tbody>
        </table>
      </div>

      <h2>What registration unlocks</h2>
      <p>Four things, and nothing before it: soliciting owners, filing claims, receiving a distribution of fees and costs, and obtaining information about unclaimed property held by the Department.</p>

      <h2>The fee cap</h2>
      <p>
        {CAP}% of the lesser of the amount claimed or the value of the property —
        O.C.G.A. § 44-12-224(d)(1). The statute says “fees <em>and costs</em>”, so
        costs sit inside the ceiling. No fee of any kind may be charged or even
        requested before the claim is approved and paid.
      </p>

      <h2>The mandatory solicitation notice</h2>
      <p>
        O.C.G.A. § 44-12-239(f) requires a specific notice on every solicitation, in
        capital letters, in at least 12 point type <em>or</em> a font larger than any
        used in the solicitation — whichever is larger. It must state that the
        communication is a solicitation, that it is not a bill or government
        document, that it was not sent by the State of Georgia, and that the reader
        is not required to use the services offered.
      </p>

      <h2>Prohibited acts and penalties</h2>
      <div className="scroll-x">
        <table className="fact-table">
          <thead><tr><th>Prohibited act</th><th>Authority and note</th></tr></thead>
          <tbody>
            {PROHIBITED.map(([act, cite]) => (
              <tr key={act}><td><strong>{act}</strong></td><td>{cite}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Twelve acts are sanctionable in total under § 44-12-239.2(a). The Department
        may fine <strong>up to $2,000 per act</strong> — § 44-12-239.2(b)(5) — and
        revoke a registration with a bar on reapplying.
      </p>

      <h2>Data the Department provides, and what may be done with it</h2>
      <p>
        A registered representative may obtain a searchable data file of unclaimed
        property — O.C.G.A. § 44-12-239.1(a). Section 44-12-239.1(b) prohibits
        redistributing it. That forecloses data resale, lookup APIs, and public
        “search your name” tools built on the Department’s file. It is why there is
        no search box on this website.
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
        Last verified 22 August 2026 against O.C.G.A. §§ 44-12-190 to 44-12-239.2 as
        amended by SB 103 and SB 403, from the enrolled acts at legis.ga.gov.
      </p>
    </div>
  )
}

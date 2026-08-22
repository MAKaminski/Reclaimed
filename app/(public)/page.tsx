import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { WhenOffering } from '@/components/public/WhenOffering'
import { getStateRules } from '@/lib/compliance/stateRules'
import { DOR_CLAIM_PORTAL } from '@/lib/public/site'

const page = PUBLIC_PAGES.find((p) => p.href === '/')!
export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: '/' },
}

const CAP = getStateRules('GA').feeCapPct ?? 30

const FAQS = [
  { question: 'What is Georgia unclaimed property?',
    answer: 'Unclaimed property is money or property a business holds for someone it has lost contact with — a dormant bank account, an uncashed cheque, an insurance payout, shares, or safe deposit box contents. After a dormancy period the holder must deliver it to the Georgia Department of Revenue, which holds it for the owner indefinitely under O.C.G.A. § 44-12-190 et seq.' },
  { question: 'Do I need a company to get my unclaimed property back?',
    answer: 'Usually not. Anyone may claim directly from the Georgia Department of Revenue for free, and a representative cannot make the Department pay faster. A representative is worth considering only when proving who may legally sign is genuinely difficult — a deceased owner, a dissolved business, or several co-owners.' },
  { question: 'What is a claimant’s designated representative?',
    answer: 'A claimant’s designated representative (CDR) is a person registered with the Georgia Department of Revenue under O.C.G.A. § 44-12-239 to file unclaimed property claims on behalf of an owner in exchange for a fee. Registration is mandatory before soliciting owners or filing claims.' },
]

const ROUTES = [
  { href: '/claim-it-yourself', label: 'Claim it yourself, free', body: 'Step by step, directly with the Department of Revenue. Most people should stop here.' },
  { href: '/is-this-letter-real', label: 'Got a letter? Check it', body: 'What Georgia law requires on a lawful solicitation, and seven red flags.' },
  { href: '/complex-claims', label: 'When it is not simple', body: 'Deceased owners, dissolved businesses, co-owners — where entitlement is hard to prove.' },
  { href: '/fees', label: 'What anyone may charge', body: `The ${CAP}% statutory cap, why costs count inside it, and the advance-fee ban.` },
  { href: '/georgia-cdr-rules', label: 'Georgia’s rules, plainly', body: 'Registration, the cap, the forms, the twelve prohibited acts, the penalties.' },
  { href: '/how-it-works', label: 'What actually happens', body: 'The 90-day and 60-day clocks, the forms, and the notary reality.' },
]

export default function HomePage() {
  return (
    <div>
      <JsonLd data={[webPageLd({ page, about: ['unclaimed property', 'Georgia'] }), faqLd(FAQS)]} />

      <div className="prose">
        <h1>Georgia is holding money for people who do not know it exists</h1>
        <p className="lede">
          Most of them should claim it themselves, for free, in an afternoon. This
          site explains how to do that, how to tell a lawful solicitation from a
          scam, and the handful of situations where a claim is genuinely too
          complicated to do alone.
        </p>
      </div>

      <SelfFileCallout />

      <div className="prose">
        <h2>Start here</h2>
      </div>
      <div className="public-grid" style={{ marginTop: '0.75rem' }}>
        {ROUTES.map((r) => (
          <Link key={r.href} href={r.href} className="card" style={{ textDecoration: 'none', display: 'block' }}>
            <strong style={{ fontSize: 'var(--fs-h3)' }}>{r.label}</strong>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: 'var(--fs-small)' }}>{r.body}</p>
          </Link>
        ))}
      </div>

      <div className="prose">
        <h2>What Reclaimed does</h2>
        <p>
          A claimant’s designated representative (CDR) is a person registered with
          the Georgia Department of Revenue under O.C.G.A. § 44-12-239 to file
          unclaimed property claims on behalf of an owner for a fee. That is what
          Reclaimed intends to be.
        </p>
        <p>
          We work the claims nobody else wants: the owner died and there are six
          heirs, the company dissolved in 2009 and merged twice before that, the
          account was joint and the other party is unreachable. Assembling the
          documentary chain that proves who may lawfully sign takes weeks, and the
          Department refuses claims over exactly that.
        </p>
        <p>
          <strong>We do not charge for finding money.</strong>{' '}
          <a href={DOR_CLAIM_PORTAL} rel="noopener">The State’s database is free and public</a>{' '}
          and searching it takes five minutes. Charging for discovery is charging for
          something you can do yourself.
        </p>

        <h2>What it would cost</h2>
        <p>
          Georgia caps a representative’s total fees <em>and</em> costs at {CAP}% of
          the lesser of the amount claimed or the property’s value —
          O.C.G.A. § 44-12-224(d)(1). Nothing may be charged before the Department
          approves and pays the claim. If a claim fails, you owe nothing, because
          charging you would be unlawful.{' '}
          <Link href="/fees">See the arithmetic →</Link>
        </p>

        {/* The only sanctioned place a CTA may live. Renders nothing until the
            registration state permits an offer; CI asserts nothing outside a
            <WhenOffering> in this tree can contain one. */}
        <WhenOffering>
          <div className="notice notice--ok" style={{ margin: '1.5rem 0' }} data-cta="engage">
            <p style={{ margin: 0, fontWeight: 700 }}>Think your claim is one of the complicated ones?</p>
            <p style={{ margin: '0.4rem 0 0' }}>
              Write to us and we will tell you honestly whether you need us.
            </p>
          </div>
        </WhenOffering>

        <h2>Common questions</h2>
        <dl>
          {FAQS.map((f) => (
            <div key={f.question} style={{ marginBottom: '1rem' }}>
              <dt style={{ fontWeight: 700, color: 'var(--ink)' }}>{f.question}</dt>
              <dd style={{ margin: '0.3rem 0 0', color: 'var(--muted)' }}>{f.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

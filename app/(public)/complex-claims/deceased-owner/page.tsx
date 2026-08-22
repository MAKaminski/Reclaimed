import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd, breadcrumbLd } from '@/lib/public/structuredData'

const page = PUBLIC_PAGES.find((p) => p.href === '/complex-claims/deceased-owner')!
export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  { question: 'Can I claim unclaimed property for a deceased parent in Georgia?',
    answer: 'Yes. Effective 1 July 2026, Georgia allows heirs to claim up to $7,500 in aggregate by sworn affidavit without opening probate, under O.C.G.A. § 44-12-220(i). Every heir must sign. Above $7,500, or where a will is being probated, the estate’s personal representative must claim instead.' },
  { question: 'Do all heirs have to sign a Georgia unclaimed property affidavit?',
    answer: 'Yes. The affidavit route requires every heir at law to join. A partial heir set will not be accepted, and swearing an incomplete one exposes the signers to personal liability to the estate’s creditors and to the omitted heirs.' },
  { question: 'What if the unclaimed property is worth more than $7,500?',
    answer: 'The affidavit route is unavailable. The estate must be administered — a personal representative is appointed by the probate court and claims in that capacity, with letters testamentary or letters of administration as proof of authority.' },
]

export default function DeceasedOwnerPage() {
  return (
    <div className="prose">
      <JsonLd data={[
        webPageLd({ page, about: ['O.C.G.A. § 44-12-220(i)', 'unclaimed property', 'estate administration'] }),
        faqLd(FAQS),
        breadcrumbLd([
          { name: 'Home', href: '/' },
          { name: 'Complex claims', href: '/complex-claims' },
          { name: 'Deceased owner', href: '/complex-claims/deceased-owner' },
        ]),
      ]} />

      <h1>Claiming unclaimed property for a deceased relative in Georgia</h1>
      <p className="lede">
        Since 1 July 2026, Georgia allows heirs to claim up to $7,500 in aggregate of
        a deceased owner’s unclaimed property by sworn affidavit, without opening
        probate — O.C.G.A. § 44-12-220(i). Every heir at law must sign, and no
        probate proceeding may have been opened.
      </p>

      <h2>The affidavit route, and its four conditions</h2>
      <ol>
        <li><strong>$7,500 aggregate ceiling.</strong> Across all of the decedent’s unclaimed property, not per item. Exceed it and this route closes.</li>
        <li><strong>Every heir at law must sign.</strong> Not the closest heir, not a majority. All of them.</li>
        <li><strong>No probate may have been opened.</strong> If an estate is or was administered, the personal representative claims instead.</li>
        <li><strong>The signers accept personal liability.</strong> To the estate’s creditors, and to any heir left off the affidavit.</li>
      </ol>

      <div className="notice notice--held" style={{ margin: '1.25rem 0' }}>
        <p style={{ margin: 0 }}>
          <strong>The fourth condition is the one people underestimate.</strong> An
          affidavit that omits a half-sibling nobody mentioned is not a paperwork
          error — it is a sworn statement that was false, made by people who are now
          personally liable. Identifying the complete heir set is the actual work.
        </p>
      </div>

      <h2>When probate is required instead</h2>
      <p>
        Above $7,500, where a will exists and is being probated, or where an estate
        has already been opened, the Department will deal only with the appointed
        personal representative. Proof of authority is letters testamentary or
        letters of administration from the probate court of the county where the
        decedent lived.
      </p>

      <h2>What the Department will want to see</h2>
      <div className="scroll-x">
        <table className="fact-table">
          <thead><tr><th>Route</th><th>Documents</th></tr></thead>
          <tbody>
            <tr><td>Heir affidavit (≤ $7,500)</td><td>Death certificate, sworn affidavit signed by every heir, identification for each signer, evidence of the relationship, attestation that no probate was opened</td></tr>
            <tr><td>Administered estate</td><td>Death certificate, letters testamentary or of administration, identification for the personal representative</td></tr>
          </tbody>
        </table>
      </div>

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
        <Link href="/claim-it-yourself"><strong>If the owner is living and the claim is simple, file it yourself →</strong></Link>
      </p>
      <p className="source-line">
        Last verified 22 August 2026 against O.C.G.A. § 44-12-220 as amended by SB 403,
        effective 1 July 2026. This is general information about Georgia’s procedure,
        not legal advice about your situation.
      </p>
    </div>
  )
}

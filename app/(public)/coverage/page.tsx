import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { CoverageMap, FeeCapTable } from '@/components/public/CoverageMap'
import { getSeedMeta } from '@/lib/compliance/stateRules'

const page = PUBLIC_PAGES.find((p) => p.href === '/coverage')!
export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  {
    question: 'Which states does Reclaimed operate in?',
    answer: 'None yet. Georgia is the only jurisdiction whose rules we have verified, and we are not registered there. Twenty-three more states are researched but not verified for use, and twenty-seven have not been researched at all.',
  },
  {
    question: 'Why does the map show so little coverage?',
    answer: 'Because a recovery firm operating under a fee cap it has not read is how an over-cap agreement gets signed. Published aggregator tables of finder fees were spot-checked and found materially wrong on six states, so we treat an unverified state as blocked rather than as a default.',
  },
  {
    question: 'What is the maximum a finder can charge in my state?',
    answer: 'It varies from 10% to 30%, and five states we have looked at have no statutory percentage cap at all. No cap is not the same as a zero cap, and the table below never renders one as the other.',
  },
]

export default function CoveragePage() {
  const meta = getSeedMeta()

  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page }), faqLd(FAQS)]} />

      <h1>Where we work, and why it is almost nowhere</h1>
      <p className="lede">
        Reclaimed operates only where we have read that state’s rules against primary
        sources. One jurisdiction of fifty-one meets that bar today. This map is the
        honest version of a coverage map: mostly empty.
      </p>

      <h2>Jurisdiction status</h2>
      <CoverageMap />

      <h2>Why an unresearched state is blocked rather than assumed</h2>
      <p>
        Every state caps what a representative may charge, and the caps differ by a
        factor of three. Getting one wrong does not produce a slightly wrong invoice;
        it produces an agreement that exceeds a statutory cap, which in Georgia is
        both unenforceable and independently sanctionable.
      </p>
      <p>
        The rules in this system are data rather than code, and any workflow touching
        a state whose status is not <code>verified</code> throws rather than falling
        back to a default. That is a deliberate choice to fail loudly.
      </p>
      {typeof meta.warning === 'string' && (
        <div className="notice notice--held">
          <p style={{ margin: 0 }}>{meta.warning}</p>
        </div>
      )}

      <h2>Statutory fee ceilings, where we have checked</h2>
      <p>
        For the states we have actually read. A blank cap column would read as zero,
        so states with <em>no</em> statutory percentage limit are named as such.
      </p>
      <FeeCapTable />

      <h2>Georgia, and California</h2>
      <p>
        Georgia is the build target and the only verified jurisdiction. We are{' '}
        <Link href="/registration-status">not registered there yet</Link>, so the
        verified rules are not currently in use for anyone.
      </p>
      <p>
        California appears in our systems for a different reason: its Controller
        publishes the state’s unclaimed property file openly and says in terms that it
        does so for recovery firms to conduct outreach. We use it to exercise the data
        pipeline at real scale. California’s rules are <em>not</em> verified, and no
        California record is treated as workable.
      </p>

      <p className="source-line">
        Rules researched {String(meta.researchedAt ?? 'see seed')}; recheck cadence{' '}
        {String(meta.recheckCadence ?? 'documented in the rules seed')}.
      </p>
    </div>
  )
}

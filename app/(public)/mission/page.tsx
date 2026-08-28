import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PAGES } from '@/lib/public/pages'
import { JsonLd } from '@/components/public/JsonLd'
import { webPageLd, faqLd } from '@/lib/public/structuredData'
import { SelfFileCallout } from '@/components/public/SelfFileCallout'
import { StatGrid } from '@/components/public/StatGrid'
import { ClaimSpread } from '@/components/public/FeeBar'
import { MARKET_STATS, INDEX_STATS, CLAIMS_FILED, INDEX_SNAPSHOT } from '@/lib/public/marketStats'
import { SITE_MISSION, SITE_MISSION_LONG } from '@/lib/public/site'

const page = PUBLIC_PAGES.find((p) => p.href === '/mission')!
export const metadata: Metadata = { title: page.title, description: page.description }

const FAQS = [
  {
    question: 'How much unclaimed property is there?',
    answer: 'State administrators hold roughly $70 billion, and the administrators’ own estimate is that about one in seven Americans has some. Georgia alone holds around $3.3 billion.',
  },
  {
    question: 'If most claims should be filed directly, what does Reclaimed do?',
    answer: 'We work on the claims where proving who may legally sign is the obstacle: the owner has died, the company dissolved, several people are named on one record. Discovery is free and public; entitlement is the hard part.',
  },
  {
    question: 'How many claims has Reclaimed filed?',
    answer: 'None. Registration has not issued, so nothing has been transmitted to any department and the system blocks transmission at runtime.',
  },
]

export default function MissionPage() {
  return (
    <div className="prose">
      <JsonLd data={[webPageLd({ page }), faqLd(FAQS)]} />

      <h1>{SITE_MISSION}</h1>
      <p className="lede">{SITE_MISSION_LONG}</p>

      <h2>The size of the problem</h2>
      <StatGrid stats={MARKET_STATS} />

      <h2>The two numbers that set our strategy</h2>

      <ClaimSpread medianUsd={144.30} meanUsd={1780} feePct={30} />

      <p>
        The median claim paid across all state programmes is <strong>$144.30</strong>.
        The average is <strong>$1,780</strong>. A gap that wide between the middle and
        the mean means the distribution has a long tail, and it tells you two things
        at once.
      </p>
      <p>
        First, most claims are small. Charging a percentage of $144 to fill in a form
        is not a business worth building, and anyone doing it is selling you something
        you could have had for nothing in five minutes.
      </p>
      <p>
        Second, the money that stays unclaimed for years is concentrated in the tail —
        and it stays there for a specific reason. Not because nobody found it, but
        because nobody could prove who was entitled to sign for it. That is the part
        we build for.
      </p>

      <SelfFileCallout heading="Which is why the first thing this site tells you is how to do it without us" />

      <h2>What we have actually built</h2>
      <p>
        Deliberately unimpressive numbers, deliberately not rounded up. These count
        records we have indexed from {INDEX_SNAPSHOT.sourceLabel} — a file that state
        publishes openly and invites recovery firms to use. They are not claims, and
        they are not Georgia.
      </p>
      <StatGrid stats={INDEX_STATS} />

      <div className="notice notice--stop">
        <p style={{ margin: 0 }}>
          <strong>Claims filed: {CLAIMS_FILED}.</strong> Reclaimed is not registered in
          Georgia, is not accepting clients, and has never transmitted a claim to any
          department. The system refuses to transmit one until registration issues.
          See <Link href="/registration-status">our registration status</Link>.
        </p>
      </div>

      <h2>What we will not do to get there</h2>
      <ul>
        <li>
          Publish a name-search tool. O.C.G.A. § 44-12-239.1(b) forbids redistributing
          the Department’s file, and the State already has one.
        </li>
        <li>
          Take a fee in advance. § 44-12-239.2(a)(12) forbids it and no code path in
          this product can construct a charge.
        </li>
        <li>
          Solicit anyone before we are registered. That is § 44-12-239.2(a)(10), and
          it is why this site has no contact form.
        </li>
        <li>
          Approach an owner whose property somebody else is already claiming. We
          exclude those records rather than compete over them —{' '}
          {INDEX_SNAPSHOT.alreadyBeingClaimed.toLocaleString('en-US')} of them so far.
        </li>
      </ul>

      <p className="source-line">
        Figures as cited above. Claims filed is read from the operating mode, not
        written by hand.
      </p>
    </div>
  )
}

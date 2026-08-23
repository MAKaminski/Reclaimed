/**
 * Public statistics, and the sources that substantiate them.
 *
 * ADR-0010's operative rule is that every factual claim on this site is
 * substantiable from an in-repo primary source — not because it is tidy, but
 * because Georgia's FBPA carries a private right of action with treble damages
 * and § 44-12-239.2(a)(5) reaches a false statement at $2,000 per act. A number
 * on a marketing page is a factual claim like any other.
 *
 * So the type makes provenance non-optional. There is no way to add a figure
 * here without saying where it came from, when it was true, and whether the
 * source was the body that produced it or somebody repeating them.
 *
 * NOTHING HERE TOUCHES THE DATABASE. The public tree cannot import `@/lib/db`
 * (verify:templates), and the counts we publish about our own index come from a
 * committed snapshot written by a workstation script, never a live read. That is
 * not merely to satisfy a gate: an aggregate over the Georgia file is arguably
 * "distributing such information" under § 44-12-239.1(b), and the honest answer
 * is that nobody knows. So the snapshot is scoped to California's file, which
 * California publishes openly and invites locators to use.
 */

import indexSnapshot from '@/data/seed/index-snapshot.json'

/**
 * PRIMARY means the body that produced the number said it, in a document we
 * fetched. SECONDARY means somebody credible reported it and we could not find
 * it stated by the source itself. The distinction is rendered, not just stored —
 * a secondary figure carries its caveat on the page.
 */
export type SourceQuality = 'primary' | 'secondary'

export interface Stat {
  /** Short label. Sentence case, no trailing colon. */
  readonly label: string
  /** Pre-formatted for display. Numbers here are prose, not arithmetic. */
  readonly value: string
  /** One line of context. What the number actually counts. */
  readonly detail: string
  /** Who said it. */
  readonly source: string
  readonly sourceUrl: string
  /** ISO date or YYYY-MM. When the figure was true, not when we read it. */
  readonly asOf: string
  readonly quality: SourceQuality
}

/**
 * The scale of the problem, from the administrators themselves.
 *
 * The average/median split is the most honest number on this site and it argues
 * against using a representative for most claims: a median claim of $144.30
 * cannot survive a 30% fee and is trivially self-filed in a few minutes. The
 * mean of $1,780 is dragged up by a long tail. That tail is the only part of
 * this market where paid representation is defensible, and saying so plainly is
 * the whole positioning.
 */
export const MARKET_STATS: readonly Stat[] = Object.freeze([
  {
    label: 'Held by the states',
    value: '~$70 billion',
    detail: 'Unclaimed property sitting with state administrators, waiting for its owners.',
    source: 'NAUPA, as widely reported',
    sourceUrl: 'https://unclaimed.org/',
    asOf: '2026-08',
    quality: 'secondary',
  },
  {
    label: 'Americans with unclaimed property',
    value: '1 in 7',
    detail: 'The administrators’ own estimate of how common this is.',
    source: 'National Association of Unclaimed Property Administrators',
    sourceUrl: 'https://unclaimed.org/what-is-unclaimed-property/',
    asOf: '2026-08',
    quality: 'primary',
  },
  {
    label: 'Returned to owners, FY2019',
    value: '$3.14 billion',
    detail: 'Paid out across all state programs in a single fiscal year.',
    source: 'NAUPA inaugural annual report',
    sourceUrl: 'https://unclaimed.org/annual-report-news/',
    asOf: '2019',
    quality: 'primary',
  },
  {
    label: 'Median claim',
    value: '$144.30',
    detail: 'Half of all claims paid are smaller than this. Do not pay anyone a percentage of it.',
    source: 'NAUPA inaugural annual report',
    sourceUrl: 'https://unclaimed.org/annual-report-news/',
    asOf: '2019',
    quality: 'primary',
  },
  {
    label: 'Average claim',
    value: '$1,780',
    detail: 'More than twelve times the median — the gap is a long tail of large, hard claims.',
    source: 'NAUPA inaugural annual report',
    sourceUrl: 'https://unclaimed.org/annual-report-news/',
    asOf: '2019',
    quality: 'primary',
  },
])

/** Georgia specifically. */
export const GEORGIA_STATS: readonly Stat[] = Object.freeze([
  {
    label: 'Held by Georgia',
    value: '~$3.3 billion',
    detail: 'Reported around the signing of SB 403. No primary Department page states a total.',
    source: 'Coverage of the SB 403 signing',
    sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
    asOf: '2026-05',
    quality: 'secondary',
  },
  {
    label: 'Cost to claim it yourself',
    value: '$0',
    detail: 'Georgia runs a free public search and claim portal. It takes about five minutes.',
    source: 'Georgia Department of Revenue',
    sourceUrl: 'https://gaclaims.unclaimedproperty.com',
    asOf: '2026-08',
    quality: 'primary',
  },
  {
    label: 'Statutory fee ceiling',
    value: '30%',
    detail: 'The most a representative may charge, costs included — not added on top.',
    source: 'O.C.G.A. § 44-12-224(d)(1)',
    sourceUrl: 'https://www.legis.ga.gov/legislation/64621',
    asOf: '2024-07-01',
    quality: 'primary',
  },
  {
    label: 'Public registry of representatives',
    value: 'None',
    detail:
      'Georgia requires representatives to register but publishes no list. Verification means telephoning the Department.',
    source: 'Georgia Department of Revenue, CDR program page',
    sourceUrl: 'https://dor.georgia.gov/claimant-designated-representative',
    asOf: '2026-08',
    quality: 'primary',
  },
])

/**
 * What we have actually built, as of the last committed snapshot.
 *
 * Deliberately unimpressive, and deliberately not rounded up. Publishing a
 * number we cannot stand behind on the same page that tells people how to spot
 * a dishonest finder would be self-refuting.
 */
export interface IndexSnapshot {
  readonly capturedAt: string
  readonly sourceKey: string
  readonly sourceLabel: string
  readonly sourceUrl: string
  readonly properties: number
  readonly reportedValueUsd: string
  readonly multiOwner: number
  readonly entityOwned: number
  readonly alreadyBeingClaimed: number
  readonly note: string
}

export const INDEX_SNAPSHOT = indexSnapshot as IndexSnapshot

export const INDEX_STATS: readonly Stat[] = Object.freeze([
  {
    label: 'Records indexed',
    value: INDEX_SNAPSHOT.properties.toLocaleString('en-US'),
    detail: `Loaded from ${INDEX_SNAPSHOT.sourceLabel}, which that state publishes openly.`,
    source: INDEX_SNAPSHOT.sourceLabel,
    sourceUrl: INDEX_SNAPSHOT.sourceUrl,
    asOf: INDEX_SNAPSHOT.capturedAt,
    quality: 'primary',
  },
  {
    label: 'Reported value indexed',
    value: INDEX_SNAPSHOT.reportedValueUsd,
    detail: 'The sum the holders reported, before any fee and before any claim is filed.',
    source: INDEX_SNAPSHOT.sourceLabel,
    sourceUrl: INDEX_SNAPSHOT.sourceUrl,
    asOf: INDEX_SNAPSHOT.capturedAt,
    quality: 'primary',
  },
  {
    label: 'Jointly owned',
    value: INDEX_SNAPSHOT.multiOwner.toLocaleString('en-US'),
    detail: 'Two or more owners on one record. Every one of them has to sign.',
    source: INDEX_SNAPSHOT.sourceLabel,
    sourceUrl: INDEX_SNAPSHOT.sourceUrl,
    asOf: INDEX_SNAPSHOT.capturedAt,
    quality: 'primary',
  },
  {
    label: 'Already being claimed',
    value: INDEX_SNAPSHOT.alreadyBeingClaimed.toLocaleString('en-US'),
    detail: 'Someone has a claim in flight. We exclude these rather than approach the owner.',
    source: INDEX_SNAPSHOT.sourceLabel,
    sourceUrl: INDEX_SNAPSHOT.sourceUrl,
    asOf: INDEX_SNAPSHOT.capturedAt,
    quality: 'primary',
  },
])

/**
 * Claims we have filed. Zero, and it says zero.
 *
 * Registration has not issued, so nothing has ever been transmitted to any
 * department — `assertMayTransmit()` blocks it at runtime. A launch page that
 * implied otherwise would be the exact conduct § 44-12-239.2(a)(5) reaches.
 */
export const CLAIMS_FILED = 0

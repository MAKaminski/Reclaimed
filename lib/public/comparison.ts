/**
 * How Reclaimed compares to the alternatives, including the free one.
 *
 * ── Why this file is shaped so defensively ──────────────────────────────────
 *
 * Naming a competitor and characterising them is the highest-risk copy on this
 * site. Two statutes reach it directly: § 44-12-239.2(a)(5) makes a false or
 * misleading statement sanctionable at $2,000 per act, and Georgia's Fair
 * Business Practices Act carries a private right of action with treble damages
 * that a named firm could bring. ADR-0010 already commits every factual claim on
 * this site to an in-repo primary source; a claim about somebody else needs that
 * more, not less.
 *
 * So the type system enforces three rules, and `scripts/verify-comparison.ts`
 * fails the build if any of them slips:
 *
 *   1. Every claim carries `sourceUrl` and `asOf`. Non-optional, so there is no
 *      way to add an unsourced assertion about a third party.
 *   2. Claims are ATTRIBUTES, never adjectives. "Publishes its fee: no" is an
 *      observation anyone can repeat in ten seconds. "Not transparent" is a
 *      characterisation, and the gate's denylist rejects it.
 *   3. What we record is what a firm's own public page said on a given date —
 *      never an inference about their conduct, their registration, or their
 *      compliance. A firm that does not publish a fee is not doing anything
 *      unlawful, and the pages say so in terms.
 *
 * ── We lose a row, and it stays lost ────────────────────────────────────────
 *
 * Reclaimed is not registered. Reclaim Georgia LLC is, and publishes its number.
 * That row shows them winning and us losing, because it is true and because a
 * comparison page that we always win is not a comparison, it is a claim about
 * ourselves that the reader has no reason to believe. It is also the only
 * version consistent with ADR-0010: this site expressly declines clients, and a
 * page that quietly stopped doing so would undermine the argument that the whole
 * public tree rests on.
 *
 * All observations below were fetched directly from each firm's own site on
 * 2026-08-23. Where a search engine summary disagreed with the primary page, the
 * primary page won — one already did.
 */

/** The rows of every comparison table, in display order. */
export const ATTRIBUTES = [
  'fee',
  'fee_published',
  'registration_published',
  'who_is_paid',
  'not_government_notice',
  'tells_you_it_is_free',
  'focus',
] as const

export type AttributeKey = (typeof ATTRIBUTES)[number]

export const ATTRIBUTE_LABEL: Readonly<Record<AttributeKey, string>> = Object.freeze({
  fee: 'Fee',
  fee_published: 'Fee published before you make contact',
  registration_published: 'Georgia registration number published',
  who_is_paid: 'Who receives the money',
  not_government_notice: 'Says plainly it is not a government agency',
  tells_you_it_is_free: 'Tells you that you can do it yourself for free',
  focus: 'What it is for',
})

/** Why a reader should care about the row. Rendered under each attribute. */
export const ATTRIBUTE_WHY: Readonly<Record<AttributeKey, string>> = Object.freeze({
  fee: 'Georgia caps fees and costs together at 30%. Anything at or under that is lawful.',
  fee_published:
    'Nothing requires a firm to publish its rate. But a rate you cannot see before you call is a rate you will negotiate under pressure.',
  registration_published:
    'Representation has required registration since 1 July 2024, and Georgia publishes no public list — so a firm’s own number, with the Department’s phone number beside it, is the only quick way to check.',
  who_is_paid:
    'The safest arrangement is the Department paying the owner directly. § 44-12-239.2(a)(12) forbids any advance fee regardless.',
  not_government_notice:
    'Impersonating a government agency is the single most common unclaimed-property fraud pattern, and § 44-12-239(g) forbids a business name that suggests one.',
  tells_you_it_is_free:
    'The state search is free and takes about five minutes. A firm that hides this is charging you for something you could have had for nothing.',
  focus: 'Most claims are simple. The question is whether you are in the part that is not.',
})

export interface ComparisonClaim {
  readonly attribute: AttributeKey
  /** What the source says. A fact, not a judgement. */
  readonly value: string
  /** Optional one-line elaboration, still factual. */
  readonly detail?: string
  /** Where we read it. */
  readonly sourceUrl: string
  /** ISO date the observation was made. */
  readonly asOf: string
}

export type AlternativeKind =
  | 'self_service'
  | 'registered_cdr'
  | 'recovery_firm'
  | 'professional'
  | 'us'

export interface Alternative {
  /** URL segment under /compare. */
  readonly slug: string
  readonly name: string
  readonly kind: AlternativeKind
  /** Their own site, or the state portal. Empty for a category, not a company. */
  readonly homepage: string
  /** One neutral sentence. */
  readonly summary: string
  readonly claims: readonly ComparisonClaim[]
}

const OBSERVED = '2026-08-23'

/** Us. Listed first in data, rendered last in tables, and honest about the gap. */
export const RECLAIMED: Alternative = Object.freeze({
  slug: 'reclaimed',
  name: 'Reclaimed',
  kind: 'us',
  homepage: '/',
  summary:
    'Built for the claims where proving who may legally sign is the hard part. Not registered yet, and not accepting clients.',
  claims: ([
    {
      attribute: 'fee',
      value: 'Intends to charge under the 30% cap once registered',
      detail: 'No fee has been charged, because no client has been accepted.',
      sourceUrl: '/fees',
      asOf: OBSERVED,
    },
    {
      attribute: 'fee_published',
      value: 'Yes',
      detail: 'On /fees, with the arithmetic worked through.',
      sourceUrl: '/fees',
      asOf: OBSERVED,
    },
    {
      attribute: 'registration_published',
      value: 'Not registered',
      detail:
        'We are not a registered representative and may not act as one. Our status is published and derived from our own systems rather than written by hand.',
      sourceUrl: '/registration-status',
      asOf: OBSERVED,
    },
    {
      attribute: 'who_is_paid',
      value: 'The Department would pay the owner directly',
      detail: 'Reclaimed never receives, holds, or handles an owner’s money.',
      sourceUrl: '/legal/disclosures',
      asOf: OBSERVED,
    },
    {
      attribute: 'not_government_notice',
      value: 'Yes',
      detail: 'On every page, in the footer, in every offer state.',
      sourceUrl: '/legal/disclosures',
      asOf: OBSERVED,
    },
    {
      attribute: 'tells_you_it_is_free',
      value: 'Yes',
      detail: 'A step-by-step self-filing guide, linked from the front page.',
      sourceUrl: '/claim-it-yourself',
      asOf: OBSERVED,
    },
    {
      attribute: 'focus',
      value: 'Entitlement, not discovery',
      detail:
        'Deceased owners, dissolved companies, joint owners, securities — cases where the paperwork is genuinely hard.',
      sourceUrl: '/complex-claims',
      asOf: OBSERVED,
    },
  ] satisfies readonly ComparisonClaim[]),
})

export const ALTERNATIVES: readonly Alternative[] = Object.freeze([
  {
    slug: 'do-it-yourself',
    name: 'Doing it yourself',
    kind: 'self_service',
    homepage: 'https://gaclaims.unclaimedproperty.com',
    summary:
      'Georgia runs a free public search and claim portal. For most claims this is the right answer and nothing on this site should talk you out of it.',
    claims: ([
      {
        attribute: 'fee',
        value: 'Free',
        detail: 'You keep 100% of whatever the Department pays.',
        sourceUrl: 'https://gaclaims.unclaimedproperty.com',
        asOf: OBSERVED,
      },
      {
        attribute: 'fee_published',
        value: 'Not applicable',
        sourceUrl: 'https://gaclaims.unclaimedproperty.com',
        asOf: OBSERVED,
      },
      {
        attribute: 'registration_published',
        value: 'Not applicable',
        detail: 'You do not need anyone’s permission to claim your own property.',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
      {
        attribute: 'who_is_paid',
        value: 'You, directly',
        sourceUrl: 'https://gaclaims.unclaimedproperty.com',
        asOf: OBSERVED,
      },
      {
        attribute: 'not_government_notice',
        value: 'It is the agency',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
      {
        attribute: 'tells_you_it_is_free',
        value: 'Yes',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
      {
        attribute: 'focus',
        value: 'Everything, and it is enough for most people',
        detail:
          'Where it gets hard is proving entitlement when the owner has died, the company dissolved, or the record names several people.',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
    ] satisfies readonly ComparisonClaim[]),
  },
  {
    slug: 'reclaim-georgia',
    name: 'Reclaim Georgia LLC',
    kind: 'registered_cdr',
    homepage: 'https://reclaimgeorgia.com/',
    summary:
      'A Georgia recovery firm that publishes both its rate and its registration number. On the two rows that are hardest to verify, it is the strongest of the firms surveyed.',
    claims: ([
      {
        attribute: 'fee',
        value: '15%',
        detail: 'Stated as “15% contingency fee — half of Georgia’s 30% legal cap”.',
        sourceUrl: 'https://reclaimgeorgia.com/',
        asOf: OBSERVED,
      },
      {
        attribute: 'fee_published',
        value: 'Yes',
        detail: 'On the front page, as a number.',
        sourceUrl: 'https://reclaimgeorgia.com/',
        asOf: OBSERVED,
      },
      {
        attribute: 'registration_published',
        value: 'Yes — CDR #202400088',
        detail:
          'Published with the Department’s verification number beside it, which is the only practical way to check.',
        sourceUrl: 'https://reclaimgeorgia.com/',
        asOf: OBSERVED,
      },
      {
        attribute: 'who_is_paid',
        value: 'Not stated on the page reviewed',
        sourceUrl: 'https://reclaimgeorgia.com/',
        asOf: OBSERVED,
      },
      {
        attribute: 'not_government_notice',
        value: 'Yes',
        detail:
          'States it is “an independent company” and “not affiliated with the State of Georgia or the Georgia Department of Revenue”.',
        sourceUrl: 'https://reclaimgeorgia.com/',
        asOf: OBSERVED,
      },
      {
        attribute: 'tells_you_it_is_free',
        value: 'Yes',
        detail: 'Links the state’s free portal and describes the self-filing route.',
        sourceUrl: 'https://reclaimgeorgia.com/',
        asOf: OBSERVED,
      },
      {
        attribute: 'focus',
        value: 'Full-service recovery',
        detail: 'Search, forms, filing, and correspondence with the Department.',
        sourceUrl: 'https://reclaimgeorgia.com/',
        asOf: OBSERVED,
      },
    ] satisfies readonly ComparisonClaim[]),
  },
  {
    slug: 'we-seek-you-claim',
    name: 'We Seek You Claim',
    kind: 'recovery_firm',
    homepage: 'https://weseekyouclaim.org/',
    summary:
      'A Georgia recovery firm working on contingency. The page reviewed states no rate and no registration number.',
    claims: ([
      {
        attribute: 'fee',
        value: 'Not stated',
        detail: 'The page says “no upfront fees” but gives no percentage.',
        sourceUrl: 'https://weseekyouclaim.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'fee_published',
        value: 'No',
        sourceUrl: 'https://weseekyouclaim.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'registration_published',
        value: 'No number published',
        detail:
          'The page describes its team as “licensed Claimant Designated Representatives” without giving a number to check.',
        sourceUrl: 'https://weseekyouclaim.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'who_is_paid',
        value: 'Funds described as arriving by cheque or direct deposit',
        sourceUrl: 'https://weseekyouclaim.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'not_government_notice',
        value: 'Yes',
        detail:
          'States it “is not a government agency. We are a private claims recovery service.”',
        sourceUrl: 'https://weseekyouclaim.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'tells_you_it_is_free',
        value: 'Not on the page reviewed',
        sourceUrl: 'https://weseekyouclaim.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'focus',
        value: 'Full-service recovery',
        sourceUrl: 'https://weseekyouclaim.org/',
        asOf: OBSERVED,
      },
    ] satisfies readonly ComparisonClaim[]),
  },
  {
    slug: 'ga-unclaimed-property-locators',
    name: 'Georgia Unclaimed Property Locators',
    kind: 'recovery_firm',
    homepage: 'https://gaunclaimedpropertylocators.com/',
    summary:
      'A Georgia locator working on a no-result-no-fee basis, with payment issued by the state to the claimant.',
    claims: ([
      {
        attribute: 'fee',
        value: 'Not stated',
        detail: 'Described only as “No results, no fee.”',
        sourceUrl: 'https://gaunclaimedpropertylocators.com/about',
        asOf: OBSERVED,
      },
      {
        attribute: 'fee_published',
        value: 'No',
        sourceUrl: 'https://gaunclaimedpropertylocators.com/about',
        asOf: OBSERVED,
      },
      {
        attribute: 'registration_published',
        value: 'No number published',
        sourceUrl: 'https://gaunclaimedpropertylocators.com/about',
        asOf: OBSERVED,
      },
      {
        attribute: 'who_is_paid',
        value: 'The claimant, directly',
        detail: 'States cheques are issued to the claimant rather than to the firm.',
        sourceUrl: 'https://gaunclaimedpropertylocators.com/about',
        asOf: OBSERVED,
      },
      {
        attribute: 'not_government_notice',
        value: 'Not on the page reviewed',
        sourceUrl: 'https://gaunclaimedpropertylocators.com/about',
        asOf: OBSERVED,
      },
      {
        attribute: 'tells_you_it_is_free',
        value: 'Not on the page reviewed',
        sourceUrl: 'https://gaunclaimedpropertylocators.com/about',
        asOf: OBSERVED,
      },
      {
        attribute: 'focus',
        value: 'Locating and recovering',
        sourceUrl: 'https://gaunclaimedpropertylocators.com/about',
        asOf: OBSERVED,
      },
    ] satisfies readonly ComparisonClaim[]),
  },
  {
    slug: 'asset-recovery-bureau',
    name: 'Asset Recovery Bureau',
    kind: 'recovery_firm',
    homepage: 'https://assetrecoverybureau.org/',
    summary:
      'A recovery firm serving Georgia. The page reviewed states no rate, no registration number, and no notice that it is not a government agency.',
    claims: ([
      {
        attribute: 'fee',
        value: 'Not stated',
        detail:
          'Described as “a small percentage of the claim paid directly by them”, without a figure.',
        sourceUrl: 'https://assetrecoverybureau.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'fee_published',
        value: 'No',
        sourceUrl: 'https://assetrecoverybureau.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'registration_published',
        value: 'No number published',
        sourceUrl: 'https://assetrecoverybureau.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'who_is_paid',
        value: 'The state pays the claimant, then pays the firm',
        detail: 'States “the state will send your payment directly to you”.',
        sourceUrl: 'https://assetrecoverybureau.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'not_government_notice',
        value: 'Not on the page reviewed',
        detail:
          'Worth knowing because § 44-12-239(g) restricts business names that suggest a government agency. Whether any particular name does is for the Department to say, not us.',
        sourceUrl: 'https://assetrecoverybureau.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'tells_you_it_is_free',
        value: 'Not on the page reviewed',
        sourceUrl: 'https://assetrecoverybureau.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'focus',
        value: 'Full-service recovery',
        sourceUrl: 'https://assetrecoverybureau.org/',
        asOf: OBSERVED,
      },
    ] satisfies readonly ComparisonClaim[]),
  },
  {
    slug: 'probate-attorneys',
    name: 'A probate or estate attorney',
    kind: 'professional',
    homepage: '',
    summary:
      'Not a competitor so much as the right answer above a certain size. If the estate needs administering anyway, the claim is a small part of a job you are already doing.',
    claims: ([
      {
        attribute: 'fee',
        value: 'Hourly or a share of the estate',
        detail: 'Not capped by § 44-12-224, because it is not representation on the claim.',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
      {
        attribute: 'fee_published',
        value: 'Varies',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
      {
        attribute: 'registration_published',
        value: 'Bar admission, publicly searchable',
        sourceUrl: 'https://www.gabar.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'who_is_paid',
        value: 'The estate',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
      {
        attribute: 'not_government_notice',
        value: 'Not applicable',
        sourceUrl: 'https://www.gabar.org/',
        asOf: OBSERVED,
      },
      {
        attribute: 'tells_you_it_is_free',
        value: 'Varies',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
      {
        attribute: 'focus',
        value: 'Estates that need administering regardless',
        detail:
          'Above Georgia’s $7,500 heir-affidavit ceiling, or where the heirs disagree, this is the route.',
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
        asOf: OBSERVED,
      },
    ] satisfies readonly ComparisonClaim[]),
  },
])

export function getAlternative(slug: string): Alternative | null {
  return ALTERNATIVES.find((a) => a.slug === slug) ?? null
}

export function claimFor(alt: Alternative, attribute: AttributeKey): ComparisonClaim | null {
  return alt.claims.find((c) => c.attribute === attribute) ?? null
}

/**
 * The one-line honest summary of the whole exercise, rendered on the hub and in
 * llms.txt. If a model paraphrases these pages, this is the sentence to carry.
 */
export const COMPARISON_BOTTOM_LINE =
  'For most claims the right answer is to file it yourself, free, in about five minutes. ' +
  'Paid representation is worth considering only when proving who may legally sign is the hard part.'

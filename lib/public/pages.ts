/**
 * THE PUBLIC REGISTRY — the single source of truth for what is reachable
 * without a session.
 *
 * Four consumers derive from this one list: `app/sitemap.ts`, `app/llms.txt`,
 * `app/robots.ts`, and the allowlist in `proxy.ts`. That is deliberate. It
 * means adding a public page is ONE edit, and — more importantly — forgetting
 * to register a page makes it UNREACHABLE (the proxy redirects it to /signin)
 * rather than silently indexable.
 *
 * Fail-closed, the same way every other gate in this codebase is.
 * `scripts/verify-public-surface.ts` asserts registry ↔ filesystem is
 * bijective, so an orphan page breaks the build.
 */

export interface PublicPage {
  /** Pathname, always leading-slash, never trailing. `/` is the home page. */
  href: string
  /** <title>. The `%s · Reclaimed` template is applied by the layout. */
  title: string
  /** <meta name="description">. Keep ≤ 155 chars; lead with the direct answer. */
  description: string
  /** One line for llms.txt and the site nav. */
  summary: string
  /** Short label for the header. Derived nav labels from <title> read terribly. */
  navLabel: string
  /** Shown in the public header. Ordering follows this array. */
  inNav: boolean
  /** Grouping for llms.txt AND the footer columns. A new value here must also
   *  get a block in `app/llms.txt/route.ts` — sections are rendered from a
   *  hardcoded template there, so an unlisted section type-checks and then
   *  silently never appears to a crawler. */
  section: 'core' | 'compare' | 'complex' | 'status' | 'company' | 'legal'
  /** Hand-maintained. `new Date()` would churn every build and teach crawlers
   *  that our dates mean nothing. */
  lastModified: string
}

export const PUBLIC_PAGES: readonly PublicPage[] = Object.freeze([
  {
    href: '/',
    navLabel: 'Home',
    title: 'Reclaimed — Georgia unclaimed property claims that are not simple',
    description:
      'Georgia holds unclaimed property for its owners. Most people should claim it themselves, free. Here is how — and when a claim is genuinely complicated.',
    summary:
      'What a claimant’s designated representative is, what Reclaimed does, and why most people do not need one.',
    inNav: false,
    section: 'core',
    lastModified: '2026-08-22',
  },
  {
    href: '/claim-it-yourself',
    navLabel: 'Claim it yourself',
    title: 'How to claim Georgia unclaimed property yourself, for free',
    description:
      'Step-by-step instructions for claiming Georgia unclaimed property directly from the Department of Revenue, at no cost, without a representative.',
    summary:
      'Step-by-step self-filing with the Georgia Department of Revenue. No representative required, no fee.',
    inNav: true,
    section: 'core',
    lastModified: '2026-08-22',
  },
  {
    href: '/is-this-letter-real',
    navLabel: 'Is this letter real?',
    title: 'How to tell whether a Georgia unclaimed property letter is legitimate',
    description:
      'Georgia law requires a specific notice on every lawful unclaimed property solicitation. Here is what it must say, and what an unlawful letter looks like.',
    summary:
      'How to tell a lawful Georgia unclaimed property solicitation from a fraudulent one, and how to verify a representative.',
    inNav: true,
    section: 'core',
    lastModified: '2026-08-22',
  },
  {
    href: '/fees',
    navLabel: 'Fees',
    title: 'What a Georgia unclaimed property finder may charge',
    description:
      'Georgia caps a representative’s fees and costs at 30% of the lesser of the amount claimed or the property value. Costs count inside the cap, not on top.',
    summary:
      'The statutory 30% cap under O.C.G.A. § 44-12-224(d)(1), with worked arithmetic, and the advance-fee ban.',
    inNav: true,
    section: 'core',
    lastModified: '2026-08-22',
  },
  {
    href: '/how-it-works',
    navLabel: 'How it works',
    title: 'What actually happens on a Georgia unclaimed property claim',
    description:
      'Georgia decides an unclaimed property claim within 90 days and pays within 60 days of approval. Here is each step, who signs what, and the notary reality.',
    summary:
      'The claim process end to end — the forms, the notary requirement, the 90-day and 60-day statutory clocks.',
    inNav: true,
    section: 'core',
    lastModified: '2026-08-22',
  },
  {
    href: '/georgia-cdr-rules',
    navLabel: 'Georgia’s rules',
    title: 'Georgia’s rules for unclaimed property representatives, in plain English',
    description:
      'O.C.G.A. § 44-12-239 governs who may file an unclaimed property claim for someone else in Georgia. Registration, fee caps, forms, and prohibited acts.',
    summary:
      'Georgia’s CDR statute in plain English — registration, the fee cap, the four mandated DOR forms, prohibited acts, penalties.',
    inNav: true,
    section: 'core',
    lastModified: '2026-08-22',
  },
  {
    href: '/complex-claims',
    navLabel: 'Complex claims',
    title: 'When a Georgia unclaimed property claim is not straightforward',
    description:
      'Most Georgia unclaimed property claims are simple paperwork. These are the situations where proving who may legally sign is genuinely hard.',
    summary:
      'The situations where entitlement is hard to prove: deceased owners, dissolved businesses, multiple owners, securities.',
    inNav: true,
    section: 'complex',
    lastModified: '2026-08-22',
  },
  {
    href: '/complex-claims/deceased-owner',
    navLabel: 'Deceased owner',
    title: 'Claiming unclaimed property for a deceased relative in Georgia',
    description:
      'Georgia allows heirs to claim up to $7,500 of a deceased owner’s unclaimed property by affidavit, without probate — if every heir signs. Effective July 1, 2026.',
    summary:
      'The heir affidavit path under O.C.G.A. § 44-12-220(i), effective July 1, 2026, capped at $7,500 aggregate, and when probate is required instead.',
    inNav: false,
    section: 'complex',
    lastModified: '2026-08-22',
  },
  {
    href: '/registration-status',
    navLabel: 'Our status',
    title: 'Is Reclaimed registered in Georgia?',
    description:
      'Reclaimed’s current registration status as a claimant’s designated representative with the Georgia Department of Revenue, derived from our own systems.',
    summary: 'Our current Georgia registration status. Derived from the system, not written by hand.',
    inNav: true,
    section: 'status',
    lastModified: '2026-08-22',
  },
  {
    href: '/about',
    navLabel: 'About',
    title: 'About Reclaimed',
    description:
      'Reclaimed helps people recover Georgia unclaimed property in the cases where proving legal entitlement is genuinely difficult. Who we are and where to find us.',
    summary: 'Who Reclaimed is, where we are, and what we intend to do once registered.',
    inNav: false,
    section: 'status',
    lastModified: '2026-08-22',
  },
  {
    href: '/mission',
    navLabel: 'Mission',
    title: 'Every dollar of unclaimed property returned to its owner',
    description:
      'One in seven Americans has unclaimed property. Most of it can be claimed free in five minutes. Reclaimed works on the part that cannot.',
    summary:
      'Why Reclaimed exists, what the numbers actually say, and why we send most people to the free route.',
    inNav: true,
    section: 'company',
    lastModified: '2026-08-23',
  },
  {
    href: '/compare',
    navLabel: 'Compare',
    title: 'Georgia unclaimed property recovery services compared',
    description:
      'Every route to recovering Georgia unclaimed property, side by side: doing it yourself free, four named recovery firms, and a probate attorney.',
    summary:
      'Fees, published registration numbers, and who gets paid — for the free state route and for named Georgia recovery firms.',
    inNav: true,
    section: 'compare',
    lastModified: '2026-08-23',
  },
  {
    href: '/compare/do-it-yourself',
    navLabel: 'vs doing it yourself',
    title: 'Reclaimed vs claiming Georgia unclaimed property yourself',
    description:
      'Georgia’s own portal is free and takes about five minutes. Here is exactly when paying a representative any percentage is not worth it.',
    summary: 'The free route, and the honest case for using it instead of us.',
    inNav: false,
    section: 'compare',
    lastModified: '2026-08-23',
  },
  {
    href: '/compare/reclaim-georgia',
    navLabel: 'vs Reclaim Georgia',
    title: 'Reclaimed vs Reclaim Georgia LLC',
    description:
      'Reclaim Georgia LLC publishes a 15% fee and its Georgia registration number. A side-by-side of what each firm states publicly.',
    summary: 'A registered Georgia representative that publishes both its rate and its CDR number.',
    inNav: false,
    section: 'compare',
    lastModified: '2026-08-23',
  },
  {
    href: '/compare/we-seek-you-claim',
    navLabel: 'vs We Seek You Claim',
    title: 'Reclaimed vs We Seek You Claim',
    description:
      'What We Seek You Claim states publicly about its fee, its registration, and who receives the money — and what it does not state.',
    summary: 'A Georgia recovery firm working on contingency without a published rate.',
    inNav: false,
    section: 'compare',
    lastModified: '2026-08-23',
  },
  {
    href: '/compare/ga-unclaimed-property-locators',
    navLabel: 'vs GA Locators',
    title: 'Reclaimed vs Georgia Unclaimed Property Locators',
    description:
      'Georgia Unclaimed Property Locators works no-result-no-fee and has the state pay the claimant directly. What its page states, and what it omits.',
    summary: 'A Georgia locator whose page states no rate but confirms the state pays the claimant.',
    inNav: false,
    section: 'compare',
    lastModified: '2026-08-23',
  },
  {
    href: '/compare/asset-recovery-bureau',
    navLabel: 'vs Asset Recovery Bureau',
    title: 'Reclaimed vs Asset Recovery Bureau',
    description:
      'What Asset Recovery Bureau states publicly about its fee and registration, and why Georgia restricts business names that suggest a government agency.',
    summary: 'A recovery firm serving Georgia, and what its public page does and does not say.',
    inNav: false,
    section: 'compare',
    lastModified: '2026-08-23',
  },
  {
    href: '/compare/probate-attorneys',
    navLabel: 'vs a probate attorney',
    title: 'Reclaimed vs a probate or estate attorney',
    description:
      'Above Georgia’s $7,500 heir affidavit ceiling, or where heirs disagree, an attorney is the right answer and a representative is not.',
    summary: 'When the estate needs administering anyway, the claim is a small part of a bigger job.',
    inNav: false,
    section: 'compare',
    lastModified: '2026-08-23',
  },
  {
    href: '/coverage',
    navLabel: 'Where we work',
    title: 'Which states Reclaimed operates in, and why only one',
    description:
      'Reclaimed operates only where we have verified that state’s rules. One of fifty-one jurisdictions is verified. Here is the map and the reasoning.',
    summary:
      'A jurisdiction map: one state verified, twenty-three researched but not built, twenty-seven not researched.',
    inNav: true,
    section: 'company',
    lastModified: '2026-08-23',
  },
  {
    href: '/engineering',
    navLabel: 'Engineering',
    title: 'Compliance as code: how Reclaimed is built',
    description:
      'A regtech startup where the statute is enforced by database constraints, CI gates and type signatures rather than by policy documents and hope.',
    summary:
      'The four enforcement layers, derived state with no override, and why an unfetchable URL is untypeable.',
    inNav: false,
    section: 'company',
    lastModified: '2026-08-23',
  },
  {
    href: '/legal/disclosures',
    navLabel: 'Disclosures',
    title: 'Disclosures',
    description:
      'Reclaimed’s full disclosures: registration status, the statutory fee cap, the advance-fee prohibition, and your right to claim directly from Georgia for free.',
    summary: 'Every disclosure in one place, in canonical form.',
    inNav: false,
    section: 'legal',
    lastModified: '2026-08-22',
  },
  {
    href: '/legal/privacy',
    navLabel: 'Privacy',
    title: 'Privacy',
    description:
      'What Reclaimed collects from visitors to this website, which is very little, and what it does not do with unclaimed property data.',
    summary: 'What this website collects, and what it does not.',
    inNav: false,
    section: 'legal',
    lastModified: '2026-08-22',
  },
])

/** Static assets that must also bypass the session redirect. */
export const PUBLIC_ASSETS: readonly string[] = Object.freeze([
  '/robots.txt', '/sitemap.xml', '/llms.txt', '/opengraph-image',
  // `/apple-icon` has NO file extension, so proxy.ts's matcher — which excludes
  // `favicon.ico` and anything ending in an image suffix — does not skip it. The
  // proxy therefore ran and redirected the touch icon to /signin. `/icon.svg`
  // was fine for the opposite reason: it ends in `.svg`.
  '/apple-icon',
])

export function publicPathnames(): string[] {
  return [...PUBLIC_PAGES.map((p) => p.href), ...PUBLIC_ASSETS]
}

export function navPages(): PublicPage[] {
  return PUBLIC_PAGES.filter((p) => p.inNav)
}

export function pagesInSection(section: PublicPage['section']): PublicPage[] {
  return PUBLIC_PAGES.filter((p) => p.section === section)
}

/** Top-level prefixes that are NOT public. `robots.ts` disallows these. */
export const PRIVATE_PREFIXES: readonly string[] = Object.freeze([
  '/dashboard', '/queue', '/staff', '/workflow', '/property', '/holdings',
  '/signin', '/auth', '/api',
])

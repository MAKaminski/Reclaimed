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
  /** Grouping for llms.txt. */
  section: 'core' | 'complex' | 'status' | 'legal'
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
  '/dashboard', '/queue', '/staff', '/workflow', '/property', '/signin', '/auth', '/api',
])

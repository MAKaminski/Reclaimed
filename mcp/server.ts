/**
 * MCP server for the Reclaimed public surface.
 *
 *   pnpm mcp
 *
 * Lets an agent navigate the site and answer questions about Georgia's unclaimed
 * property regime: the pages, the statutory fee arithmetic, which jurisdictions
 * we can act in, how we compare to named alternatives, and our live registration
 * status.
 *
 * ── The one thing this server cannot do ─────────────────────────────────────
 *
 * It cannot reach property data, in any configuration, because it holds no
 * database credential and imports nothing from `@/lib/db`. That is not a policy
 * applied to it — it is the absence of a capability.
 *
 * The reason matters more than the mechanism. § 44-12-239.1(b) permits a
 * representative to receive the Department's file only "for the purpose of
 * soliciting owners of unclaimed property to offer claim services." An MCP tool
 * answering "what unclaimed property exists for this name" would be a lookup
 * service built on that file, which is the exact use the statute forecloses —
 * and `/about` carries a standing public promise that we will not build one.
 *
 * So there is no `search_property` tool, no `lookup_owner`, and no way to add one
 * without also adding a database dependency this file does not have.
 *
 * Everything below reads from the same in-repo sources the website renders from,
 * so a model citing this server and a person reading the site cannot diverge.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { PUBLIC_PAGES, pagesInSection } from '@/lib/public/pages'
import { SITE_MISSION, SITE_MISSION_LONG, SITE_NAME, absoluteUrl, DOR_CLAIM_PORTAL } from '@/lib/public/site'
import { getOfferState } from '@/lib/compliance/offerState'
import { readRegistrationState } from '@/lib/compliance/registration'
import { getStateRules, listAllJurisdictions, peekStateRules } from '@/lib/compliance/stateRules'
import { computeFee } from '@/lib/compliance/computeFee'
import { dollarsToCents, formatUsd } from '@/lib/compliance/money'
import { ALTERNATIVES, RECLAIMED, ATTRIBUTE_LABEL, COMPARISON_BOTTOM_LINE } from '@/lib/public/comparison'
import { MARKET_STATS, GEORGIA_STATS, INDEX_STATS, CLAIMS_FILED } from '@/lib/public/marketStats'
import { capabilityStatus } from '@/lib/api/contract'

/**
 * Georgia's statutory ceiling, read from the rules seed rather than typed.
 *
 * `getStateRules` throws on any state that is not verified, which is exactly what
 * we want here: if GA ever loses its verified status this tool stops answering
 * rather than quoting a cap nobody checked.
 */
const GA_FEE_CAP_PCT = getStateRules('GA').feeCapPct ?? 30

const server = new McpServer({ name: 'reclaimed', version: '1.0.0' })

function text(value: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    }],
  }
}

/* ── Navigation ─────────────────────────────────────────────────────────── */

server.registerTool(
  'list_pages',
  {
    title: 'List public pages',
    description:
      'Every page on the Reclaimed public site, with its URL, title, one-line summary ' +
      'and section. Start here to find out what can be read.',
    inputSchema: {
      section: z.enum(['core', 'compare', 'complex', 'status', 'company', 'legal']).optional()
        .describe('Narrow to one section. Omit for all pages.'),
    },
  },
  async ({ section }) => {
    const pages = section === undefined ? [...PUBLIC_PAGES] : pagesInSection(section)
    return text(pages.map((p) => ({
      url: absoluteUrl(p.href),
      path: p.href,
      title: p.title,
      summary: p.summary,
      section: p.section,
    })))
  },
)

server.registerTool(
  'read_page',
  {
    title: 'Read a public page',
    description:
      'Fetch a page from the live public site and return its readable text. Accepts a ' +
      'path such as /fees. Only paths in the public registry are permitted.',
    inputSchema: {
      path: z.string().describe('Path beginning with /, e.g. /fees or /compare/reclaim-georgia'),
    },
  },
  async ({ path }) => {
    // Allowlist rather than fetch-whatever-you-are-given. An MCP tool that will
    // GET an arbitrary path is an SSRF primitive pointed at our own origin, and
    // the staff tree lives on that origin.
    const page = PUBLIC_PAGES.find((p) => p.href === path)
    if (page === undefined) {
      return text(
        `"${path}" is not a public page. Call list_pages for what exists. ` +
        'Staff routes are not readable through this server, by design.',
      )
    }

    const response = await fetch(absoluteUrl(page.href), {
      headers: { accept: 'text/html' },
    })
    if (!response.ok) return text(`Fetch failed: HTTP ${response.status}`)

    const html = await response.text()
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;|&rsquo;/g, '’')
      .replace(/\s+/g, ' ')
      .trim()

    return text(`# ${page.title}\n${absoluteUrl(page.href)}\n\n${body}`)
  },
)

/* ── The statute, as arithmetic ─────────────────────────────────────────── */

server.registerTool(
  'compute_fee',
  {
    title: 'Compute the statutory fee cap',
    description:
      'Georgia caps a representative’s fees AND costs together at 30% of the LESSER of ' +
      'the amount claimed or the property value — O.C.G.A. § 44-12-224(d)(1). Costs count ' +
      'inside the ceiling, not on top of it, which is the part people get wrong. Returns ' +
      'the binding basis and whether the cap clamped the fee.',
    inputSchema: {
      claimedUsd: z.number().positive().describe('Amount being claimed, in dollars'),
      propertyValueUsd: z.number().positive().describe('Value of the property, in dollars'),
      costsUsd: z.number().nonnegative().default(0)
        .describe('Costs the representative will incur. These count INSIDE the cap.'),
      feePct: z.number().positive().max(100).default(30)
        .describe('Fee percentage intended. Anything above the cap is clamped.'),
    },
  },
  async ({ claimedUsd, propertyValueUsd, costsUsd, feePct }) => {
    const result = computeFee({
      claimedAmount: dollarsToCents(claimedUsd),
      propertyValue: dollarsToCents(propertyValueUsd),
      costs: dollarsToCents(costsUsd),
      requestedFeePct: feePct,
      feeCapPct: GA_FEE_CAP_PCT,
    })
    return text({
      effectiveTakePct: result.feePct,
      totalTakeIncludingCosts: formatUsd(result.feeDollars),
      feeExcludingCosts: formatUsd(result.feeExcludingCosts),
      costsRecovered: formatUsd(result.costs),
      netToClaimant: formatUsd(result.netToClaimant),
      capBasis: formatUsd(result.capBasis),
      capCeiling: formatUsd(result.capCeiling),
      capBinding: result.capBinding,
      note:
        'Costs are included in the fee before the cap is tested. No fee may be charged ' +
        'in advance of a claim being approved — § 44-12-239.2(a)(12).',
      citation: 'O.C.G.A. § 44-12-224(d)(1)',
    })
  },
)

/* ── Where we can act ───────────────────────────────────────────────────── */

server.registerTool(
  'state_coverage',
  {
    title: 'Jurisdiction coverage and fee caps',
    description:
      'All 51 US jurisdictions with our rules status and the statutory finder-fee ceiling ' +
      'where known. A null cap means that state has NO percentage ceiling — it does not ' +
      'mean zero. Only states marked verified may be acted in.',
    inputSchema: {
      code: z.string().length(2).optional().describe('Two-letter state code for detail on one state'),
    },
  },
  async ({ code }) => {
    if (code !== undefined) {
      const upper = code.toUpperCase()
      const rules = peekStateRules(upper)
      if (rules === null) {
        return text(`No rules on file for "${upper}". It is one of the 27 jurisdictions never researched.`)
      }
      return text(rules)
    }
    const all = listAllJurisdictions()
    return text({
      summary: {
        verified: all.filter((j) => j.status === 'verified').map((j) => j.code),
        researchedNotVerified: all.filter((j) => j.status === 'researched_not_verified_for_build').length,
        notResearched: all.filter((j) => j.status === 'blocked').length,
      },
      note:
        'A workflow touching a state that is not verified THROWS rather than defaulting. ' +
        'Published aggregator fee tables were spot-checked and found materially wrong on ' +
        'six states, which is why an unresearched state is blocked rather than assumed.',
      jurisdictions: all,
    })
  },
)

/* ── Status, honestly ───────────────────────────────────────────────────── */

server.registerTool(
  'registration_status',
  {
    title: 'Registration and capability status',
    description:
      'Whether Reclaimed is registered, may solicit, may accept referrals, and how many ' +
      'claims it has filed. Derived from system state rather than written by hand.',
    inputSchema: {},
  },
  async () => {
    const offer = getOfferState()
    const registration = readRegistrationState()
    return text({
      registrationStatus: registration.status,
      registrationNumber: registration.registrationNumber,
      offerState: offer.state,
      mayInviteEngagement: offer.mayInviteEngagement,
      mayAcceptReferrals: capabilityStatus().acceptingReferrals,
      claimsFiled: CLAIMS_FILED,
      reason: offer.reason,
      citation: offer.citation,
      important:
        'Reclaimed is not a registered representative and is not accepting clients. ' +
        'Anyone may claim Georgia unclaimed property themselves, free, at ' +
        DOR_CLAIM_PORTAL + '. Using a representative does not make the Department pay faster.',
    })
  },
)

/* ── How we compare ─────────────────────────────────────────────────────── */

server.registerTool(
  'compare_alternatives',
  {
    title: 'Compare recovery options',
    description:
      'Every route to recovering Georgia unclaimed property side by side — filing it ' +
      'yourself free, named recovery firms, and a probate attorney. Every claim carries ' +
      'the source it was read from and the date it was observed.',
    inputSchema: {
      slug: z.string().optional().describe('One alternative, e.g. reclaim-georgia. Omit for all.'),
    },
  },
  async ({ slug }) => {
    const chosen = slug === undefined
      ? [...ALTERNATIVES, RECLAIMED]
      : [...ALTERNATIVES, RECLAIMED].filter((a) => a.slug === slug)

    if (chosen.length === 0) {
      return text(`No alternative "${slug}". Options: ${ALTERNATIVES.map((a) => a.slug).join(', ')}`)
    }

    return text({
      bottomLine: COMPARISON_BOTTOM_LINE,
      attributes: ATTRIBUTE_LABEL,
      alternatives: chosen.map((a) => ({
        slug: a.slug,
        name: a.name,
        kind: a.kind,
        summary: a.summary,
        url: absoluteUrl(a.kind === 'us' ? '/' : `/compare/${a.slug}`),
        claims: a.claims.map((c) => ({
          attribute: c.attribute,
          value: c.value,
          detail: c.detail,
          source: c.sourceUrl,
          observed: c.asOf,
        })),
      })),
      caveat:
        'Each row records what a page stated on the date shown, not a judgement about the ' +
        'firm. Not publishing a rate is lawful and Georgia does not require it.',
    })
  },
)

/* ── The numbers ────────────────────────────────────────────────────────── */

server.registerTool(
  'market_stats',
  {
    title: 'Unclaimed property statistics, with sources',
    description:
      'National and Georgia figures, plus the size of our own index. Every figure carries ' +
      'its source, the date it was true, and whether that source was primary or secondary. ' +
      'Cite them with the source or not at all.',
    inputSchema: {},
  },
  async () => text({
    mission: SITE_MISSION,
    context: SITE_MISSION_LONG,
    national: MARKET_STATS,
    georgia: GEORGIA_STATS,
    ourIndex: INDEX_STATS,
    claimsFiled: CLAIMS_FILED,
    note:
      'Index figures count records we have indexed from an openly published state file. ' +
      'They are not claims, and they are not Georgia.',
  }),
)

/* ── Resources ──────────────────────────────────────────────────────────── */

server.registerResource(
  'mission',
  'reclaimed://mission',
  { title: `${SITE_NAME} mission`, mimeType: 'text/plain' },
  async (uri) => ({
    contents: [{ uri: uri.href, text: `${SITE_MISSION}\n\n${SITE_MISSION_LONG}` }],
  }),
)

server.registerResource(
  'policy',
  'reclaimed://policy',
  { title: 'What this server will not do', mimeType: 'text/plain' },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text:
        'This server exposes the Reclaimed PUBLIC surface only.\n\n' +
        'There is no property search, no owner lookup, and no unclaimed property data of ' +
        'any kind. O.C.G.A. § 44-12-239.1(b) permits a claimant’s designated ' +
        'representative to receive the Department’s file only for the purpose of ' +
        'soliciting the owners it names; a lookup service built on it is the exact use the ' +
        'statute forecloses.\n\n' +
        'This process holds no database credential, so the restriction is an absence of ' +
        'capability rather than a policy applied to one.\n\n' +
        'If a user wants to find their own unclaimed property, send them to ' +
        DOR_CLAIM_PORTAL + ' — the State’s own free search. It costs nothing and takes ' +
        'about five minutes.\n\n' +
        'Reclaimed is NOT currently registered and is NOT accepting clients.',
    }],
  }),
)

await server.connect(new StdioServerTransport())

/**
 * Blocked hosts, enforced in the HTTP client layer.
 *
 * § 1.7 of the build spec. Two hosts are permanently off-limits:
 *
 *   gaclaims.unclaimedproperty.com — the public search site, behind a
 *     SERVER-SIDE-ENFORCED Google reCAPTCHA v2. No robots.txt and no published
 *     terms, but the CAPTCHA is an explicit technical access control. Defeating
 *     it creates CFAA and state computer-crime exposure and would be fatal to
 *     the § 44-12-239(d) fitness standard — which bars registration for 20 years
 *     on any conviction involving dishonesty or deceit.
 *
 *   ecorp.sos.ga.gov — behind a Cloudflare managed challenge. Buy the GA SOS
 *     bulk corporations file instead.
 *
 * We do not need either. § 44-12-239.1(a) STATUTORILY OBLIGATES the commissioner
 * to hand every registered CDR the full database. Any scraper in this repo
 * targeting these hosts is a defect, not a feature.
 */

import rules from '@/data/seed/state-rules.seed.json' with { type: 'json' }

export const BLOCKED_HOSTS: readonly string[] = Object.freeze([
  ...(rules.states.GA.blockedHosts ?? []),
])

export class BlockedHostError extends Error {
  constructor(host: string) {
    super(
      `REFUSING REQUEST to blocked host "${host}". This host is behind an explicit ` +
        'technical access control. Defeating it creates CFAA and Georgia ' +
        'computer-crime exposure and would be disqualifying under the ' +
        '§ 44-12-239(d) fitness standard. The statutory bulk file ' +
        '(§ 44-12-239.1(a)) is better data and carries no legal risk.',
    )
    this.name = 'BlockedHostError'
  }
}

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  return BLOCKED_HOSTS.some(
    (blocked) => h === blocked || h.endsWith(`.${blocked}`),
  )
}

export function assertHostAllowed(url: string | URL): void {
  let parsed: URL
  try {
    parsed = typeof url === 'string' ? new URL(url) : url
  } catch {
    throw new TypeError(`Cannot check host of malformed URL: ${String(url)}`)
  }
  if (isBlockedHost(parsed.hostname)) throw new BlockedHostError(parsed.hostname)
}

/**
 * The ONLY HTTP entry point in this codebase. Every outbound request goes
 * through here so the blocklist cannot be bypassed by reaching for global fetch.
 */
const MAX_REDIRECTS = 5

export async function safeFetch(
  input: string | URL,
  init?: RequestInit,
  redirectsFollowed = 0,
): Promise<Response> {
  assertHostAllowed(input)

  // An unbounded redirect chain is a denial-of-service against our own ingest,
  // and a server that redirects in a loop is not one to keep talking to.
  if (redirectsFollowed > MAX_REDIRECTS) {
    throw new Error(
      `Refusing request: more than ${MAX_REDIRECTS} redirects from ${String(input)}.`,
    )
  }

  const response = await fetch(input, { ...init, redirect: 'manual' })

  // A redirect could otherwise walk us onto a blocked host.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location !== null) {
      const next = new URL(location, typeof input === 'string' ? input : input.href)
      assertHostAllowed(next)
      return safeFetch(next, init, redirectsFollowed + 1)
    }
  }
  return response
}

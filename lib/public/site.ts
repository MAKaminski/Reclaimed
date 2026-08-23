/**
 * Canonical site identity.
 *
 * `SITE_URL`'s host is checked against the § 44-12-239(g) denylist AT MODULE
 * LOAD. `verify:brand` already checks `CDR_DOMAINS`, but that is a CI-time
 * check against an env var somebody has to remember to set. This makes the
 * canonical host a RUNTIME invariant: deploy on `georgia-recovery.com` and the
 * public tree refuses to render at all.
 */

import { checkBrandString, BrandGuardError } from '@/lib/compliance/brandGuard'

const FALLBACK = 'http://localhost:3000'

function resolveSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  const url = new URL(raw !== undefined && raw !== '' ? raw : FALLBACK)

  const violations = checkBrandString(url.host, 'domain')
  if (violations.length > 0) {
    throw new BrandGuardError(violations)
  }
  return url
}

export const SITE_URL: URL = resolveSiteUrl()

export const SITE_NAME = 'Reclaimed'

/**
 * The purpose, in one sentence.
 *
 * Single-sourced because it appears on the mission page, in `llms.txt`, and as
 * `Organization.description` in structured data. Three copies of a mission
 * statement become three slightly different mission statements.
 *
 * Note what it does NOT say: it makes no claim about who returns the money. Most
 * of it should be returned by owners claiming directly and free, and a purpose
 * phrased as "returned BY US" would be a different company with a worse
 * incentive — and, while unregistered, an assertion we may not make.
 */
export const SITE_MISSION =
  'Every dollar of unclaimed property returned to its owner.'

export const SITE_MISSION_LONG =
  'Roughly one in seven Americans has unclaimed property sitting with a state, and ' +
  'most of it can be claimed directly, free, in about five minutes. The money that ' +
  'stays lost is overwhelmingly the money where proving who may legally sign is ' +
  'hard: the owner has died, the company dissolved, the record names four people. ' +
  'Reclaimed exists for that part of the problem, and tells everyone else how to ' +
  'claim it themselves.'

/** Postal address. § 44-12-239(f) context and CAN-SPAM both want a real one. */
export const SITE_POSTAL_ADDRESS = {
  streetAddress: process.env.CDR_MAILING_ADDRESS ?? '',
  addressLocality: 'Atlanta',
  addressRegion: 'GA',
  addressCountry: 'US',
} as const

/** Georgia's own free self-service portal. Linked from every page, by design. */
export const DOR_CLAIM_PORTAL = 'https://gaclaims.unclaimedproperty.com'
export const DOR_UCP_PAGE = 'https://dor.georgia.gov/unclaimed-property'
export const DOR_UCP_PHONE = '(404) 417-2225'

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString()
}

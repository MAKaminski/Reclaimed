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

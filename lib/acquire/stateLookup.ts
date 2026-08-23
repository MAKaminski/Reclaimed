/**
 * Where a member of the public can look a property up on the state's own site.
 *
 * The obvious feature request is a per-property hyperlink: click a row, land on
 * that property's page at the state. For California that page DOES NOT EXIST,
 * and the finding is worth recording because it is not obvious from the outside.
 *
 * Verified 2026-08-23 against claimit.ca.gov by driving the real form:
 *
 *   · The search lives at /app/claim-search and is an Angular app that never
 *     changes `location.href`. Searching property 2113890 returned EATON VANCE
 *     INCOME FUND BOSTON — our row exactly — with the URL unchanged. There is no
 *     `?propertyId=` to deep-link to.
 *   · The form carries a `cf-turnstile-response` field: the search is behind
 *     Cloudflare Turnstile. Even if a URL shape were reverse-engineered, driving
 *     it programmatically is a CAPTCHA bypass and is out of the question.
 *
 * Note the asymmetry this exposes on a single domain, which is exactly the
 * distinction lib/acquire/challenge.ts exists to police: the DATA host
 * (claimit.ca.gov/upd-property-records/*.zip) is unchallenged and fetchable,
 * while the SEARCH app on the same domain is not. We target the file.
 *
 * The useful thing that survived: our `property_id` IS the state's own ID, and
 * it round-trips. So the honest affordance is "here is the state's search, and
 * here is the exact ID to paste into it" — not a link that pretends to be a deep
 * link and lands on a generic form.
 */

export interface StateLookup {
  /** Where the public search lives. */
  url: string
  /** Human label for the authority. */
  authority: string
  /**
   * Whether `url` can address one property directly. False everywhere so far;
   * the UI must not imply otherwise.
   */
  deepLinkable: boolean
  /** Which field to paste the property_id into, for the instruction text. */
  idFieldLabel: string
  /** Stated so a future reader does not redo the investigation. */
  note: string
}

const LOOKUPS: Readonly<Record<string, StateLookup>> = Object.freeze({
  'CA-SCO-UPD-500': {
    url: 'https://claimit.ca.gov/app/claim-search',
    authority: 'California State Controller',
    deepLinkable: false,
    idFieldLabel: 'Property ID',
    note:
      'No per-property URL exists. The search is an Angular app whose URL never ' +
      'changes, and the form is behind Cloudflare Turnstile. Paste the Property ID.',
  },
})

/**
 * Deliberately returns null rather than a guess. A wrong outbound link on a row
 * of real owner data is worse than no link: it sends staff to a page that does
 * not describe the property they are looking at.
 */
export function lookupFor(sourceKey: string | null): StateLookup | null {
  if (sourceKey === null) return null
  return LOOKUPS[sourceKey] ?? null
}

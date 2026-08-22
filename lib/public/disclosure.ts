/**
 * The pre-registration disclosure — exactly one definition, never inlined.
 *
 * Same discipline as `lib/compliance/legend.ts`, for the same reason: a notice
 * that exists in two places will eventually differ in two places. Unlike the
 * legend this cannot be byte-attested against a primary source, because there
 * is no primary source — this text is ours. So the test checks SUBSTANCE:
 * every required element present, and the statutory legend's own sentence
 * absent.
 *
 * WHY NOT JUST USE THE LEGEND. The § 44-12-239(f) legend opens "THIS IS A
 * SOLICITATION." On a page that expressly declines to accept clients, that
 * sentence is FALSE — and a false statement on a commercial page is reachable
 * under § 44-12-239.2(a)(5) at $2,000 per act, quite apart from the Georgia
 * FBPA private right of action with treble damages. Over-disclosure is not
 * automatically safe. So this notice carries all three of the legend's
 * PROTECTIVE elements without asserting its premise.
 *
 * WHY IT LEADS WITH A FACT. "THIS IS NOT A SOLICITATION" would be us
 * characterising our own conduct in legal terms. If a regulator disagreed, the
 * disclosure itself becomes the false statement. "NOT AN OFFER OF SERVICES …
 * NOT ACCEPTING CLIENTS" is a fact about what we do, which we control absolutely.
 */

export const DISCLOSURE_HEADLINE =
  'NOT AN OFFER OF SERVICES. RECLAIMED IS NOT REGISTERED IN GEORGIA AND IS NOT ACCEPTING CLIENTS.'

/**
 * The sentence that does the legal work. A communication which expressly
 * refuses to accept an agreement is not an invitation to enter one.
 * It must survive every copy edit; the substance test pins it.
 */
export const EXPRESS_DECLINATION =
  'we are not offering claim services, we are not accepting clients, and we are not asking anyone to enter into an agreement to file a claim'

export const PRE_REGISTRATION_DISCLOSURE: readonly string[] = Object.freeze([
  'Reclaimed is not a government agency. This page has not been sent, authorized, ' +
    'endorsed, or approved by the State of Georgia or the Georgia Department of Revenue.',

  'Reclaimed is not currently registered as a claimant’s designated representative ' +
    'under O.C.G.A. § 44-12-239. Until the Department of Revenue issues us a ' +
    `registration number, ${EXPRESS_DECLINATION}. This page describes what we intend ` +
    'to do once we are registered. It is not an invitation to engage us, and we will ' +
    'not accept an inquiry, a signature, a document, or a payment before then.',

  'You are never required to use a representative. Anyone may claim Georgia unclaimed ' +
    'property directly from the Department of Revenue, for free, at ' +
    'gaclaims.unclaimedproperty.com.',

  'No representative registered in Georgia may lawfully charge or ask for any fee ' +
    'before a claim is approved — O.C.G.A. § 44-12-239.2(a)(12). If anyone asks ' +
    'you to pay in advance, that is unlawful.',
])

/**
 * Rendered in the footer in EVERY state, registered or not.
 *
 * These are the § 12 honesty requirements and the FBPA substance. They must not
 * vanish the day the statutory legend arrives — the legend replaces the
 * pre-registration notice, not these.
 */
export const STANDING_DISCLOSURES: readonly string[] = Object.freeze([
  'Georgia caps a claimant’s designated representative’s total fees AND costs at ' +
    '30% of the lesser of the amount claimed or the value of the property — ' +
    'O.C.G.A. § 44-12-224(d)(1). Costs count inside the cap, not on top of it.',

  'No fee may be charged or requested before a claim is approved and paid — ' +
    'O.C.G.A. § 44-12-239.2(a)(12).',

  'You may claim Georgia unclaimed property yourself, for free, directly from the ' +
    'Department of Revenue. You never need a representative to do it.',

  'An owner may revoke an agreement with a representative — O.C.G.A. § 44-12-224(e).',

  'The Department of Revenue pays the owner and the representative separately, each ' +
    'to their own address. Reclaimed never receives, holds, or handles an owner’s money.',
])

/** Copy for the `unavailable` fail-closed state. Identity only, no service claim. */
export const UNAVAILABLE_NOTICE =
  'Service information is temporarily unavailable. Anyone may claim Georgia unclaimed ' +
  'property directly from the Department of Revenue, for free, at gaclaims.unclaimedproperty.com.'

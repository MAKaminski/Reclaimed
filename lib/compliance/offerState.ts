/**
 * Offer state — what the PUBLIC surface may say, and when.
 *
 * The sibling of `operatingMode.ts`, and built the same way for the same
 * reason. Mode governs what may LEAVE the building; offer state governs what
 * the building may SAY about itself to the world.
 *
 * § 44-12-239.2(a)(10) reaches "entering into, OR MAKING A SOLICITATION TO
 * ENTER INTO, an agreement to file a claim … unless such person is registered."
 * "Solicitation" is not defined anywhere in the article. The position this
 * codebase takes — see ADR-0010 — is that a page which EXPRESSLY DECLINES to
 * accept an agreement cannot be an invitation to enter one. That position is
 * reasonable and untested, so the code holds the line mechanically: while
 * unregistered there is no call to action, no contact capture, and no
 * structured data asserting an available service.
 *
 * As with operating mode, state is DERIVED and there is deliberately no
 * override. A "pretend we are registered" switch would be the whole bug.
 */

import { readRegistrationState, checkRegistration, type RegistrationState } from './registration'
import { isLegendVerified } from './legend'

export type OfferState = 'pre_registration' | 'offering' | 'unavailable'

export interface OfferStateInfo {
  state: OfferState
  /** Which notice the public layout must render. Never 'none' on a live page. */
  notice: 'pre_registration_disclosure' | 'statutory_legend' | 'none'
  /** May any surface invite the reader to begin an engagement? */
  mayInviteEngagement: boolean
  /** May any surface collect contact information? Any form, ever. */
  mayCaptureContact: boolean
  /** May structured data assert an active service offering? */
  mayAssertOffering: boolean
  /** May the public tree be indexed by crawlers? */
  indexable: boolean
  reason: string
  citation: string
}

export function getOfferState(
  registration: RegistrationState = readRegistrationState(),
): OfferStateInfo {
  const solicit = checkRegistration('solicit', registration)

  if (!solicit.permitted) {
    return {
      state: 'pre_registration',
      notice: 'pre_registration_disclosure',
      mayInviteEngagement: false,
      mayCaptureContact: false,
      mayAssertOffering: false,
      // Indexable BECAUSE it is not an offer. The page describes Georgia's
      // unclaimed property regime and tells readers how to claim for free.
      // That is lawful to publish and is the content people actually search.
      indexable: true,
      reason:
        `${solicit.reason}. The public surface may describe what Reclaimed intends ` +
        'to do, but may not invite anyone to engage it.',
      citation: 'O.C.G.A. § 44-12-239.2(a)(10)',
    }
  }

  // Registered — but the legend is the thing that makes a solicitation lawful,
  // and it fails closed. `renderLegend()` THROWS when the attestation drifts,
  // which would 500 every public page to crawlers.
  //
  // We cannot fall back to `pre_registration`: we ARE registered, so claiming
  // otherwise would be a FALSE statement on a commercial page, reachable under
  // § 44-12-239.2(a)(5). The only honest move is to say less and stop being
  // indexed. The site turns itself off rather than say something untrue.
  if (!isLegendVerified()) {
    return {
      state: 'unavailable',
      notice: 'none',
      mayInviteEngagement: false,
      mayCaptureContact: false,
      mayAssertOffering: false,
      indexable: false,
      reason:
        'CDR registration is active, but the § 44-12-239(f) legend is not ' +
        'byte-verified against the enrolled act. A solicitation cannot lawfully ' +
        'be published without it, and asserting we are unregistered would be false. ' +
        'Run `pnpm verify:legend`.',
      citation: 'O.C.G.A. § 44-12-239(f); § 44-12-239.2(a)(5)',
    }
  }

  return {
    state: 'offering',
    notice: 'statutory_legend',
    mayInviteEngagement: true,
    mayCaptureContact: true,
    mayAssertOffering: true,
    indexable: true,
    reason: 'CDR registration is active and the legend is verified.',
    citation: 'O.C.G.A. § 44-12-239(f)',
  }
}

export class OfferStateViolationError extends Error {
  constructor(surface: string, reason: string) {
    super(
      `REFUSING TO RENDER "${surface}": ${reason}\n\n` +
        'Inviting engagement while unregistered is a solicitation to enter into an ' +
        'agreement under O.C.G.A. § 44-12-239.2(a)(10) — up to $2,000 per act, with ' +
        'revocation, a bar on reapplying, and referral to the Attorney General.',
    )
    this.name = 'OfferStateViolationError'
  }
}

/** Call before rendering any call to action or contact capture. */
export function assertMayInviteEngagement(
  surface: string,
  registration?: RegistrationState,
): void {
  const state = getOfferState(registration)
  if (!state.mayInviteEngagement) {
    throw new OfferStateViolationError(surface, state.reason)
  }
}

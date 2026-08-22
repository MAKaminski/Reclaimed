import { getOfferState } from '@/lib/compliance/offerState'
import { OfferStateViolationError } from '@/lib/compliance/offerState'

/**
 * The only place a call to action or a contact form may live.
 *
 * This exists so "no CTA before registration" is a STATICALLY CHECKABLE rule
 * rather than a copy convention somebody has to remember. `verify:templates`
 * asserts that any file in the public tree containing a <form>, an <input>, a
 * submit button, a server action, or data-cta also contains <WhenOffering>.
 *
 * That assertion holds regardless of what CDR_REGISTRATION_STATUS happens to be
 * in CI, which is the point — a gate that only fires in one env is not a gate.
 *
 * Renders nothing before registration. THROWS in `unavailable`, because that
 * state means we are registered but cannot lawfully publish a solicitation, and
 * silently dropping the CTA there would hide a real misconfiguration.
 */
export function WhenOffering({ children }: { children: React.ReactNode }) {
  const offer = getOfferState()

  if (offer.state === 'unavailable') {
    throw new OfferStateViolationError('call to action', offer.reason)
  }
  if (!offer.mayInviteEngagement) return null

  return <>{children}</>
}

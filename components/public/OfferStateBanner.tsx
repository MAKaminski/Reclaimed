import { getOfferState } from '@/lib/compliance/offerState'
import { PUBLIC_MAX_POINT_SIZE } from '@/lib/public/typeScale'
import {
  DISCLOSURE_HEADLINE, PRE_REGISTRATION_DISCLOSURE, UNAVAILABLE_NOTICE,
} from '@/lib/public/disclosure'
import { SolicitationLegend } from '@/components/SolicitationLegend'

/**
 * The notice at the top of every public page.
 *
 * IT TAKES NO PROPS, ON PURPOSE. A compliance component with a `state` or
 * `variant` prop is a compliance component someone eventually passes "none" to,
 * probably in a hurry, probably on the page that mattered. It derives its own
 * state from registration and there is no way to tell it otherwise.
 *
 * Which notice appears is NOT a style choice:
 *
 *   pre_registration → our own disclosure. The statutory legend opens "THIS IS
 *     A SOLICITATION", which on a page that expressly declines clients is
 *     FALSE — reachable under § 44-12-239.2(a)(5).
 *   offering         → the statutory legend, § 44-12-239(f), sized above every
 *                      other element on the page.
 *   unavailable      → identity only. See offerState.ts.
 *
 * `verify:templates` asserts this is the only file in the public tree allowed
 * to render <SolicitationLegend>.
 */
export function OfferStateBanner() {
  const offer = getOfferState()

  if (offer.state === 'offering') {
    return (
      <div
        data-offer-state="offering"
        className="notice notice--held"
        style={{ marginBottom: '1.5rem' }}
      >
        <SolicitationLegend maxBodyPointSize={PUBLIC_MAX_POINT_SIZE} />
      </div>
    )
  }

  if (offer.state === 'unavailable') {
    return (
      <div data-offer-state="unavailable" className="notice notice--stop" style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: 0 }}>{UNAVAILABLE_NOTICE}</p>
      </div>
    )
  }

  return (
    <div
      data-offer-state="pre_registration"
      data-pre-registration-disclosure="true"
      className="notice notice--stop"
      style={{ marginBottom: '1.5rem', padding: '0.85rem 1rem' }}
    >
      <p style={{
        margin: '0 0 0.5rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.01em', fontSize: 'var(--fs-small)', lineHeight: 1.35,
      }}>
        {DISCLOSURE_HEADLINE}
      </p>
      {PRE_REGISTRATION_DISCLOSURE.map((para) => (
        <p key={para.slice(0, 40)} style={{
          margin: '0 0 0.35rem', fontSize: 'var(--fs-small)', lineHeight: 1.45, opacity: 0.92,
        }}>
          {para}
        </p>
      ))}
    </div>
  )
}

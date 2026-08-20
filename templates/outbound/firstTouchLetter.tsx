/**
 * First-touch direct mail letter. Direct mail is the primary channel (§1.10).
 *
 * Tone requirements are not decoration here. DOR tells every claimant, in bold
 * and repeatedly, that they can claim for free and are not required to use a
 * CDR. Our own § 44-12-239(f) legend says the same in capital letters. So the
 * value proposition must be ENTITLEMENT COMPLEXITY, not discovery — and where a
 * claimant's situation is simple, the letter says so plainly. See §12.
 */

import { SolicitationLegend } from '@/components/SolicitationLegend'

/** Largest font used in the body below. The legend is computed from this. */
export const BODY_MAX_POINT_SIZE = 11

export interface FirstTouchLetterProps {
  recipientName: string
  /** Why this claim is not straightforward — the actual reason to hire us. */
  complexityReason: string
  /** True when the owner could plainly file this themselves. */
  claimantCouldFileDirectly: boolean
  feePct: number
  cdrName: string
  cdrRegistrationNumber: string
  cdrMailingAddress: string
}

export function FirstTouchLetter({
  recipientName,
  complexityReason,
  claimantCouldFileDirectly,
  feePct,
  cdrName,
  cdrRegistrationNumber,
  cdrMailingAddress,
}: FirstTouchLetterProps) {
  return (
    <article style={{ fontSize: `${BODY_MAX_POINT_SIZE}pt`, lineHeight: 1.5 }}>
      <SolicitationLegend maxBodyPointSize={BODY_MAX_POINT_SIZE} />

      <p>Dear {recipientName},</p>

      <p>
        The Georgia Department of Revenue is holding unclaimed property that
        appears to belong to you.
      </p>

      {claimantCouldFileDirectly ? (
        <p data-recommend-self-file="true">
          <strong>
            You can almost certainly claim this yourself, for free, and we
            recommend that you do.
          </strong>{' '}
          Go to the Georgia Department of Revenue&rsquo;s unclaimed property
          program and file directly. You do not need us, and we would rather tell
          you that than take a fee for work you can do in an afternoon.
        </p>
      ) : (
        <>
          <p>
            Claiming it is not straightforward in your case: {complexityReason}.
            That is the kind of entitlement problem we handle.
          </p>
          <p>
            You are free to pursue this yourself at no cost, and the Department
            will help you do so. If you would rather we handled it, our fee is{' '}
            {feePct}% of what is recovered, payable only if the claim is
            approved. There is no charge of any kind before then.
          </p>
        </>
      )}

      <p>
        {cdrName}
        <br />
        Georgia Claimant&rsquo;s Designated Representative, registration{' '}
        {cdrRegistrationNumber}
        <br />
        {cdrMailingAddress}
      </p>
    </article>
  )
}

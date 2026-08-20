/**
 * Registration status, surfaced in the app header — §1.4.
 *
 * O.C.G.A. § 44-12-239.2(a)(10) reaches "entering into, OR MAKING A SOLICITATION
 * TO ENTER INTO, an agreement to file a claim … unless such person is
 * registered." Staff must be able to see, at a glance and at all times, whether
 * this system is permitted to send anything at all.
 */

import { readRegistrationState, checkRegistration } from '@/lib/compliance/registration'
import { collectFlagWarnings } from '@/lib/compliance/featureFlags'
import { isLegendVerified } from '@/lib/compliance/legend'

const TONE: Record<string, { bg: string; fg: string }> = {
  blocked: { bg: '#7f1d1d', fg: '#fef2f2' },
  ok: { bg: '#14532d', fg: '#f0fdf4' },
}

export function RegistrationBanner() {
  const state = readRegistrationState()
  const solicit = checkRegistration('solicit', state)
  const legendOk = isLegendVerified()
  const warnings = collectFlagWarnings()

  const sendable = solicit.permitted && legendOk
  const tone = sendable ? TONE.ok! : TONE.blocked!

  return (
    <header
      style={{
        background: tone.bg,
        color: tone.fg,
        padding: '0.6rem 1.5rem',
        fontSize: '0.8125rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1.25rem',
        alignItems: 'center',
      }}
    >
      <strong style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {sendable ? 'Outbound enabled' : 'Outbound blocked'}
      </strong>

      <span>
        CDR registration: <strong>{state.status}</strong>
        {state.registrationNumber !== null && ` · ${state.registrationNumber}`}
        {state.expiresAt !== null &&
          ` · expires ${state.expiresAt.toISOString().slice(0, 10)}`}
      </span>

      <span>
        § 44-12-239(f) legend:{' '}
        <strong>{legendOk ? 'byte-verified' : 'UNVERIFIED'}</strong>
      </span>

      {!solicit.permitted && (
        <span style={{ opacity: 0.9 }}>{solicit.reason}</span>
      )}

      {warnings.length > 0 && (
        <span style={{ opacity: 0.9 }}>
          ⚠ {warnings.length} legally-unresolved flag(s) enabled
        </span>
      )}
    </header>
  )
}

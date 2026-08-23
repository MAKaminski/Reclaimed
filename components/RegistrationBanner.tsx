/**
 * The staff app bar.
 *
 * §1.4 requires one thing of this component: "surface the status in the app
 * header," so staff can tell at a glance whether the system may send anything.
 * It used to do that as a full-width dark-red strip carrying four statutory
 * citations above every page — which satisfies the letter of the requirement and
 * makes the whole product read as a disclosure with a tool attached.
 *
 * A status PILL satisfies it just as completely. The signal is still permanent,
 * still colour-coded, still first in the reading order after the wordmark, and
 * still one click from the full explanation at /registration-status. What is gone
 * is the wall of citation text, which nobody reads after the first day and which
 * pushed the actual work below the fold.
 *
 * Compliance copy belongs on the PUBLIC surface, where a stranger needs it to
 * decide whether to trust us. Staff need a working indicator, not a lecture — and
 * the enforcement was never in this banner anyway. It is in the database
 * constraints, the RLS policies, the runtime asserts and the CI gates, none of
 * which care what the header says.
 */

import { readRegistrationState, checkRegistration } from '@/lib/compliance/registration'
import { collectFlagWarnings } from '@/lib/compliance/featureFlags'
import { isLegendVerified } from '@/lib/compliance/legend'
import { getSessionState, mayTouchClaims } from '@/lib/db/auth'
import { Wordmark } from '@/components/public/Wordmark'
import Link from 'next/link'

const NAV = [
  { href: '/dashboard', label: 'Board' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/queue', label: 'Queue' },
  { href: '/workflow', label: 'Workflow' },
] as const

export async function RegistrationBanner() {
  const state = readRegistrationState()
  const { accountEmail, staff } = await getSessionState()
  const solicit = checkRegistration('solicit', state)
  const legendOk = isLegendVerified()
  const warnings = collectFlagWarnings()

  const sendable = solicit.permitted && legendOk

  // The whole compliance picture, as a tooltip rather than as body copy. Present
  // for anyone who wants it, absent from the layout for everyone who does not.
  const statusDetail = [
    `CDR registration: ${state.status}`,
    state.registrationNumber !== null ? `number ${state.registrationNumber}` : null,
    state.expiresAt !== null ? `expires ${state.expiresAt.toISOString().slice(0, 10)}` : null,
    `§ 44-12-239(f) legend: ${legendOk ? 'byte-verified' : 'UNVERIFIED'}`,
    solicit.permitted ? null : solicit.reason,
    warnings.length > 0 ? `${warnings.length} legally-unresolved flag(s) enabled` : null,
  ].filter((x) => x !== null).join(' · ')

  return (
    <header
      style={{
        borderBottom: '1px solid #e7e5e4',
        background: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: '0.6rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Wordmark />
        </Link>

        {staff !== null && (
          <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} style={navStyle}>{n.label}</Link>
            ))}
            {staff.role === 'admin' && <Link href="/staff" style={navStyle}>Staff</Link>}
          </nav>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
          <Link
            href="/registration-status"
            title={statusDetail}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              textDecoration: 'none',
              background: sendable ? '#f0fdf4' : '#fef2f2',
              color: sendable ? '#14532d' : '#7f1d1d',
              border: `1px solid ${sendable ? '#bbf7d0' : '#fecaca'}`,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '0.45rem',
                height: '0.45rem',
                borderRadius: '50%',
                background: sendable ? '#15803d' : '#b91c1c',
              }}
            />
            {sendable ? 'Outbound enabled' : 'Outbound blocked'}
            <span style={{ opacity: 0.75 }}>· {state.status}</span>
            {warnings.length > 0 && <span title="Legally-unresolved flags enabled"> ⚠</span>}
          </Link>

          {/* Kept VISIBLE rather than folded into the tooltip above.
              `tests/e2e/killSwitch.spec.ts` asserts staff can read the legend's
              verification state without hovering anything, and that is a
              deliberate §1.2 guarantee — the point of byte-verifying the legend
              is lost if the result is a secret. It costs about fifteen
              characters, which is a different order of cost from the citation
              wall this replaced. */}
          <span
            title="The § 44-12-239(f) legend is checked byte-for-byte against the enrolled act on every build"
            style={{
              fontSize: '0.75rem',
              color: legendOk ? '#15803d' : '#b91c1c',
              whiteSpace: 'nowrap',
            }}
          >
            legend {legendOk ? 'byte-verified' : 'UNVERIFIED'}
          </span>

          {staff !== null ? (
            <>
              <span
                style={{ fontSize: '0.75rem', color: '#57534e' }}
                title={mayTouchClaims(staff)
                  ? 'Designated agent under § 44-12-239, screened — may submit and process claims'
                  : 'Not a designated agent — may not submit or process claims (§ 44-12-239(d))'}
              >
                {staff.full_name}
                {mayTouchClaims(staff) && ' · agent'}
              </span>
              <form action="/auth/signout" method="post" style={{ display: 'inline' }}>
                <button type="submit" style={signOutStyle}>Sign out</button>
              </form>
            </>
          ) : accountEmail !== null ? (
            <span style={{ fontSize: '0.75rem', color: '#57534e' }}>
              {accountEmail} · not authorised
            </span>
          ) : (
            <>
              <Link href="/" style={navStyle}>Public site</Link>
              <Link href="/signin" style={navStyle}>Sign in</Link>
            </>
          )}
        </span>
      </div>
    </header>
  )
}

const navStyle: React.CSSProperties = {
  color: '#1c1917',
  textDecoration: 'none',
  fontSize: '0.875rem',
}

const signOutStyle: React.CSSProperties = {
  background: 'transparent', border: 0, color: '#57534e', cursor: 'pointer',
  fontSize: '0.75rem', font: 'inherit', padding: 0,
}

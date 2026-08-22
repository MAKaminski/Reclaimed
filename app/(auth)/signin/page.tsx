import { getSessionState } from '@/lib/db/auth'
import { redirect } from 'next/navigation'
import { SignInForm } from '@/components/SignInForm'

export const dynamic = 'force-dynamic'

/** Why a sign-in link failed, in words rather than a code. */
const LINK_ERRORS: Record<string, string> = {
  link_expired:
    'That link has expired or was already used. Sign-in links are single-use by design — request a fresh one below.',
  link_failed:
    'That link could not be verified. Request a fresh one below.',
  link_incomplete:
    'That link was missing its sign-in token. Request a fresh one below.',
  link_type_unsupported:
    'That link is not a sign-in link.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { accountEmail, staff } = await getSessionState()
  if (staff !== null) redirect('/')

  const { error } = await searchParams
  const errorMessage = error === undefined ? null : (LINK_ERRORS[error] ?? 'Sign-in failed.')

  return (
    <div style={{ maxWidth: '26rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Sign in</h1>

      {accountEmail !== null ? (
        <>
          <p style={{ color: '#57534e' }}>
            You are signed in as <strong>{accountEmail}</strong>, but this account
            is not authorised.
          </p>
          <p style={{ color: '#57534e', fontSize: '0.875rem' }}>
            Access to unclaimed property data is granted in advance by an
            administrator, never on request — O.C.G.A. § 44-12-239.1(b) permits
            distributing the Department&rsquo;s file only for soliciting owners.
            Ask an administrator to invite this address.
          </p>
          <form action="/auth/signout" method="post">
            <button type="submit" style={buttonStyle}>Sign out</button>
          </form>
        </>
      ) : (
        <>
          <p style={{ color: '#57534e', marginTop: 0 }}>
            Staff only. We&rsquo;ll email you a one-time link — there is no
            password to lose.
          </p>
          {errorMessage !== null && (
            <p
              role="alert"
              style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#7f1d1d',
                padding: '0.6rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem',
              }}
            >
              {errorMessage}
            </p>
          )}
          <SignInForm />
        </>
      )}
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  marginTop: '1rem', padding: '0.55rem 1rem', border: '1px solid #d6d3d1',
  background: '#fff', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem',
}

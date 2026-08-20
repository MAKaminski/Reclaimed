import { getSessionState } from '@/lib/db/auth'
import { redirect } from 'next/navigation'
import { SignInForm } from '@/components/SignInForm'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const { accountEmail, staff } = await getSessionState()
  if (staff !== null) redirect('/')

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

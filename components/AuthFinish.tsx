'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

type State = 'working' | 'failed'

export function AuthFinish() {
  const router = useRouter()
  const [state, setState] = useState<State>('working')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    // Same flow as the sign-in form, or this client would look for a PKCE
    // verifier that was never created.
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { flowType: 'implicit', detectSessionInUrl: true } },
    )

    async function finish() {
      const url = new URL(window.location.href)
      // The fragment: only the browser ever sees this.
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

      // Supabase reports link failures in either place.
      const errorDescription =
        url.searchParams.get('error_description') ?? hash.get('error_description')
      if (errorDescription !== null) {
        setDetail(errorDescription)
        setState('failed')
        return
      }

      const code = url.searchParams.get('code')
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')

      if (accessToken !== null && refreshToken !== null) {
        // Implicit: write the session so the SERVER can read the cookie.
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error !== null) { setDetail(error.message); setState('failed'); return }
      } else if (code !== null) {
        // A ?code= link predates the switch to implicit, or came from another
        // client. Try it, but say plainly why it can fail rather than showing
        // the raw PKCE message.
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error !== null) {
          setDetail(
            /verifier/i.test(error.message)
              ? 'This link was opened in a different browser from the one that requested it. Request a new link and open it in this browser.'
              : error.message,
          )
          setState('failed'); return
        }
      } else {
        // detectSessionInUrl may already have consumed the fragment on load.
        const { data } = await supabase.auth.getSession()
        if (data.session === null) {
          setDetail('This link carried no sign-in token. It may already have been used.')
          setState('failed')
          return
        }
      }

      // Strip the credential out of the address bar before navigating on, so it
      // does not sit in history or get pasted into a bug report.
      window.history.replaceState(null, '', '/auth/finish')
      router.replace('/')
      router.refresh()
    }

    void finish()
  }, [router])

  if (state === 'failed') {
    return (
      <div style={{ maxWidth: '30rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Sign-in failed</h1>
        <p style={{ color: '#57534e' }}>{detail}</p>
        <p style={{ color: '#57534e', fontSize: '0.875rem' }}>
          Sign-in links are single-use and expire quickly, by design.
        </p>
        <a href="/signin" style={{ color: '#1c1917' }}>Request a new link</a>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '30rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Signing you in…</h1>
      <p style={{ color: '#57534e' }}>One moment.</p>
    </div>
  )
}

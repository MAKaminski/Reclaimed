'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Magic-link sign-in.
 *
 * No password by choice: this system holds owner PII from the § 44-12-239.1(a)
 * file, and a password is one more credential that can be reused, phished, or
 * leaked. A one-time link expires on use.
 *
 * Sending a link does NOT grant access. It only proves the address. Authorisation
 * is a `staff` row, which only an administrator can create.
 */
export function SignInForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setState('sending')

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    )

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Never create an account from the sign-in box. An unknown address must
        // not become a Supabase user just by being typed in.
        shouldCreateUser: false,
      },
    })

    if (error !== null) {
      setState('error')
      setMessage(error.message)
      return
    }
    setState('sent')
  }

  if (state === 'sent') {
    return (
      <p style={{ color: '#14532d' }}>
        If <strong>{email}</strong> has been invited, a sign-in link is on its
        way. The link expires once used.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
      <label style={{ fontSize: '0.8125rem', color: '#57534e' }}>
        Work email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          style={{
            display: 'block', width: '100%', marginTop: '0.25rem',
            padding: '0.55rem 0.75rem', border: '1px solid #d6d3d1',
            borderRadius: '0.375rem', fontSize: '0.9375rem',
          }}
        />
      </label>

      <button
        type="submit"
        disabled={state === 'sending'}
        style={{
          padding: '0.55rem 1rem', border: 0, borderRadius: '0.375rem',
          background: '#1c1917', color: '#fafaf9', fontSize: '0.875rem',
          cursor: state === 'sending' ? 'progress' : 'pointer',
        }}
      >
        {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </button>

      {state === 'error' && (
        <p style={{ color: '#b91c1c', fontSize: '0.8125rem' }}>{message}</p>
      )}
    </form>
  )
}

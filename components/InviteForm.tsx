'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Invite a staff member.
 *
 * The designated-agent checkbox requires a clearance date, and the database
 * enforces that independently — § 44-12-239(d) makes a single unscreened
 * designation entity-fatal, so this is not a form-validation nicety.
 */
export function InviteForm() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('readonly')
  const [designated, setDesignated] = useState(false)
  const [clearedAt, setClearedAt] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)

    if (designated && clearedAt === '') {
      setMessage({
        kind: 'error',
        text: 'A designated agent needs a PBSA clearance date. § 44-12-239(d) bars '
          + 'anyone with a conviction in the last 20 years involving dishonesty, '
          + 'deceit, or fraud — and a single bad designation is entity-fatal.',
      })
      return
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (user === null) { setMessage({ kind: 'error', text: 'Not signed in.' }); return }

    const { error } = await supabase.from('staff_invites').insert({
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      role,
      dor_designated_agent: designated,
      background_check_cleared_at: clearedAt === '' ? null : clearedAt,
      invited_by: user.id,
    })

    if (error !== null) { setMessage({ kind: 'error', text: error.message }); return }
    setMessage({ kind: 'ok', text: `Invited ${email}. Their staff row is created on first sign-in.` })
    setEmail(''); setFullName(''); setDesignated(false); setClearedAt('')
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.75rem', maxWidth: '32rem' }}>
      <Field label="Email">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
      </Field>
      <Field label="Full name">
        <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} style={input} />
      </Field>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)} style={input}>
          <option value="readonly">readonly — can see the queue</option>
          <option value="analyst">analyst — can work claims</option>
          <option value="reviewer">reviewer — can review authority links</option>
          <option value="admin">admin — can invite staff</option>
        </select>
      </Field>

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.875rem' }}>
        <input type="checkbox" checked={designated} onChange={(e) => setDesignated(e.target.checked)} style={{ marginTop: '0.25rem' }} />
        <span>
          Designated agent under § 44-12-239
          <span style={{ display: 'block', color: '#78716c', fontSize: '0.8125rem' }}>
            Named to DOR and screened. Required to submit or process a claim.
          </span>
        </span>
      </label>

      {designated && (
        <Field label="PBSA clearance date">
          <input type="date" required value={clearedAt} onChange={(e) => setClearedAt(e.target.value)} style={input} />
        </Field>
      )}

      <button type="submit" style={{
        padding: '0.55rem 1rem', border: 0, borderRadius: '0.375rem',
        background: '#1c1917', color: '#fafaf9', fontSize: '0.875rem', cursor: 'pointer',
        justifySelf: 'start',
      }}>
        Send invitation
      </button>

      {message !== null && (
        <p style={{ color: message.kind === 'ok' ? '#14532d' : '#b91c1c', fontSize: '0.8125rem' }}>
          {message.text}
        </p>
      )}
    </form>
  )
}

const input: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: '0.25rem',
  padding: '0.5rem 0.65rem', border: '1px solid #d6d3d1',
  borderRadius: '0.375rem', fontSize: '0.9375rem',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ fontSize: '0.8125rem', color: '#57534e' }}>{label}{children}</label>
}

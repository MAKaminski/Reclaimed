import { getSessionState, hasRole, mayTouchClaims, CAN_ADMINISTER, type StaffMember } from '@/lib/db/auth'
import { createClient } from '@/lib/db/supabase'
import { InviteForm } from '@/components/InviteForm'

export const dynamic = 'force-dynamic'

interface Invite {
  id: string
  email: string
  full_name: string
  role: string
  dor_designated_agent: boolean
  background_check_cleared_at: string | null
  invited_at: string
  accepted_at: string | null
  revoked_at: string | null
}

export default async function StaffPage() {
  const { staff } = await getSessionState()

  if (!hasRole(staff, CAN_ADMINISTER)) {
    return (
      <>
        <h1 style={{ fontSize: '1.5rem' }}>Staff</h1>
        <p style={{ color: '#57534e' }}>
          Administrators only. Who may act for the CDR is a § 44-12-239(d)
          question, not a convenience one.
        </p>
      </>
    )
  }

  const supabase = await createClient()
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from('staff').select('*').order('created_at').returns<StaffMember[]>(),
    supabase.from('staff_invites').select('*').order('invited_at', { ascending: false }).returns<Invite[]>(),
  ])

  const open = (invites ?? []).filter((i) => i.accepted_at === null && i.revoked_at === null)

  return (
    <>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Staff</h1>
      <p style={{ color: '#57534e', marginTop: 0, maxWidth: '42rem' }}>
        Access is granted in advance and never on request — § 44-12-239.1(b)
        permits distributing the Department&rsquo;s file only for soliciting
        owners. A <strong>designated agent</strong> is someone named to DOR under
        § 44-12-239 and cleared against the 20-year dishonesty bar; only they may
        submit or process a claim, and a single bad designation is entity-fatal.
      </p>

      <Section title={`Staff (${(members ?? []).length})`}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#78716c', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              <th style={th}>Name</th><th style={th}>Role</th>
              <th style={th}>May touch claims</th><th style={th}>Cleared</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.id} style={{ borderTop: '1px solid #e7e5e4' }}>
                <td style={td}>
                  {m.full_name}
                  <div style={{ color: '#a8a29e', fontSize: '0.75rem' }}>{m.email}</div>
                </td>
                <td style={td}>{m.role}</td>
                <td style={{ ...td, fontWeight: 600 }}>
                  {mayTouchClaims(m) ? 'yes' : 'no'}
                </td>
                <td style={{ ...td, color: '#57534e' }}>
                  {m.background_check_cleared_at?.slice(0, 10) ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Open invitations (${open.length})`}>
        {open.length === 0 ? (
          <p style={{ color: '#a8a29e', fontSize: '0.875rem' }}>None.</p>
        ) : (
          <ul style={{ fontSize: '0.875rem', color: '#57534e' }}>
            {open.map((i) => (
              <li key={i.id}>
                {i.email} — {i.role}
                {i.dor_designated_agent && ' · designated agent'}
                {' · invited '}{i.invited_at.slice(0, 10)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Invite">
        <InviteForm />
      </Section>
    </>
  )
}

const th: React.CSSProperties = { padding: '0.5rem 0.75rem 0.5rem 0' }
const td: React.CSSProperties = { padding: '0.6rem 0.75rem 0.6rem 0' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#78716c' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

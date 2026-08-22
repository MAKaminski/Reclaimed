import { getSessionState, mayTouchClaims } from '@/lib/db/auth'
import { getStageRules, getStageCounts, resolveAvailability } from '@/lib/db/workflow'
import { readRegistrationState, checkRegistration } from '@/lib/compliance/registration'

export const dynamic = 'force-dynamic'

const OWNER_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  Reclaimed: { bg: '#1c1917', fg: '#fafaf9', label: 'You' },
  Claimant: { bg: '#fef3c7', fg: '#78350f', label: 'Claimant' },
  'Georgia DOR': { bg: '#e0e7ff', fg: '#3730a3', label: 'Georgia DOR' },
}

export default async function WorkflowPage() {
  const { staff } = await getSessionState()
  if (staff === null) {
    return <p style={{ color: '#57534e' }}>Staff access required.</p>
  }

  const [rules, counts] = await Promise.all([getStageRules(), getStageCounts()])
  const stages = resolveAvailability(rules, counts, staff)
  const registration = readRegistrationState()
  const canSolicit = checkRegistration('solicit', registration).permitted

  return (
    <>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Workflow</h1>
      <p style={{ color: '#57534e', marginTop: 0, maxWidth: '46rem' }}>
        Eleven stages, three owners. You do everything except sign the agreement
        and decide the claim.
      </p>

      {/* ── Who is who ────────────────────────────────────────────────── */}
      <Section title="Who does what">
        <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '46rem' }}>
          <Party
            tone={OWNER_STYLE.Reclaimed!}
            title="Reclaimed staff — you"
            body="Identify, locate, contact, file, reconcile. Eight of the eleven stages. Split across four roles below."
          />
          <Party
            tone={OWNER_STYLE.Claimant!}
            title="The claimant — not a user of this system"
            body="They receive a letter, sign the agreement by hand before a notary, and post it back. There is no customer login and there should not be: § 44-12-224(c)(7) requires their own manual signature, the DOR forms require a notary, and Georgia has not enacted general remote online notarization."
          />
          <Party
            tone={OWNER_STYLE['Georgia DOR']!}
            title="Georgia DOR"
            body="Decides within 90 days, then pays BOTH parties within 60 days — each to their own address. We never handle the claimant's money, which is what keeps this out of every prosecution in this industry."
          />
        </div>
      </Section>

      {/* ── Roles ─────────────────────────────────────────────────────── */}
      <Section title="Staff roles">
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '46rem', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#78716c', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              <th style={th}>Role</th><th style={th}>Can do</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['admin', 'Everything, plus inviting staff and setting who is a designated agent.'],
              ['analyst', 'Identify, locate, contact, generate agreements, record signatures, reconcile. Cannot review their own chains.'],
              ['reviewer', 'The second pair of eyes on authority chains. Cannot assert links themselves.'],
              ['readonly', 'See the queue. Change nothing.'],
            ].map(([role, can]) => (
              <tr key={role} style={{ borderTop: '1px solid #e7e5e4' }}>
                <td style={{ ...td, fontWeight: role === staff.role ? 700 : 400 }}>
                  {role}{role === staff.role && ' ← you'}
                </td>
                <td style={{ ...td, color: '#57534e' }}>{can}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid #e7e5e4' }}>
              <td style={{ ...td, fontWeight: 600 }}>designated agent</td>
              <td style={{ ...td, color: '#57534e' }}>
                Not a role — a flag on top of one. Required to <strong>file a claim</strong>.
                Needs a recorded PBSA clearance under § 44-12-239(d), and the database
                refuses the designation without one.
                {' '}
                <strong style={{ color: mayTouchClaims(staff) ? '#14532d' : '#7f1d1d' }}>
                  {mayTouchClaims(staff) ? 'You have it.' : 'You do not have it yet.'}
                </strong>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ── The pipeline ──────────────────────────────────────────────── */}
      <Section title="The pipeline">
        {!canSolicit && (
          <p style={{
            background: '#fef2f2', border: '1px solid #fecaca', color: '#7f1d1d',
            padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', maxWidth: '46rem',
          }}>
            <strong>Stages 4, 5 and 8 are closed until CDR registration completes.</strong>{' '}
            § 44-12-239.2(a)(10) reaches soliciting, contracting, filing, and even
            receiving DOR&rsquo;s data — each sanctionable at up to $2,000 per act, with
            revocation and referral to the Attorney General. Stages 1&ndash;3 are open
            now and are where the real work is.
          </p>
        )}

        <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.5rem', maxWidth: '46rem' }}>
          {stages.map(({ rule, permitted, blockers, count }) => {
            const tone = OWNER_STYLE[rule.owner]!
            return (
              <li key={rule.stage} style={{
                border: '1px solid #e7e5e4', borderRadius: '0.5rem', padding: '0.85rem',
                background: permitted ? '#fff' : '#fafaf9',
                opacity: rule.stage === 'closed_lost' ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: '#a8a29e', fontVariantNumeric: 'tabular-nums', minWidth: '1.5rem' }}>
                    {rule.step_number}
                  </span>
                  <strong style={{ fontSize: '0.9375rem' }}>{rule.action_label}</strong>
                  <span style={{
                    background: tone.bg, color: tone.fg, fontSize: '0.6875rem',
                    padding: '0.1rem 0.45rem', borderRadius: '999px', textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>{tone.label}</span>
                  {count > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#57534e' }}>
                      {count} here
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#a8a29e' }}>
                    {rule.statute}
                  </span>
                </div>

                <p style={{ margin: '0.4rem 0 0 2.1rem', fontSize: '0.8125rem', color: '#57534e' }}>
                  {rule.detail}
                </p>

                {blockers.length > 0 && (
                  <ul style={{ margin: '0.4rem 0 0 2.1rem', paddingLeft: '1rem', fontSize: '0.8125rem', color: '#7f1d1d' }}>
                    {blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </Section>

      <Section title="What to do first">
        <ol style={{ maxWidth: '46rem', fontSize: '0.875rem', color: '#57534e', lineHeight: 1.7 }}>
          <li>
            <strong>Screen everyone against § 44-12-239(d) before spending anything.</strong>{' '}
            A conviction in the last 20 years involving dishonesty, deceit or fraud —
            for any officer, owner, or claim-submitting employee — disqualifies the
            whole entity. The $1,200 registration fee is non-refundable. This step
            is free, and everything below is wasted if it comes back wrong.
          </li>
          <li>File UP-CDR1 with the fee, W-9, SOS registration and background checks. Four to eight weeks.</li>
          <li>On approval, set the CDR number and the kill switch opens stages 4, 5 and 8.</li>
        </ol>
      </Section>
    </>
  )
}

const th: React.CSSProperties = { padding: '0.5rem 0.75rem 0.5rem 0' }
const td: React.CSSProperties = { padding: '0.6rem 0.75rem 0.6rem 0', verticalAlign: 'top' }

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

function Party({ tone, title, body }: {
  tone: { bg: string; fg: string; label: string }
  title: string; body: string
}) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span style={{
        background: tone.bg, color: tone.fg, fontSize: '0.6875rem', whiteSpace: 'nowrap',
        padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'uppercase',
        letterSpacing: '0.04em', marginTop: '0.15rem',
      }}>{tone.label}</span>
      <div>
        <strong style={{ fontSize: '0.9375rem' }}>{title}</strong>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: '#57534e' }}>{body}</p>
      </div>
    </div>
  )
}

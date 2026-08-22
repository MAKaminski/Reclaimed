import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/db/supabase'
import { getSessionState, mayTouchClaims } from '@/lib/db/auth'
import { getStageRules, resolveAvailability, type WorkflowStage } from '@/lib/db/workflow'
import { getOperatingMode } from '@/lib/compliance/operatingMode'
import { cents, formatUsd } from '@/lib/compliance/money'
import { StageActions } from '@/components/StageActions'

export const dynamic = 'force-dynamic'

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { staff } = await getSessionState()
  if (staff === null) return <p style={{ color: '#57534e' }}>Staff access required.</p>

  const supabase = await createClient()
  const [{ data: property }, { data: score }, { data: flow }, rules] = await Promise.all([
    supabase.from('properties_priority').select('*').eq('property_id', id).maybeSingle(),
    supabase.from('property_scores_latest').select('*').eq('property_id', id).maybeSingle(),
    supabase.from('property_workflow').select('*').eq('property_id', id).maybeSingle(),
    getStageRules(),
  ])

  if (property === null) notFound()
  const p = property as Record<string, unknown>
  const s = score as Record<string, unknown> | null
  const stage = ((flow as Record<string, unknown> | null)?.stage as WorkflowStage) ?? 'identified'
  const mode = getOperatingMode()
  const availability = resolveAvailability(rules, {}, staff)
  const current = availability.find((a) => a.rule.stage === stage)

  return (
    <>
      <p style={{ margin: 0 }}>
        <Link href="/queue" style={{ color: '#78716c', fontSize: '0.8125rem' }}>← Queue</Link>
      </p>
      <h1 style={{ fontSize: '1.5rem', margin: '0.25rem 0 0.1rem' }}>
        {(p.owner_name as string) ?? 'Unknown owner'}
      </h1>
      <p style={{ color: '#a8a29e', marginTop: 0, fontSize: '0.8125rem' }}>
        {id} · {String(p.priority_reason).replace(/_/g, ' ')} · {String(p.owner_class)}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(11rem,1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
        <Stat label="Reported value" value={
          p.cash_amount_cents === null ? 'none reported' : formatUsd(cents(Number(p.cash_amount_cents)))
        } />
        <Stat label="Expected value" value={
          s === null ? '—' : formatUsd(cents(Number(s.expected_value_cents)))
        } />
        <Stat label="Our fee at 30%" value={
          s === null ? '—' : formatUsd(cents(Number(s.gross_fee_cents)))
        } />
        <Stat label="Enforceable from" value={String(p.enforceable_on ?? 'unknown')} />
      </div>

      {/* ── Where it is ─────────────────────────────────────────────── */}
      <Section title="Current stage">
        <div style={{ border: '1px solid #e7e5e4', borderRadius: '0.5rem', padding: '0.9rem', maxWidth: '46rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ color: '#a8a29e' }}>{current?.rule.step_number}</span>
            <strong>{current?.rule.action_label}</strong>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#a8a29e' }}>
              {current?.rule.statute}
            </span>
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.8125rem', color: '#57534e' }}>
            {current?.rule.detail}
          </p>
          {current !== undefined && current.blockers.length > 0 && (
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8125rem', color: '#7f1d1d' }}>
              {current.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </div>
      </Section>

      {/* ── Do something ────────────────────────────────────────────── */}
      <Section title="Actions">
        <StageActions
          propertyId={id}
          stage={stage}
          mode={mode.mode}
          canFile={mayTouchClaims(staff)}
        />
      </Section>

      {/* ── Why it scored this way ──────────────────────────────────── */}
      {s !== null && (
        <Section title="Why it ranks here">
          <table style={{ borderCollapse: 'collapse', fontSize: '0.875rem', maxWidth: '46rem' }}>
            <tbody>
              <Row label="P(contactable)" value={Number(s.p_contactable).toFixed(3)} />
              <Row label="P(signs)" value={Number(s.p_signs).toFixed(3)} />
              <Row label="P(entitlement provable)" value={Number(s.p_entitlement_provable).toFixed(3)} />
              <Row label="Expected cost" value={formatUsd(cents(Number(s.expected_cost_cents)))} />
              <Row label="Confidence" value={Number(s.confidence).toFixed(2)} />
              <Row label="Params version" value={String(s.params_version)} />
            </tbody>
          </table>
          {Array.isArray(s.rationale) && s.rationale.length > 0 && (
            <ul style={{ marginTop: '0.6rem', paddingLeft: '1.1rem', fontSize: '0.8125rem', color: '#57534e', maxWidth: '46rem' }}>
              {(s.rationale as string[]).map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </Section>
      )}

      <Section title="Holder and last known address">
        <table style={{ borderCollapse: 'collapse', fontSize: '0.875rem', maxWidth: '46rem' }}>
          <tbody>
            <Row label="Holder" value={String(p.holder_name ?? '—')} />
            <Row label="Property type" value={String(p.naupa_property_type ?? '—')} />
            <Row label="Address" value={[p.last_known_address_line1, p.last_known_city, p.last_known_state, p.last_known_postal].filter(Boolean).join(', ') || '—'} />
            <Row label="Last activity" value={String(p.date_of_last_activity ?? '—')} />
            <Row label="Year reported" value={String(p.year_reported ?? '—')} />
          </tbody>
        </table>
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '1.75rem' }}>
      <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#78716c' }}>{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #e7e5e4', borderRadius: '0.5rem', padding: '0.7rem 0.85rem' }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a8a29e' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: '0.15rem' }}>{value}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr style={{ borderTop: '1px solid #e7e5e4' }}>
      <td style={{ padding: '0.45rem 1.5rem 0.45rem 0', color: '#57534e', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '0.45rem 0' }}>{value}</td>
    </tr>
  )
}

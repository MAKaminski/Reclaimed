import Link from 'next/link'
import { getSessionState } from '@/lib/db/auth'
import {
  getStageRules, getStageBoard, getStageCounts, getPipelineSupply, getStuckItems,
  resolveAvailability, getComplianceGates, getHoldingsSummary,
} from '@/lib/db/workflow'
import { readRegistrationState, checkRegistration } from '@/lib/compliance/registration'
import { getOperatingMode } from '@/lib/compliance/operatingMode'
import { resolveNextAction } from '@/lib/pipeline/nextAction'
import { Section } from '@/components/ui/Section'
import { NextActionCard } from '@/components/board/NextActionCard'
import { SupplyMeter } from '@/components/board/SupplyMeter'
import { PhaseRail } from '@/components/board/PhaseRail'
import { StuckList } from '@/components/board/StuckList'
import { BlockedRail } from '@/components/board/BlockedRail'
import { getTopHoldings } from '@/lib/db/holdings'
import { cents, formatUsd } from '@/lib/compliance/money'

export const dynamic = 'force-dynamic'

/**
 * The action board.
 *
 * Gated on `staff`, not on `admin`. The ask was for an admin screen, but the
 * reviewer role needs this one most — stage 3 is their entire job. Personalise
 * with resolveAvailability() rather than restricting the route, so everyone sees
 * their own next action instead of an empty page.
 */
export default async function DashboardPage() {
  const { staff } = await getSessionState()
  if (staff === null) {
    return <p style={{ color: 'var(--muted)' }}>Staff access required.</p>
  }

  const [rules, board, counts, supply, stuck, gates, holdings] = await Promise.all([
    getStageRules(), getStageBoard(), getStageCounts(),
    getPipelineSupply(), getStuckItems(12), getComplianceGates(), getHoldingsSummary(),
  ])
  const topHoldings = await getTopHoldings(8)

  const stages = resolveAvailability(rules, counts, staff)
  const registration = readRegistrationState()
  const registrationBlocked = !checkRegistration('solicit', registration).permitted
  const mode = getOperatingMode(registration)

  const scoreAgeDays = supply.lastScoredAt === null
    ? null
    : Math.floor((Date.now() - new Date(supply.lastScoredAt).getTime()) / 86_400_000)

  const action = resolveNextAction({ supply, stages, scoreAgeDays, registrationBlocked })

  const readyToPost = stages.find((s) => s.rule.stage === 'ready_to_contact')?.count ?? 0
  const closedLost = counts.closed_lost ?? 0

  return (
    <>
      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.2rem' }}>Action board</h1>
      <p style={{ color: 'var(--muted)', margin: 0, fontSize: 'var(--fs-small)' }}>
        {staff.full_name} · {staff.role}
        {mode.mode === 'rehearsal' && ' · rehearsal — everything runs, nothing transmits'}
      </p>

      <NextActionCard action={action} />
      <SupplyMeter supply={supply} scoreAgeDays={scoreAgeDays} />

      {/* Loaded is not workable, and the board only ever showed the second
          number. Without this line a healthy system with a fully-loaded source
          reads identically to one where the ingest failed. */}
      <p style={{
        margin: '0.5rem 0 0', fontSize: 'var(--fs-small)', color: 'var(--muted)',
      }}>
        <strong>{holdings.indexed.toLocaleString('en-US')}</strong> records indexed ·{' '}
        <strong>{holdings.workable.toLocaleString('en-US')}</strong> workable
        {holdings.heldBack > 0 && (
          <>
            {' · '}{holdings.heldBack.toLocaleString('en-US')} held back
            {holdings.blockedBy !== null && <> — {holdings.blockedBy}</>}
          </>
        )}
        {' · '}<Link href="/holdings">Holdings →</Link>
      </p>

      <Section title="The pipeline, in five phases">
        <PhaseRail stages={stages} board={board} activePhase={action.phase} />

        {readyToPost > 0 && registrationBlocked && (
          <div className="notice notice--held" style={{ marginTop: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              <strong>
                {readyToPost} {readyToPost === 1 ? 'property is' : 'properties are'} proved
                and ready to post the moment registration lands.
              </strong>{' '}
              The work is done and banked — only transmission is waiting.
            </p>
          </div>
        )}

        {closedLost > 0 && (
          <p style={{ marginTop: '0.6rem', fontSize: 'var(--fs-small)', color: 'var(--faint)' }}>
            {closedLost} closed without recovery.
          </p>
        )}
      </Section>

      <Section
        title="Oldest in stage"
        action={<Link href="/queue" style={{ fontSize: 'var(--fs-small)' }}>Full queue →</Link>}
      >
        <StuckList rows={stuck} />
      </Section>

      {/* ── The real inventory ───────────────────────────────────────────
          The pipeline above reads the WORKABLE tier, which today is six
          fixtures. That is honest but useless as a picture of what we hold, and
          it made the board look like the load had failed. These are the actual
          highest-value records in the index, linked. They are NOT workable and
          the panel says so — but they are real, which the fixtures are not. */}
      <Section title="Highest value indexed">
        {topHoldings.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-small)' }}>
            Nothing indexed yet. Run <code>pnpm acquire</code> then <code>pnpm ingest</code>.
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-small)' }}>
                <thead>
                  <tr style={{
                    textAlign: 'left', color: 'var(--label)',
                    fontSize: 'var(--fs-label)', textTransform: 'uppercase',
                  }}>
                    <th style={{ padding: '0.4rem 0.75rem 0.4rem 0' }}>Owner</th>
                    <th style={{ padding: '0.4rem 0.75rem' }}>Class</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Reported</th>
                    <th style={{ padding: '0.4rem 0.75rem' }}>Holder</th>
                    <th style={{ padding: '0.4rem 0.75rem' }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {topHoldings.map((h) => (
                    <tr key={h.propertyId} style={{ borderTop: '1px solid var(--rule)' }}>
                      <td style={{ padding: '0.5rem 0.75rem 0.5rem 0' }}>
                        <Link href={`/property/${h.propertyId}`}>{h.ownerName ?? h.propertyId}</Link>
                        {h.ownerCount !== null && h.ownerCount > 1 && (
                          <span style={{ color: 'var(--faint)' }}> · {h.ownerCount} owners</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)' }}>{h.ownerClass}</td>
                      <td style={{
                        padding: '0.5rem 0.75rem', textAlign: 'right',
                        fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {h.cashAmountCents === null ? '—' : formatUsd(cents(h.cashAmountCents))}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)', maxWidth: '16rem' }}>
                        {h.holderName ?? '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <Link href={`/holdings?source=${encodeURIComponent(h.sourceKey ?? '')}`}>
                          {h.sourceKey ?? '—'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '0.75rem', fontSize: 'var(--fs-small)', color: 'var(--muted)' }}>
              Indexed, <strong>not workable</strong> — the pipeline above is a different
              tier and these do not appear in it. Sort and filter the full index on{' '}
              <Link href="/holdings?sort=value">Holdings</Link>, or by{' '}
              <Link href="/holdings?sort=owners">owner count</Link> and{' '}
              <Link href="/holdings?sort=holder">holder</Link>.
            </p>
          </>
        )}
      </Section>

      <Section title="What is held, and what releases it">
        <BlockedRail gates={gates} />
      </Section>

      <Section title="Measuring this">
        <p style={{ color: 'var(--muted)', fontSize: 'var(--fs-small)', maxWidth: '46rem', margin: 0 }}>
          Inventory, expected value and time-in-stage above are exact.{' '}
          <strong>Conversion rates are not computable yet</strong> — they need closed
          claims, and a “0% conversion” tile would say nothing while looking like
          bad news. Every stage transition is being recorded from today, so the
          readout arrives when there are enough to mean something.
        </p>
        <p style={{ marginTop: '0.75rem', fontSize: 'var(--fs-small)' }}>
          <Link href="/workflow">
            The full eleven-stage explainer — owners, statutes, and what each stage means →
          </Link>
        </p>
      </Section>
    </>
  )
}

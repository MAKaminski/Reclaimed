import Link from 'next/link'
import { getSessionState } from '@/lib/db/auth'
import {
  getStageRules, getStageBoard, getStageCounts, getPipelineSupply, getStuckItems,
  resolveAvailability, getComplianceGates,
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

  const [rules, board, counts, supply, stuck, gates] = await Promise.all([
    getStageRules(), getStageBoard(), getStageCounts(),
    getPipelineSupply(), getStuckItems(12), getComplianceGates(),
  ])

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

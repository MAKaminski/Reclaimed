/**
 * The claim pipeline.
 *
 * Stage rules are read from workflow_stage_rules() in the database rather than
 * duplicated here. Two copies of "who may do what" drift, and the copy that
 * drifts is always the one a reviewer reads.
 */

import { createClient } from './supabase'
import { readRegistrationState, checkRegistration } from '@/lib/compliance/registration'
import { mayTouchClaims, hasRole, type StaffMember, type StaffRole } from './auth'

export type WorkflowStage =
  | 'identified' | 'locating' | 'chain_review' | 'ready_to_contact'
  | 'contacted' | 'agreement_sent' | 'signed' | 'filed'
  | 'approved' | 'paid' | 'closed_lost'

export interface StageRule {
  stage: WorkflowStage
  step_number: number
  owner: 'Reclaimed' | 'Claimant' | 'Georgia DOR'
  action_label: string
  required_roles: StaffRole[]
  requires_designated_agent: boolean
  requires_registration: boolean
  statute: string
  detail: string
}

export interface StageAvailability {
  rule: StageRule
  /** Can the signed-in user perform this step right now? */
  permitted: boolean
  /** Why not. Empty when permitted. */
  blockers: string[]
  /** Properties currently sitting at this stage. */
  count: number
}

export interface ComplianceGate {
  gate_key: string
  gate_name: string
  statute: string
  /** What clearing this gate makes legal. */
  unlocks: string[]
  /** What it is stopping right now. Empty when already cleared. */
  blocked_today: string[]
  /** Whether the pipeline can still be exercised without it. */
  available_in_rehearsal: boolean
  penalty: string
}

export async function getComplianceGates(): Promise<ComplianceGate[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('compliance_gates')
  return (data ?? []) as unknown as ComplianceGate[]
}

export async function getStageRules(): Promise<StageRule[]> {
  const supabase = await createClient()
  // The generated RPC type does not know this function returns a set, so the
  // cast is the narrow escape hatch rather than loosening the whole client.
  const { data } = await supabase.rpc('workflow_stage_rules')
  const rules = (data ?? []) as unknown as StageRule[]
  return rules.sort((a, b) => a.step_number - b.step_number)
}

/**
 * Per-stage inventory, aggregated in the database.
 *
 * PostgREST returns bigint as a STRING (see WorkQueueRow), so every numeric
 * column here is Number()'d at the boundary rather than trusted.
 */
export interface StageBoardRow {
  stage: WorkflowStage
  property_count: number
  expected_value_cents: number
  claim_value_cents: number
  oldest_days_in_stage: number
  stale_count: number
}

export async function getStageBoard(): Promise<StageBoardRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipeline_board')
    .select('*')
    .returns<Array<Record<string, unknown>>>()

  return (data ?? []).map((r) => ({
    stage: r.stage as WorkflowStage,
    property_count: Number(r.property_count ?? 0),
    expected_value_cents: Number(r.expected_value_cents ?? 0),
    claim_value_cents: Number(r.claim_value_cents ?? 0),
    oldest_days_in_stage: Number(r.oldest_days_in_stage ?? 0),
    stale_count: Number(r.stale_count ?? 0),
  }))
}

/** Scored opportunities nobody has started. The "is my pipeline full" number. */
export interface PipelineSupply {
  unworkedCount: number
  unworkedExpectedValueCents: number
  highValueCount: number
  lastScoredAt: string | null
}

export async function getPipelineSupply(): Promise<PipelineSupply> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipeline_supply')
    .select('*')
    .maybeSingle<Record<string, unknown>>()

  return {
    unworkedCount: Number(data?.unworked_count ?? 0),
    unworkedExpectedValueCents: Number(data?.unworked_expected_value_cents ?? 0),
    highValueCount: Number(data?.high_value_count ?? 0),
    lastScoredAt: (data?.last_scored_at as string | null) ?? null,
  }
}

export interface StuckRow {
  property_id: string
  stage: WorkflowStage
  owner_name: string | null
  priority_reason: string | null
  expected_value_cents: number
  days_in_stage: number
  assigned_to: string | null
}

export async function getStuckItems(limit = 12): Promise<StuckRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipeline_stuck')
    .select('*')
    .limit(limit)
    .returns<Array<Record<string, unknown>>>()

  return (data ?? []).map((r) => ({
    property_id: String(r.property_id),
    stage: r.stage as WorkflowStage,
    owner_name: (r.owner_name as string | null) ?? null,
    priority_reason: (r.priority_reason as string | null) ?? null,
    expected_value_cents: Number(r.expected_value_cents ?? 0),
    days_in_stage: Number(r.days_in_stage ?? 0),
    assigned_to: (r.assigned_to as string | null) ?? null,
  }))
}

/**
 * Derived from the board view rather than counted in JS. Callers that only need
 * counts (the /workflow explainer, the property detail page) keep working
 * unchanged and stop reading every workflow row to do it.
 */
export async function getStageCounts(): Promise<Record<string, number>> {
  const board = await getStageBoard()
  const counts: Record<string, number> = {}
  for (const row of board) counts[row.stage] = row.property_count
  return counts
}

/**
 * Resolve, for THIS user, what they can actually do at each stage — and where
 * they cannot, exactly which condition is unmet.
 *
 * A greyed-out button with no explanation is how people conclude software is
 * broken when it is in fact refusing correctly.
 */
export function resolveAvailability(
  rules: readonly StageRule[],
  counts: Record<string, number>,
  staff: StaffMember | null,
): StageAvailability[] {
  const registration = readRegistrationState()
  const canSolicit = checkRegistration('solicit', registration)

  return rules.map((rule) => {
    const blockers: string[] = []

    if (rule.owner === 'Claimant') {
      blockers.push(
        'The claimant does this, not us. They sign by hand before a notary and post it back — ' +
          'they have no login here, and § 44-12-224(c)(7) does not permit us to sign for them.',
      )
    } else if (rule.owner === 'Georgia DOR') {
      blockers.push('Waiting on the Department. Nothing for us to do but watch the clock.')
    } else {
      if (rule.required_roles.length > 0 && !hasRole(staff, rule.required_roles)) {
        blockers.push(
          `Needs the ${rule.required_roles.join(' or ')} role. You are ${staff?.role ?? 'not staff'}.`,
        )
      }
      if (rule.requires_designated_agent && !mayTouchClaims(staff)) {
        blockers.push(
          'Only a DOR-designated agent, screened against the § 44-12-239(d) 20-year ' +
            'dishonesty bar, may file a claim. Your record shows no clearance date.',
        )
      }
      if (rule.requires_registration && !canSolicit.permitted) {
        blockers.push(`CDR registration: ${canSolicit.reason}.`)
      }
    }

    return {
      rule,
      permitted: blockers.length === 0,
      blockers,
      count: counts[rule.stage] ?? 0,
    }
  })
}

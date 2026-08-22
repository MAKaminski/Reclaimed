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

export async function getStageCounts(): Promise<Record<string, number>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('property_workflow')
    .select('stage')
    .returns<Array<{ stage: WorkflowStage }>>()

  const counts: Record<string, number> = {}
  for (const row of data ?? []) counts[row.stage] = (counts[row.stage] ?? 0) + 1
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

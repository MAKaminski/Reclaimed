'use server'

/**
 * Stage actions.
 *
 * Every one of these runs today. The only thing that waits for registration is
 * TRANSMISSION — and the three actions that transmit call assertMayTransmit()
 * rather than being hidden, so the refusal explains itself instead of leaving a
 * dead button.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/supabase'
import { getSessionState, hasRole, mayTouchClaims, CAN_WRITE } from '@/lib/db/auth'
import { assertMayTransmit, getOperatingMode } from '@/lib/compliance/operatingMode'
import type { WorkflowStage } from '@/lib/db/workflow'

export interface ActionResult {
  ok: boolean
  message: string
}

export async function advanceStage(
  propertyId: string,
  toStage: WorkflowStage,
  note?: string,
): Promise<ActionResult> {
  const { staff } = await getSessionState()
  if (!hasRole(staff, CAN_WRITE)) {
    return { ok: false, message: 'Needs the admin or analyst role.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('property_workflow')
    .upsert({ property_id: propertyId, stage: toStage, note: note ?? null })

  if (error !== null) return { ok: false, message: error.message }

  revalidatePath(`/property/${propertyId}`)
  revalidatePath('/queue')
  return { ok: true, message: `Moved to ${toStage.replace(/_/g, ' ')}.` }
}

/**
 * The three transmitting actions. Each refuses in rehearsal with the reason,
 * rather than being absent — a missing button teaches nothing.
 */
export async function sendSolicitation(propertyId: string): Promise<ActionResult> {
  const { staff } = await getSessionState()
  if (!hasRole(staff, CAN_WRITE)) return { ok: false, message: 'Needs the admin or analyst role.' }

  try {
    assertMayTransmit('post the solicitation')
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
  // Live dispatch is not wired: no mail vendor is integrated yet. See
  // docs/GO-LIVE.md — this is the remaining build, not a compliance gate.
  return {
    ok: false,
    message:
      'Registration is active, but no mail vendor is integrated yet. Download the ' +
      'letter and post it manually, then record the send.',
  }
}

export async function fileClaim(propertyId: string): Promise<ActionResult> {
  const { staff } = await getSessionState()
  if (!mayTouchClaims(staff)) {
    return {
      ok: false,
      message:
        'Only a DOR-designated agent, screened under § 44-12-239(d), may file a claim. ' +
        'Your staff record has no clearance date.',
    }
  }
  try {
    assertMayTransmit('file the claim with DOR')
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
  return {
    ok: false,
    message:
      'Registration is active, but outbound claim email is not wired yet. Download ' +
      'the packet and send it from the registered address.',
  }
}

export async function currentMode() {
  return getOperatingMode()
}

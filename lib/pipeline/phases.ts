/**
 * Funnel phases — five groupings over the eleven stages.
 *
 * WHY NOT THE OBVIOUS FOUR. The intuitive model is: fill the pipeline, reach
 * out, get the agreement signed, file the claim. That is right except in the
 * place that matters most, and it is wrong in two smaller ways.
 *
 *   1. Between "fill" and "reach out" sits PROVING WHO MAY LEGALLY SIGN, and
 *      that is the actual bottleneck, the actual product, and the actual moat.
 *      Three separate parts of this codebase already say so: build-spec §12
 *      ("the value proposition is entitlement complexity, not discovery"),
 *      pEntitlementProvable being a MULTIPLICATIVE term in the EV model — for a
 *      dissolved entity it collapses EV toward zero no matter how large the
 *      claim — and chain_submittable() being the only per-claim qualification
 *      gate in the system.
 *
 *   2. "Reach out" and "get it signed" are ONE phase. Stages 4-7 are a single
 *      continuous conversation with a single counterparty; stage 6 is the
 *      waiting beat inside it, not a separate workstream. Splitting them implies
 *      two queues where there is one.
 *
 *   3. "Fill the pipeline" is not a funnel phase at all. It is a SUPPLY METER —
 *      `pnpm ingest && pnpm score`, a job, not a human decision. Treating it as
 *      step one hides that when it is empty, nothing else on the board matters.
 *
 * Phases are expressed as step_number RANGES over the rows workflow_stage_rules()
 * already returns. Stage order is currently encoded in three places (the DB
 * enum, the SQL values list, and the NEXT map in StageActions.tsx). This must
 * not become a fourth — hence ranges rather than a name list, and a unit test
 * asserting the ranges cover 1..11 exactly once each.
 */

import type { StageRule } from '@/lib/db/workflow'

export type PhaseKey = 'find' | 'prove' | 'ask' | 'file' | 'collect'

export interface Phase {
  key: PhaseKey
  label: string
  /** The question this phase answers, in the operator's language. */
  question: string
  from: number
  to: number
}

export const PHASES: readonly Phase[] = Object.freeze([
  { key: 'find', label: 'Find', question: 'Is there anything worth working?', from: 1, to: 1 },
  { key: 'prove', label: 'Prove', question: 'Who may legally sign?', from: 2, to: 3 },
  { key: 'ask', label: 'Ask', question: 'Get the signature.', from: 4, to: 7 },
  { key: 'file', label: 'File', question: 'Get it to the Department.', from: 8, to: 8 },
  { key: 'collect', label: 'Collect', question: 'Get paid, and check the cheque.', from: 9, to: 10 },
])

/** closed_lost is an exit, not a phase. Rendered as a leak readout. */
export const TERMINAL_STEP = 11

export function phaseOf(rule: Pick<StageRule, 'step_number'>): Phase | null {
  return PHASES.find((p) => rule.step_number >= p.from && rule.step_number <= p.to) ?? null
}

export function stepsInPhase(phase: Phase): number[] {
  const out: number[] = []
  for (let n = phase.from; n <= phase.to; n += 1) out.push(n)
  return out
}

/**
 * The phase model must stay a VIEW over the stage rules, never a second copy of
 * them. Stage order already lives in three places (the workflow_stage enum, the
 * values list in workflow_stage_rules(), and the NEXT map in StageActions.tsx);
 * a fourth is how they start disagreeing.
 */

import { describe, expect, it } from 'vitest'
import { PHASES, TERMINAL_STEP, phaseOf, stepsInPhase } from '@/lib/pipeline/phases'
import { resolveNextAction } from '@/lib/pipeline/nextAction'
import type { StageAvailability, StageRule } from '@/lib/db/workflow'
import type { PipelineSupply } from '@/lib/db/workflow'

const ALL_STEPS = Array.from({ length: 11 }, (_, i) => i + 1)

describe('phases cover the eleven stages exactly once', () => {
  it('assigns every non-terminal step to exactly one phase', () => {
    for (const step of ALL_STEPS.filter((s) => s !== TERMINAL_STEP)) {
      const matches = PHASES.filter((p) => step >= p.from && step <= p.to)
      expect(matches, `step ${step} matched ${matches.length} phases`).toHaveLength(1)
    }
  })

  it('leaves the terminal step out — closed_lost is an exit, not a phase', () => {
    expect(phaseOf({ step_number: TERMINAL_STEP })).toBeNull()
  })

  it('has no gaps and no overlaps between consecutive phases', () => {
    const covered = PHASES.flatMap(stepsInPhase)
    expect(covered).toEqual([...covered].sort((a, b) => a - b))
    expect(new Set(covered).size).toBe(covered.length)
    expect(covered).toEqual(ALL_STEPS.filter((s) => s !== TERMINAL_STEP))
  })

  it('groups reach-out and agreement into ONE phase — they are one conversation', () => {
    const ask = PHASES.find((p) => p.key === 'ask')!
    expect(stepsInPhase(ask)).toEqual([4, 5, 6, 7])
  })

  it('separates proving the signer from finding the property', () => {
    // The correction that matters: identification is cheap, provable authority
    // is the moat. They must not sit in the same phase.
    expect(phaseOf({ step_number: 1 })!.key).toBe('find')
    expect(phaseOf({ step_number: 2 })!.key).toBe('prove')
    expect(phaseOf({ step_number: 3 })!.key).toBe('prove')
  })
})

// ── next action ────────────────────────────────────────────────────────────

function rule(step: number, over: Partial<StageRule> = {}): StageRule {
  return {
    stage: 'identified', step_number: step, owner: 'Reclaimed',
    action_label: `Do step ${step}`, required_roles: ['admin'],
    requires_designated_agent: false, requires_registration: false,
    statute: 'O.C.G.A. 44-12-224', detail: 'detail', ...over,
  }
}
function avail(step: number, over: Partial<StageAvailability> = {}): StageAvailability {
  return { rule: rule(step), permitted: true, blockers: [], count: 0, ...over }
}
const SUPPLY: PipelineSupply = {
  unworkedCount: 200, unworkedExpectedValueCents: 5_000_00,
  highValueCount: 30, lastScoredAt: '2026-08-20',
}

describe('the next action is never empty and never impossible', () => {
  it('says run the ingest when the board is genuinely empty', () => {
    const a = resolveNextAction({
      supply: { ...SUPPLY, unworkedCount: 0, highValueCount: 0 },
      stages: [avail(1)], scoreAgeDays: 1, registrationBlocked: true,
    })
    expect(a.kind).toBe('supply')
    expect(a.headline).toMatch(/pipeline/i)
  })

  it('does NOT send you fetching more supply while work sits on the desk', () => {
    // Regression: an earlier ordering returned "run the ingest" whenever supply
    // was zero, which told an operator holding six workable properties to go
    // and find more. The hero is the ACTION; the supply meter reports the STATE.
    const a = resolveNextAction({
      supply: { ...SUPPLY, unworkedCount: 0, highValueCount: 0 },
      stages: [avail(1, { count: 6, rule: rule(1, { action_label: 'Review and prioritise' }) })],
      scoreAgeDays: 1, registrationBlocked: true,
    })
    expect(a.kind).toBe('work')
    expect(a.headline).toContain('Review and prioritise')
    expect(a.headline).toContain('6')
  })

  it('flags stale scores before trusting any expected value', () => {
    const a = resolveNextAction({
      supply: SUPPLY, stages: [avail(1, { count: 5 })],
      scoreAgeDays: 30, registrationBlocked: true,
    })
    expect(a.headline).toMatch(/re-score/i)
    expect(a.detail).toMatch(/30 days/)
  })

  it('NEVER proposes a stage the user is not permitted to work', () => {
    const a = resolveNextAction({
      supply: SUPPLY,
      stages: [
        avail(2, { count: 14, permitted: false, blockers: ['wrong role'] }),
        avail(3, { count: 6, permitted: true, rule: rule(3, { action_label: 'Review the chain' }) }),
      ],
      scoreAgeDays: 1, registrationBlocked: true,
    })
    expect(a.headline).toContain('Review the chain')
    expect(a.headline).not.toMatch(/Do step 2/)
  })

  it('prefers the most UPSTREAM workable stage — upstream blocks downstream', () => {
    const a = resolveNextAction({
      supply: SUPPLY,
      stages: [
        avail(7, { count: 3, rule: rule(7, { action_label: 'Record the signature' }) }),
        avail(2, { count: 1, rule: rule(2, { action_label: 'Build the chain' }) }),
      ],
      scoreAgeDays: 1, registrationBlocked: true,
    })
    expect(a.headline).toContain('Build the chain')
  })

  it('falls back to filing UP-CDR1 when every stage is gated', () => {
    const a = resolveNextAction({
      supply: SUPPLY,
      stages: [avail(4, { count: 3, permitted: false, blockers: ['not registered'] })],
      scoreAgeDays: 1, registrationBlocked: true,
    })
    expect(a.kind).toBe('registration')
    expect(a.headline).toMatch(/UP-CDR1/)
    // The free screening step must be named — the fee is non-refundable.
    expect(a.detail).toMatch(/44-12-239\(d\)/)
  })

  it('always returns something actionable', () => {
    const a = resolveNextAction({
      supply: SUPPLY, stages: [], scoreAgeDays: 1, registrationBlocked: false,
    })
    expect(a.headline.length).toBeGreaterThan(0)
    expect(a.href.startsWith('/')).toBe(true)
  })
})

describe('the live database state, pinned', () => {
  // Snapshot of project cuaeplfeignnlptfugcv on 2026-08-22, read from the
  // pipeline_* views after migration 0022 was applied: 6 properties at
  // `identified` worth $1,072.50, zero unworked supply, never scored through
  // the queue. Pinned because this is the exact shape that exposed the ordering
  // bug above — supply dry while six properties sit ready to work.
  const LIVE = {
    supply: {
      unworkedCount: 0, unworkedExpectedValueCents: 0,
      highValueCount: 0, lastScoredAt: null,
    },
    counts: { identified: 6 },
    expectedValueCents: 107_250,
  }

  function liveStages(): StageAvailability[] {
    // admin, not a designated agent, unregistered — stages 1-3 workable.
    return [
      avail(1, { count: LIVE.counts.identified, rule: rule(1, { stage: 'identified', action_label: 'Review and prioritise' }) }),
      avail(2, { count: 0, rule: rule(2, { stage: 'locating', action_label: 'Build the authority chain' }) }),
      avail(3, { count: 0, rule: rule(3, { stage: 'chain_review', action_label: 'Review the chain' }) }),
      avail(4, { count: 0, permitted: false, blockers: ['CDR registration is not active'], rule: rule(4, { stage: 'ready_to_contact', requires_registration: true }) }),
      avail(8, { count: 0, permitted: false, blockers: ['not a designated agent'], rule: rule(8, { stage: 'filed', requires_registration: true, requires_designated_agent: true }) }),
    ]
  }

  it('tells the operator to work the six they have, not to fetch more', () => {
    const a = resolveNextAction({
      supply: LIVE.supply, stages: liveStages(),
      scoreAgeDays: null, registrationBlocked: true,
    })
    expect(a.kind).toBe('work')
    expect(a.headline).toBe('Review and prioritise — 6 properties')
    expect(a.href).toBe('/queue?stage=identified')
    expect(a.phase).toBe('find')
  })

  it('puts every workable property in FIND, and holds ASK and FILE', () => {
    const stages = liveStages()
    const byPhase = (key: string) =>
      stages.filter((s) => phaseOf(s.rule)?.key === key)

    expect(byPhase('find').reduce((n, s) => n + s.count, 0)).toBe(6)
    expect(byPhase('prove').reduce((n, s) => n + s.count, 0)).toBe(0)
    // Held, not hidden: the stages exist and are addressable, they just refuse.
    expect(byPhase('ask').every((s) => !s.permitted)).toBe(true)
    expect(byPhase('file').every((s) => !s.permitted)).toBe(true)
    expect(byPhase('ask')[0]!.blockers.length).toBeGreaterThan(0)
  })
})

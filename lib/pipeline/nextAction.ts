/**
 * "What should I do next?" — resolved as a pure function.
 *
 * Deliberately NOT a SQL function. Ranking what a person should do next is
 * judgement, and this codebase's convention is that judgement lives in typed,
 * unit-tested TypeScript with documented reasoning (lib/scoring/params.ts,
 * resolveAvailability) rather than inside the database where it cannot be
 * exercised in a test.
 *
 * Two rules the ranking must never break:
 *
 *   1. NEVER SUGGEST AN ACTION THIS USER CANNOT TAKE. Candidates are filtered
 *      through resolveAvailability() first, so a reviewer is told to review
 *      chains and an analyst is told to build them.
 *
 *   2. NEVER RETURN NOTHING. An empty dashboard is the state in which an
 *      operator concludes the software is broken. With no supply the answer is
 *      "run the ingest"; with supply but every stage gated the answer is "file
 *      UP-CDR1" — because the registration application is itself an action
 *      available today, and it is the one that unblocks everything else.
 */

import type { StageAvailability } from '@/lib/db/workflow'
import type { PipelineSupply } from '@/lib/db/workflow'
import { PHASES, phaseOf } from './phases'
import { THRESHOLDS } from './thresholds'

export interface NextAction {
  /** Verb-first imperative. This is the largest text on the dashboard. */
  headline: string
  /** One sentence of justification. Money, or the consequence of not acting. */
  detail: string
  /** Where the button goes. */
  href: string
  cta: string
  /** Secondary link, when a filtered list is useful alongside the primary. */
  secondary?: { label: string; href: string }
  /** Which phase this belongs to, for highlighting the rail. */
  phase: string
  kind: 'supply' | 'work' | 'registration'
}

export interface NextActionInput {
  supply: PipelineSupply
  stages: readonly StageAvailability[]
  /** Days since the last scoring run, or null if never scored. */
  scoreAgeDays: number | null
  /** Whether the operator can act on anything at all beyond registration. */
  registrationBlocked: boolean
}

const RUN_INGEST: Omit<NextAction, 'detail'> = {
  headline: 'Fill the pipeline',
  href: '/workflow',
  cta: 'How the pipeline works',
  phase: 'find',
  kind: 'supply',
}

const FILE_UPCDR1: NextAction = {
  headline: 'File UP-CDR1 with the Department of Revenue',
  detail:
    'Screen every officer, owner and claim-submitting employee under § 44-12-239(d) first — it is free, and a conviction in the last 20 years involving dishonesty disqualifies the entity. The $1,200 fee is non-refundable.',
  href: '/workflow',
  cta: 'See what registration unlocks',
  phase: 'ask',
  kind: 'registration',
}

export function resolveNextAction(input: NextActionInput): NextAction {
  const { supply, stages, scoreAgeDays, registrationBlocked } = input
  const inFlight = stages.reduce((n, s) => n + s.count, 0)

  // 1. Truly empty board — no supply AND nothing in flight.
  //
  //    Note the ordering against rule 3 below. An earlier version returned
  //    "run the ingest" whenever supply was zero, which told an operator with
  //    six properties in hand to go and fetch more. Supply exhaustion is real,
  //    but it never outranks work already sitting on the desk: the hero is the
  //    ACTION, and the supply meter underneath it reports the STATE.
  if (supply.unworkedCount === 0 && inFlight === 0) {
    return {
      ...RUN_INGEST,
      detail: 'The board is empty. Run `pnpm ingest --file <path>` then `pnpm score` to load and rank a delivery.',
    }
  }

  // 2. Stale scores make the ranking itself wrong, so this DOES outrank working
  //    the queue — re-scoring is a one-minute command that changes which item
  //    you should pick up first.
  if (scoreAgeDays !== null && scoreAgeDays > THRESHOLDS.scoreStaleAfterDays) {
    return {
      ...RUN_INGEST,
      headline: 'Re-score the queue',
      detail: `The last scoring run was ${scoreAgeDays} days ago and the DOR file is delivered weekly. Expected values below may be based on stale data.`,
    }
  }

  // 3. The most upstream stage this user can actually work, with items in it.
  //    Upstream first: a property stuck at "prove" blocks everything after it.
  const workable = stages
    .filter((s) => s.permitted && s.count > 0)
    .sort((a, b) => a.rule.step_number - b.rule.step_number)

  const target = workable[0]
  if (target !== undefined) {
    const phase = phaseOf(target.rule)
    return {
      headline: `${target.rule.action_label} — ${target.count} ${target.count === 1 ? 'property' : 'properties'}`,
      detail: target.rule.detail,
      href: `/queue?stage=${target.rule.stage}`,
      cta: 'Work the oldest',
      secondary: { label: `See all ${target.count}`, href: `/queue?stage=${target.rule.stage}` },
      phase: phase?.key ?? 'find',
      kind: 'work',
    }
  }

  // 4. Supply exists and nothing is in flight — start something.
  const entry = stages.find((s) => s.permitted && s.rule.step_number === 1)
  if (entry !== undefined) {
    return {
      headline: `Start working ${Math.min(supply.unworkedCount, supply.highValueCount || supply.unworkedCount)} scored opportunities`,
      detail:
        `${supply.unworkedCount} scored ${supply.unworkedCount === 1 ? 'property has' : 'properties have'} never been picked up. ` +
        `${supply.highValueCount} of them are above $500 expected value.`,
      href: '/queue',
      cta: 'Open the queue',
      phase: 'find',
      kind: 'work',
    }
  }

  // 5. Supply is dry and nothing is workable by this user right now.
  if (supply.unworkedCount === 0) {
    return {
      ...RUN_INGEST,
      detail: 'Nothing new is waiting to be picked up. Run `pnpm ingest` on the latest delivery and `pnpm score` to refresh the queue.',
    }
  }

  // 6. Everything this user could do is gated. Registration is the unblock.
  if (registrationBlocked) return FILE_UPCDR1

  return {
    ...RUN_INGEST,
    detail: 'Nothing is assigned to your role right now. Check the queue for work you can pick up.',
    href: '/queue',
    cta: 'Open the queue',
  }
}

export function phaseLabel(key: string): string {
  return PHASES.find((p) => p.key === key)?.label ?? key
}

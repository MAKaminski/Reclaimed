/**
 * The compliance rules engine. Rules are DATA, not code.
 *
 * Georgia is fully populated and verified. Every other state is present but
 * flagged, and is BLOCKED from all workflows until a human clears it. Any rule
 * with status !== 'verified' THROWS when a workflow touches it — a loud failure,
 * never a silent default.
 *
 * The seed's own warning is the reason: aggregator sites publishing 51-row
 * finder-fee tables were spot-checked and found materially WRONG on GA, VA, MD,
 * IN, CA and MI. A silently-defaulted cap is how you generate an over-cap
 * agreement in a state you never researched.
 */

import seed from '@/data/seed/state-rules.seed.json' with { type: 'json' }

export type RuleStatus =
  | 'verified'
  | 'researched_not_verified_for_build'
  | 'blocked'

export interface StateRules {
  code: string
  status: RuleStatus
  name?: string
  feeCapPct: number | null
  feeCapAbsolute: number | null
  capBasis?: string
  costsCountTowardCap?: boolean
  purchaseAgreementExemptFromCap?: boolean
  unenforceabilityDays?: number
  maxPropertiesPerRecoveryAgreement?: number
  maxPropertiesPerPurchaseAgreement?: number
  requiresNotary?: boolean
  ronAvailable?: boolean
  ownerMustSignPersonally?: boolean
  advanceFeesPermitted?: boolean
  registrationRequired?: boolean
  registrationFeeUsd?: number
  registrationTermYears?: number
  dataRedistributionPermitted?: boolean
  customTermsThresholdUsd?: number
  blockedHosts?: readonly string[]
  [key: string]: unknown
}

export const SUPPORTED_STATES = ['GA'] as const
export type SupportedState = (typeof SUPPORTED_STATES)[number]

export class UnverifiedStateRulesError extends Error {
  constructor(code: string, status: string) {
    super(
      `REFUSING TO PROCEED: state "${code}" has rules status "${status}", not "verified". ` +
        'No workflow may run against unverified rules. A wrong fee cap produces an ' +
        'over-cap agreement (O.C.G.A. § 44-12-224(d)(1) and equivalents), and published ' +
        'aggregator tables were found materially wrong on at least six states. ' +
        'Research the state against primary sources and set status to "verified" first.',
    )
    this.name = 'UnverifiedStateRulesError'
  }
}

export class UnknownStateError extends Error {
  constructor(code: string) {
    super(`REFUSING TO PROCEED: no rules exist for state "${code}".`)
    this.name = 'UnknownStateError'
  }
}

const RAW_STATES = seed.states as Record<string, Record<string, unknown>>

/** Every state present in the seed, verified or not. Read-only introspection. */
export function listStateRules(): StateRules[] {
  return Object.entries(RAW_STATES)
    .filter(([code]) => !code.startsWith('_'))
    .map(([code, value]) => ({ code, ...value }) as StateRules)
}

export interface Jurisdiction {
  code: string
  status: RuleStatus
  /** null means the state has NO statutory percentage cap. Never treat as zero. */
  feeCapPct: number | null
}

/**
 * All 51 jurisdictions with a status, for reporting surfaces.
 *
 * `listStateRules()` returns 24 — it filters `_`-prefixed keys, and the other 27
 * live inside the `_UNVERIFIED_NO_DATA` bucket as a bare array of codes. A map
 * built on `listStateRules()` alone silently omits half the country and reads as
 * though those states did not exist rather than as though we had not looked at
 * them. Those are very different claims to make in public.
 */
export function listAllJurisdictions(): Jurisdiction[] {
  const researched = listStateRules().map((r) => ({
    code: r.code,
    status: r.status,
    feeCapPct: r.feeCapPct,
  }))

  const bucket = RAW_STATES['_UNVERIFIED_NO_DATA'] as
    | { status?: RuleStatus; states?: readonly string[] }
    | undefined

  const unresearched = (bucket?.states ?? []).map((code) => ({
    code,
    status: bucket?.status ?? ('blocked' as RuleStatus),
    feeCapPct: null,
  }))

  return [...researched, ...unresearched].sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Fetch rules WITHOUT the verification gate. For admin/reporting surfaces only.
 * Never call this from a workflow that generates an agreement or sends anything.
 */
export function peekStateRules(code: string): StateRules | null {
  const raw = RAW_STATES[code]
  if (raw === undefined) return null
  return { code, ...raw } as StateRules
}

/**
 * The gated accessor. THIS is what every workflow must use.
 * Throws unless the state's rules are verified.
 */
export function getStateRules(code: string): StateRules {
  const raw = RAW_STATES[code]
  if (raw === undefined) throw new UnknownStateError(code)

  const status = raw.status as string | undefined
  if (status !== 'verified') {
    throw new UnverifiedStateRulesError(code, status ?? 'missing')
  }
  return { code, ...raw } as StateRules
}

export function isStateSupported(code: string): code is SupportedState {
  const raw = RAW_STATES[code]
  return raw !== undefined && raw.status === 'verified'
}

/** Seed provenance, surfaced so a stale seed is visible rather than assumed fresh. */
export function getSeedMeta(): Record<string, unknown> {
  return seed._meta as Record<string, unknown>
}

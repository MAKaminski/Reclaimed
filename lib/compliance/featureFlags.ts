/**
 * Feature flags for legally-unresolved capabilities.
 *
 * Each flag here guards an activity whose lawfulness is genuinely open. Defaults
 * are OFF, and each carries the citation you need to close the question.
 */

import type { EnvLike } from './env'

export interface FlagDefinition {
  envVar: string
  defaultValue: boolean
  /** Printed at startup when the flag is ON. */
  warning: string
}

export const ENABLE_EXTERNAL_SKIPTRACE: FlagDefinition = {
  envVar: 'ENABLE_EXTERNAL_SKIPTRACE',
  defaultValue: false,
  warning:
    'ENABLE_EXTERNAL_SKIPTRACE is ON. O.C.G.A. § 43-38-3(3)(C) defines "private ' +
    'detective business" to include obtaining information about "the location, ' +
    'disposition, or recovery of LOST or stolen property", and § 43-38-14 contains ' +
    'NO public-records exemption. The counter-argument — that § 44-12-239 is later ' +
    'and specific — is real but untested. THE RISK SHARPENS THE MOMENT YOU ' +
    'SKIP-TRACE LIVING OWNERS BEYOND MATCHING DOR\'S OWN FILE. Obtain a Georgia ' +
    'opinion letter before relying on this flag.',
}

export const ENABLE_RON_SIGNATURE: FlagDefinition = {
  envVar: 'ENABLE_RON_SIGNATURE',
  defaultValue: false,
  warning:
    'ENABLE_RON_SIGNATURE is ON. Georgia has NOT enacted general remote online ' +
    'notarization (HB 289 died 2026-04-02). DOR Policy Bulletin ADMIN-2025-03 says ' +
    'DOR will accept remote notarizations from states where RON is permitted, but ' +
    'that path is UNVERIFIED for UP-CDR2/UP-CDR4. A rejected signature VOIDS the ' +
    'claim under § 44-12-224(b). Do not enable without written DOR confirmation.',
}

export const ALL_FLAGS: readonly FlagDefinition[] = Object.freeze([
  ENABLE_EXTERNAL_SKIPTRACE,
  ENABLE_RON_SIGNATURE,
])

export function isFlagEnabled(
  flag: FlagDefinition,
  env: EnvLike = process.env,
): boolean {
  const raw = env[flag.envVar]
  if (raw === undefined || raw === '') return flag.defaultValue
  return raw === 'true' || raw === '1'
}

/** Collect startup warnings for every flag that is ON. */
export function collectFlagWarnings(
  env: EnvLike = process.env,
): string[] {
  return ALL_FLAGS.filter((f) => isFlagEnabled(f, env)).map((f) => f.warning)
}

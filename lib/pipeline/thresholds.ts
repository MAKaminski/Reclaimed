/**
 * SLA thresholds. Every value is a GUESS, and labelled as one.
 *
 * Same register as lib/scoring/params.ts: a documented guess that can be
 * corrected beats a sophisticated number nobody can audit. When there are enough
 * closed claims to compute real targets, this file becomes the config for them.
 */

export const THRESHOLDS = {
  /** Days in a stage before it reads as stalled. */
  staleAfterDays: 14,
  /** Expected value at or above which an opportunity is worth working by hand. */
  highValueCents: 50_000,
  /** Days since the last scoring run before the supply figure is untrustworthy. */
  scoreStaleAfterDays: 7,
} as const

export const THRESHOLD_BASIS: Record<keyof typeof THRESHOLDS, string> = {
  staleAfterDays: 'GUESS. No completed claims to calibrate against yet.',
  highValueCents: 'JUDGEMENT. Below the SB 403 $500 auto-pay ceiling the State often pays the owner directly, so working those by hand is usually wasted effort.',
  scoreStaleAfterDays: 'GUESS. The DOR file is delivered weekly, so a score older than one delivery may be stale.',
}

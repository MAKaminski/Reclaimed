/**
 * Brand and name restriction, O.C.G.A. § 44-12-239(g).
 *
 * A CDR "may not register under or use a business name that might lead a
 * reasonable person to conclude the representative is an agent of the United
 * States, or an agency thereof, or a state or an agency or political subdivision
 * of a state."
 *
 * Applied to: entity name, DBA, domains, email From-names, and mail envelope
 * copy. A violation is also reachable as a § 44-12-239.2(a)(5) deceptive
 * solicitation, so this guard runs in CI and at runtime.
 */

import rules from '@/data/seed/state-rules.seed.json' with { type: 'json' }

export const BRAND_DENYLIST: readonly string[] = Object.freeze([
  ...(rules.states.GA.brandDenylistSeed ?? []),
  '.gov',
])

export type BrandSurface =
  | 'entity_name'
  | 'dba'
  | 'domain'
  | 'email_from_name'
  | 'envelope_copy'

export interface BrandViolation {
  surface: BrandSurface
  value: string
  matchedTerm: string
}

export interface BrandOverride {
  /** The exact value being permitted. */
  value: string
  /** Which denylist term the override covers. */
  term: string
  /**
   * Written justification. Required and non-trivial: a deliberate choice must be
   * recorded, never silently made.
   */
  justification: string
  /** Named human accountable for the decision. */
  approvedBy: string
  approvedAt: string
}

const MIN_JUSTIFICATION_LENGTH = 40

/**
 * Normalize for matching: lowercase, and collapse the separators a brand might
 * use to smuggle a denied term past a naive substring check
 * ("Georgia-Recovery", "georgia_recovery", "GeorgiaRecovery").
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_\-.]+/g, ' ')
}

function matchesTerm(normalizedValue: string, term: string): boolean {
  const normalizedTerm = normalize(term)
  // Check both the separator-normalized form and the fully-collapsed form, so
  // "GeorgiaRecoveryLLC" is caught as well as "Georgia Recovery LLC".
  if (normalizedValue.includes(normalizedTerm)) return true
  const collapsed = normalizedValue.replace(/ /g, '')
  return collapsed.includes(normalizedTerm.replace(/ /g, ''))
}

export function checkBrandString(
  value: string,
  surface: BrandSurface,
  overrides: readonly BrandOverride[] = [],
): BrandViolation[] {
  const normalized = normalize(value)
  const violations: BrandViolation[] = []

  for (const term of BRAND_DENYLIST) {
    if (!matchesTerm(normalized, term)) continue

    const override = overrides.find(
      (o) => o.value === value && o.term === term && isValidOverride(o),
    )
    if (override) continue

    violations.push({ surface, value, matchedTerm: term })
  }
  return violations
}

export function isValidOverride(override: BrandOverride): boolean {
  return (
    typeof override.justification === 'string' &&
    override.justification.trim().length >= MIN_JUSTIFICATION_LENGTH &&
    typeof override.approvedBy === 'string' &&
    override.approvedBy.trim().length > 0 &&
    typeof override.approvedAt === 'string' &&
    !Number.isNaN(Date.parse(override.approvedAt))
  )
}

export interface BrandConfig {
  entityName?: string
  dba?: string
  domains?: readonly string[]
  emailFromNames?: readonly string[]
  envelopeCopy?: readonly string[]
  overrides?: readonly BrandOverride[]
}

export function checkBrandConfig(config: BrandConfig): BrandViolation[] {
  const overrides = config.overrides ?? []
  const violations: BrandViolation[] = []
  const push = (v: string | undefined, s: BrandSurface) => {
    if (v) violations.push(...checkBrandString(v, s, overrides))
  }

  push(config.entityName, 'entity_name')
  push(config.dba, 'dba')
  for (const d of config.domains ?? []) push(d, 'domain')
  for (const n of config.emailFromNames ?? []) push(n, 'email_from_name')
  for (const c of config.envelopeCopy ?? []) push(c, 'envelope_copy')

  return violations
}

export class BrandGuardError extends Error {
  readonly violations: BrandViolation[]
  constructor(violations: BrandViolation[]) {
    const detail = violations
      .map((v) => `  ${v.surface}: "${v.value}" contains denied term "${v.matchedTerm}"`)
      .join('\n')
    super(
      'Brand name restriction violated (O.C.G.A. § 44-12-239(g)) — a name may not ' +
        'suggest the representative is an agent of a government:\n' +
        detail,
    )
    this.name = 'BrandGuardError'
    this.violations = violations
  }
}

export function assertBrandCompliant(config: BrandConfig): void {
  const violations = checkBrandConfig(config)
  if (violations.length > 0) throw new BrandGuardError(violations)
}

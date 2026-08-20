/**
 * CI gate for §1.3 — O.C.G.A. § 44-12-239(g).
 *
 * A CDR "may not register under or use a business name that might lead a
 * reasonable person to conclude the representative is an agent of the United
 * States, or an agency thereof, or a state or an agency or political
 * subdivision of a state."
 *
 * Checks every configured brand surface: entity name, DBA, domains, email
 * From-names, and mail envelope copy. A violation is also reachable as a
 * § 44-12-239.2(a)(5) deceptive solicitation.
 *
 * Overrides are permitted but must carry a substantive written justification
 * and a named approver, so a deliberate choice is recorded rather than
 * silently made.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkBrandConfig, type BrandConfig, type BrandOverride } from '../lib/compliance/brandGuard.ts'

const ROOT = resolve(import.meta.dirname, '..')
const OVERRIDES_PATH = join(ROOT, 'data/seed/brand-overrides.json')

function fromEnv(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}

function listFromEnv(name: string): string[] {
  const value = fromEnv(name)
  return value === undefined ? [] : value.split(',').map((v) => v.trim()).filter(Boolean)
}

function main(): void {
  const overrides: BrandOverride[] = existsSync(OVERRIDES_PATH)
    ? (JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8')) as BrandOverride[])
    : []

  const config: BrandConfig = {
    entityName: fromEnv('CDR_ENTITY_NAME'),
    dba: fromEnv('CDR_DBA'),
    domains: listFromEnv('CDR_DOMAINS'),
    emailFromNames: listFromEnv('CDR_EMAIL_FROM_NAMES'),
    envelopeCopy: listFromEnv('CDR_ENVELOPE_COPY'),
    overrides,
  }

  const configured = [
    config.entityName, config.dba,
    ...(config.domains ?? []), ...(config.emailFromNames ?? []), ...(config.envelopeCopy ?? []),
  ].filter(Boolean)

  if (configured.length === 0) {
    console.log(
      '✓ §1.3 no brand strings configured yet (gate armed).\n' +
      '  Set CDR_ENTITY_NAME, CDR_DBA, CDR_DOMAINS, CDR_EMAIL_FROM_NAMES,\n' +
      '  CDR_ENVELOPE_COPY before registering — the name goes on UP-CDR1.',
    )
    return
  }

  const violations = checkBrandConfig(config)

  if (violations.length > 0) {
    console.error('\n✗ BRAND NAME RESTRICTION — O.C.G.A. § 44-12-239(g)\n')
    for (const v of violations) {
      console.error(`  ${v.surface}: "${v.value}" contains the denied term "${v.matchedTerm}"`)
    }
    console.error(
      '\n  A name may not lead a reasonable person to conclude the representative\n' +
      '  is an agent of a government. This is also reachable as a deceptive\n' +
      '  solicitation under § 44-12-239.2(a)(5), at up to $2,000 per act.\n\n' +
      '  If a term is genuinely defensible, record an override in\n' +
      `  ${OVERRIDES_PATH.replace(`${ROOT}/`, '')} with a substantive written\n` +
      '  justification and a named approver.\n',
    )
    process.exit(1)
  }

  console.log(`✓ §1.3 ${configured.length} brand string(s) clean (§ 44-12-239(g))`)
}

main()

/**
 * Load data/seed/state-rules.seed.json into the state_rules table.
 *
 * Rules are DATA, not code. Georgia is verified; every other state loads with
 * its researched status intact and is therefore BLOCKED from all workflows —
 * getStateRules() throws on anything that is not 'verified'.
 *
 * The seed's own warning is the reason to be careful here: aggregator sites
 * publishing 51-row finder-fee tables were spot-checked and found MATERIALLY
 * WRONG on GA, VA, MD, IN, CA and MI. A silently-defaulted cap is how an
 * over-cap agreement gets generated in a state nobody researched.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getSql, closeSql } from '../lib/db/client.ts'

const ROOT = resolve(import.meta.dirname, '..')

interface SeedState {
  status?: string
  name?: string
  feeCapPct?: number | null
  feeCapAbsolute?: number | null
  costsCountTowardCap?: boolean
  capBasis?: string
  capCitation?: string
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
  payeeModel?: string
  customTermsThresholdUsd?: number
  verifiedAt?: string
  [key: string]: unknown
}

const VALID_STATUSES = new Set([
  'verified', 'researched_not_verified_for_build', 'blocked',
])

function usdToCents(usd: number | null | undefined): number | null {
  if (usd === null || usd === undefined) return null
  return Math.round(usd * 100)
}

async function main(): Promise<void> {
  const seed = JSON.parse(
    readFileSync(resolve(ROOT, 'data/seed/state-rules.seed.json'), 'utf8'),
  ) as { states: Record<string, SeedState>; _meta: Record<string, unknown> }

  const sql = getSql()
  let loaded = 0
  let verified = 0
  let blocked = 0

  try {
    for (const [code, state] of Object.entries(seed.states)) {
      // The _UNVERIFIED_NO_DATA bucket is a list of states, not a state.
      if (code.startsWith('_')) {
        const bucket = state.states as string[] | undefined
        for (const bucketCode of bucket ?? []) {
          await sql`
            insert into state_rules (code, status, raw)
            values (${bucketCode}, 'blocked', ${JSON.stringify({
              note: state.note ?? 'No primary-source confirmation. Any workflow touching this MUST throw.',
            })}::jsonb)
            on conflict (code) do update set
              status = 'blocked', raw = excluded.raw, loaded_at = now()
          `
          loaded++; blocked++
        }
        continue
      }

      const status = VALID_STATUSES.has(state.status ?? '')
        ? state.status!
        : 'blocked'

      if (status === 'verified') verified++
      else blocked++

      await sql`
        insert into state_rules (
          code, status, name, fee_cap_pct, fee_cap_absolute_cents,
          costs_count_toward_cap, cap_basis, unenforceability_days,
          max_properties_per_recovery_agreement, max_properties_per_purchase_agreement,
          requires_notary, ron_available, owner_must_sign_personally,
          advance_fees_permitted, registration_required, registration_fee_cents,
          registration_term_years, data_redistribution_permitted, payee_model,
          custom_terms_threshold_cents, raw, citation, verified_at
        ) values (
          ${code},
          ${status}::rule_status,
          ${state.name ?? null},
          ${state.feeCapPct ?? null},
          ${usdToCents(state.feeCapAbsolute)},
          ${state.costsCountTowardCap ?? null},
          ${state.capBasis ?? null},
          ${state.unenforceabilityDays ?? null},
          ${state.maxPropertiesPerRecoveryAgreement ?? null},
          ${state.maxPropertiesPerPurchaseAgreement ?? null},
          ${state.requiresNotary ?? null},
          ${state.ronAvailable ?? null},
          ${state.ownerMustSignPersonally ?? null},
          ${state.advanceFeesPermitted ?? null},
          ${state.registrationRequired ?? null},
          ${usdToCents(state.registrationFeeUsd)},
          ${state.registrationTermYears ?? null},
          ${state.dataRedistributionPermitted ?? null},
          ${state.payeeModel ?? null},
          ${usdToCents(state.customTermsThresholdUsd)},
          ${JSON.stringify(state)}::jsonb,
          ${state.capCitation ?? null},
          ${state.verifiedAt ?? null}
        )
        on conflict (code) do update set
          status = excluded.status,
          name = excluded.name,
          fee_cap_pct = excluded.fee_cap_pct,
          fee_cap_absolute_cents = excluded.fee_cap_absolute_cents,
          costs_count_toward_cap = excluded.costs_count_toward_cap,
          cap_basis = excluded.cap_basis,
          unenforceability_days = excluded.unenforceability_days,
          max_properties_per_recovery_agreement = excluded.max_properties_per_recovery_agreement,
          max_properties_per_purchase_agreement = excluded.max_properties_per_purchase_agreement,
          requires_notary = excluded.requires_notary,
          ron_available = excluded.ron_available,
          owner_must_sign_personally = excluded.owner_must_sign_personally,
          advance_fees_permitted = excluded.advance_fees_permitted,
          registration_required = excluded.registration_required,
          registration_fee_cents = excluded.registration_fee_cents,
          registration_term_years = excluded.registration_term_years,
          data_redistribution_permitted = excluded.data_redistribution_permitted,
          payee_model = excluded.payee_model,
          custom_terms_threshold_cents = excluded.custom_terms_threshold_cents,
          raw = excluded.raw,
          citation = excluded.citation,
          verified_at = excluded.verified_at,
          loaded_at = now()
      `
      loaded++
    }

    console.log(`✓ ${loaded} state rule rows loaded`)
    console.log(`  ${verified} verified (workflows permitted)`)
    console.log(`  ${blocked} blocked (any workflow touching these MUST throw)`)
    console.log(`\n  Seed researched ${String(seed._meta.researchedAt)}`)
    console.log(`  Recheck cadence: ${String(seed._meta.recheckCadence)}`)
  } finally {
    await closeSql()
  }
}

await main()

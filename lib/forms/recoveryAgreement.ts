/**
 * UP-CDR2 Standard Recovery Agreement generation.
 *
 * § 44-12-224(b): "the failure of a claimant's designated representative to use
 * such agreement or agreements as required by this subsection SHALL VOID the
 * claimant's designated representative's claim."
 *
 * It voids OUR claim, not the claimant's own right to the property — but it is
 * still total loss to us. So every gate below throws rather than warns.
 *
 * We fill the ACTUAL DOR PDF. The form is never re-typeset: its hash is pinned
 * in CI (`pnpm verify:forms`) so a DOR revision breaks the build instead of
 * silently producing void claims. DOR last revised UP-CDR2 on 2025-04-09.
 */

import { PDFDocument } from 'pdf-lib'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

import { type Cents, formatAmount, formatUsd } from '@/lib/compliance/money'
import {
  computeFee, computePathBSplit, assertFeeAgreementEligible,
  type FeeComputation,
} from '@/lib/compliance/computeFee'
import { assertRegistered, type RegistrationState } from '@/lib/compliance/registration'
import { getStateRules } from '@/lib/compliance/stateRules'
import { assertChainSubmittable, type AuthorityLink } from '@/lib/locate/authorityChain'
import { UP_CDR2_FIELDS, MAX_PROPERTIES_RECOVERY } from './fieldMaps'

const ROOT = resolve(import.meta.dirname, '../..')

export interface AgreementProperty {
  propertyId: string
  /** Amount as reported by the holder. Null when no value was reported. */
  reportedValueCents: Cents | null
}

export interface ClaimantDetails {
  name: string
  phone: string
  /**
   * WRITE-LOCKED (§1.9). This is the address DOR pays to. Every criminal
   * prosecution in this industry involved redirecting it. It must be the
   * claimant's own address, never one we control.
   */
  mailingAddress: string
  email: string
  taxId: string
}

export interface CdrDetails {
  name: string
  agentName: string
  identificationNumber: string
  address: string
  agentEmail: string
  agentPhone: string
}

export interface BuildAgreementInput {
  properties: readonly AgreementProperty[]
  claimant: ClaimantDetails
  coClaimant?: ClaimantDetails
  cdr: CdrDetails
  /** Costs we intend to recover. Counts INSIDE the 30% cap. */
  costsCents: Cents
  /** Fee percentage. Strategic per claim — § 44-12-220(g), lowest fee wins. */
  feePct: number
  /** Custom terms, if any. Triggers the UP-CDR3 addendum. */
  customTerms?: string
  /** The authority chain for these properties. */
  authorityLinks: readonly AuthorityLink[]
  registration?: RegistrationState
}

export interface AgreementArtifact {
  pdfBytes: Uint8Array
  /** Frozen snapshot. A historical agreement must render exactly as signed. */
  snapshot: AgreementSnapshot
  /** True when UP-CDR3 must be attached. */
  requiresAddendum: boolean
}

export interface AgreementSnapshot {
  formId: 'UP-CDR2'
  formSha256: string
  rulesVersion: string
  feeComputation: FeeComputation
  path: 'A' | 'B'
  pathBSplit: { cdrPct: number; claimantPct: number } | null
  propertyIds: string[]
  totalReportedValueCents: Cents | null
  claimantMailingAddress: string
  cdrIdentificationNumber: string
  generatedAt: string
}

export class AgreementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgreementError'
  }
}

function loadForm(formId: string): { bytes: Buffer; sha256: string } {
  const bytes = readFileSync(join(ROOT, 'data/forms', `${formId}.pdf`))
  const pinned = JSON.parse(
    readFileSync(join(ROOT, 'data/seed/form-hashes.json'), 'utf8'),
  ) as Record<string, { sha256: string }>

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const expected = pinned[formId]?.sha256

  if (expected !== undefined && expected !== sha256) {
    throw new AgreementError(
      `REFUSING TO GENERATE: ${formId} on disk does not match the pinned hash.\n` +
        `  pinned ${expected}\n  actual ${sha256}\n` +
        'DOR may have revised the form. Using a superseded form VOIDS the claim ' +
        '(§ 44-12-224(b)). Run `pnpm verify:forms` and re-check the layout.',
    )
  }
  return { bytes, sha256 }
}

/**
 * Every gate that must pass before a Recovery Agreement may exist.
 * Ordered cheapest-first so failures are fast and specific.
 */
export function assertAgreementPermitted(input: BuildAgreementInput): void {
  const rules = getStateRules('GA')

  // §1.4 — registration. Also checks the CDR Identification Number is present.
  assertRegistered('generate_agreement', input.registration)

  if (input.properties.length === 0) {
    throw new AgreementError('REFUSING TO GENERATE: no properties on the agreement.')
  }

  // Form UP-CDR2 has exactly 15 property rows.
  if (input.properties.length > MAX_PROPERTIES_RECOVERY) {
    throw new AgreementError(
      `REFUSING TO GENERATE: ${input.properties.length} properties exceeds the ` +
        `${MAX_PROPERTIES_RECOVERY}-property limit of form UP-CDR2. Split into ` +
        'multiple agreements — and note that no property may be added to a form ' +
        'after it has been received, so the property set is immutable once sent.',
    )
  }

  const ids = input.properties.map((p) => p.propertyId)
  if (new Set(ids).size !== ids.length) {
    throw new AgreementError('REFUSING TO GENERATE: duplicate property IDs on the agreement.')
  }

  // §7.3 — the authority chain. The most safety-critical gate here.
  assertChainSubmittable(ids.join(','), input.authorityLinks)

  // § 44-12-224(c)(6) — the CDR Identification Number.
  if (input.cdr.identificationNumber.trim() === '') {
    throw new AgreementError(
      'REFUSING TO GENERATE: no CDR Identification Number. § 44-12-224(c)(6) ' +
        'requires it on every agreement, and § 44-12-224(b) voids a defective one.',
    )
  }

  // §6.2 — custom terms. The $2,000 threshold is PERMISSION to add terms, not
  // merely a trigger for the addendum. At or below it, terms may not be added.
  if (input.customTerms !== undefined && input.customTerms.trim() !== '') {
    const threshold = (rules.customTermsThresholdUsd as number) * 100
    const total = totalReportedValue(input.properties)
    if (total === null) {
      throw new AgreementError(
        'REFUSING TO GENERATE: custom terms require a known total value to test ' +
          'the $2,000 threshold of § 44-12-224(g)(1), and the holder reported none.',
      )
    }
    if (total <= threshold) {
      throw new AgreementError(
        `REFUSING TO GENERATE: custom terms are not permitted at or below $2,000 ` +
          `(total ${formatUsd(total)}). § 44-12-224(g)(1) permits additional terms ` +
          'only where the value EXCEEDS $2,000. This is a hard block, not a warning.',
      )
    }
  }

  // §1.9 — the claimant's address is what DOR pays to. Never ours.
  const claimantAddress = input.claimant.mailingAddress.trim()
  if (claimantAddress === '') {
    throw new AgreementError('REFUSING TO GENERATE: claimant mailing address is empty.')
  }
  if (normalise(claimantAddress) === normalise(input.cdr.address)) {
    throw new AgreementError(
      'REFUSING TO GENERATE: the claimant mailing address matches the CDR address. ' +
        'DOR pays the claimant directly at this address (§ 44-12-220(d)(3)). ' +
        'Redirecting it is the conduct behind every criminal prosecution in this ' +
        'industry.',
    )
  }
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function totalReportedValue(
  properties: readonly AgreementProperty[],
): Cents | null {
  // Null if ANY property has no reported value: the form's Path A asks for a
  // total, and a total that silently omits a property would misstate it.
  if (properties.some((p) => p.reportedValueCents === null)) return null
  return properties.reduce(
    (sum, p) => (sum + (p.reportedValueCents ?? 0)) as Cents,
    0 as Cents,
  )
}

export async function buildRecoveryAgreement(
  input: BuildAgreementInput,
): Promise<AgreementArtifact> {
  assertAgreementPermitted(input)

  const rules = getStateRules('GA')
  const feeCapPct = rules.feeCapPct as number
  const { bytes, sha256 } = loadForm('UP-CDR2')

  const totalValue = totalReportedValue(input.properties)
  const claimedAmount = totalValue ?? (0 as Cents)

  const fee = computeFee({
    claimedAmount,
    propertyValue: totalValue,
    costs: input.costsCents,
    requestedFeePct: input.feePct,
    feeCapPct,
  })
  assertFeeAgreementEligible(fee, feeCapPct, 'GA')

  const usePathB = fee.requiresPathB
  const pathBSplit = usePathB
    ? computePathBSplit(input.feePct, feeCapPct)
    : null

  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = pdf.getForm()

  const set = (name: string, value: string): void => {
    try {
      form.getTextField(name).setText(value)
    } catch (error) {
      throw new AgreementError(
        `Failed to set UP-CDR2 field "${name}": ${(error as Error).message}. ` +
          'The form layout may have changed — run `pnpm discover:fields`.',
      )
    }
  }

  // §I — properties. The form has exactly 15 rows; the limit is physical.
  input.properties.forEach((property, index) => {
    const row = index + 1
    set(UP_CDR2_FIELDS.propertyIdRow(row), property.propertyId)
    set(
      UP_CDR2_FIELDS.propertyAmountRow(row),
      property.reportedValueCents === null
        ? 'No value reported'
        : formatAmount(property.reportedValueCents),
    )
  })

  // §II — Path A or Path B, never both.
  if (usePathB) {
    // § 44-12-224(c)(3): where the holder reported no value, state a PERCENTAGE
    // of net value rather than a dollar figure. B1 + B2 must equal 100.
    set(UP_CDR2_FIELDS.pathB.cdrPercent, pathBSplit!.cdrPct.toFixed(2))
    set(UP_CDR2_FIELDS.pathB.claimantPercent, pathBSplit!.claimantPct.toFixed(2))
  } else {
    // These cells print their own "$" on the form.
    set(UP_CDR2_FIELDS.pathA.totalValue, formatAmount(totalValue!))
    set(UP_CDR2_FIELDS.pathA.feePercent, fee.feePct.toFixed(2))
    set(UP_CDR2_FIELDS.pathA.feesAndCosts, formatAmount(fee.feeDollars))
    set(UP_CDR2_FIELDS.pathA.netToClaimant, formatAmount(fee.netToClaimant))
  }

  // §III — claimant.
  set(UP_CDR2_FIELDS.claimant.name, input.claimant.name)
  set(UP_CDR2_FIELDS.claimant.phone, input.claimant.phone)
  set(UP_CDR2_FIELDS.claimant.mailingAddress, input.claimant.mailingAddress)
  set(UP_CDR2_FIELDS.claimant.email, input.claimant.email)
  set(UP_CDR2_FIELDS.claimant.taxId, input.claimant.taxId)

  if (input.coClaimant !== undefined) {
    set(UP_CDR2_FIELDS.coClaimant.name, input.coClaimant.name)
    set(UP_CDR2_FIELDS.coClaimant.phone, input.coClaimant.phone)
    set(UP_CDR2_FIELDS.coClaimant.mailingAddress, input.coClaimant.mailingAddress)
    set(UP_CDR2_FIELDS.coClaimant.email, input.coClaimant.email)
    set(UP_CDR2_FIELDS.coClaimant.taxId, input.coClaimant.taxId)
  }

  // §IV — CDR block, entirely from config.
  set(UP_CDR2_FIELDS.cdr.name, input.cdr.name)
  set(UP_CDR2_FIELDS.cdr.agentName, input.cdr.agentName)
  set(UP_CDR2_FIELDS.cdr.identificationNumber, input.cdr.identificationNumber)
  set(UP_CDR2_FIELDS.cdr.address, input.cdr.address)
  set(UP_CDR2_FIELDS.cdr.agentEmail, input.cdr.agentEmail)
  set(UP_CDR2_FIELDS.cdr.agentPhone, input.cdr.agentPhone)

  // The claimant signs by hand and the form is notarised. We never pre-fill a
  // signature: § 44-12-224(c)(7) requires the claimant's own MANUAL signature
  // affixed by the claimant.

  const pdfBytes = await pdf.save()

  // § 44-12-224(g)(1): the addendum is required where custom terms exist AND
  // the value exceeds $2,000. Below that, assertAgreementPermitted already threw.
  const requiresAddendum =
    input.customTerms !== undefined && input.customTerms.trim() !== ''

  return {
    pdfBytes,
    requiresAddendum,
    snapshot: {
      formId: 'UP-CDR2',
      formSha256: sha256,
      rulesVersion: String(rules.verifiedAt ?? 'unknown'),
      feeComputation: fee,
      path: usePathB ? 'B' : 'A',
      pathBSplit,
      propertyIds: input.properties.map((p) => p.propertyId),
      totalReportedValueCents: totalValue,
      claimantMailingAddress: input.claimant.mailingAddress,
      cdrIdentificationNumber: input.cdr.identificationNumber,
      generatedAt: new Date().toISOString(),
    },
  }
}

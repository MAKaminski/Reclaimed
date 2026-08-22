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

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

import { type Cents, add, cents, formatAmount, formatUsd } from '@/lib/compliance/money'
import {
  computeFee, computePathBSplit, assertFeeAgreementEligible,
  type FeeComputation,
} from '@/lib/compliance/computeFee'
import { assertRegistered, type RegistrationState } from '@/lib/compliance/registration'
import { isRehearsal, REHEARSAL_WATERMARK } from '@/lib/compliance/operatingMode'
import { getStateRules } from '@/lib/compliance/stateRules'
import { assertChainSubmittable, type AuthorityLink, type ClaimShape } from '@/lib/locate/authorityChain'
import { assertPayeeAddresses } from '@/lib/compliance/payeeAddress'
import { computeEnforceability, windowAppliesToAgreement, type DeliveryDate } from '@/lib/compliance/windows'
import { UP_CDR2_FIELDS, MAX_PROPERTIES_RECOVERY } from './fieldMaps'

const ROOT = resolve(import.meta.dirname, '../..')

export interface AgreementProperty {
  propertyId: string
  /** Amount as reported by the holder. Null when no value was reported. */
  reportedValueCents: Cents | null
  /**
   * When the holder delivered the property to the commissioner, at whatever
   * precision the bulk file provided. Drives the § 44-12-220(d.1)(4) 120-day
   * unenforceability window.
   */
  delivery?: DeliveryDate
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
  /**
   * Shape of the claim, so the chain is checked for COMPLETENESS and not merely
   * internal consistency. Omitting it means a lone individual_identity link can
   * satisfy an entity-owned claim.
   */
  claimShape?: ClaimShape
  /**
   * Every other address the CDR controls — agents, offices, mail services,
   * previously-used drops. Each is a redirect vector, so each is denylisted
   * from any payee field. §1.9.
   */
  cdrControlledAddresses?: readonly string[]
  registration?: RegistrationState
}

export interface AgreementArtifact {
  pdfBytes: Uint8Array
  /** True when generated before registration: practice only, never to be posted. */
  isRehearsal: boolean
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

  // A MISSING pin used to mean NO CHECK — the generator would fill whatever PDF
  // happened to be on disk. Combined with verify-forms.ts being able to drop a
  // pin after a failed fetch, one flaky network call converted the § 44-12-224(b)
  // tripwire into a silent auto-accept.
  if (expected === undefined) {
    throw new AgreementError(
      `REFUSING TO GENERATE: no pinned hash for ${formId}. An unpinned form is an ` +
        'unverified form, and using a superseded one VOIDS the claim ' +
        '(§ 44-12-224(b)). Run `pnpm verify:forms` and review the layout before ' +
        'pinning.',
    )
  }

  if (expected !== sha256) {
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

  // Registration is NOT checked here. Generating an agreement transmits nothing
  // and reaches nobody, so it is product rather than compliance — and being able
  // to rehearse the whole pipeline before registration is the point. What IS
  // gated is POSTING it, enforced at the send path by assertMayTransmit().
  //
  // The CDR Identification Number is still required on any LIVE agreement, and
  // that is checked below.

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

  // §7.3 — the authority chain. The most safety-critical gate here. The shape
  // is passed so completeness is checked, not just internal consistency.
  assertChainSubmittable(
    ids.join(','),
    input.authorityLinks,
    undefined,
    input.claimShape,
  )

  // § 44-12-224(c)(6) — the CDR Identification Number. Required on a LIVE
  // agreement. In rehearsal there is no number yet by definition, so a
  // placeholder is accepted and the artifact is watermarked instead.
  if (!isRehearsal(input.registration) && input.cdr.identificationNumber.trim() === '') {
    throw new AgreementError(
      'REFUSING TO GENERATE a live agreement without a CDR Identification Number. ' +
        '§ 44-12-224(c)(6) requires it, and § 44-12-224(b) voids a defective agreement.',
    )
  }

  // §6.2 — custom terms. The $2,000 threshold is PERMISSION to add terms, not
  // merely a trigger for the addendum. At or below it, terms may not be added.
  if (input.customTerms !== undefined && input.customTerms.trim() !== '') {
    const thresholdUsd = rules.customTermsThresholdUsd
    if (typeof thresholdUsd !== 'number' || !Number.isFinite(thresholdUsd)) {
      throw new AgreementError(
        'REFUSING TO GENERATE: the § 44-12-224(g)(1) custom-terms threshold is ' +
          `missing or unreadable (${JSON.stringify(thresholdUsd)}). A NaN threshold ` +
          'makes every comparison false, which would permit custom terms at ANY value.',
      )
    }
    const threshold = thresholdUsd * 100
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

  // §1.6 — the 120-day unenforceability window, § 44-12-220(d.1)(4).
  //
  // This was previously computed in lib/compliance/windows.ts and referenced
  // ONLY from tests. The workable view filtered on it, but nothing on the
  // agreement path re-checked — so an agreement could be generated against a
  // property inside the window, which SB 403 makes unenforceable for 120 days.
  // Unenforceable means the work is done for nothing.
  if (windowAppliesToAgreement(new Date())) {
    const inside = input.properties.filter((property) => {
      const delivery = property.delivery ?? { precision: 'unknown' as const }
      return computeEnforceability(delivery).insideWindow
    })
    if (inside.length > 0) {
      throw new AgreementError(
        `REFUSING TO GENERATE: ${inside.length} propert${inside.length === 1 ? 'y is' : 'ies are'} ` +
          `inside the 120-day unenforceability window (§ 44-12-220(d.1)(4)): ` +
          `${inside.map((p) => p.propertyId).join(', ')}. ` +
          'An agreement entered into during the window is UNENFORCEABLE, so the ' +
          'work would be done for nothing. Where the delivery date is unknown or ' +
          'year-precise this resolves conservatively — supply an exact delivery ' +
          'date to narrow it. TODO(DOR-CONFIRM-120).',
      )
    }
  }

  // §1.9 — EVERY payee address is what DOR pays to. Never ours.
  //
  // This originally checked only the primary claimant. UP-CDR2 §III has a
  // SECOND address block (co-claimant, form field "8 Mailing Address") which was
  // written to the PDF unvalidated — a complete bypass of the single most
  // safety-critical check in the system. Both blocks now go through the same
  // gate, which also catches unit-suffix evasion ("… Ste 2") and flags PO boxes
  // and mail drops for a named human.
  const payees = [{ address: input.claimant.mailingAddress, label: 'Claimant' }]
  if (input.coClaimant !== undefined) {
    payees.push({ address: input.coClaimant.mailingAddress, label: 'Co-claimant' })
  }
  assertPayeeAddresses(payees, input.cdr.address, input.cdrControlledAddresses ?? [])
}

export function totalReportedValue(
  properties: readonly AgreementProperty[],
): Cents | null {
  // Null if ANY property has no reported value: the form's Path A asks for a
  // total, and a total that silently omits a property would misstate it.
  if (properties.some((p) => p.reportedValueCents === null)) return null
  // Through add(), not raw `+` with a cast: the branded constructor is what
  // enforces "integer cents only" (§8), and a cast skips it.
  return properties.reduce(
    (sum, p) => add(sum, p.reportedValueCents ?? cents(0)),
    cents(0),
  )
}

export async function buildRecoveryAgreement(
  input: BuildAgreementInput,
): Promise<AgreementArtifact> {
  assertAgreementPermitted(input)

  const rules = getStateRules('GA')
  const feeCapPct = rules.feeCapPct
  if (typeof feeCapPct !== 'number' || !Number.isFinite(feeCapPct)) {
    throw new AgreementError(
      `REFUSING TO GENERATE: the Georgia fee cap is missing or unreadable ` +
        `(${JSON.stringify(feeCapPct)}). A NaN cap makes every comparison false.`,
    )
  }
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

  // § 44-12-224(c)(2) requires the disclosure to state the total percentage of
  // all authorized FEES AND COSTS. Path A already used the cost-inclusive
  // fee.feePct; Path B used the RAW requested percentage, so a CDR recovering
  // costs on top disclosed a percentage lower than it intended to take, and the
  // frozen snapshot recorded costs as zero — the audit record actively hid it.
  //
  // Where the holder reported no value there is no dollar basis to compute a
  // cost percentage against, so costs cannot be silently folded in. They must be
  // waived on this path, or the property valued first.
  if (usePathB && input.costsCents > 0) {
    throw new AgreementError(
      `REFUSING TO GENERATE: UP-CDR2 Path B states a PERCENTAGE of net value ` +
        `(§ 44-12-224(c)(3)) because the holder reported no value — so there is ` +
        `no dollar basis against which ${formatUsd(input.costsCents)} of costs ` +
        'can be expressed. § 44-12-224(c)(2) requires the disclosed percentage to ' +
        'cover fees AND costs. Either waive costs on this claim, or establish the ' +
        "property's value and use Path A.",
    )
  }

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

  // ── Rehearsal watermark ──────────────────────────────────────────────────
  // A rehearsal agreement is otherwise indistinguishable from a real one. If it
  // were printed and posted it WOULD be an unregistered solicitation, so the
  // mark goes into the page content on every page, not into metadata.
  const rehearsal = isRehearsal(input.registration)
  if (rehearsal) {
    const font = await pdf.embedFont(StandardFonts.HelveticaBold)
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize()
      page.drawText(REHEARSAL_WATERMARK, {
        x: 40,
        y: height / 2,
        size: 22,
        font,
        color: rgb(0.85, 0.1, 0.1),
        opacity: 0.28,
        rotate: degrees(32),
        maxWidth: width - 80,
        lineHeight: 26,
      })
    }
  }

  const pdfBytes = await pdf.save()

  // § 44-12-224(g)(1): the addendum is required where custom terms exist AND
  // the value exceeds $2,000. Below that, assertAgreementPermitted already threw.
  const requiresAddendum =
    input.customTerms !== undefined && input.customTerms.trim() !== ''

  return {
    pdfBytes,
    isRehearsal: rehearsal,
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

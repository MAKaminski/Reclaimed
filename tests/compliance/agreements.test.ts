/**
 * UP-CDR2 agreement generation — build spec §6.
 *
 * § 44-12-224(b): using the wrong agreement, or a defective one, VOIDS the
 * representative's claim. Every assertion here is a way that could happen.
 */

import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  buildRecoveryAgreement, assertAgreementPermitted, totalReportedValue,
  AgreementError, type BuildAgreementInput,
} from '@/lib/forms/recoveryAgreement'
import { UP_CDR2_FIELDS, UP_CDR4_FIELDS, MAX_PROPERTIES_RECOVERY, MAX_PROPERTIES_PURCHASE } from '@/lib/forms/fieldMaps'
import { dollarsToCents, cents } from '@/lib/compliance/money'
import type { AuthorityLink } from '@/lib/locate/authorityChain'
import type { RegistrationState } from '@/lib/compliance/registration'

const ACTIVE: RegistrationState = {
  status: 'active',
  registrationNumber: 'CDR-000123',
  expiresAt: new Date('2030-01-01'),
}

function chain(): AuthorityLink[] {
  return [1, 2, 3, 4].map((sequence) => ({
    sequence,
    linkType: 'owner_name_to_entity' as const,
    fromRef: null, toRef: null,
    evidenceDocumentId: `doc-${sequence}`,
    evidenceInvalidated: false,
    confidence: 0.9,
    reviewStatus: 'reviewed' as const,
    entityStatus: 'active' as const,
    assertedBy: 'staff-1',
    reviewedBy: 'staff-2',
  }))
}

function agreement(overrides: Partial<BuildAgreementInput> = {}): BuildAgreementInput {
  return {
    properties: [{ propertyId: 'GA0000001', reportedValueCents: dollarsToCents(48_500), delivery: DELIVERED }],
    claimant: {
      name: 'PEACHTREE VENTURES, LLC',
      phone: '404-555-0100',
      mailingAddress: '120 Peachtree St NE, Atlanta, GA 30303',
      email: 'owner@example.test',
      taxId: '58-1234567',
    },
    cdr: {
      name: 'Reclaimed Holdings LLC',
      agentName: 'Michael Kaminski',
      identificationNumber: 'CDR-000123',
      address: '900 Recovery Way, Decatur, GA 30030',
      agentEmail: 'claims@reclaimed.example',
      agentPhone: '404-555-0199',
    },
    costsCents: dollarsToCents(45),
    feePct: 30,
    authorityLinks: chain(),
    registration: ACTIVE,
    ...overrides,
  }
}

/**
 * Delivery well outside the § 44-12-220(d.1)(4) 120-day window.
 * Agreement generation refuses a property inside it, and an unknown delivery
 * date resolves conservatively as inside — so a fixture must state one.
 */
const DELIVERED = { precision: 'exact' as const, date: new Date('2020-01-15T00:00:00Z') }

describe('§6.1 the form limits are physical, and enforced', () => {
  it('mirrors the statutory 15 / 5 property limits', () => {
    expect(MAX_PROPERTIES_RECOVERY).toBe(15)
    expect(MAX_PROPERTIES_PURCHASE).toBe(5)
  })

  it('accepts exactly 15 properties on UP-CDR2', () => {
    const properties = Array.from({ length: 15 }, (_, i) => ({
      propertyId: `GA${String(i).padStart(7, '0')}`,
      reportedValueCents: dollarsToCents(1_000),
      delivery: DELIVERED,
    }))
    expect(() => assertAgreementPermitted(agreement({ properties }))).not.toThrow()
  })

  it('REFUSES a 16th property — UP-CDR2 has no row for it', () => {
    const properties = Array.from({ length: 16 }, (_, i) => ({
      propertyId: `GA${String(i).padStart(7, '0')}`,
      reportedValueCents: dollarsToCents(1_000),
      delivery: DELIVERED,
    }))
    expect(() => assertAgreementPermitted(agreement({ properties })))
      .toThrow(/15-property limit/)
  })

  it('the field map itself refuses row 16 and row 6', () => {
    expect(() => UP_CDR2_FIELDS.propertyAmountRow(16)).toThrow(RangeError)
    expect(() => UP_CDR4_FIELDS.propertyAmountRow(6)).toThrow(RangeError)
  })

  it('refuses an empty or duplicated property set', () => {
    expect(() => assertAgreementPermitted(agreement({ properties: [] }))).toThrow(/no properties/)
    expect(() => assertAgreementPermitted(agreement({
      properties: [
        { propertyId: 'GA1', reportedValueCents: dollarsToCents(100), delivery: DELIVERED },
        { propertyId: 'GA1', reportedValueCents: dollarsToCents(100), delivery: DELIVERED },
      ],
    }))).toThrow(/duplicate/)
  })
})

describe('§1.4 registration gates SENDING, not generating', () => {
  const unregistered: RegistrationState = {
    status: 'unregistered', registrationNumber: null, expiresAt: null,
  }

  it('PERMITS generating an agreement while unregistered — it transmits nothing', () => {
    // Generating reaches no owner and no Department, so it is product rather
    // than compliance. Being able to rehearse the whole pipeline before
    // registration is the point.
    expect(() => assertAgreementPermitted(agreement({ registration: unregistered })))
      .not.toThrow()
  })

  it('marks an unregistered agreement as a REHEARSAL', async () => {
    const artifact = await buildRecoveryAgreement(agreement({ registration: unregistered }))
    expect(artifact.isRehearsal).toBe(true)
  })

  it('marks a registered agreement as live', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    expect(artifact.isRehearsal).toBe(false)
  })

  it('accepts a placeholder CDR number in rehearsal — there is no real one yet', () => {
    const draft = agreement({ registration: unregistered })
    draft.cdr = { ...draft.cdr, identificationNumber: '   ' }
    expect(() => assertAgreementPermitted(draft)).not.toThrow()
  })

  it('REFUSES a LIVE agreement without a CDR Identification Number — § 44-12-224(c)(6)', () => {
    const noNumber = agreement()
    noNumber.cdr = { ...noNumber.cdr, identificationNumber: '   ' }
    expect(() => assertAgreementPermitted(noNumber)).toThrow(/44-12-224\(c\)\(6\)/)
  })
})

describe('§1.9 the claimant address is what DOR pays to', () => {
  it('REFUSES an agreement that routes the claimant payment to the CDR address', () => {
    // This single check is what separates this business from every criminal
    // prosecution in the seed's enforcement history.
    const redirected = agreement()
    redirected.claimant = { ...redirected.claimant, mailingAddress: redirected.cdr.address }
    expect(() => assertAgreementPermitted(redirected)).toThrow(/Redirecting it/)
  })

  it('catches the redirect through punctuation and casing differences', () => {
    const redirected = agreement()
    redirected.claimant = {
      ...redirected.claimant,
      mailingAddress: '900 recovery way., DECATUR ga  30030',
    }
    expect(() => assertAgreementPermitted(redirected)).toThrow(/Redirecting it/)
  })

  it('refuses an empty claimant address', () => {
    const blank = agreement()
    blank.claimant = { ...blank.claimant, mailingAddress: '  ' }
    expect(() => assertAgreementPermitted(blank)).toThrow(/address is empty/)
  })
})

describe('§6.2 custom terms and the $2,000 threshold', () => {
  it('HARD BLOCKS custom terms at or below $2,000 — permission, not just a trigger', () => {
    const small = agreement({
      properties: [{ propertyId: 'GA1', reportedValueCents: dollarsToCents(2_000), delivery: DELIVERED }],
      customTerms: 'Additional term.',
    })
    expect(() => assertAgreementPermitted(small)).toThrow(/not permitted at or below \$2,000/)
  })

  it('permits custom terms above $2,000', () => {
    const large = agreement({
      properties: [{ propertyId: 'GA1', reportedValueCents: dollarsToCents(2_000.01), delivery: DELIVERED }],
      customTerms: 'Additional term.',
    })
    expect(() => assertAgreementPermitted(large)).not.toThrow()
  })

  it('refuses custom terms when the total value is unknown', () => {
    const unknown = agreement({
      properties: [{ propertyId: 'GA1', reportedValueCents: null, delivery: DELIVERED }],
      customTerms: 'Additional term.',
    })
    expect(() => assertAgreementPermitted(unknown)).toThrow(/\$2,000 threshold/)
  })

  it('flags the addendum requirement on the artifact', async () => {
    const withTerms = await buildRecoveryAgreement(agreement({ customTerms: 'Custom term.' }))
    expect(withTerms.requiresAddendum).toBe(true)
    const without = await buildRecoveryAgreement(agreement())
    expect(without.requiresAddendum).toBe(false)
  })
})

describe('§7.3 the authority chain gates agreement generation', () => {
  it('refuses when the chain is empty', () => {
    expect(() => assertAgreementPermitted(agreement({ authorityLinks: [] }))).toThrow()
  })

  it('refuses when a link rests on evidence later found forged', () => {
    const forged = chain()
    forged[2] = { ...forged[2]!, evidenceInvalidated: true }
    expect(() => assertAgreementPermitted(agreement({ authorityLinks: forged }))).toThrow()
  })

  it('refuses when the entity is dissolved', () => {
    const dissolved = chain().map((l) => ({ ...l, entityStatus: 'admin_dissolved' as const }))
    expect(() => assertAgreementPermitted(agreement({ authorityLinks: dissolved }))).toThrow()
  })
})

describe('§6.2 Path A and Path B', () => {
  it('uses Path A when the holder reported a value', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    expect(artifact.snapshot.path).toBe('A')
    expect(artifact.snapshot.pathBSplit).toBeNull()
  })

  it('uses Path B when the holder reported NO value — § 44-12-224(c)(3)', async () => {
    const artifact = await buildRecoveryAgreement(agreement({
      properties: [{ propertyId: 'GA1', reportedValueCents: null, delivery: DELIVERED }],
      costsCents: cents(0),
    }))
    expect(artifact.snapshot.path).toBe('B')
    expect(artifact.snapshot.pathBSplit).not.toBeNull()
  })

  it('Path B percentages sum to exactly 100, as the form requires', async () => {
    for (const feePct of [10, 22.5, 29.99, 30]) {
      const artifact = await buildRecoveryAgreement(agreement({
        properties: [{ propertyId: 'GA1', reportedValueCents: null, delivery: DELIVERED }],
        costsCents: cents(0),
        feePct,
      }))
      const split = artifact.snapshot.pathBSplit!
      expect(split.cdrPct + split.claimantPct).toBe(100)
    }
  })

  it('treats a mixed set with ANY unvalued property as Path B', () => {
    // A Path A total that silently omitted a property would misstate it.
    expect(totalReportedValue([
      { propertyId: 'A', reportedValueCents: dollarsToCents(100), delivery: DELIVERED },
      { propertyId: 'B', reportedValueCents: null, delivery: DELIVERED },
    ])).toBeNull()
  })
})

describe('§6.2 the generated PDF is the real DOR form, filled correctly', () => {
  it('produces a valid PDF with the pinned form hash in its snapshot', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    expect(artifact.snapshot.formId).toBe('UP-CDR2')
    expect(artifact.snapshot.formSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(artifact.pdfBytes.byteLength).toBeGreaterThan(50_000)
  })

  it('writes the property IDs into §I and keeps the 9-page form intact', async () => {
    const properties = Array.from({ length: 3 }, (_, i) => ({
      propertyId: `GA000000${i + 1}`,
      reportedValueCents: dollarsToCents(1_000 * (i + 1)),
      delivery: DELIVERED,
    }))
    const artifact = await buildRecoveryAgreement(agreement({ properties }))

    const pdf = await PDFDocument.load(artifact.pdfBytes)
    expect(pdf.getPageCount()).toBe(9)

    const form = pdf.getForm()
    expect(form.getTextField('Property IDRow1').getText()).toBe('GA0000001')
    expect(form.getTextField('Property IDRow3').getText()).toBe('GA0000003')
    expect(form.getTextField('fill_17').getText()).toBe('1,000.00')
    expect(form.getTextField('Property IDRow4').getText()).toBeUndefined()
  })

  it('populates §IV including the CDR Identification Number', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    const form = (await PDFDocument.load(artifact.pdfBytes)).getForm()
    expect(form.getTextField(UP_CDR2_FIELDS.cdr.identificationNumber).getText()).toBe('CDR-000123')
    expect(form.getTextField(UP_CDR2_FIELDS.cdr.name).getText()).toBe('Reclaimed Holdings LLC')
  })

  it('writes the claimant address exactly as supplied — it is write-locked', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    const form = (await PDFDocument.load(artifact.pdfBytes)).getForm()
    expect(form.getTextField(UP_CDR2_FIELDS.claimant.mailingAddress).getText())
      .toBe('120 Peachtree St NE, Atlanta, GA 30303')
  })

  it('NEVER pre-fills a signature — § 44-12-224(c)(7) requires the claimant\'s own hand', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    const form = (await PDFDocument.load(artifact.pdfBytes)).getForm()
    // The notary block must also be left entirely to the notary.
    expect(form.getTextField(UP_CDR2_FIELDS.notary.printedName).getText()).toBeUndefined()
    expect(form.getTextField(UP_CDR2_FIELDS.notary.commissionExpires).getText()).toBeUndefined()
  })

  it('fills Path A boxes and leaves Path B empty, never both', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    const form = (await PDFDocument.load(artifact.pdfBytes)).getForm()
    // No leading "$": the form cell prints its own symbol.
    expect(form.getTextField(UP_CDR2_FIELDS.pathA.totalValue).getText()).toBe('48,500.00')
    expect(form.getTextField(UP_CDR2_FIELDS.pathB.cdrPercent).getText()).toBeUndefined()
    expect(form.getTextField(UP_CDR2_FIELDS.pathB.claimantPercent).getText()).toBeUndefined()
  })

  it('freezes the fee computation in the snapshot so history renders as signed', async () => {
    const artifact = await buildRecoveryAgreement(agreement())
    const { feeComputation } = artifact.snapshot
    expect(feeComputation.capBasis).toBe(dollarsToCents(48_500))
    expect(feeComputation.feeDollars).toBeLessThanOrEqual(feeComputation.capCeiling)
    expect(feeComputation.costs).toBe(dollarsToCents(45))
  })

  it('clamps an over-cap request rather than emitting one — § 44-12-224(d)(1)', async () => {
    const artifact = await buildRecoveryAgreement(agreement({ feePct: 45 }))
    expect(artifact.snapshot.feeComputation.capBinding).toBe(true)
    expect(artifact.snapshot.feeComputation.feeDollars)
      .toBe(artifact.snapshot.feeComputation.capCeiling)
    const form = (await PDFDocument.load(artifact.pdfBytes)).getForm()
    expect(form.getTextField(UP_CDR2_FIELDS.pathA.feePercent).getText()).toBe('30.00')
  })
})

describe('§6.2 REGRESSION: Path B dropped costs out of the disclosed percentage', () => {
  it('REFUSES a Path B agreement that intends to recover costs', async () => {
    // Path A used the cost-inclusive fee.feePct. Path B used the RAW requested
    // percentage, so a CDR recovering costs on top disclosed a percentage lower
    // than it meant to take — and the frozen snapshot recorded costs as zero,
    // so the audit record actively hid the discrepancy.
    //
    // § 44-12-224(c)(2) requires the disclosure to state the total percentage of
    // all authorized fees AND costs. Where the holder reported no value there is
    // no dollar basis to express a cost percentage against, so costs cannot be
    // folded in — they must be waived, or the property valued first.
    await expect(buildRecoveryAgreement(agreement({
      properties: [{ propertyId: 'GA1', reportedValueCents: null, delivery: DELIVERED }],
      costsCents: dollarsToCents(600),
    }))).rejects.toThrow(/no dollar basis/)
  })

  it('permits Path B with costs waived', async () => {
    const artifact = await buildRecoveryAgreement(agreement({
      properties: [{ propertyId: 'GA1', reportedValueCents: null, delivery: DELIVERED }],
      costsCents: cents(0),
      feePct: 30,
    }))
    expect(artifact.snapshot.path).toBe('B')
    expect(artifact.snapshot.pathBSplit).toEqual({ cdrPct: 30, claimantPct: 70 })
  })

  it('Path A still discloses the COST-INCLUSIVE percentage', async () => {
    // $1,000 claim, $50 costs, 30% requested: the cap binds at $300 total, so
    // the disclosed percentage is 30.00 and it covers the costs.
    const artifact = await buildRecoveryAgreement(agreement({
      properties: [{ propertyId: 'GA1', reportedValueCents: dollarsToCents(1_000), delivery: DELIVERED }],
      costsCents: dollarsToCents(50),
    }))
    const form = (await PDFDocument.load(artifact.pdfBytes)).getForm()
    expect(form.getTextField(UP_CDR2_FIELDS.pathA.feePercent).getText()).toBe('30.00')
    expect(form.getTextField(UP_CDR2_FIELDS.pathA.feesAndCosts).getText()).toBe('300.00')
    expect(artifact.snapshot.feeComputation.costs).toBe(dollarsToCents(50))
  })
})

describe('§6.2 REGRESSION: a MISSING form pin silently disabled the hash check', () => {
  it('refuses to generate against an unpinned form', async () => {
    // `if (expected !== undefined && expected !== sha256)` meant no pin = no
    // check, and the generator filled whatever PDF was on disk. Combined with
    // verify-forms dropping a pin after a failed fetch, one flaky network call
    // turned the § 44-12-224(b) tripwire into a silent auto-accept.
    const { readFileSync, writeFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const pinPath = resolve(import.meta.dirname, '../../data/seed/form-hashes.json')
    const original = readFileSync(pinPath, 'utf8')

    try {
      const pins = JSON.parse(original) as Record<string, unknown>
      delete pins['UP-CDR2']
      writeFileSync(pinPath, JSON.stringify(pins, null, 2))

      await expect(buildRecoveryAgreement(agreement()))
        .rejects.toThrow(/no pinned hash for UP-CDR2/)
    } finally {
      writeFileSync(pinPath, original)
    }
  })

  it('generates normally once the pin is present', async () => {
    await expect(buildRecoveryAgreement(agreement())).resolves.toBeTruthy()
  })
})

describe('§1.6 REGRESSION: the 120-day window was computed but never enforced', () => {
  it('REFUSES an agreement on a property inside the window — § 44-12-220(d.1)(4)', async () => {
    // computeEnforceability() and windowAppliesToAgreement() existed in
    // lib/compliance/windows.ts and were referenced ONLY from tests. The
    // workable view filtered on the window, but nothing on the agreement path
    // re-checked — so an agreement could be generated against a property whose
    // agreement SB 403 makes unenforceable for 120 days. Unenforceable means
    // the entire claim is worked for nothing.
    const recent = new Date()
    recent.setDate(recent.getDate() - 30)
    await expect(buildRecoveryAgreement(agreement({
      properties: [{
        propertyId: 'GA-RECENT',
        reportedValueCents: dollarsToCents(10_000),
        delivery: { precision: 'exact', date: recent },
      }],
    }))).rejects.toThrow(/120-day unenforceability window/)
  })

  it('REFUSES when the delivery date is UNKNOWN — resolves conservatively', async () => {
    await expect(buildRecoveryAgreement(agreement({
      properties: [{ propertyId: 'GA-UNKNOWN', reportedValueCents: dollarsToCents(10_000) }],
    }))).rejects.toThrow(/120-day unenforceability window/)
  })

  it('REFUSES on a year-precise date whose latest possible day is inside', async () => {
    // The bulk file gives "year reported" at best. 31 December of the current
    // year plus 120 days is still ahead, so this must refuse.
    await expect(buildRecoveryAgreement(agreement({
      properties: [{
        propertyId: 'GA-YEAR',
        reportedValueCents: dollarsToCents(10_000),
        delivery: { precision: 'year', year: new Date().getUTCFullYear() },
      }],
    }))).rejects.toThrow(/120-day unenforceability window/)
  })

  it('names every offending property, not just the first', async () => {
    try {
      await buildRecoveryAgreement(agreement({
        properties: [
          { propertyId: 'GA-A', reportedValueCents: dollarsToCents(1_000) },
          { propertyId: 'GA-B', reportedValueCents: dollarsToCents(1_000) },
        ],
      }))
      throw new Error('should have thrown')
    } catch (error) {
      expect((error as Error).message).toContain('GA-A')
      expect((error as Error).message).toContain('GA-B')
    }
  })

  it('permits a property delivered well outside the window', async () => {
    await expect(buildRecoveryAgreement(agreement())).resolves.toBeTruthy()
  })
})

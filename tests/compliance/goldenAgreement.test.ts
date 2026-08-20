/**
 * GOLDEN-FILE TEST — build spec §10.4.
 *
 * Renders a complete UP-CDR2 from fixture data and compares every filled field
 * against a checked-in reference.
 *
 * Compares extracted FIELD VALUES rather than PDF bytes deliberately: bytes
 * churn on metadata and timestamps, whereas a field-mapping regression is the
 * actual risk. Writing the fee into the wrong box produces a defective
 * agreement, and § 44-12-224(b) voids the representative's claim on one.
 *
 * If DOR revises the form, `pnpm verify:forms` fails first. If our mapping
 * drifts, this fails. Update the reference only after re-rendering the form and
 * confirming by eye that each value lands in the box its printed label names.
 */

import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildRecoveryAgreement } from '@/lib/forms/recoveryAgreement'
import { dollarsToCents } from '@/lib/compliance/money'
import type { AuthorityLink } from '@/lib/locate/authorityChain'
import type { RegistrationState } from '@/lib/compliance/registration'

const REFERENCE = resolve(import.meta.dirname, '../fixtures/upcdr2-golden.json')

const REGISTRATION: RegistrationState = {
  status: 'active',
  registrationNumber: 'CDR-000123',
  expiresAt: new Date('2030-01-01'),
}

const CHAIN: AuthorityLink[] = [1, 2, 3, 4].map((sequence) => ({
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

/** Fixed fixture. Do not randomise — the point is a stable reference. */
const FIXTURE = {
  properties: [
    { propertyId: 'GA0004821993', reportedValueCents: dollarsToCents(48_500) },
    { propertyId: 'GA0004821994', reportedValueCents: dollarsToCents(12_250.5) },
    { propertyId: 'GA0004822010', reportedValueCents: dollarsToCents(3_075) },
  ],
  claimant: {
    name: 'PEACHTREE VENTURES, LLC',
    phone: '(404) 555-0100',
    mailingAddress: '120 Peachtree St NE, Suite 1400, Atlanta, GA 30303',
    email: 'jroe@peachtreeventures.example',
    taxId: '58-1234567',
  },
  cdr: {
    name: 'Reclaimed Holdings LLC',
    agentName: 'Michael Kaminski',
    identificationNumber: 'CDR-000123',
    address: '900 Recovery Way, Decatur, GA 30030',
    agentEmail: 'claims@reclaimed.example',
    agentPhone: '(404) 555-0199',
  },
  costsCents: dollarsToCents(212.4),
  feePct: 30,
  authorityLinks: CHAIN,
  registration: REGISTRATION,
}

async function extractFilledFields(bytes: Uint8Array): Promise<Record<string, string>> {
  const pdf = await PDFDocument.load(bytes)
  const out: Record<string, string> = {}
  for (const field of pdf.getForm().getFields()) {
    if (field instanceof PDFTextField) {
      const value = field.getText()
      if (value !== undefined && value !== '') out[field.getName()] = value
    }
  }
  return out
}

describe('§10.4 golden UP-CDR2', () => {
  it('matches the checked-in reference field-for-field', async () => {
    const artifact = await buildRecoveryAgreement(FIXTURE)
    const actual = await extractFilledFields(artifact.pdfBytes)

    if (!existsSync(REFERENCE)) {
      writeFileSync(REFERENCE, `${JSON.stringify(actual, null, 2)}\n`)
      throw new Error(
        `No golden reference existed; wrote ${REFERENCE}. Re-render the form and ` +
          'confirm by eye that each value lands in the box its printed label names, ' +
          'then re-run.',
      )
    }

    const expected = JSON.parse(readFileSync(REFERENCE, 'utf8')) as Record<string, string>
    expect(actual).toEqual(expected)
  })

  it('fills exactly the fields the reference names, and no others', async () => {
    const artifact = await buildRecoveryAgreement(FIXTURE)
    const actual = await extractFilledFields(artifact.pdfBytes)
    const expected = JSON.parse(readFileSync(REFERENCE, 'utf8')) as Record<string, string>
    // A field filled that should be blank is as dangerous as one left empty:
    // a stray value in the Path B boxes would state two fee bases at once.
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())
  })

  it('leaves rows 4-15, Path B, the co-claimant, and the notary block empty', async () => {
    const artifact = await buildRecoveryAgreement(FIXTURE)
    const actual = await extractFilledFields(artifact.pdfBytes)
    for (const blank of [
      'Property IDRow4', 'Property IDRow15', 'fill_20', 'fill_31',   // unused rows
      'fill_10', 'fill_12',                                          // Path B
      '6 Name', '10 Tax ID or SSN',                                  // co-claimant
      'Printed Name of Notary Public', 'My Commission Expires',      // notary
    ]) {
      expect(actual[blank], `${blank} must be blank`).toBeUndefined()
    }
  })

  it('states the fee at exactly the cap, with costs inside it', async () => {
    const artifact = await buildRecoveryAgreement(FIXTURE)
    const actual = await extractFilledFields(artifact.pdfBytes)
    // 30% of $63,825.50 is $19,147.65. Adding the $212.40 of costs ON TOP would
    // be $19,360.05 — an over-cap agreement under § 44-12-224(d)(1).
    expect(actual['fill_2']).toBe('63,825.50')
    expect(actual['fill_4']).toBe('30.00')
    expect(actual['fill_6']).toBe('19,147.65')
    expect(actual['fill_8']).toBe('44,677.85')
    expect(artifact.snapshot.feeComputation.costs).toBe(dollarsToCents(212.4))
  })
})

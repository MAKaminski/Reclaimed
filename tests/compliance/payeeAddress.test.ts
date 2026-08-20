/**
 * §1.9 PAYEE ADDRESS — O.C.G.A. § 44-12-220(d)(3).
 *
 * These tests exist because an adversarial review found three live bypasses of
 * the original check. Each is reproduced here as a named test so it cannot
 * regress.
 *
 * DOR pays the claimant directly at the address on the signed agreement.
 * Redirecting it is the mechanism in Stayman, Michaud, Badea, and Pendergrass.
 */

import { describe, expect, it } from 'vitest'
import { checkPayeeAddress, assertPayeeAddresses, PayeeAddressError } from '@/lib/compliance/payeeAddress'
import { buildRecoveryAgreement, assertAgreementPermitted, type BuildAgreementInput } from '@/lib/forms/recoveryAgreement'
import { PDFDocument } from 'pdf-lib'
import { dollarsToCents } from '@/lib/compliance/money'
import { UP_CDR2_FIELDS } from '@/lib/forms/fieldMaps'
import type { AuthorityLink } from '@/lib/locate/authorityChain'
import type { RegistrationState } from '@/lib/compliance/registration'

const CDR_ADDRESS = '900 Recovery Way, Decatur, GA 30030'
const ACTIVE: RegistrationState = {
  status: 'active', registrationNumber: 'CDR-000123', expiresAt: new Date('2030-01-01'),
}
const CHAIN: AuthorityLink[] = [1, 2, 3, 4].map((sequence) => ({
  sequence, linkType: 'owner_name_to_entity' as const, fromRef: null, toRef: null,
  evidenceDocumentId: `doc-${sequence}`, evidenceInvalidated: false,
  confidence: 0.9, reviewStatus: 'reviewed' as const, entityStatus: 'active' as const,
  assertedBy: 's1', reviewedBy: 's2',
}))

function agreement(overrides: Partial<BuildAgreementInput> = {}): BuildAgreementInput {
  return {
    properties: [{ propertyId: 'GA1', reportedValueCents: dollarsToCents(48_500), delivery: DELIVERED }],
    claimant: {
      name: 'PEACHTREE VENTURES, LLC', phone: '404-555-0100',
      mailingAddress: '120 Peachtree St NE, Atlanta, GA 30303',
      email: 'owner@example.test', taxId: '58-1234567',
    },
    cdr: {
      name: 'Reclaimed Holdings LLC', agentName: 'MK', identificationNumber: 'CDR-000123',
      address: CDR_ADDRESS, agentEmail: 'claims@reclaimed.example', agentPhone: '404-555-0199',
    },
    costsCents: dollarsToCents(45), feePct: 30,
    authorityLinks: CHAIN, registration: ACTIVE,
    ...overrides,
  }
}

const coClaimant = (mailingAddress: string) => ({
  name: 'CO OWNER', phone: '404-555-0111', mailingAddress,
  email: 'co@example.test', taxId: '58-7654321',
})

/**
 * Delivery well outside the § 44-12-220(d.1)(4) 120-day window.
 * Agreement generation refuses a property inside it, and an unknown delivery
 * date resolves conservatively as inside — so a fixture must state one.
 */
const DELIVERED = { precision: 'exact' as const, date: new Date('2020-01-15T00:00:00Z') }

describe('§1.9 REGRESSION: the CO-CLAIMANT address block was unvalidated', () => {
  it('REFUSES a co-claimant address equal to the CDR address', () => {
    // The original check covered only the primary claimant. UP-CDR2 §III has a
    // second address block, written to PDF field "8 Mailing Address" with no
    // validation — a complete bypass of the most safety-critical check.
    expect(() => assertAgreementPermitted(agreement({ coClaimant: coClaimant(CDR_ADDRESS) })))
      .toThrow(PayeeAddressError)
  })

  it('names WHICH payee failed, so the fix is unambiguous', () => {
    try {
      assertAgreementPermitted(agreement({ coClaimant: coClaimant(CDR_ADDRESS) }))
      throw new Error('should have thrown')
    } catch (error) {
      expect((error as PayeeAddressError).errors.join(' ')).toContain('Co-claimant')
    }
  })

  it('still refuses the PRIMARY claimant redirect', () => {
    const redirected = agreement()
    redirected.claimant = { ...redirected.claimant, mailingAddress: CDR_ADDRESS }
    expect(() => assertAgreementPermitted(redirected)).toThrow(PayeeAddressError)
  })

  it('permits a genuine co-claimant at their own address', async () => {
    const valid = agreement({ coClaimant: coClaimant('55 Oak Ave, Macon, GA 31201') })
    expect(() => assertAgreementPermitted(valid)).not.toThrow()
    const form = (await PDFDocument.load((await buildRecoveryAgreement(valid)).pdfBytes)).getForm()
    expect(form.getTextField(UP_CDR2_FIELDS.coClaimant.mailingAddress).getText())
      .toBe('55 Oak Ave, Macon, GA 31201')
  })
})

describe('§1.9 REGRESSION: unit-suffix evasion', () => {
  it('catches the same building with a suite number appended', () => {
    // "900 Recovery Way Ste 2" is the same mailbox as "900 Recovery Way".
    // Raw string comparison treated them as different addresses.
    const evasive = agreement()
    evasive.claimant = { ...evasive.claimant, mailingAddress: '900 Recovery Way Ste 2, Decatur, GA 30030' }
    expect(() => assertAgreementPermitted(evasive)).toThrow(PayeeAddressError)
  })

  it.each(['Suite 400', 'Apt 12', 'Unit B', '#7', 'Floor 3'])(
    'catches unit designator "%s"',
    (unit) => {
      const evasive = agreement()
      evasive.claimant = { ...evasive.claimant, mailingAddress: `900 Recovery Way ${unit}, Decatur, GA 30030` }
      expect(() => assertAgreementPermitted(evasive)).toThrow(PayeeAddressError)
    },
  )

  it('still catches casing and punctuation differences', () => {
    const evasive = agreement()
    evasive.claimant = { ...evasive.claimant, mailingAddress: '900 recovery way., DECATUR ga  30030' }
    expect(() => assertAgreementPermitted(evasive)).toThrow(PayeeAddressError)
  })
})

describe('§1.9 REGRESSION: PO boxes were waved through', () => {
  it('FLAGS a PO box for manual review rather than accepting it silently', () => {
    // §1.9 requires PO boxes be flagged. Stayman intercepted cheques through
    // PO boxes and mail forwarding. Not blocked — rural and small-business
    // claimants use them legitimately — but never unnoticed.
    const result = checkPayeeAddress('PO Box 4410, Decatur, GA 30031', {
      cdrAddress: CDR_ADDRESS, label: 'Claimant',
    })
    expect(result.ok).toBe(true)
    expect(result.flags.join(' ')).toMatch(/PO box/i)
  })

  it.each(['P.O. Box 12', 'PO BOX 12', 'Post Office Box 12', 'p o box 12'])(
    'recognises "%s" as a PO box',
    (form) => {
      expect(checkPayeeAddress(`${form}, Atlanta, GA 30303`, {
        cdrAddress: CDR_ADDRESS, label: 'Claimant',
      }).flags.length).toBeGreaterThan(0)
    },
  )

  it('flags commercial mail drops and care-of addresses', () => {
    for (const address of ['1234 Main St PMB 88, Atlanta GA', 'c/o Acme Services, Atlanta GA']) {
      expect(checkPayeeAddress(address, { cdrAddress: CDR_ADDRESS, label: 'Claimant' }).flags.length)
        .toBeGreaterThan(0)
    }
  })

  it('surfaces flags from the agreement path without blocking', () => {
    const withBox = agreement()
    withBox.claimant = { ...withBox.claimant, mailingAddress: 'PO Box 900, Atlanta, GA 30303' }
    expect(() => assertAgreementPermitted(withBox)).not.toThrow()
  })
})

describe('§1.9 the CDR-controlled address denylist', () => {
  it('refuses any address on the denylist, not merely the registered one', () => {
    // §1.9 requires a denylist of known CDR/company addresses. An agent's home,
    // a satellite office, or a previously-used mail service are all redirects.
    const other = '17 Agent Lane, Marietta, GA 30060'
    const redirected = agreement({ cdrControlledAddresses: [other] })
    redirected.claimant = { ...redirected.claimant, mailingAddress: other }
    expect(() => assertAgreementPermitted(redirected)).toThrow(PayeeAddressError)
  })

  it('reports every failing payee at once', () => {
    try {
      assertPayeeAddresses(
        [
          { address: CDR_ADDRESS, label: 'Claimant' },
          { address: '900 Recovery Way Ste 9, Decatur, GA 30030', label: 'Co-claimant' },
        ],
        CDR_ADDRESS,
      )
      throw new Error('should have thrown')
    } catch (error) {
      expect((error as PayeeAddressError).errors).toHaveLength(2)
    }
  })

  it('refuses an empty payee address', () => {
    expect(checkPayeeAddress('   ', { cdrAddress: CDR_ADDRESS, label: 'Claimant' }).ok).toBe(false)
  })
})

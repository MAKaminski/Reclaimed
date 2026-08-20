/**
 * DOR form field maps.
 *
 * Field names come from `pnpm discover:fields`, which enumerates the real
 * AcroForm via pdf-lib. All four forms ARE fully fillable — an earlier raw
 * `strings` scan suggested UP-CDR2 had only ~14 fields, but 49 of its 63 live
 * inside compressed object streams.
 *
 * The Path A / Path B mapping below was confirmed by RENDERING page 6 of
 * UP-CDR2 and reading the printed labels, not inferred from field coordinates.
 * Filling the wrong box here produces a defective agreement, and § 44-12-224(b)
 * voids the representative's claim on one.
 *
 * The property tables are physically bounded by the forms themselves:
 * UP-CDR2 has exactly 15 rows, UP-CDR4 exactly 5 — matching the statutory
 * limits. There is no way to overfill them.
 */

export const UP_CDR2_FIELDS = {
  /** §I — up to 15 properties. Row N property ID and its reported amount. */
  propertyIdRow: (n: number) => `Property IDRow${n}`,
  /** Paired amount column. Non-contiguous numbering, so mapped explicitly. */
  propertyAmountRow: (n: number) => {
    const map: Record<number, string> = {
      1: 'fill_17', 2: 'fill_18', 3: 'fill_19', 4: 'fill_20', 5: 'fill_21',
      6: 'fill_22', 7: 'fill_23', 8: 'fill_24', 9: 'fill_25', 10: 'fill_26',
      11: 'fill_27', 12: 'fill_28', 13: 'fill_29', 14: 'fill_30', 15: 'fill_31',
    }
    const field = map[n]
    if (field === undefined) {
      throw new RangeError(
        `UP-CDR2 §I has exactly 15 property rows; row ${n} does not exist. ` +
          'Form UP-CDR2 limits a Recovery Agreement to 15 properties.',
      )
    }
    return field
  },

  /**
   * §II Path A — used when the Unclaimed Property Section INCLUDES the value.
   * Labels verified against the rendered form.
   */
  pathA: {
    /** A1. Total dollar value of unclaimed property to be claimed. */
    totalValue: 'fill_2',
    /** A2. Total percentage of value to be paid as fees and costs to the CDR. */
    feePercent: 'fill_4',
    /** A3. Total fees and costs to be deducted and paid to the CDR. */
    feesAndCosts: 'fill_6',
    /** A4. Net amount to be received by claimant. */
    netToClaimant: 'fill_8',
  },

  /**
   * §II Path B — used when the Section DOES NOT include the value.
   * § 44-12-224(c)(3). B1 + B2 must equal 100.
   */
  pathB: {
    /** B1. Percentage of net value due to the CDR. */
    cdrPercent: 'fill_10',
    /** B2. Percentage of net value due to the claimant. */
    claimantPercent: 'fill_12',
  },

  /** §III Claimant. */
  claimant: {
    name: '1 Name',
    phone: '2 Phone Number',
    mailingAddress: '3 Mailing Address',
    email: '4 Email',
    taxId: '5 Tax ID or SSN',
  },
  /** §III Co-Claimant, completed only if applicable. */
  coClaimant: {
    name: '6 Name',
    phone: '7 Phone Number',
    mailingAddress: '8 Mailing Address',
    email: '9 Email',
    taxId: '10 Tax ID or SSN',
  },

  /** §IV CDR block. Every field is populated from config. */
  cdr: {
    name: '1 Name of CDR',
    agentName: '2 Name of AgentEmployee',
    /** § 44-12-224(c)(6). Refuse to generate without it. */
    identificationNumber: '3 CDRs Identification Number received from the Department upon registration',
    address: '4 Address',
    agentEmail: '5 AgentEmployee Email Address',
    agentPhone: '6 AgentEmployee Phone Number',
  },

  /** Payment instruction. */
  payment: {
    netAmount: 'Please send the net amount of',
    netPercentage: 'or net percentage of',
  },

  /** §VI notary acknowledgment. Required by the FORM, not the statute. */
  notary: {
    printedName: 'Printed Name of Notary Public',
    commissionExpires: 'My Commission Expires',
    day: 'Sworn and subscribed before this',
    month: 'day of',
    year: '20',
  },
} as const

export const UP_CDR4_FIELDS = {
  /** §I — up to 5 properties. Form UP-CDR4 limits a Purchase Agreement to 5. */
  propertyIdRow: (n: number) => `Property IDRow${n}`,
  propertyAmountRow: (n: number) => {
    const map: Record<number, string> = {
      1: 'fill_7', 2: 'fill_8', 3: 'fill_9', 4: 'fill_10', 5: 'fill_11',
    }
    const field = map[n]
    if (field === undefined) {
      throw new RangeError(
        `UP-CDR4 §I has exactly 5 property rows; row ${n} does not exist. ` +
          'Form UP-CDR4 limits a Purchase Agreement to 5 properties.',
      )
    }
    return field
  },
  totals: { fill13: 'fill_13', fill15: 'fill_15', purchasePrice: 'fill_5' },
  /**
   * Proof of payment. § 44-12-224(d)(2): the claim is VOID without proof of
   * payment to the seller filed WITH the claim. At least one must be checked.
   */
  proofOfPayment: {
    signedReceipt: 'Receipt signed by the claimant and if any',
    copyOfCheck: 'Copy of check issued for payment',
    bankWire: 'Bank wire confirmation',
    other: 'undefined',
    otherDescription: 'Other please specify',
  },
  seller: {
    name: '1 Name',
    phone: '2 Phone Number',
    mailingAddress: '3 Mailing Address',
    email: '4 Email',
    taxId: '5 Tax ID or SSN',
  },
} as const

export const UP_CDR3_FIELDS = {
  claimant: 'Claimant',
  cdr: 'CDR',
  claim: 'Claim',
  cdrIdentificationNumber: 'CDR Identification Number',
  /** §II — the custom terms themselves. Must be ≥10-point type. */
  additionalTerms: 'Text1',
  claimantAgrees: 'I agree to the additional terms and conditions stated in Section II and acknowledge that these terms and',
  claimantDisputes: 'I dispute the following terms and conditions stated in Section II reference any disputed terms and',
  claimantSignature: 'Claimants Signature',
  claimantDate: 'Date',
  cdrSignature: 'Designated Representatives Signature',
  cdrDate: 'Date_2',
} as const

/** Statutory property limits, mirrored by the forms' physical row counts. */
export const MAX_PROPERTIES_RECOVERY = 15
export const MAX_PROPERTIES_PURCHASE = 5

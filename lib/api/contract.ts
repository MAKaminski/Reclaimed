import { z } from 'zod'
import { getOfferState } from '@/lib/compliance/offerState'
import { readRegistrationState } from '@/lib/compliance/registration'
import { listAllJurisdictions } from '@/lib/compliance/stateRules'

/**
 * The partner API contract.
 *
 * ── What this API is, and what it can never be ──────────────────────────────
 *
 * It accepts REFERRALS. A partner — an estate attorney, a fiduciary, a trustee,
 * another firm outside its own jurisdiction — tells us about a claimant they
 * already act for, and asks us to do the recovery work.
 *
 * It is not, and will never become, a lookup or a data API. § 44-12-239.1(b)
 * permits a representative to receive the Department's file only "for the purpose
 * of soliciting owners of unclaimed property to offer claim services." An
 * endpoint that answers "what do you hold for this name" is the exact use the
 * statute forecloses, and `/about` publishes a standing promise that we will not
 * build one.
 *
 * The direction of travel is therefore the whole design. Data arrives; nothing
 * leaves. A response never echoes a property, a value, a holder, or a count — the
 * only thing a caller ever sees back is the reference they themselves supplied.
 * That is enforced by shape rather than by review: there is no read endpoint, and
 * `partner_referrals` has no anon grant.
 *
 * ── Why it returns 503 today ────────────────────────────────────────────────
 *
 * Accepting a referral is contact capture. ADR-0010 rejected lead capture on the
 * public tree in terms: collecting the details of people who want claim services
 * is the front half of soliciting an agreement, which § 44-12-239.2(a)(10)
 * reaches unless registered. So the endpoint is gated on the SAME derived offer
 * state as every call to action on the site, with no override — see
 * `lib/compliance/offerState.ts`.
 *
 * A 503 rather than a 404 is deliberate. A partner building an integration needs
 * to know the endpoint exists, why it is closed, and how to tell when it opens.
 * `GET /api/v1/status` answers that without polling this one.
 */

/** Bumped only on a breaking change. Partners pin it in the path. */
export const API_VERSION = 'v1'

export const INTAKE_MAX_BYTES = 16_384

/**
 * `reference` is the partner's idempotency key.
 *
 * Required rather than optional because the retry case is the normal case: a
 * partner whose POST times out will send it again, and without a key we would
 * create a second referral for the same person and eventually contact them twice.
 */
export const ReferralSchema = z.object({
  reference: z.string().min(1).max(128),

  partner: z.object({
    name: z.string().min(1).max(200),
    email: z.email().max(320),
    /** Their own CDR registration or bar number, where they have one. */
    registration: z.string().max(64).optional(),
  }),

  /**
   * Two letters. Validated against the rules seed rather than a regex, so a
   * referral for a state we have never researched is refused at the door instead
   * of sitting in a queue nobody can lawfully work.
   */
  jurisdiction: z.string().length(2).transform((s) => s.toUpperCase()),

  claimant: z.object({
    name: z.string().min(1).max(200),
    kind: z.enum(['individual', 'entity', 'estate']),
    /** How the partner knows them. Free text, kept verbatim. */
    relationship: z.string().min(1).max(500),
  }),

  /**
   * Deliberately a DESCRIPTION, not an identifier.
   *
   * There is no `property_id` field and there will not be one. A partner quoting
   * one of our identifiers would mean they had our file, which is the failure
   * this whole design exists to prevent.
   */
  property: z.object({
    description: z.string().max(2000).optional(),
    estimatedValueUsd: z.number().nonnegative().max(100_000_000).optional(),
  }).optional(),

  /**
   * The partner attests the claimant knows about and consents to the referral.
   *
   * Literal `true` only. An unattested referral is a cold contact, and a cold
   * contact is the fact pattern § 44-12-239.2(a)(10) is about.
   */
  claimantConsentAttested: z.literal(true),
})

export type Referral = z.infer<typeof ReferralSchema>

export type IntakeRefusalCode =
  | 'not_registered'
  | 'jurisdiction_not_served'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'duplicate_reference'

export interface IntakeRefusal {
  code: IntakeRefusalCode
  message: string
  citation?: string
  /** Where a caller can watch for this to change. */
  statusUrl: string
}

export interface CapabilityStatus {
  apiVersion: string
  /** Whether a referral would be accepted right now. */
  acceptingReferrals: boolean
  registrationStatus: string
  reason: string
  citation: string
  /** States we could lawfully act in today. Empty is a real answer. */
  jurisdictionsServed: string[]
  /** Researched but not verified for use. Useful for a partner planning ahead. */
  jurisdictionsResearched: string[]
  /** Statutory ceiling on fees AND costs, where known. */
  feeCapPct: Record<string, number | null>
  documentation: string
}

/**
 * Whether the API may accept a referral, derived rather than configured.
 *
 * Reads the same `getOfferState()` the banner, the CTA slot and the structured
 * data read. There is deliberately no separate API switch: a flag that let the
 * API open while the website still declined clients would be a way to solicit
 * quietly, which is precisely the thing ADR-0010 argues we do not do.
 */
export function intakeOpen(): boolean {
  return getOfferState().mayCaptureContact
}

export function capabilityStatus(): CapabilityStatus {
  const offer = getOfferState()
  const registration = readRegistrationState()
  const jurisdictions = listAllJurisdictions()

  return {
    apiVersion: API_VERSION,
    acceptingReferrals: offer.mayCaptureContact,
    registrationStatus: registration.status,
    reason: offer.reason,
    citation: offer.citation,
    jurisdictionsServed: offer.mayCaptureContact
      ? jurisdictions.filter((j) => j.status === 'verified').map((j) => j.code)
      : [],
    jurisdictionsResearched: jurisdictions
      .filter((j) => j.status === 'researched_not_verified_for_build')
      .map((j) => j.code),
    feeCapPct: Object.fromEntries(jurisdictions.map((j) => [j.code, j.feeCapPct])),
    documentation: '/for-partners',
  }
}

/**
 * A jurisdiction is servable only if its rules are VERIFIED.
 *
 * `getStateRules()` throws on an unverified state by design, so this asks the
 * question without triggering that — a referral for Ohio should get a clean
 * refusal, not a 500.
 */
export function jurisdictionServable(code: string): boolean {
  return listAllJurisdictions().some((j) => j.code === code && j.status === 'verified')
}

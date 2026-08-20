/**
 * Scoring priors.
 *
 * EVERY NUMBER IN THIS FILE IS A GUESS. That is deliberate and it is stated
 * plainly so nobody mistakes it for evidence.
 *
 * The build spec is explicit on this point: start with deliberately crude values
 * and improve them from observed conversion. A documented guess that gets
 * corrected beats a sophisticated one nobody can audit. So:
 *
 *   · every prior is named, versioned, and overridable
 *   · every score logs its inputs, so the model can be back-tested against real
 *     outcomes once claims start closing
 *   · nothing is buried in the code
 *
 * When you change a value, bump PARAMS_VERSION. Scores carry the version they
 * were computed under, so a mid-flight change never silently invalidates a
 * queue that a human is already working.
 */

export const PARAMS_VERSION = '2026-08-20.2'

export interface ScoringParams {
  version: string

  /** P(we can reach a person who can act) */
  contactable: {
    /** Complete last-known address in the DOR file. */
    withFullAddress: number
    /** Partial address — city/state but no street, or street but no city. */
    withPartialAddress: number
    /** No usable address at all. */
    withNoAddress: number
    /**
     * Multiplier applied per decade since last activity. Addresses go stale;
     * a 2009 last-activity date is a much weaker signal than a 2024 one.
     */
    decayPerDecade: number
    /** Entities are reachable via the SOS registered agent even when the DOR address is dead. */
    entityRegisteredAgentBonus: number
    /** A dissolved entity has no registered agent to reach. */
    dissolvedEntityPenalty: number
    /**
     * Entity NOT YET matched against the SOS file — "we have not looked",
     * which is NOT the same as "it is dissolved". Blended across the base rate
     * of active vs dissolved Georgia entities. See the note on conservatism below.
     */
    uncheckedEntityFactor: number
  }

  /** P(they sign a 30% contingency agreement, given we reached them) */
  signs: {
    /**
     * Base rate for cold direct mail on a legitimate, verifiable claim.
     * Deliberately pessimistic: DOR tells every owner in bold that they can
     * claim for free, and our own § 44-12-239(f) legend says the same in capital
     * letters. We chose that market.
     */
    base: number
    /** Larger claims justify the recipient's attention. Applied per log10 above $1,000. */
    valueLiftPerDecade: number
    /** Ceiling — no amount of money makes cold mail convert like a warm lead. */
    max: number
    /** Multi-owner property needs EVERY owner to sign. Compounds badly. */
    perAdditionalOwner: number
    /** An entity signer must also establish authority before signing. */
    entityFriction: number
  }

  /** P(we can prove entitlement to DOR's satisfaction) */
  entitlementProvable: {
    /** Living individual, sole owner, name and address match. */
    individualSoleOwner: number
    /** Multiple living owners, all identifiable. */
    multiOwner: number
    /** Active entity with officers on the SOS file. */
    activeEntity: number
    /**
     * DISSOLVED entity. DOR publishes NOTHING on dissolved-entity requirements —
     * see docs/DOR-QUESTIONS.md #3. This is simultaneously the moat and the risk,
     * so the prior is low until we have DOR's answer in writing.
     */
    dissolvedEntity: number
    /** Merged entity requiring chain-of-title through name changes. */
    mergedEntity: number
    /** Entity not yet matched against the SOS file. Blended, not worst-case. */
    uncheckedEntity: number
    /** Heir claim at or below the § 44-12-220(i) $7,500 affidavit ceiling. */
    heirUnderAffidavitCeiling: number
    /** Heir claim above the ceiling — probate required. */
    heirOverAffidavitCeiling: number
  }

  /**
   * Expected cost to work a property, in CENTS.
   *
   * These count INSIDE the 30% cap (§ 44-12-224(d)(1) — "fees AND costs"), so
   * they are not merely a margin question: a high-cost claim on a small property
   * can push the total over the cap and force a clamp.
   */
  costsCents: {
    /** First-touch letter: print, envelope, postage, prepaid return envelope. */
    firstTouchMail: number
    /** Expected follow-up mailings per property worked. */
    followUpMail: number
    /** Notary reimbursement, the usual sticking point on wet-ink signing. */
    notaryReimbursement: number
    /** Staff time to assemble evidence, priced at a loaded hourly rate. */
    evidenceAssemblyPerHour: number
    /** Hours for a straightforward individual claim. */
    hoursIndividual: number
    /** Hours for an active entity. */
    hoursActiveEntity: number
    /** Hours for a dissolved or merged entity — the chain-of-title work. */
    hoursComplexEntity: number
    /** Hours for an heir claim: enumerate ALL heirs, collect every signature. */
    hoursHeir: number
  }

  /** Thresholds that shape the queue rather than the arithmetic. */
  thresholds: {
    /** Below this EV, do not surface the property to a human at all, in cents. */
    minimumExpectedValueCents: number
    /** Confidence below which a score is shown but flagged as speculative. */
    lowConfidence: number
  }
}

export const DEFAULT_PARAMS: ScoringParams = {
  version: PARAMS_VERSION,

  contactable: {
    withFullAddress: 0.55,
    withPartialAddress: 0.25,
    withNoAddress: 0.05,
    decayPerDecade: 0.75,
    entityRegisteredAgentBonus: 1.35,
    dissolvedEntityPenalty: 0.45,
    uncheckedEntityFactor: 1.0,
  },

  signs: {
    base: 0.08,
    valueLiftPerDecade: 0.05,
    max: 0.35,
    perAdditionalOwner: 0.65,
    entityFriction: 0.8,
  },

  entitlementProvable: {
    individualSoleOwner: 0.92,
    multiOwner: 0.7,
    activeEntity: 0.85,
    dissolvedEntity: 0.35,
    mergedEntity: 0.5,
    uncheckedEntity: 0.72,
    heirUnderAffidavitCeiling: 0.75,
    heirOverAffidavitCeiling: 0.4,
  },

  costsCents: {
    firstTouchMail: 165,
    followUpMail: 220,
    notaryReimbursement: 1_500,
    evidenceAssemblyPerHour: 6_500,
    hoursIndividual: 0.5,
    hoursActiveEntity: 1.5,
    hoursComplexEntity: 6,
    hoursHeir: 4,
  },

  thresholds: {
    minimumExpectedValueCents: 15_000,
    lowConfidence: 0.4,
  },
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE CONSERVATISM BELONGS — AND WHERE IT DOES NOT
 *
 * This codebase resolves genuinely-unknown facts conservatively: the 120-day
 * window treats an unknown delivery date as inside the window, and the authority
 * chain refuses to submit a claim it cannot evidence. Both are correct, because
 * both gate an ACTION with legal consequences.
 *
 * RANKING is different. The queue only decides what a human looks at first.
 * Scoring an unchecked entity as though it were dissolved does not protect
 * anyone — it just buries the entity-owned properties that are, per SB 403, the
 * actual addressable market, before Phase 3 has looked a single one of them up.
 *
 * So `unchecked` uses a blended prior and `admin_dissolved` uses the pessimistic
 * one. The conservatism lives in the authority chain, which is the thing that
 * can actually cause harm.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Provenance for every prior above, so a reviewer can tell evidence from guess.
 * Update the basis as real outcomes accumulate.
 */
export const PARAM_BASIS: Record<string, string> = {
  'contactable.withFullAddress':
    'GUESS. Cold-mail deliverability on aged government address data. No observed data yet.',
  'contactable.decayPerDecade':
    'GUESS. US annual residential mobility runs roughly 8-10%, so address decay over a decade is severe.',
  'signs.base':
    'GUESS, deliberately pessimistic. DOR tells every owner in bold that they may claim for free, and our own legend repeats it in capital letters.',
  'signs.valueLiftPerDecade':
    'GUESS. Larger sums plausibly justify the recipient reading past the legend.',
  'entitlementProvable.uncheckedEntity':
    'GUESS. Blend of the active and dissolved priors weighted toward active, because most registered entities are in good standing. Replaced by a real status the moment the SOS match runs (Phase 3).',
  'entitlementProvable.dissolvedEntity':
    'GUESS, deliberately low. DOR publishes NOTHING on dissolved-entity requirements — docs/DOR-QUESTIONS.md #3. Raise this only on a written DOR answer.',
  'entitlementProvable.heirUnderAffidavitCeiling':
    'GUESS. SB 403 § 44-12-220(i) removed probate for aggregate claims at or below $7,500, which should materially raise this.',
  'costsCents.firstTouchMail':
    'ESTIMATE from USPS First-Class presort plus print and a prepaid return envelope. Refine against actual invoices.',
  'costsCents.evidenceAssemblyPerHour':
    'ESTIMATE. Loaded cost of a background-screened analyst under § 44-12-239(d).',
  'thresholds.minimumExpectedValueCents':
    'JUDGEMENT. $150 of expected value per property is the floor at which a human should look at all.',
}

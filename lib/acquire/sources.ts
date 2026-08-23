/**
 * THE SOURCE REGISTRY — where unclaimed-property data may be obtained, and by
 * whom.
 *
 * Sources are classified by THE COUNTERPARTY'S POSTURE TOWARD MACHINES, not by
 * what we intend to do. That distinction is the whole design, and it comes from
 * getting it wrong: the California download page returns 403 with
 * `cf-mitigated: challenge`, so a workflow-shaped taxonomy would have labelled
 * California "manual" and shipped a permanent human step. In fact the DATA is
 * on a different host entirely — claimit.ca.gov, S3 behind CloudFront — which
 * answers 200 to plain curl with no User-Agent at all.
 *
 * A mode we assign ourselves is an assertion. A mode describing the wire is a
 * fact, and it can be falsified. So every `open` classification carries dated
 * wire evidence, and the runtime tripwire in ./challenge.ts re-checks it on
 * every response: the source DECLARES open, the response may PROVE otherwise,
 * and the proof wins.
 *
 * This is NOT in data/seed/state-rules.seed.json, deliberately. That file
 * answers "may we operate in this state" and throws for CA because CA is
 * researched_not_verified_for_build. This file answers "may a machine fetch
 * this artifact" — a different question with a different failure mode. Keeping
 * them apart is what lets California DATA load while California OPERATIONS stay
 * blocked, which is exactly the state we want.
 */

import type { PropertyField } from '@/lib/ingest/columnMap'

export type SourceKey = 'CA-SCO-UPD-500' | 'GA-DOR-CDR'

/** One retrievable file. Only an `open` source can have these. */
export interface ArtifactSpec {
  url: string
  /** What lands on disk. */
  filename: string
  /** `zip` members are extracted; `plain` is used as-is. */
  container: 'zip' | 'plain'
  /** Refuse anything larger — a wrong URL must not fill the disk. */
  maxBytes: number
  /** Expected member count after extraction. A mismatch is a format change. */
  expectMembers?: number
}

/** Dated proof that no access control stands in the way. */
export interface OpenEvidence {
  observedAt: string
  /** Verbatim wire observation. */
  observed: string
  /** What robots.txt says about this path. */
  robots: string
  /** Why the publisher offers it. */
  publisherIntent: string
}

export interface AccessControl {
  kind: 'captcha' | 'challenge' | 'login' | 'paywall'
  observedAt: string
  observed: string
}

export interface DeliverySpec {
  /** Unknown is a legitimate value — see DOR-QUESTIONS #5. */
  transport: 'email' | 'sftp' | 'https_link' | 'unknown'
  cadenceDays: number
  citation: string
}

/**
 * The discriminated union that makes circumvention a type error.
 *
 * Only `open` carries `artifacts`, and only ArtifactSpec has `url`. So
 * `source.permission.artifacts` DOES NOT COMPILE without narrowing through
 * assertFetchable() first. `pnpm typecheck` is already a CI step, which means
 * writing a fetch against a restricted source is a red build before anybody has
 * to reason about whether it would be a good idea.
 */
export type Permission =
  | { mode: 'open'; artifacts: readonly ArtifactSpec[]; evidence: OpenEvidence }
  | { mode: 'restricted'; refusal: string; control: AccessControl }
  | { mode: 'entitled'; refusal: string; delivery: DeliverySpec }

export type AcquisitionMode = Permission['mode']

export interface DataSource {
  key: SourceKey
  stateCode: string
  label: string
  permission: Permission
  /** How often the publisher refreshes it. Drives staleness reporting. */
  expectedCadenceDays: number
  /**
   * Column mapping override. The header-regex mapper is a good default and a
   * bad guess: run against California's real header it maps CASH_REPORTED into
   * year_reported — a dollar amount in a year column, silently. Where we have
   * seen the real header, we pin it.
   */
  columnOverrides: Readonly<Partial<Record<PropertyField, string>>> | null
  notes: string
}

export const SOURCES: Readonly<Record<SourceKey, DataSource>> = Object.freeze({
  'CA-SCO-UPD-500': {
    key: 'CA-SCO-UPD-500',
    stateCode: 'CA',
    label: 'California SCO — unclaimed property, $500 and above',
    expectedCadenceDays: 7,
    permission: {
      mode: 'open',
      artifacts: [{
        url: 'https://claimit.ca.gov/upd-property-records/04_From_500_To_Beyond.zip',
        filename: '04_From_500_To_Beyond.zip',
        container: 'zip',
        // Observed 161,417,193 bytes. Ceiling is ~2.5x to absorb growth while
        // still refusing if this ever silently becomes the 3.0GB All_Records.
        maxBytes: 400_000_000,
      }],
      evidence: {
        observedAt: '2026-08-22',
        observed:
          'HTTP/2 200 · content-type: application/zip · content-length: 161417193 · ' +
          'server: AmazonS3 · via CloudFront. Plain curl, NO User-Agent header. ' +
          'No CAPTCHA, no challenge, no login. (Note: www.sco.ca.gov returns 403 ' +
          'cf-mitigated:challenge, but the data is not served from that host.)',
        robots:
          'claimit.ca.gov/robots.txt disallows only /mor and /docs/. ' +
          '/upd-property-records/ is permitted under User-agent: *.',
        publisherIntent:
          'SCO publishes these files so locators can "conduct outreach to people and ' +
          'businesses who may not know they have unclaimed property."',
      },
    },
    // Pinned against the REAL header of the real file, read 2026-08-22.
    //
    // This is not defensive tidiness. Run the generic header matcher against
    // California's actual header and it produces:
    //
    //     year_reported  <-  [2] CASH_REPORTED
    //
    // A dollar amount, silently, into a year column — which then feeds
    // derive_delivery_precision() and the § 44-12-220(d.1)(4) enforceability
    // window. It does not fail; it corrupts. Where the real header is known,
    // it is pinned.
    //
    // California's export genuinely has NO naupa_relation_code, NO
    // date_of_last_activity, and NO year_reported. Their absence is a fact
    // about the source, not a mapping failure, and the overrides say so by
    // omission rather than letting a fuzzy match invent one.
    //
    // Not yet carried because `properties` has no column for them, though both
    // are valuable: NO_OF_OWNERS (a direct multi-owner signal, better than
    // inferring from the name) and NUMBER_OF_PENDING_CLAIMS /
    // NUMBER_OF_PAID_CLAIMS (dedupe — someone is already claiming this).
    columnOverrides: {
      property_id: 'PROPERTY_ID',
      naupa_property_type: 'PROPERTY_TYPE',
      share_count: 'SHARES_REPORTED',
      issuer_name: 'NAME_OF_SECURITIES_REPORTED',
      owner_name: 'OWNER_NAME',
      last_known_address_line1: 'OWNER_STREET_1',
      last_known_address_line2: 'OWNER_STREET_2',
      last_known_city: 'OWNER_CITY',
      last_known_state: 'OWNER_STATE',
      last_known_postal: 'OWNER_ZIP',
      // CURRENT_CASH_BALANCE, not CASH_REPORTED: the former is what remains
      // claimable, the latter is what the holder originally handed over.
      cash_amount_cents: 'CURRENT_CASH_BALANCE',
      holder_name: 'HOLDER_NAME',
      cusip: 'CUSIP',
      // Read from the real header 2026-08-23. NUMBER_OF_PENDING_CLAIMS is why
      // this block grew: a property someone is already claiming is the worst
      // target in the file, and we were discarding the column that says so.
      pending_claims_count: 'NUMBER_OF_PENDING_CLAIMS',
      paid_claims_count: 'NUMBER_OF_PAID_CLAIMS',
      declared_owner_count: 'NO_OF_OWNERS',
    },
    notes:
      'The $500+ tier is 154MB — about 5% of the full 3.0GB dataset for effectively ' +
      'all of the addressable value, and it matches the >=$500 floor already in ' +
      'properties_workable. California rules are researched_not_verified_for_build, ' +
      'so these rows LOAD but are not workable until CA is verified.',
  },

  'GA-DOR-CDR': {
    key: 'GA-DOR-CDR',
    stateCode: 'GA',
    label: 'Georgia DOR — statutory CDR bulk file',
    expectedCadenceDays: 7,
    permission: {
      mode: 'entitled',
      refusal:
        'Georgia publishes no public bulk file. The data is a statutory entitlement ' +
        'delivered to registered CDRs under O.C.G.A. § 44-12-239.1(a); there is no ' +
        'fetch URL and none may be constructed. The public portal, ' +
        'gaclaims.unclaimedproperty.com, is behind a server-side reCAPTCHA and is on ' +
        'BLOCKED_HOSTS — defeating it would create CFAA exposure and a conviction ' +
        'involving dishonesty bars registration for 20 years under § 44-12-239(d). ' +
        'Save the delivered file and pass it with --file.',
      delivery: {
        // Believed email, but the repo both asserts and disclaims this. Open
        // question to DOR — DOR-QUESTIONS #5. Do not build against a guess.
        transport: 'unknown',
        cadenceDays: 7,
        citation: 'O.C.G.A. § 44-12-239.1(a)',
      },
    },
    // Unknown until the first delivery arrives; the sniffer handles it, and the
    // first live load requires --accept-inferred-mapping.
    columnOverrides: null,
    notes:
      '>1GB delimited text, refreshed weekly, with exact cash amounts. Delimiter, ' +
      'encoding, header presence and file count are all unknown — DOR states it ' +
      '"cannot offer any assistance in using this database", so the parser sniffs ' +
      'and records every inference on the ingest_runs manifest.',
  },
})

export function listSources(): DataSource[] {
  return Object.values(SOURCES)
}

export function getSource(key: string): DataSource {
  const source = SOURCES[key as SourceKey]
  if (source === undefined) {
    throw new Error(
      `Unknown source "${key}". Known sources: ${Object.keys(SOURCES).join(', ')}`,
    )
  }
  return source
}

/**
 * Non-null for every source a machine may not fetch. Pure, so --list can render
 * it and the CI gate can assert it is substantive.
 */
export function refusalFor(source: DataSource): string | null {
  return source.permission.mode === 'open' ? null : source.permission.refusal
}

export class AcquisitionRefusedError extends Error {
  constructor(source: DataSource, reason: string) {
    super(`REFUSING TO FETCH "${source.key}" (${source.label}):\n\n  ${reason}`)
    this.name = 'AcquisitionRefusedError'
  }
}

/**
 * The hard gate. Narrows the type so `permission.artifacts` becomes reachable —
 * which is why there is no way to write a fetch that skips it.
 */
export function assertFetchable(
  source: DataSource,
): asserts source is DataSource & { permission: Extract<Permission, { mode: 'open' }> } {
  const refusal = refusalFor(source)
  if (refusal !== null) throw new AcquisitionRefusedError(source, refusal)
}

/**
 * Whether receiving this source requires an active CDR registration.
 *
 * DERIVED from the permission mode, never declared. § 44-12-239.1(a) data is
 * gated because registration is what entitles us to it; California's public
 * file is not, and gating it would put public data behind something $1,200 and
 * 4-8 weeks away for no reason.
 */
export function requiresRegistration(source: DataSource): boolean {
  return source.permission.mode === 'entitled'
}

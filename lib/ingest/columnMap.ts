/**
 * Map the DOR bulk file's columns onto our schema.
 *
 * The field list is fixed by O.C.G.A. § 44-12-239.1(a), but the COLUMN NAMES
 * and their order are not published. DOR's Program Overview says Property ID is
 * the first field; everything else must be matched.
 *
 * EVERY FIELD IS NULLABLE. The statute qualifies each one "if provided by the
 * holder", and cash amount further "if applicable".
 */

export type PropertyField =
  | 'property_id'
  | 'owner_name'
  | 'insured_name'
  | 'beneficiary_name'
  | 'last_known_address_line1'
  | 'last_known_address_line2'
  | 'last_known_city'
  | 'last_known_state'
  | 'last_known_postal'
  | 'naupa_relation_code'
  | 'naupa_property_type'
  | 'cash_amount_cents'
  | 'share_count'
  | 'issuer_name'
  | 'cusip'
  | 'safe_deposit_contents'
  | 'date_of_last_activity'
  | 'year_reported'
  | 'holder_name'
  | 'holder_contact'
  // Present in California's file and nowhere in Georgia's. pending_claims is
  // a NEGATIVE signal — a claim already in flight makes this the worst target
  // on the list, not the best — and properties_workable excludes on it.
  | 'pending_claims_count'
  | 'paid_claims_count'
  | 'declared_owner_count'

/**
 * Header-name patterns, most specific first. Ordering matters: "owner name"
 * must not be captured by a looser /name/ pattern intended for the holder.
 */
const HEADER_PATTERNS: Array<[PropertyField, RegExp]> = [
  ['property_id', /^(property[_\s-]*id|prop[_\s-]*id|account[_\s-]*(number|no|id)|claim[_\s-]*id)$/i],
  ['owner_name', /^(owner[_\s-]*name|apparent[_\s-]*owner|owner|name[_\s-]*of[_\s-]*owner)$/i],
  ['insured_name', /insured/i],
  ['beneficiary_name', /benefic/i],
  ['last_known_address_line1', /^(owner[_\s-]*)?(address|addr)[_\s-]*(1|line[_\s-]*1)?$/i],
  ['last_known_address_line2', /^(owner[_\s-]*)?(address|addr)[_\s-]*(2|line[_\s-]*2)$/i],
  ['last_known_city', /^(owner[_\s-]*)?city$/i],
  ['last_known_state', /^(owner[_\s-]*)?(state|st)$/i],
  ['last_known_postal', /^(owner[_\s-]*)?(zip|postal)([_\s-]*code)?$/i],
  ['naupa_relation_code', /(relation|owner[_\s-]*type|naupa[_\s-]*relation)/i],
  ['naupa_property_type', /(property[_\s-]*type|prop[_\s-]*type|naupa[_\s-]*(code|type))/i],
  ['cash_amount_cents', /^(cash[_\s-]*amount|amount|current[_\s-]*(cash[_\s-]*)?balance|remitted[_\s-]*amount|value)$/i],
  ['share_count', /(share|number[_\s-]*of[_\s-]*shares)/i],
  ['issuer_name', /issuer/i],
  ['cusip', /cusip/i],
  ['safe_deposit_contents', /(safe[_\s-]*deposit|box[_\s-]*contents|contents)/i],
  ['date_of_last_activity', /(last[_\s-]*activity|date[_\s-]*of[_\s-]*last|dola)/i],
  ['year_reported', /(year[_\s-]*reported|report[_\s-]*year|reported)/i],
  ['holder_name', /holder[_\s-]*name|^holder$/i],
  ['holder_contact', /holder[_\s-]*(contact|phone|email|address)/i],
  // Anchored, not loose: /claims/ alone would also swallow a holder's claims
  // department column, and a phone number parsed as a claim count would
  // silently suppress the property from the queue.
  ['pending_claims_count', /^(number[_\s-]*of[_\s-]*)?pending[_\s-]*claims?$/i],
  ['paid_claims_count', /^(number[_\s-]*of[_\s-]*)?paid[_\s-]*claims?$/i],
  ['declared_owner_count', /^(no|num|number)[_\s-]*(of[_\s-]*)?owners?$/i],
]

export type ColumnMapping = Partial<Record<PropertyField, number>>

export interface MappingResult {
  mapping: ColumnMapping
  /** Header values we could not place. Recorded so nothing is lost silently. */
  unmapped: Array<{ index: number; header: string }>
  /** Fields we could not find a column for. */
  missing: PropertyField[]
  basis: 'header-names' | 'positional-fallback'
}

const ALL_FIELDS = HEADER_PATTERNS.map(([field]) => field)

export function mapColumnsFromHeader(headers: readonly string[]): MappingResult {
  const mapping: ColumnMapping = {}
  const taken = new Set<number>()
  const unmapped: Array<{ index: number; header: string }> = []

  for (const [field, pattern] of HEADER_PATTERNS) {
    const index = headers.findIndex(
      (h, i) => !taken.has(i) && pattern.test(h.trim().replace(/^"|"$/g, '')),
    )
    if (index !== -1) {
      mapping[field] = index
      taken.add(index)
    }
  }

  headers.forEach((header, index) => {
    if (!taken.has(index)) unmapped.push({ index, header: header.trim() })
  })

  return {
    mapping,
    unmapped,
    missing: ALL_FIELDS.filter((f) => mapping[f] === undefined),
    basis: 'header-names',
  }
}

/**
 * Fallback for a headerless file. DOR's Program Overview puts Property ID
 * first; the remaining order follows § 44-12-239.1(a)(1)–(10) as listed.
 *
 * This is a GUESS and is recorded as such on the ingest manifest. Question 5 in
 * docs/DOR-QUESTIONS.md exists to replace it with a fact.
 */
export const POSITIONAL_FALLBACK: readonly PropertyField[] = [
  'property_id',
  'owner_name',
  'last_known_address_line1',
  'last_known_city',
  'last_known_state',
  'last_known_postal',
  'naupa_relation_code',
  'cash_amount_cents',
  'share_count',
  'issuer_name',
  'cusip',
  'safe_deposit_contents',
  'naupa_property_type',
  'date_of_last_activity',
  'year_reported',
  'holder_name',
  'holder_contact',
]

export function mapColumnsPositionally(fieldCount: number): MappingResult {
  const mapping: ColumnMapping = {}
  POSITIONAL_FALLBACK.forEach((field, index) => {
    if (index < fieldCount) mapping[field] = index
  })
  return {
    mapping,
    unmapped: [],
    missing: ALL_FIELDS.filter((f) => mapping[f] === undefined),
    basis: 'positional-fallback',
  }
}

/**
 * Map by an EXPLICIT header-name pin rather than by pattern.
 *
 * The regex matcher is a good default and a bad guess. Against California's
 * real header it maps `CASH_REPORTED` into `year_reported` — a dollar amount in
 * a year column, silently, which then feeds derive_delivery_precision() and the
 * enforceability window. It does not fail; it corrupts.
 *
 * So where a source's real header has been read, it is pinned in
 * lib/acquire/sources.ts and resolved here. Every pin must MATCH: a pinned
 * column that is not present means the publisher changed the format, which is
 * exactly the moment to stop rather than fall back to guessing.
 *
 * Fields absent from the overrides are absent from the result. That is
 * deliberate — for a source that genuinely has no `date_of_last_activity`,
 * omission is the correct answer and inference is not.
 */
export function mapColumnsFromOverrides(
  headers: readonly string[],
  overrides: Readonly<Partial<Record<PropertyField, string>>>,
): MappingResult {
  const normalise = (h: string): string => h.replace(/^"|"$/g, '').trim().toLowerCase()
  const lookup = new Map(headers.map((h, i) => [normalise(h), i]))

  const mapping: ColumnMapping = {}
  const taken = new Set<number>()
  const notFound: string[] = []

  for (const [field, headerName] of Object.entries(overrides)) {
    if (headerName === undefined) continue
    const index = lookup.get(normalise(headerName))
    if (index === undefined) { notFound.push(`${field} -> "${headerName}"`); continue }
    mapping[field as PropertyField] = index
    taken.add(index)
  }

  if (notFound.length > 0) {
    throw new Error(
      `REFUSING: pinned columns are missing from the file header: ${notFound.join(', ')}.\n\n` +
      `Header seen: ${headers.map((h) => normalise(h)).join(', ')}\n\n` +
      'A pinned mapping that no longer matches means the publisher changed the ' +
      'format. Falling back to pattern matching here is how a dollar amount ends ' +
      'up in a year column. Re-read the header and update columnOverrides.',
    )
  }

  return {
    mapping,
    unmapped: headers
      .map((header, index) => ({ index, header }))
      .filter(({ index }) => !taken.has(index)),
    missing: ALL_FIELDS.filter((f) => mapping[f] === undefined),
    basis: 'header-names',
  }
}

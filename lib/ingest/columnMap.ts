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

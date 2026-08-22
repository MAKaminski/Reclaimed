/**
 * COPY encoding — the NULL distinction matters legally.
 *
 * COPY's TEXT format is used rather than CSV precisely because CSV cannot
 * distinguish an empty string from NULL. That distinction is not cosmetic here:
 * a NULL cash_amount_cents means the holder reported NO VALUE, which forces
 * UP-CDR2 Path B under § 44-12-224(c)(3) — percentages instead of dollars. A
 * reported zero is a completely different fact.
 */

import { describe, expect, it } from 'vitest'
import { encodeCopyRow } from '@/lib/ingest/load'
import type { ParsedProperty } from '@/lib/ingest/parse'

const RUN = '00000000-0000-0000-0000-0000000000ff'

function row(overrides: Partial<ParsedProperty> = {}): ParsedProperty {
  return {
    property_id: 'GA001',
    raw: null,
    source_key: null,
    owner_name: 'SMITH, JAMES',
    insured_name: null,
    beneficiary_name: null,
    last_known_address_line1: null,
    last_known_address_line2: null,
    last_known_city: null,
    last_known_state: null,
    last_known_postal: null,
    naupa_relation_code: null,
    naupa_property_type: null,
    cash_amount_cents: null,
    share_count: null,
    issuer_name: null,
    cusip: null,
    safe_deposit_contents: null,
    date_of_last_activity: null,
    year_reported: null,
    holder_name: null,
    holder_contact: null,
    ...overrides,
  }
}

describe('COPY text encoding', () => {
  it('distinguishes NULL from zero — Path B depends on it', () => {
    const nullValue = encodeCopyRow(RUN, row({ cash_amount_cents: null })).split('\t')[12]
    const zeroValue = encodeCopyRow(RUN, row({ cash_amount_cents: 0 })).split('\t')[12]
    expect(nullValue).toBe('\\N')
    expect(zeroValue).toBe('0')
    expect(nullValue).not.toBe(zeroValue)
  })

  it('distinguishes NULL from an empty string', () => {
    const asNull = encodeCopyRow(RUN, row({ owner_name: null })).split('\t')[2]
    const asEmpty = encodeCopyRow(RUN, row({ owner_name: '' })).split('\t')[2]
    expect(asNull).toBe('\\N')
    expect(asEmpty).toBe('')
  })

  it('escapes tabs, newlines, and backslashes so a value cannot break the row', () => {
    const encoded = encodeCopyRow(RUN, row({ owner_name: 'A\tB\nC\\D\rE' }))
    const field = encoded.split('\t')[2]
    expect(field).toBe('A\\tB\\nC\\\\D\\rE')
    // Exactly one row terminator, and exactly the expected column count.
    expect(encoded.split('\n')).toHaveLength(2)
    expect(encoded.trimEnd().split('\t')).toHaveLength(23)  // + raw, source_key
  })

  it('a delimiter hidden in a name cannot shift the column count', () => {
    // The exact failure mode that would misalign cash_amount into another column.
    const encoded = encodeCopyRow(RUN, row({
      owner_name: 'EVIL\t9999999\tCORP',
      cash_amount_cents: 12345,
    }))
    const fields = encoded.trimEnd().split('\t')
    expect(fields).toHaveLength(23)  // + raw, source_key (migration 0023)
    expect(fields[12]).toBe('12345') // still the real amount, in the right slot
  })

  it('emits integer cents, never a float', () => {
    const fields = encodeCopyRow(RUN, row({ cash_amount_cents: 400000 })).split('\t')
    expect(fields[12]).toBe('400000')
    expect(fields[12]).not.toContain('.')
  })

  it('puts the run id first and the property id second', () => {
    const fields = encodeCopyRow(RUN, row()).split('\t')
    expect(fields[0]).toBe(RUN)
    expect(fields[1]).toBe('GA001')
  })
})

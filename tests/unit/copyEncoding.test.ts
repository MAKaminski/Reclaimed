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
import { COPY_COLUMNS, encodeCopyRow } from '@/lib/ingest/load'
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
    pending_claims_count: null,
    paid_claims_count: null,
    declared_owner_count: null,
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
    expect(encoded.trimEnd().split('\t')).toHaveLength(COPY_COLUMNS.length)
  })

  it('a delimiter hidden in a name cannot shift the column count', () => {
    // The exact failure mode that would misalign cash_amount into another column.
    const encoded = encodeCopyRow(RUN, row({
      owner_name: 'EVIL\t9999999\tCORP',
      cash_amount_cents: 12345,
    }))
    const fields = encoded.trimEnd().split('\t')
    expect(fields).toHaveLength(COPY_COLUMNS.length)
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

describe('raw is JSONB, so the encoded value must be valid JSON', () => {
  // Regression. `raw` was written as the bare delimited source line, which is
  // not JSON, and Postgres rejected the COPY with "invalid input syntax for
  // type json" partway through a live load. The dry run never encodes anything,
  // so only a real write could surface it — hence this test.
  function rawField(line: string | null): string {
    const encoded = encodeCopyRow(RUN, row({ raw: line }))
    // raw is the second-to-last column; source_key is last.
    const fields = encoded.trimEnd().split('\t')
    return fields[fields.length - 2]!
  }

  // Undo the COPY text-format escaping Postgres reverses on the way in.
  //
  // Must be ONE left-to-right pass. Sequential .replace() calls corrupt the
  // result: unescaping \\n before \\\\ turns the two characters backslash-n,
  // which the encoder wrote as \\\\n, into a real newline.
  function unescapeCopy(v: string): string {
    return v.replace(/\\(.)/g, (_m, c: string) =>
      c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c)
  }

  it('encodes a plain source line as a parseable JSON string', () => {
    const line = '"1031519745","SC12: SHARES","0.00","463.000000"'
    expect(() => JSON.parse(unescapeCopy(rawField(line)))).not.toThrow()
    expect(JSON.parse(unescapeCopy(rawField(line)))).toBe(line)
  })

  it('survives a line containing quotes, backslashes and delimiters', () => {
    const line = 'A\\B\t"C,D"|E'
    expect(JSON.parse(unescapeCopy(rawField(line)))).toBe(line)
  })

  it('writes NULL, not the string "null", when raw is absent', () => {
    expect(rawField(null)).toBe('\\N')
  })

  /**
   * The encoder is POSITIONAL: COPY_COLUMNS and the value array must stay in
   * lockstep. Adding three columns before `raw` shifts every later index, and
   * nothing in the type system catches a mismatch — both sides are just lists.
   * Pinning the indices means a future insertion in the wrong place fails here
   * rather than writing claim counts into a JSONB column at 3am.
   */
  it('writes the claim counts at their COPY positions, ahead of raw', () => {
    const encoded = encodeCopyRow(RUN, row({
      pending_claims_count: 2,
      paid_claims_count: 1,
      declared_owner_count: 9,
      holder_contact: 'x',
      source_key: 'CA-SCO-UPD-500',
    })).trimEnd().split('\t')

    expect(encoded[21]).toBe('2')                 // pending_claims_count
    expect(encoded[22]).toBe('1')                 // paid_claims_count
    expect(encoded[23]).toBe('9')                 // declared_owner_count
    expect(encoded[24]).toBe('\\N')               // raw, still NULL
    expect(encoded[25]).toBe('CA-SCO-UPD-500')    // source_key
  })

  it('keeps "no claims reported" distinct from "zero claims"', () => {
    const unknown = encodeCopyRow(RUN, row({ pending_claims_count: null })).split('\t')[21]
    const none = encodeCopyRow(RUN, row({ pending_claims_count: 0 })).split('\t')[21]
    expect(unknown).toBe('\\N')
    expect(none).toBe('0')
  })
})

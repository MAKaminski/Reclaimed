/**
 * Ingest tests — build spec §5.
 *
 * DOR "cannot offer any assistance in using this database", so the parser must
 * sniff. These tests exist to prove it sniffs correctly on formats we have
 * never seen, because the first real delivery is the one that matters and we
 * only get it after registration.
 */

import { describe, expect, it } from 'vitest'
import {
  detectDelimiter, detectEncoding, detectHeader, detectLineEnding,
  inferFormat, splitLine, stripBom,
} from '@/lib/ingest/sniff'
import { mapColumnsFromHeader, mapColumnsPositionally } from '@/lib/ingest/columnMap'
import {
  coerceCents, coerceCusip, coerceDate, coerceState, coerceText, coerceYear,
} from '@/lib/ingest/coerce'
import { parseRow } from '@/lib/ingest/parse'

describe('delimiter detection scores CONSISTENCY, not frequency', () => {
  it('picks the pipe even when commas are more numerous', () => {
    // The classic trap: unquoted entity names contain commas, so a
    // frequency-based guess corrupts the whole load.
    const lines = [
      'GA001|PEACHTREE VENTURES, LLC|123 MAIN ST, APT 4|ATLANTA|GA',
      'GA002|SMITH, JAMES|456 OAK AVE, STE 2|MACON|GA',
      'GA003|ATLANTA CAPITAL, INC|789 ELM RD, UNIT 9|AUGUSTA|GA',
    ]
    expect(detectDelimiter(lines).delimiter).toBe('|')
  })

  it('detects a tab', () => {
    const lines = ['a\tb\tc\td', 'e\tf\tg\th', 'i\tj\tk\tl']
    expect(detectDelimiter(lines).delimiter).toBe('\t')
  })

  it('detects an exotic control-character delimiter', () => {
    // Government extracts sometimes use SOH precisely to avoid the comma trap.
    const lines = ['a\x01b\x01c\x01d', 'e\x01f\x01g\x01h', 'i\x01j\x01k\x01l']
    expect(detectDelimiter(lines).delimiter).toBe('\x01')
  })

  it('detects a tilde', () => {
    const lines = ['a~b~c~d~e', 'f~g~h~i~j', 'k~l~m~n~o']
    expect(detectDelimiter(lines).delimiter).toBe('~')
  })

  it('reports low confidence when field counts are inconsistent', () => {
    const ragged = ['a,b,c', 'd,e', 'f,g,h,i,j,k', 'l']
    expect(detectDelimiter(ragged).confidence).toBeLessThan(0.5)
  })
})

describe('encoding detection', () => {
  it('reads a UTF-8 BOM', () => {
    expect(detectEncoding(Buffer.from('﻿hello', 'utf8'))).toEqual({
      encoding: 'utf8', basis: 'bom',
    })
  })

  it('reads a UTF-16LE BOM', () => {
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x68, 0x00]))).toEqual({
      encoding: 'utf16le', basis: 'bom',
    })
  })

  it('detects BOM-less UTF-16LE from null-byte density', () => {
    const utf16 = Buffer.from('PROPERTY ID|OWNER NAME|CITY'.repeat(40), 'utf16le')
    expect(detectEncoding(utf16).encoding).toBe('utf16le')
  })

  it('falls back to latin1 rather than losing bytes', () => {
    // 0xA9 alone is not valid UTF-8.
    const latin = Buffer.from([0x53, 0x4d, 0x49, 0x54, 0x48, 0xa9, 0x20, 0x43, 0x4f])
    expect(detectEncoding(latin).encoding).toBe('latin1')
  })

  it('strips a BOM from decoded text', () => {
    expect(stripBom('﻿PROPERTY ID')).toBe('PROPERTY ID')
  })
})

describe('header detection by type inference', () => {
  it('detects a header when the body is numeric and row 1 is not', () => {
    const rows = [
      ['PROPERTY ID', 'AMOUNT', 'YEAR'],
      ['GA001', '1234.56', '2019'],
      ['GA002', '99.00', '2020'],
      ['GA003', '4500.10', '2018'],
      ['GA004', '12.75', '2021'],
    ]
    const result = detectHeader(rows)
    expect(result.hasHeader).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('detects a HEADERLESS file — the case that silently eats row 1', () => {
    const rows = [
      ['GA001', '1234.56', '2019'],
      ['GA002', '99.00', '2020'],
      ['GA003', '4500.10', '2018'],
      ['GA004', '12.75', '2021'],
    ]
    expect(detectHeader(rows).hasHeader).toBe(false)
  })

  it('detects CRLF line endings', () => {
    expect(detectLineEnding('a\r\nb\r\nc\r\n')).toBe('\r\n')
    expect(detectLineEnding('a\nb\nc\n')).toBe('\n')
  })
})

describe('quoted-field splitting', () => {
  it('honours quotes around embedded delimiters', () => {
    expect(splitLine('GA001,"SMITH, JAMES",ATLANTA', ',', '"'))
      .toEqual(['GA001', 'SMITH, JAMES', 'ATLANTA'])
  })

  it('honours doubled quotes as an escape', () => {
    expect(splitLine('GA001,"THE ""BIG"" CO",GA', ',', '"'))
      .toEqual(['GA001', 'THE "BIG" CO', 'GA'])
  })

  it('splits plainly when the file is unquoted', () => {
    expect(splitLine('GA001|SMITH, JAMES|ATLANTA', '|', null))
      .toEqual(['GA001', 'SMITH, JAMES', 'ATLANTA'])
  })
})

describe('full-format inference over a realistic head', () => {
  it('infers pipe + BOM + CRLF + header together', () => {
    const body = Array.from({ length: 40 }, (_, i) =>
      `GA${String(i).padStart(6, '0')}|SMITH, JAMES|ATLANTA|GA|${(i * 13.5).toFixed(2)}|20${10 + (i % 15)}`,
    ).join('\r\n')
    const head = Buffer.from(
      `﻿PROPERTY ID|OWNER NAME|CITY|STATE|CASH AMOUNT|YEAR REPORTED\r\n${body}\r\n`,
      'utf8',
    )
    const inference = inferFormat(head)
    expect(inference.delimiter).toBe('|')
    expect(inference.encoding).toBe('utf8')
    expect(inference.lineEnding).toBe('\r\n')
    expect(inference.hasHeader).toBe(true)
    expect(inference.fieldCount).toBe(6)
    expect(inference.columns?.[0]).toBe('PROPERTY ID')
  })
})

describe('column mapping', () => {
  it('maps DOR-style headers onto schema fields', () => {
    const { mapping } = mapColumnsFromHeader([
      'PROPERTY ID', 'OWNER NAME', 'OWNER ADDRESS 1', 'OWNER CITY', 'OWNER STATE',
      'OWNER ZIP', 'RELATION CODE', 'PROPERTY TYPE', 'CASH AMOUNT', 'CUSIP',
      'DATE OF LAST ACTIVITY', 'YEAR REPORTED', 'HOLDER NAME',
    ])
    expect(mapping.property_id).toBe(0)
    expect(mapping.owner_name).toBe(1)
    expect(mapping.cash_amount_cents).toBe(8)
    expect(mapping.year_reported).toBe(11)
    expect(mapping.holder_name).toBe(12)
  })

  it('does not let the holder name capture the owner-name column', () => {
    const { mapping } = mapColumnsFromHeader(['PROPERTY ID', 'HOLDER NAME', 'OWNER NAME'])
    expect(mapping.owner_name).toBe(2)
    expect(mapping.holder_name).toBe(1)
  })

  it('records headers it could not place rather than dropping them', () => {
    const result = mapColumnsFromHeader(['PROPERTY ID', 'OWNER NAME', 'MYSTERY COLUMN'])
    expect(result.unmapped).toEqual([{ index: 2, header: 'MYSTERY COLUMN' }])
  })

  it('falls back positionally for a headerless file', () => {
    const { mapping, basis } = mapColumnsPositionally(8)
    expect(basis).toBe('positional-fallback')
    expect(mapping.property_id).toBe(0)
    expect(mapping.cash_amount_cents).toBe(7)
  })
})

describe('value coercion is strict — a misread amount is worse than a null', () => {
  it('reads money in the shapes government extracts actually use', () => {
    expect(coerceCents('1234.56')).toBe(123_456)
    expect(coerceCents('$1,234.56')).toBe(123_456)
    expect(coerceCents(' 99.00 ')).toBe(9_900)
    expect(coerceCents('(500.00)')).toBe(-50_000) // accounting negative
    expect(coerceCents('0')).toBe(0)
  })

  it('returns null for a value it cannot read exactly', () => {
    // NULL is not zero: a null cash amount forces UP-CDR2 Path B, whereas a
    // wrong zero would silently drop the property below the workability floor.
    expect(coerceCents('')).toBeNull()
    expect(coerceCents('N/A')).toBeNull()
    expect(coerceCents('UNKNOWN')).toBeNull()
    expect(coerceCents('SEE HOLDER')).toBeNull()
    expect(coerceCents('1.234')).toBeNull() // three decimals is not cents
  })

  it('treats placeholder text as absent', () => {
    for (const placeholder of ['N/A', 'NULL', 'none', 'UNKNOWN', '--', '.']) {
      expect(coerceText(placeholder), placeholder).toBeNull()
    }
    expect(coerceText('  SMITH, JAMES  ')).toBe('SMITH, JAMES')
  })

  it('reads mixed date formats and rejects impossible dates', () => {
    expect(coerceDate('2019-03-15')).toBe('2019-03-15')
    expect(coerceDate('3/15/2019')).toBe('2019-03-15')
    expect(coerceDate('20190315')).toBe('2019-03-15')
    expect(coerceDate('2019-02-31')).toBeNull()
    expect(coerceDate('15/03/19')).toBeNull() // ambiguous — refuse to guess
  })

  it('bounds the reported year', () => {
    expect(coerceYear('2019')).toBe(2019)
    expect(coerceYear('19')).toBeNull()
    expect(coerceYear('9999')).toBeNull()
  })

  it('validates state and CUSIP shape', () => {
    expect(coerceState('ga')).toBe('GA')
    expect(coerceState('Georgia')).toBeNull()
    expect(coerceCusip('037833100')).toBe('037833100')
    expect(coerceCusip('BAD')).toBeNull()
  })
})

describe('row parsing', () => {
  const mapping = { property_id: 0, owner_name: 1, cash_amount_cents: 2, year_reported: 3 }

  it('parses a well-formed row', () => {
    const row = parseRow(['GA001', 'SMITH, JAMES', '1234.56', '2019'], mapping)
    expect(row).toMatchObject({
      property_id: 'GA001',
      owner_name: 'SMITH, JAMES',
      cash_amount_cents: 123_456,
      year_reported: 2019,
    })
  })

  it('REJECTS a row with no property_id — it is the join key and UP-CDR2 §I requires it', () => {
    expect(parseRow(['', 'SMITH, JAMES', '1234.56', '2019'], mapping)).toBeNull()
    expect(parseRow(['N/A', 'SMITH, JAMES', '1234.56', '2019'], mapping)).toBeNull()
  })

  it('keeps a sparse row — every field is "if provided by the holder"', () => {
    const row = parseRow(['GA002', '', '', ''], mapping)
    expect(row).toMatchObject({
      property_id: 'GA002',
      owner_name: null,
      cash_amount_cents: null,
      year_reported: null,
    })
  })
})

describe('field-count mismatch is handled ASYMMETRICALLY', () => {
  // Surplus fields shift every later column, so a cash amount would be read
  // from the wrong position and flow into the § 44-12-224(d)(1) cap basis.
  // A null is recoverable; a wrong number is not.
  it('rejects a row with surplus fields, and keeps one with trimmed trailing empties', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { parseFile } = await import('@/lib/ingest/parse')

    const dir = mkdtempSync(join(tmpdir(), 'ingest-'))
    const path = join(dir, 'sample.txt')

    const header = 'PROPERTY ID|OWNER NAME|CITY|STATE|CASH AMOUNT|YEAR REPORTED'
    const good = Array.from({ length: 30 }, (_, i) =>
      `GA${String(i).padStart(6, '0')}|SMITH, JAMES|ATLANTA|GA|${(i * 11.25).toFixed(2)}|20${10 + (i % 15)}`,
    )
    const surplus = 'GA999901|BAD, ROW|ATLANTA|GA|100.00|2019|STRAY|EXTRA'
    const trimmed = 'GA999902|SHORT, ROW|ATLANTA|GA'

    writeFileSync(path, [header, ...good, surplus, trimmed].join('\r\n') + '\r\n')

    const seen: string[] = []
    const result = await parseFile(path, {
      onBatch: (rows) => { seen.push(...rows.map((r) => r.property_id)) },
    })

    expect(result.rowsRejected).toBe(1)
    expect(result.rejectSamples[0]?.reason).toContain('misalign')
    expect(seen).not.toContain('GA999901')  // surplus → rejected
    expect(seen).toContain('GA999902')      // trimmed trailing → kept
  })
})

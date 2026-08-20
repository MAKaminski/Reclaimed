/**
 * Generate a synthetic DOR bulk file.
 *
 * The real file is a registration entitlement under § 44-12-239.1(a) and will
 * not exist until DOR issues a CDR number. Until then the ingest pipeline is
 * validated against a fixture built from the statutory field list.
 *
 * Deliberately awkward by default, because the point is to prove the parser
 * SNIFFS rather than assumes:
 *   · pipe-delimited, which no CSV default would guess
 *   · CRLF line endings
 *   · a UTF-8 BOM
 *   · sparse fields — the statute qualifies every field "if provided by the
 *     holder", so most rows are mostly empty
 *   · malformed rows, placeholder nulls, accounting negatives, mixed date
 *     formats, and commas inside unquoted names
 *
 * Usage:
 *   pnpm tsx scripts/generate-fixture.ts --rows 100000 --out data/fixtures/week1.txt
 *   pnpm tsx scripts/generate-fixture.ts --gb 1 --out data/fixtures/big.txt
 *   pnpm tsx scripts/generate-fixture.ts --from week1.txt --week 2 --out week2.txt
 */

import { createWriteStream } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'

const HEADERS = [
  'PROPERTY ID', 'OWNER NAME', 'OWNER ADDRESS 1', 'OWNER ADDRESS 2', 'OWNER CITY',
  'OWNER STATE', 'OWNER ZIP', 'RELATION CODE', 'PROPERTY TYPE', 'CASH AMOUNT',
  'SHARES', 'ISSUER NAME', 'CUSIP', 'BOX CONTENTS', 'DATE OF LAST ACTIVITY',
  'YEAR REPORTED', 'HOLDER NAME', 'HOLDER CONTACT',
]

const DELIM = '|'
const EOL = '\r\n'

const SURNAMES = ['SMITH', 'JOHNSON', 'WILLIAMS', 'BROWN', 'JONES', 'GARCIA', 'MILLER', 'DAVIS', 'MARTINEZ', 'HERNANDEZ', 'LOPEZ', 'WILSON', 'ANDERSON', 'THOMAS', 'TAYLOR', 'MOORE', 'JACKSON', 'WHITE']
const GIVEN = ['JAMES', 'MARY', 'ROBERT', 'PATRICIA', 'JOHN', 'JENNIFER', 'MICHAEL', 'LINDA', 'DAVID', 'ELIZABETH', 'WILLIAM', 'BARBARA', 'RICHARD', 'SUSAN']
const ENTITY_SUFFIX = ['LLC', 'INC', 'CORP', 'CO', 'L.L.C.', 'INCORPORATED', 'COMPANY', 'PARTNERS LP', 'HOLDINGS INC']
const ENTITY_STEM = ['PEACHTREE', 'ATLANTA', 'SAVANNAH', 'MACON', 'AUGUSTA', 'COLUMBUS', 'ATHENS', 'MARIETTA', 'ROSWELL', 'VALDOSTA']
const CITIES = ['ATLANTA', 'AUGUSTA', 'COLUMBUS', 'MACON', 'SAVANNAH', 'ATHENS', 'SANDY SPRINGS', 'ROSWELL', 'ALBANY', 'MARIETTA']
const HOLDERS = ['TRUIST BANK', 'BANK OF AMERICA NA', 'WELLS FARGO BANK NA', 'STATE FARM', 'AFLAC INC', 'GEORGIA POWER CO', 'DELTA AIR LINES INC', 'HOME DEPOT USA INC']
const PROPERTY_TYPES = ['AC01 CHECKING ACCOUNT', 'AC02 SAVINGS ACCOUNT', 'CK01 CASHIERS CHECK', 'IN01 INDIVIDUAL POLICY BENEFIT', 'MS01 WAGES', 'SD01 SAFE DEPOSIT BOX CONTENTS', 'SC01 DIVIDENDS', 'UT01 UTILITY DEPOSIT', 'TR01 PAYING AGENT ACCOUNT']
const RELATION = ['SO', 'JT', 'OW', 'AD', 'BF', 'CU', 'TE']

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRow(rand: () => number, index: number, valueShift = 0): string {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
  const chance = (p: number): boolean => rand() < p

  const propertyId = `GA${String(index).padStart(10, '0')}`

  const isEntity = chance(0.22)
  const isMulti = !isEntity && chance(0.12)
  let ownerName: string
  if (isEntity) {
    // Commas inside an UNQUOTED field — the classic reason a comma-delimiter
    // guess corrupts a load.
    ownerName = `${pick(ENTITY_STEM)} ${pick(['PROPERTIES', 'VENTURES', 'CAPITAL', 'SERVICES'])}, ${pick(ENTITY_SUFFIX)}`
  } else if (isMulti) {
    ownerName = `${pick(SURNAMES)}, ${pick(GIVEN)} & ${pick(GIVEN)}`
  } else {
    ownerName = `${pick(SURNAMES)}, ${pick(GIVEN)}`
  }

  const propertyType = pick(PROPERTY_TYPES)
  const isSafeDeposit = propertyType.startsWith('SD')
  const isSecurity = propertyType.startsWith('SC') && chance(0.6)

  // Long tail: most unclaimed property is small. § 44-12-220(d.1)(1) auto-pay
  // drains the sub-$500 sole-owner cash tier, so the fixture must be dense there.
  let cash = ''
  if (!isSafeDeposit && !isSecurity) {
    if (chance(0.04)) cash = '' // holder reported no value → UP-CDR2 Path B
    else {
      const r = rand()
      const dollars = r < 0.62 ? rand() * 500
        : r < 0.9 ? 500 + rand() * 4_500
        : r < 0.99 ? 5_000 + rand() * 45_000
        : 50_000 + rand() * 450_000
      const shifted = dollars * (1 + valueShift)
      cash = chance(0.02) ? `(${shifted.toFixed(2)})` : shifted.toFixed(2)
      if (chance(0.15)) cash = `$${Number(cash).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    }
  }

  // Mixed date formats within one file — a real hazard in government extracts.
  const year = 2008 + Math.floor(rand() * 18)
  const month = 1 + Math.floor(rand() * 12)
  const day = 1 + Math.floor(rand() * 28)
  const dola = chance(0.18) ? '' : chance(0.5)
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : `${month}/${day}/${year}`

  const sparse = (value: string, keepProbability: number): string =>
    chance(keepProbability) ? value : chance(0.3) ? pick(['N/A', 'NULL', 'UNKNOWN', '']) : ''

  const fields = [
    propertyId,
    ownerName,
    sparse(`${100 + Math.floor(rand() * 9899)} ${pick(['PEACHTREE ST', 'MAIN ST', 'OAK AVE', 'PONCE DE LEON AVE'])}`, 0.72),
    sparse(`${pick(['APT', 'STE', 'UNIT'])} ${1 + Math.floor(rand() * 400)}`, 0.18),
    sparse(pick(CITIES), 0.74),
    sparse('GA', 0.76),
    sparse(String(30000 + Math.floor(rand() * 2999)), 0.7),
    pick(RELATION),
    propertyType,
    cash,
    isSecurity ? (rand() * 500).toFixed(4) : '',
    isSecurity ? `${pick(ENTITY_STEM)} CORP` : '',
    isSecurity ? `${String(Math.floor(rand() * 1e9)).padStart(9, '0')}` : '',
    isSafeDeposit ? pick(['COINS, JEWELRY', 'DOCUMENTS', 'MISC CONTENTS', 'STAMPS AND CURRENCY']) : '',
    dola,
    String(year + 1),
    pick(HOLDERS),
    sparse(`PO BOX ${1000 + Math.floor(rand() * 8999)}, ATLANTA GA`, 0.55),
  ]
  return fields.join(DELIM)
}

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i]?.replace(/^--/, '')
    if (key !== undefined) out[key] = process.argv[i + 1] ?? 'true'
  }
  return out
}

async function generateFresh(outPath: string, targetRows: number | null, targetBytes: number | null, seed: number): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true })
  const out = createWriteStream(outPath)
  const rand = mulberry32(seed)

  // UTF-8 BOM, so encoding detection has something to find.
  out.write('﻿')
  out.write(HEADERS.join(DELIM) + EOL)

  let bytes = 0
  let rows = 0
  let buffer = ''

  const shouldContinue = (): boolean =>
    targetRows !== null ? rows < targetRows : bytes < (targetBytes ?? 0)

  while (shouldContinue()) {
    rows++
    // A malformed row roughly every 20k lines: an extra unescaped delimiter.
    const line = rows % 20_000 === 0
      ? makeRow(rand, rows, 0) + `${DELIM}STRAY${DELIM}EXTRA`
      : makeRow(rand, rows, 0)
    buffer += line + EOL
    bytes += Buffer.byteLength(line) + 2

    if (buffer.length > 1 << 20) {
      if (!out.write(buffer)) await new Promise((r) => out.once('drain', r))
      buffer = ''
    }
  }
  if (buffer !== '') out.write(buffer)
  await new Promise<void>((r) => out.end(r))
  console.log(`✓ ${outPath}: ${rows.toLocaleString()} rows, ${(bytes / 1e6).toFixed(1)} MB`)
}

/**
 * Derive a later weekly delivery from an earlier one, simulating real deltas:
 * some properties disappear (claimed), some change value, some are new.
 */
async function generateDelta(fromPath: string, outPath: string, week: number): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true })
  const out = createWriteStream(outPath)
  const rand = mulberry32(9000 + week)

  out.write('﻿')
  out.write(HEADERS.join(DELIM) + EOL)

  const rl = createInterface({ input: createReadStream(fromPath), crlfDelay: Infinity })
  let lineNo = 0
  let kept = 0, disappeared = 0, changed = 0, maxIndex = 0

  for await (const raw of rl) {
    const line = lineNo === 0 ? raw.replace(/^﻿/, '') : raw
    lineNo++
    if (lineNo === 1) continue // header
    if (line.trim() === '') continue

    const fields = line.split(DELIM)
    const id = fields[0] ?? ''
    const n = Number(id.replace(/^GA0*/, ''))
    if (Number.isFinite(n)) maxIndex = Math.max(maxIndex, n)

    // ~1.5% claimed each week: these DISAPPEAR, the highest-signal event.
    if (rand() < 0.015) { disappeared++; continue }

    // ~0.8% revalued (interest, partial payment, holder correction).
    if (rand() < 0.008 && fields[9] !== undefined && fields[9] !== '') {
      const current = Number(fields[9].replace(/[$,()]/g, ''))
      if (Number.isFinite(current) && current > 0) {
        fields[9] = (current * (1 + (rand() - 0.4) * 0.2)).toFixed(2)
        changed++
      }
    }
    kept++
    out.write(fields.join(DELIM) + EOL)
  }

  // ~2% newly reported property each week.
  const newRows = Math.floor(kept * 0.02)
  for (let i = 1; i <= newRows; i++) {
    out.write(makeRow(rand, maxIndex + i, 0) + EOL)
  }

  await new Promise<void>((r) => out.end(r))
  console.log(
    `✓ ${outPath}: week ${week} — ${kept.toLocaleString()} carried, ` +
    `${disappeared.toLocaleString()} disappeared, ${changed.toLocaleString()} revalued, ` +
    `${newRows.toLocaleString()} new`,
  )
}

const args = parseArgs()
const out = resolve(args.out ?? 'data/fixtures/week1.txt')

if (args.from !== undefined) {
  await generateDelta(resolve(args.from), out, Number(args.week ?? 2))
} else {
  await generateFresh(
    out,
    args.rows !== undefined ? Number(args.rows) : null,
    args.gb !== undefined ? Number(args.gb) * 1e9 : null,
    Number(args.seed ?? 20260820),
  )
}

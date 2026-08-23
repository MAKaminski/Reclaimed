/**
 * The holdings sort allowlist.
 *
 * `resolveSort` decides which database column a query-string parameter is
 * allowed to reach. PostgREST's `.order()` takes a column NAME, so an
 * unvalidated parameter lets a visitor order by any column on the table —
 * including ones deliberately kept out of the select list. RLS still bounds what
 * comes back, but ordering by a column you cannot read leaks its contents by
 * inference, one page at a time.
 *
 * The prototype-chain case is the one worth pinning. `'toString' in SORTABLE` is
 * true, so an `in` check accepts it, and the lookup then yields undefined — which
 * reaches `.order(undefined)` rather than being rejected. That is exactly the
 * shape of bug an allowlist is supposed to prevent, written by someone who
 * believed they had written an allowlist.
 */

import { describe, expect, it } from 'vitest'
import { SORTABLE, resolveSort } from '@/lib/db/holdings'

describe('holdings sort allowlist', () => {
  it('accepts every declared key and maps it to a real column', () => {
    for (const key of Object.keys(SORTABLE)) {
      expect(resolveSort(key)).toBe(key)
      const column = SORTABLE[key as keyof typeof SORTABLE].column
      expect(typeof column).toBe('string')
      expect(column.length).toBeGreaterThan(0)
    }
  })

  it('falls back to value for anything undeclared', () => {
    for (const bad of ['', 'nope', 'raw', 'password', 'property_id']) {
      expect(resolveSort(bad)).toBe('value')
    }
    expect(resolveSort(undefined)).toBe('value')
  })

  it('does not accept inherited Object properties', () => {
    // `in` would pass all of these. Object.hasOwn does not.
    for (const inherited of ['toString', 'constructor', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(resolveSort(inherited)).toBe('value')
    }
  })

  it('never resolves to a key without a column, however it is reached', () => {
    for (const attempt of ['toString', 'constructor', 'value', 'holder', 'bogus']) {
      const resolved = resolveSort(attempt)
      expect(SORTABLE[resolved]).toBeDefined()
      expect(SORTABLE[resolved].column).toBeTypeOf('string')
    }
  })
})

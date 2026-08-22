/**
 * ACQUISITION — no circumvention. ADR-0001 §3, O.C.G.A. § 44-12-239(d).
 *
 * Every assertion here constructs the violation in memory and asserts the
 * checker rejects it. That discipline exists because four static gates in this
 * repo shipped green as decoration — satisfied by text that merely MENTIONED
 * what they checked — and were only found when somebody broke the code
 * deliberately and watched nothing happen.
 */

import { describe, expect, it } from 'vitest'
import {
  checkNoUrlsOnNonOpen, checkRefusalSubstantive, checkOneNetworkDoor,
  checkNoUserAgent, checkPackages,
} from '@/lib/acquire/verify'
import {
  SOURCES, listSources, refusalFor, assertFetchable, requiresRegistration,
  AcquisitionRefusedError, type DataSource,
} from '@/lib/acquire/sources'
import { detectChallenge, assertNoChallenge, ChallengeDetectedError } from '@/lib/acquire/challenge'

const GA = SOURCES['GA-DOR-CDR']
const CA = SOURCES['CA-SCO-UPD-500']

describe('§ 44-12-239.1(a) — Georgia data is entitled, never fetched', () => {
  it('refuses to be fetched, citing the statute', () => {
    expect(() => assertFetchable(GA)).toThrow(AcquisitionRefusedError)
    expect(() => assertFetchable(GA)).toThrow(/44-12-239\.1\(a\)/)
  })

  it('names the portal and why we do not touch it', () => {
    const refusal = refusalFor(GA)!
    expect(refusal).toMatch(/gaclaims\.unclaimedproperty\.com/)
    expect(refusal).toMatch(/reCAPTCHA/i)
    expect(refusal).toMatch(/20 years|twenty years/i)
  })

  it('carries no fetchable URL anywhere in its object graph', () => {
    // Prose naming a host is fine; an http(s) URL is not.
    expect(checkNoUrlsOnNonOpen(GA)).toEqual([])
  })

  it('gates on registration, DERIVED from the permission mode', () => {
    expect(requiresRegistration(GA)).toBe(true)
    // California is public data. Gating it would put it behind $1,200 and 4-8
    // weeks for no reason.
    expect(requiresRegistration(CA)).toBe(false)
  })
})

describe('the type is the primary control; the checker is belt and braces', () => {
  it('rejects a restricted source that smuggles in a URL', () => {
    const smuggled = {
      ...GA,
      permission: {
        mode: 'restricted',
        refusal: 'A perfectly adequate refusal string, long enough to satisfy the minimum.',
        control: { kind: 'challenge', observedAt: '2026-08-22', observed: 'HTTP 403' },
        // Not reachable through the type — this is the belt-and-braces case.
        sneaky: { url: 'https://example.gov/records.zip' },
      },
    } as unknown as DataSource

    const found = checkNoUrlsOnNonOpen(smuggled)
    expect(found).toHaveLength(1)
    expect(found[0]!.reason).toMatch(/fetchable URL/)
  })

  it('accepts an open source carrying its URL', () => {
    expect(checkNoUrlsOnNonOpen(CA)).toEqual([])
  })
})

describe('a refusal has to explain itself', () => {
  it('rejects a terse refusal', () => {
    const terse = {
      ...GA,
      permission: { ...GA.permission, refusal: 'no' },
    } as unknown as DataSource
    expect(checkRefusalSubstantive(terse)).toHaveLength(1)
  })

  it('accepts every real refusal in the registry', () => {
    for (const source of listSources()) {
      expect(checkRefusalSubstantive(source)).toEqual([])
    }
  })
})

describe('one network door', () => {
  it('rejects a bare fetch()', () => {
    const found = checkOneNetworkDoor('lib/acquire/x.ts', 'const r = await fetch(url)')
    expect(found.some((v) => /only HTTP entry point/.test(v.reason))).toBe(true)
  })

  it('accepts safeFetch()', () => {
    expect(checkOneNetworkDoor('lib/acquire/x.ts', 'const r = await safeFetch(url)')).toEqual([])
  })

  it.each(['axios', 'got', 'undici', 'node:https', 'puppeteer', 'playwright'])(
    'rejects an import of "%s"', (mod) => {
      const found = checkOneNetworkDoor('lib/acquire/x.ts', `import x from '${mod}'`)
      expect(found).not.toHaveLength(0)
    },
  )

  it('is not fooled by a comment mentioning fetch', () => {
    // The exact defect that has hit this gate family four times.
    expect(checkOneNetworkDoor('lib/acquire/x.ts', '// never call fetch( directly')).toEqual([])
  })
})

describe('no User-Agent — and the check must not fire on prose about it', () => {
  it.each([
    ["object key", `const h = { 'User-Agent': 'Mozilla/5.0' }`],
    ["headers.set", `headers.set('user-agent', 'Mozilla/5.0')`],
    ["index assignment", `h['user-agent'] = 'Mozilla'`],
    ["camelCase option", `const opts = { userAgent: 'Mozilla/5.0' }`],
  ])('rejects %s', (_label, code) => {
    expect(checkNoUserAgent('lib/acquire/x.ts', code)).toHaveLength(1)
  })

  it.each([
    ["an error message telling you not to", `throw new Error('Do NOT add a User-Agent, do NOT retry.')`],
    ["wire evidence recording that none was needed", `const e = 'Plain curl, NO User-Agent header. 200 OK.'`],
    ["a doc comment", `/** Never send a User-Agent. */`],
  ])('does NOT fire on %s', (_label, code) => {
    // These are the strongest anti-circumvention statements in the codebase.
    // A gate that flags them trains people to disable the gate.
    expect(checkNoUserAgent('lib/acquire/x.ts', code)).toEqual([])
  })

  it('the real acquisition tree is clean', () => {
    for (const source of listSources()) {
      expect(checkNoUserAgent('registry', JSON.stringify(source))).toEqual([])
    }
  })
})

describe('the package ban catches evasion tooling in both directions', () => {
  it('PASSES on the legitimate Playwright devDependency', () => {
    // tests/e2e genuinely needs this. A gate that fails on it would be turned off.
    expect(checkPackages({ devDependencies: { '@playwright/test': '^1.62.1' } })).toEqual([])
  })

  it.each(['puppeteer-extra-plugin-stealth', 'cloudscraper', '2captcha', 'curl-impersonate', 'got-scraping'])(
    'rejects "%s"', (name) => {
      expect(checkPackages({ dependencies: { [name]: '*' } })).toHaveLength(1)
    },
  )
})

describe('the challenge tripwire — the wire beats the declaration', () => {
  function res(status: number, headers: Record<string, string>) {
    return { status, headers: new Headers(headers) }
  }

  it.each([
    ['cf-mitigated header', res(403, { 'cf-mitigated': 'challenge' })],
    ['cloudflare + 403', res(403, { server: 'cloudflare' })],
    ['datadome + 403', res(403, { 'x-datadome': 'protected' })],
    ['www-authenticate', res(401, { 'www-authenticate': 'Basic' })],
  ])('detects %s', (_label, response) => {
    expect(detectChallenge(response)).not.toBeNull()
  })

  it('detects a CAPTCHA sitekey in the body', () => {
    expect(detectChallenge(res(200, {}), '<div data-sitekey="abc">')).not.toBeNull()
  })

  it('stays SILENT on the real California response', () => {
    // 200, S3 behind CloudFront, no challenge. If this ever fires, the tripwire
    // is over-broad and would block the one source we can lawfully automate.
    expect(detectChallenge(res(200, {
      server: 'AmazonS3',
      via: '1.1 cloudfront.net (CloudFront)',
      'content-type': 'application/zip',
    }))).toBeNull()
  })

  it('does not fire merely because Cloudflare fronts a healthy response', () => {
    // Cloudflare serves an enormous share of the web without interfering.
    // Only a challenge STATUS from a Cloudflare edge counts.
    expect(detectChallenge(res(200, { server: 'cloudflare' }))).toBeNull()
  })

  it('throws with the marker and the remedy, not a retry suggestion', () => {
    const call = () => assertNoChallenge(
      'https://example.gov/x.zip', 'CA-SCO-UPD-500', res(403, { 'cf-mitigated': 'challenge' }),
    )
    expect(call).toThrow(ChallengeDetectedError)
    expect(call).toThrow(/cf-mitigated: challenge/)
    expect(call).toThrow(/the wire wins/)
    expect(call).toThrow(/Do NOT add a User-Agent/)
    expect(call).toThrow(/reclassify/)
  })
})

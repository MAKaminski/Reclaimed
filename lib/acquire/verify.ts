/**
 * Predicates for the acquisition gate.
 *
 * These are exported PURE FUNCTIONS rather than logic inside a script's main(),
 * for one reason: a gate whose logic exists only in main() cannot be
 * negative-probed, and four gates in this repo shipped green as decoration
 * until somebody broke the code deliberately and watched them stay silent.
 *
 * Every predicate here has a test that constructs the violation in memory and
 * asserts rejection.
 */

import type { DataSource } from './sources'
import { refusalFor } from './sources'

export interface Violation { where: string; reason: string }

/**
 * A — a non-`open` source may not carry a fetchable URL ANYWHERE in its object
 * graph.
 *
 * Checked by walking the imported value, not by scanning source text. Text
 * scanning is defeated by formatting; a walk over the actual data is not.
 */
export function checkNoUrlsOnNonOpen(source: DataSource): Violation[] {
  if (source.permission.mode === 'open') return []

  const found: Violation[] = []
  const seen = new WeakSet<object>()

  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value.trim())) {
        found.push({
          where: `${source.key}.${path}`,
          reason:
            `a source in mode "${source.permission.mode}" carries a fetchable URL ` +
            `("${value.slice(0, 60)}"). Only an "open" source may name one — the type ` +
            'makes it unreachable, and this catches it reaching the data another way.',
        })
      }
      return
    }
    if (value === null || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, path === '' ? k : `${path}.${k}`)
    }
  }

  // The refusal string legitimately NAMES hosts in prose ("gaclaims..."), which
  // is not a URL and must not trip this. Only http(s):// prefixed values count.
  walk(source.permission, 'permission')
  return found
}

/** B — a refusal has to actually explain itself. */
export const MIN_REFUSAL_CHARS = 40

export function checkRefusalSubstantive(source: DataSource): Violation[] {
  const refusal = refusalFor(source)
  if (refusal === null) return []
  if (refusal.trim().length >= MIN_REFUSAL_CHARS) return []
  return [{
    where: `${source.key}.permission.refusal`,
    reason:
      `refusal is ${refusal.trim().length} characters; at least ${MIN_REFUSAL_CHARS} are ` +
      'required. The refusal is what a person reads at the moment they are tempted to ' +
      'work around it, so "no" is not enough.',
  }]
}

/**
 * C/D/E — source-text checks over the acquisition tree.
 *
 * Comments are stripped first. This gate family has been fooled four times in
 * this repo by text that merely MENTIONS what is being checked — an import
 * line, a doc comment describing a call, a comment stating the rule the file
 * obeys.
 */
export function executableSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

const BANNED_IMPORTS = [
  'axios', 'got', 'node-fetch', 'superagent', 'undici',
  'node:http', 'node:https', 'playwright', '@playwright/test',
  'puppeteer', 'puppeteer-core', 'puppeteer-extra',
]

export function checkOneNetworkDoor(rel: string, contents: string): Violation[] {
  const code = executableSource(contents)
  const out: Violation[] = []

  // Any fetch( that is not safeFetch( — including globalThis.fetch.
  const bare = /(^|[^.\w])fetch\s*\(/.exec(code.replace(/safeFetch\s*\(/g, 'SAFE('))
  if (bare !== null) {
    out.push({
      where: rel,
      reason:
        'calls fetch() directly. safeFetch (lib/compliance/blockedHosts.ts) is the only ' +
        'HTTP entry point in this codebase; it enforces the blocklist per redirect, and ' +
        'bypassing it bypasses that.',
    })
  }

  for (const mod of BANNED_IMPORTS) {
    const pattern = new RegExp(`from\\s+['"]${mod.replace(/[/@-]/g, '\\$&')}['"]|require\\(['"]${mod.replace(/[/@-]/g, '\\$&')}['"]\\)`)
    if (pattern.test(code)) {
      out.push({
        where: rel,
        reason:
          `imports "${mod}". Acquisition has exactly one network door and no browser. ` +
          'A second HTTP client routes around the blocklist; a browser driver is how a ' +
          'data pipeline becomes a circumvention tool.',
      })
    }
  }
  return out
}

/**
 * D — no User-Agent, anywhere in the acquisition tree.
 *
 * Not a style rule. Spoofing a browser UA is the first step of pretending to be
 * a human, and the evidence on record is that plain curl with NO User-Agent
 * gets HTTP 200 from claimit.ca.gov. We have never needed one, so the moment
 * somebody adds one, something has gone wrong upstream of the code.
 */
export function checkNoUserAgent(rel: string, contents: string): Violation[] {
  const code = executableSource(contents)

  // Match a header ASSIGNMENT, not a mention.
  //
  // The first version matched /user-agent/i anywhere in executable code and
  // immediately failed on this repo's own files: challenge.ts says "Do NOT add
  // a User-Agent" inside its error message, and sources.ts records "Plain curl,
  // NO User-Agent header" as its wire evidence. Both are prose inside string
  // literals — the strongest anti-UA statements in the codebase, flagged as
  // violations. That is the fourth time a gate here has been fooled by text
  // that merely mentions what it checks.
  //
  // These patterns require the term to be QUOTED AS A KEY or passed as an
  // option, which prose never is:
  //   { 'User-Agent': '...' }      headers.set('user-agent', ...)
  //   headers['user-agent'] = ...  { userAgent: '...' }
  const ASSIGNMENTS = [
    /(['"`])user-agent\1\s*[:,\]]/i,
    /\buserAgent\s*[:=]/,
  ]

  if (!ASSIGNMENTS.some((p) => p.test(code))) return []
  return [{
    where: rel,
    reason:
      'sets a User-Agent header. Plain curl with no User-Agent returns HTTP 200 from ' +
      'the sources we use — we have never needed one. If a source started requiring ' +
      'one, it acquired an access control, and the answer is to reclassify it as ' +
      '"restricted", not to disguise the client.',
  }]
}

/**
 * E — the package ban list.
 *
 * Two-part on purpose. @playwright/test is a LEGITIMATE devDependency for
 * tests/e2e, so a blanket "no browser automation" package check would either be
 * permanently red or would have to exempt Playwright everywhere — including in
 * the acquisition tree, where it must never appear. So: ban the
 * evasion-specific packages outright, and ban browser drivers by IMPORT, scoped
 * to lib/acquire only.
 */
export const BANNED_PACKAGES = [
  'puppeteer', 'puppeteer-core', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth',
  'playwright-extra', 'selenium-webdriver', 'undetected-chromedriver',
  '2captcha', '@2captcha/captcha-solver', 'anticaptcha', 'capsolver',
  'death-by-captcha', 'cloudscraper', 'cfscrape', 'curl-impersonate',
  'tls-client', 'got-scraping', 'crawlee',
]

export function checkPackages(pkg: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}): Violation[] {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  return BANNED_PACKAGES
    .filter((name) => all[name] !== undefined)
    .map((name) => ({
      where: 'package.json',
      reason:
        `depends on "${name}". This package exists to defeat bot detection or solve ` +
        'CAPTCHAs. Defeating a technical access control creates CFAA exposure, and a ' +
        'conviction involving dishonesty bars CDR registration for 20 years under ' +
        'O.C.G.A. § 44-12-239(d).',
    }))
}

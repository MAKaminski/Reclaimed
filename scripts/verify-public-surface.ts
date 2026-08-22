/**
 * CI gate for the route architecture.
 *
 * This one exists because of a single dangerous change: removing
 * `robots: { index: false }` from the root layout INVERTS this codebase's
 * default from noindex to indexable. Every other gate here protects an
 * invariant that was always true; this protects one that only became true when
 * the public surface was added, and whose failure mode is silent.
 *
 * A staff route that forgets to opt out of indexing does not throw, does not
 * render differently, and does not appear in any test. It just quietly invites
 * Google to crawl the unclaimed property file — § 44-12-239.1(b).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { PUBLIC_PAGES } from '../lib/public/pages'
import { checkBrandString } from '../lib/compliance/brandGuard'

const ROOT = resolve(import.meta.dirname, '..')
const APP = join(ROOT, 'app')

interface Failure { file: string; reason: string }
const failures: Failure[] = []

function read(rel: string): string | null {
  try { return readFileSync(join(ROOT, rel), 'utf8') } catch { return null }
}

// ── 1. The root layout must stay inert ──────────────────────────────────────
{
  const rel = 'app/layout.tsx'
  const source = read(rel)
  if (source === null) {
    failures.push({ file: rel, reason: 'is missing.' })
  } else {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const banned: Array<[RegExp, string]> = [
      [/RegistrationBanner/, 'renders RegistrationBanner, which reads cookies() and forces EVERY route — including anonymous crawler hits on the public tree — to render dynamically.'],
      [/cookies\(/, 'calls cookies(), which makes every route dynamic and defeats static rendering of the public pages.'],
      [/getSessionState/, 'reads the session. The root layout is shared with the public tree and must not.'],
      [/robots\s*:/, 'declares a robots policy. Indexing posture belongs to each route group, so a new group must state its own rather than silently inherit one.'],
    ]
    for (const [pattern, reason] of banned) {
      if (pattern.test(code)) failures.push({ file: rel, reason })
    }
  }
}

// ── 2. Every group except (public) must opt OUT of indexing ─────────────────
{
  const groups = readdirSync(APP)
    .filter((e) => e.startsWith('(') && e.endsWith(')'))
    .filter((e) => statSync(join(APP, e)).isDirectory())

  if (!groups.includes('(public)')) {
    failures.push({ file: 'app/(public)/', reason: 'is missing. There is no public surface.' })
  }

  for (const group of groups.filter((g) => g !== '(public)')) {
    const rel = `app/${group}/layout.tsx`
    const source = read(rel)
    if (source === null) {
      failures.push({
        file: rel,
        reason: `route group ${group} has no layout, so it inherits the root layout's ` +
          'posture — which is now INDEXABLE. Add a layout declaring index: false.',
      })
      continue
    }
    if (!/index:\s*false/.test(source)) {
      failures.push({
        file: rel,
        reason: 'does not declare robots { index: false }. Only (public) may be indexed — ' +
          '§ 44-12-239.1(b) forbids redistributing the Department’s file.',
      })
    }
  }
}

// ── 3. The SEO artifacts must exist ─────────────────────────────────────────
for (const artifact of ['app/robots.ts', 'app/sitemap.ts', 'app/llms.txt/route.ts']) {
  if (!existsSync(join(ROOT, artifact))) {
    failures.push({ file: artifact, reason: 'is missing. The public tree is unreachable to crawlers without it.' })
  }
}

// ── 4. Registry ↔ filesystem must be bijective ──────────────────────────────
//
// This catches the page that exists, is indexable, is absent from the sitemap,
// and is redirected to /signin by the proxy — a failure with no symptom until
// someone notices the page has never had a visitor.
{
  const publicDir = join(APP, '(public)')
  const onDisk: string[] = []
  const walk = (dir: string, prefix: string): void => {
    let entries: string[]
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, `${prefix}/${entry}`)
      else if (entry === 'page.tsx') onDisk.push(prefix === '' ? '/' : prefix)
    }
  }
  walk(publicDir, '')

  const registered = new Set(PUBLIC_PAGES.map((p) => p.href))
  for (const href of onDisk) {
    if (!registered.has(href)) {
      failures.push({
        file: `app/(public)${href === '/' ? '' : href}/page.tsx`,
        reason: `route "${href}" is not in lib/public/pages.ts. It is therefore absent from ` +
          'the sitemap and llms.txt, and proxy.ts will redirect it to /signin.',
      })
    }
  }
  for (const href of registered) {
    if (!onDisk.includes(href)) {
      failures.push({
        file: 'lib/public/pages.ts',
        reason: `registers "${href}" but no page.tsx exists for it. The sitemap advertises a 404.`,
      })
    }
  }
}

// ── 5. proxy.ts must derive its allowlist, not keep a second copy ───────────
{
  const rel = 'proxy.ts'
  const source = read(rel)
  if (source === null) {
    failures.push({ file: rel, reason: 'is missing; nothing steers anonymous traffic.' })
  } else {
    if (!/publicPathnames\(/.test(source)) {
      failures.push({
        file: rel,
        reason: 'does not derive its allowlist from lib/public/pages.ts. A second hand-typed ' +
          'list will drift, and the drift is invisible: pages 302 to /signin for crawlers only.',
      })
    }
    for (const artifact of ['robots', 'sitemap', 'llms']) {
      if (!source.includes(artifact)) {
        failures.push({
          file: rel,
          reason: `matcher does not exclude ${artifact}. Anonymous requests for it redirect to /signin.`,
        })
      }
    }
  }
}

// ── 6. § 44-12-239(g): the canonical host itself ────────────────────────────
{
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  if (raw !== undefined && raw !== '') {
    try {
      const host = new URL(raw).host
      const violations = checkBrandString(host, 'domain')
      for (const v of violations) {
        failures.push({
          file: 'NEXT_PUBLIC_SITE_URL',
          reason: `host "${v.value}" contains the denied term "${v.matchedTerm}". § 44-12-239(g) ` +
            'forbids a name that could lead a reasonable person to think we are a government agency.',
        })
      }
    } catch {
      failures.push({ file: 'NEXT_PUBLIC_SITE_URL', reason: `is not a valid URL: "${raw}"` })
    }
  }
}

if (failures.length > 0) {
  console.error('\n✗ PUBLIC SURFACE ARCHITECTURE\n')
  for (const f of failures) console.error(`  ${f.file}\n    ${f.reason}\n`)
  console.error(
    '  Only app/(public) may be indexed. Everything else reads the unclaimed\n' +
    '  property file, which O.C.G.A. § 44-12-239.1(b) forbids redistributing.\n',
  )
  process.exit(1)
}

console.log(`✓ public surface: ${PUBLIC_PAGES.length} registered pages, all groups declare an indexing posture`)

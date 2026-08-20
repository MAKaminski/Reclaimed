/**
 * CI gate for §1.8 — O.C.G.A. § 44-12-239.1(b).
 *
 * A CDR receiving the statutory database "is prohibited from distributing such
 * information EXCEPT for the purpose of soliciting owners of unclaimed property
 * to offer claim services." Violations are referred to the Attorney General.
 *
 * That forecloses data resale, a B2B lookup API, enrichment-as-a-service, a
 * public "search your name" tool, and partner sharing. This gate fails the
 * build if any route reads the property data without an authenticated staff
 * session, or if a service-role key appears anywhere in application code.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** Tables and views derived from the CDR file. None may be read publicly. */
const PROTECTED = [
  'properties', 'properties_staging', 'properties_workable', 'properties_priority',
  'work_queue', 'property_scores', 'property_scores_latest', 'owners', 'entities',
]

/** Evidence that a request is authenticated as staff. */
const AUTH_MARKERS = [
  'auth.getUser', 'getUser()', 'createClient()', 'is_active_staff', 'requireStaff',
]

/**
 * A service-role key bypasses RLS entirely. The only component permitted a
 * direct connection is the ingest CLI, which runs on a workstation.
 */
const SERVICE_KEY_MARKERS = [
  'SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'SUPABASE_SECRET_KEY',
]

const SCAN_DIRS = ['app', 'components']
const SOURCE_EXT = /\.(ts|tsx)$/

interface Failure { file: string; reason: string }

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.test(entry)) out.push(full)
  }
  return out
}

function main(): void {
  const failures: Failure[] = []

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file)
      const source = readFileSync(file, 'utf8')

      const readsProtected = PROTECTED.filter((table) =>
        new RegExp(`\\.from\\(['"\`]${table}['"\`]\\)`).test(source) ||
        new RegExp(`\\brpc\\(['"\`][^'"\`]*${table}`).test(source),
      )

      if (readsProtected.length > 0) {
        const authenticated = AUTH_MARKERS.some((marker) => source.includes(marker))
        if (!authenticated) {
          failures.push({
            file: rel,
            reason:
              `reads ${readsProtected.join(', ')} without an authenticated staff ` +
              'session. § 44-12-239.1(b) permits distribution ONLY to solicit owners.',
          })
        }
      }

      for (const marker of SERVICE_KEY_MARKERS) {
        if (source.includes(marker)) {
          failures.push({
            file: rel,
            reason:
              `references "${marker}". A service-role key bypasses RLS, which is ` +
              'the access-control boundary protecting the CDR file. The app must ' +
              'always use the publishable key with the user session.',
          })
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('\n✗ PUBLIC DATA SURFACE — O.C.G.A. § 44-12-239.1(b)\n')
    for (const f of failures) console.error(`  ${f.file}\n    ${f.reason}\n`)
    console.error(
      '  Distributing the CDR file other than to solicit owners is referred to\n' +
      '  the Attorney General. There is no public read surface in this system.\n',
    )
    process.exit(1)
  }

  console.log('✓ §1.8 no unauthenticated read of CDR-derived data (§ 44-12-239.1(b))')
}

main()

/**
 * Publisher watch — "has the state put out a new file?"
 *
 *   pnpm watch:sources            compare, report, update the watch file
 *   pnpm watch:sources --check    compare and report; exit 1 if anything changed
 *
 * This runs in GitHub Actions on a schedule, and the design constraint that
 * shapes it is that **the repository is public**.
 *
 * That rules out doing the actual load here, and not merely because a database
 * credential would have to live in repository settings. A public repo's Actions
 * LOGS are public. An ingest run prints reject samples, row counts and — on any
 * unhandled error — fragments of the rows it was parsing. Those rows are names
 * and addresses of real people under § 44-12-239.1(b), which permits
 * distributing that file only to solicit the owners it names. Publishing them to
 * an anonymous log reader is not that. So the split is:
 *
 *   · CI  (public)     — may this be fetched, and has it changed?  No credential,
 *                        no rows, nothing but HEAD metadata about a public URL.
 *   · Workstation      — the load itself, over a direct connection.
 *
 * The watch file therefore holds only ETag, size and Last-Modified of a publicly
 * downloadable artifact. There is nothing in it that is not already served to
 * anyone who runs `curl -I` against the same URL.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { listSources, refusalFor, assertFetchable, type DataSource } from '@/lib/acquire/sources'
import { headArtifact } from '@/lib/acquire/fetch'
import { parseArgs } from './lib/args'

const ROOT = resolve(import.meta.dirname, '..')
const WATCH_FILE = join(ROOT, 'data/source-watch.json')

const SPEC = {
  check: {
    type: 'boolean',
    describe: 'Exit 1 if any source changed, and do not rewrite the watch file',
  },
} as const

interface WatchEntry {
  etag: string | null
  lastModified: string | null
  bytes: number | null
  seenAt: string
}
type WatchFile = Record<string, WatchEntry>

function readWatch(): WatchFile {
  if (!existsSync(WATCH_FILE)) return {}
  return JSON.parse(readFileSync(WATCH_FILE, 'utf8')) as WatchFile
}

/**
 * Identity is ETag when the publisher sends one, and falls back to
 * (size, Last-Modified). Falling back to size ALONE would be wrong: California
 * reissues a file of near-identical length every week, and a same-size different
 * file is exactly the case a staleness check exists to catch.
 */
function changed(prev: WatchEntry | undefined, now: WatchEntry): boolean {
  if (prev === undefined) return true
  if (prev.etag !== null && now.etag !== null) return prev.etag !== now.etag
  return prev.bytes !== now.bytes || prev.lastModified !== now.lastModified
}

async function main(): Promise<void> {
  const args = parseArgs(SPEC, 'pnpm watch:sources')
  const previous = readWatch()
  const next: WatchFile = { ...previous }
  const report: string[] = []
  let anyChanged = false
  let anyFailed = false

  for (const source of listSources()) {
    const refusal = refusalFor(source)
    if (refusal !== null) {
      // A restricted or entitled source has no URL to HEAD, by construction —
      // assertFetchable() would throw. Nothing to watch; say so and move on.
      report.push(`  ${source.key.padEnd(16)} SKIPPED — ${source.permission.mode}: not machine-fetchable`)
      continue
    }

    assertFetchable(source)
    const artifact = source.permission.artifacts[0]!

    try {
      const remote = await headArtifact(source, artifact)
      const entry: WatchEntry = {
        etag: remote.etag,
        lastModified: remote.lastModified,
        bytes: remote.bytes,
        seenAt: new Date().toISOString(),
      }
      const isNew = changed(previous[source.key], entry)
      if (isNew) anyChanged = true
      next[source.key] = entry

      report.push(
        `  ${source.key.padEnd(16)} ${isNew ? 'CHANGED' : 'unchanged'} · ` +
        `${remote.bytes === null ? '?' : (remote.bytes / 1e6).toFixed(1) + ' MB'} · ` +
        `published ${remote.lastModified ?? 'unknown'}`,
      )
      if (isNew) {
        report.push(`  ${' '.repeat(16)} → run on a workstation: pnpm acquire --source ${source.key}`)
      }
    } catch (error) {
      anyFailed = true
      report.push(`  ${source.key.padEnd(16)} CHECK FAILED — ${(error as Error).message}`)
    }
  }

  console.log('\nPublisher watch\n')
  for (const line of report) console.log(line)
  console.log('')

  // Surfaced to the workflow so it can decide whether to raise an issue.
  const out = process.env.GITHUB_OUTPUT
  if (out !== undefined && out !== '') {
    writeFileSync(out, `changed=${anyChanged}\nfailed=${anyFailed}\n`, { flag: 'a' })
  }

  if (args.check === true) {
    // A failed HEAD must not be reported as "no change" — a source we cannot
    // reach is the case most worth knowing about.
    if (anyFailed) { console.error('A source check failed.\n'); process.exit(1) }
    if (anyChanged) { console.error('A publisher has new data.\n'); process.exit(1) }
    return
  }

  writeFileSync(WATCH_FILE, JSON.stringify(next, null, 2) + '\n')
  console.log(`Wrote ${WATCH_FILE.replace(ROOT + '/', '')}\n`)
}

void main()

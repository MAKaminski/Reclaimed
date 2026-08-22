/**
 * Data acquisition CLI.
 *
 *   pnpm acquire --list                     what sources exist, and how stale
 *   pnpm acquire --source <key>             fetch it, verify it, extract it
 *
 * ACQUIRE NEVER LOADS. It fetches, hashes, extracts, writes a manifest, and
 * prints the next command.
 *
 * That separation is deliberate. `acquire` is idempotent, cheap, and
 * reversible. `ingest` can retire millions of rows and place
 * disappeared_from_file holds that apply_ingest_diff deliberately does NOT
 * auto-release ("a human decides"). Fusing a safe read to a destructive write
 * behind one verb means the destructive half runs every time the safe half
 * does — including on a cron, at 12:17 UTC, unattended.
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, ArgumentError } from './lib/args.ts'
import {
  SOURCES, listSources, getSource, refusalFor, assertFetchable,
  type DataSource,
} from '../lib/acquire/sources.ts'
import { headArtifact, downloadArtifact, extractZip } from '../lib/acquire/fetch.ts'
import { getSql, closeSql } from '../lib/db/client.ts'

const SPEC = {
  list: { type: 'boolean', describe: 'List every source with its mode and staleness' },
  source: { type: 'string', describe: 'Source key to acquire', placeholder: 'KEY' },
  dest: { type: 'string', describe: 'Directory to write into (default: a temp dir)', placeholder: 'DIR' },
  force: { type: 'boolean', describe: 'Download even if the remote artifact is unchanged' },
  json: { type: 'boolean', describe: 'Machine-readable output for --list' },
  'no-db': { type: 'boolean', describe: 'Skip recording provenance (no DATABASE_URL needed)' },
} as const

function fmtBytes(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`
}

interface LastAcquisition {
  checked_at: string
  outcome: string
  etag: string | null
  last_modified: string | null
}

async function lastAcquisition(key: string, useDb: boolean): Promise<LastAcquisition | null> {
  if (!useDb) return null
  try {
    const sql = getSql()
    const rows = await sql<LastAcquisition[]>`
      select checked_at, outcome::text, etag, last_modified
      from acquisitions
      where source_key = ${key} and outcome = 'retrieved'
      order by checked_at desc limit 1
    `
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function record(
  useDb: boolean,
  source: DataSource,
  outcome: 'retrieved' | 'unchanged' | 'refused' | 'failed',
  fields: Partial<{
    artifact_url: string; etag: string | null; last_modified: string | null
    bytes: number; sha256: string; file_count: number; detail: string
  }> = {},
): Promise<number | null> {
  if (!useDb) return null
  try {
    const sql = getSql()
    const rows = await sql<Array<{ id: string }>>`
      insert into acquisitions (
        source_key, state_code, mode, outcome,
        artifact_url, etag, last_modified, bytes, sha256, file_count, detail
      ) values (
        ${source.key}, ${source.stateCode}, ${source.permission.mode}, ${outcome},
        ${fields.artifact_url ?? null}, ${fields.etag ?? null},
        ${fields.last_modified ?? null}, ${fields.bytes ?? null},
        ${fields.sha256 ?? null}, ${fields.file_count ?? null}, ${fields.detail ?? null}
      ) returning id
    `
    return rows[0] === undefined ? null : Number(rows[0].id)
  } catch (error) {
    console.warn(`  ! could not record provenance: ${(error as Error).message}`)
    return null
  }
}

async function doList(useDb: boolean, asJson: boolean): Promise<void> {
  const report: Array<Record<string, unknown>> = []

  for (const source of listSources()) {
    const last = await lastAcquisition(source.key, useDb)
    const refusal = refusalFor(source)
    const entry: Record<string, unknown> = {
      key: source.key,
      state: source.stateCode,
      mode: source.permission.mode,
      lastRetrieved: last?.checked_at ?? null,
    }

    if (refusal === null) {
      // Only an `open` source has anything to HEAD.
      assertFetchable(source)
      try {
        const artifact = source.permission.artifacts[0]!
        const remote = await headArtifact(source, artifact)
        const changed = last === null || last.etag !== remote.etag
        entry.status = changed ? 'new version available' : 'fresh'
        entry.remote = {
          url: remote.url, bytes: remote.bytes,
          lastModified: remote.lastModified, etag: remote.etag,
        }
      } catch (error) {
        entry.status = 'check failed'
        entry.detail = (error as Error).message
      }
    } else {
      entry.status = last === null ? 'awaiting delivery' : 'delivered previously'
      entry.refusal = refusal
    }
    report.push(entry)
  }

  if (asJson) { console.log(JSON.stringify(report, null, 2)); return }

  console.log('')
  for (const e of report) {
    const remote = e.remote as { bytes: number | null; lastModified: string | null } | undefined
    console.log(`  ${String(e.key).padEnd(16)} ${String(e.state).padEnd(3)} ${String(e.mode).padEnd(11)} ${String(e.status).toUpperCase()}`)
    if (remote !== undefined) {
      console.log(`  ${' '.repeat(31)}${fmtBytes(remote.bytes ?? 0)} · published ${remote.lastModified ?? 'unknown'}`)
    }
    if (e.lastRetrieved !== null) {
      const days = Math.floor((Date.now() - new Date(e.lastRetrieved as string).getTime()) / 86_400_000)
      console.log(`  ${' '.repeat(31)}last retrieved ${days}d ago`)
    }
    if (typeof e.refusal === 'string') {
      for (const line of wrap(e.refusal, 74)) console.log(`  ${' '.repeat(31)}${line}`)
    }
    if (typeof e.detail === 'string') {
      for (const line of wrap(e.detail, 74)) console.log(`  ${' '.repeat(31)}${line}`)
    }
    console.log('')
  }
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if ((line + w).length > width) { lines.push(line.trimEnd()); line = '' }
    line += `${w} `
  }
  if (line.trim() !== '') lines.push(line.trimEnd())
  return lines
}

async function doAcquire(
  key: string, destArg: string | undefined, force: boolean, useDb: boolean,
): Promise<void> {
  const source = getSource(key)

  // The refusal path is a first-class OUTCOME, recorded like any other. Those
  // rows are the audit trail showing we declined rather than circumvented.
  const refusal = refusalFor(source)
  if (refusal !== null) {
    await record(useDb, source, 'refused', { detail: refusal })
    console.error(`\n✗ ${source.key} — ${source.label}\n`)
    for (const line of wrap(refusal, 76)) console.error(`  ${line}`)
    if (source.permission.mode === 'entitled') {
      console.error(
        `\n  Cadence: every ${source.permission.delivery.cadenceDays} days ` +
        `(${source.permission.delivery.citation})` +
        `\n  Transport: ${source.permission.delivery.transport}` +
        '\n\n  When the file arrives:' +
        `\n    pnpm ingest --source ${source.key} --file <path> --dry-run`,
      )
    }
    console.error('')
    process.exitCode = 1
    return
  }

  assertFetchable(source)
  const artifact = source.permission.artifacts[0]!

  console.log(`\n${source.key} — ${source.label}`)
  console.log(`  ${source.permission.evidence.observed.split('.')[0]}.\n`)

  const remote = await headArtifact(source, artifact)
  const last = await lastAcquisition(source.key, useDb)

  if (!force && last !== null && last.etag !== null && last.etag === remote.etag) {
    await record(useDb, source, 'unchanged', {
      artifact_url: artifact.url, etag: remote.etag, last_modified: remote.lastModified,
    })
    console.log(`  UNCHANGED — same ETag as ${last.checked_at}. Nothing to do.`)
    console.log('  Use --force to download anyway.\n')
    return
  }

  const dest = destArg ?? await mkdtemp(join(tmpdir(), 'reclaimed-acq-'))
  console.log(`  Downloading ${fmtBytes(remote.bytes ?? 0)} → ${dest}`)

  let lastPct = -1
  const download = await downloadArtifact(source, artifact, dest, (bytes) => {
    if (remote.bytes === null) return
    const pct = Math.floor((bytes / remote.bytes) * 100)
    if (pct >= lastPct + 10) { lastPct = pct; process.stdout.write(`  ${pct}% `) }
  })
  process.stdout.write('\n')

  console.log(`  sha256 ${download.sha256}`)

  const files = artifact.container === 'zip'
    ? await extractZip(download.path, dest, artifact.expectMembers)
    : [download.path]
  console.log(`  ${files.length} file(s) extracted`)

  const acquisitionId = await record(useDb, source, 'retrieved', {
    artifact_url: artifact.url, etag: download.etag, last_modified: download.lastModified,
    bytes: download.bytes, sha256: download.sha256, file_count: files.length,
  })

  const manifestPath = join(dest, 'acquisition.json')
  await writeFile(manifestPath, `${JSON.stringify({
    sourceKey: source.key,
    acquisitionId,
    retrievedAt: new Date().toISOString(),
    artifactUrl: artifact.url,
    etag: download.etag,
    lastModified: download.lastModified,
    bytes: download.bytes,
    sha256: download.sha256,
    files,
  }, null, 2)}\n`)

  console.log(`\n  Manifest: ${manifestPath}`)
  console.log('\n  Next — validate before loading anything:')
  console.log(`    pnpm ingest --source ${source.key} --manifest ${manifestPath} --dry-run\n`)
}

async function main(): Promise<void> {
  let args
  try {
    args = parseArgs(SPEC, 'pnpm acquire')
  } catch (error) {
    if (error instanceof ArgumentError) { console.error(`\n${error.message}\n`); process.exit(1) }
    throw error
  }

  const useDb = !args['no-db'] && (process.env.DATABASE_URL ?? '') !== ''

  try {
    if (args.list) { await doList(useDb, args.json); return }
    if (args.source === undefined) {
      console.error('\nNothing to do. Pass --list or --source <key>.\n')
      process.exitCode = 1
      return
    }
    await doAcquire(args.source, args.dest, args.force, useDb)
  } catch (error) {
    const source = args.source === undefined ? null : SOURCES[args.source as never]
    if (source != null) {
      await record(useDb, source, 'failed', { detail: (error as Error).message.slice(0, 2000) })
    }
    console.error(`\n✗ ${(error as Error).message}\n`)
    process.exitCode = 1
  } finally {
    if (useDb) await closeSql()
  }
}

void main()

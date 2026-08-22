/**
 * The download path.
 *
 * Every request goes through safeFetch (lib/compliance/blockedHosts.ts), which
 * is the only HTTP entry point in this codebase and enforces the blocklist
 * per-redirect. Nothing here constructs a Request, sets a header, or retries.
 *
 * Streaming is structural rather than incidental: the $500+ California tier is
 * 154MB today, but the same code pointed at All_Records.zip would be 3GB, and a
 * buffered implementation would work in testing and die in production. The
 * sha256 is computed inline over the same stream, so the file is never read
 * twice.
 */

import { createWriteStream } from 'node:fs'
import { mkdir, stat, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readdir } from 'node:fs/promises'
import { safeFetch } from '@/lib/compliance/blockedHosts'
import { assertNoChallenge } from './challenge'
import type { ArtifactSpec, DataSource } from './sources'

const execFileAsync = promisify(execFile)

/** Generous, and present to catch a hang rather than a slow link. */
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000
const HEAD_TIMEOUT_MS = 60 * 1000

export interface RemoteState {
  url: string
  etag: string | null
  lastModified: string | null
  bytes: number | null
}

/** Conditional-request metadata, so an unchanged file is never downloaded. */
export async function headArtifact(
  source: DataSource,
  artifact: ArtifactSpec,
): Promise<RemoteState> {
  const response = await safeFetch(artifact.url, {
    method: 'HEAD',
    signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
  })
  assertNoChallenge(artifact.url, source.key, response)

  if (!response.ok) {
    throw new Error(`HEAD ${artifact.url} returned HTTP ${response.status}`)
  }

  const length = response.headers.get('content-length')
  return {
    url: artifact.url,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    bytes: length === null ? null : Number(length),
  }
}

export interface DownloadResult {
  path: string
  bytes: number
  sha256: string
  etag: string | null
  lastModified: string | null
}

export async function downloadArtifact(
  source: DataSource,
  artifact: ArtifactSpec,
  destDir: string,
  onProgress?: (bytes: number) => void,
): Promise<DownloadResult> {
  await mkdir(destDir, { recursive: true })
  const path = join(destDir, artifact.filename)

  const response = await safeFetch(artifact.url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  assertNoChallenge(artifact.url, source.key, response)

  if (!response.ok) {
    throw new Error(
      `GET ${artifact.url} returned HTTP ${response.status}. ` +
      'This is not retried: an unexpected status on a source classified "open" is a ' +
      'classification or URL error, not a transient fault.',
    )
  }
  if (response.body === null) throw new Error(`GET ${artifact.url} returned no body.`)

  const hash = createHash('sha256')
  let bytes = 0

  // Hash and count inline so the file is written once and read zero extra times.
  const source$ = Readable.fromWeb(response.body as never)
  source$.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    bytes += chunk.length
    if (bytes > artifact.maxBytes) {
      source$.destroy(new Error(
        `REFUSING: ${artifact.url} exceeded maxBytes (${artifact.maxBytes}). ` +
        'Either the publisher changed the file materially or the URL is wrong. ' +
        'Verify before raising the ceiling.',
      ))
      return
    }
    onProgress?.(bytes)
  })

  await pipeline(source$, createWriteStream(path))

  return {
    path,
    bytes,
    sha256: hash.digest('hex'),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }
}

/**
 * Extract a zip with the system `unzip`.
 *
 * execFile with an argv array and no shell — nothing here is interpolated into
 * a command line. `unzip` ships on every GitHub runner and on macOS, which
 * avoids adding a dependency to a repo that guards its dependency list.
 */
export async function extractZip(
  zipPath: string,
  destDir: string,
  expectMembers?: number,
): Promise<string[]> {
  const outDir = join(destDir, 'extracted')
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  await execFileAsync('unzip', ['-o', '-q', zipPath, '-d', outDir], {
    maxBuffer: 16 * 1024 * 1024,
  })

  const entries = await readdir(outDir, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => join(outDir, e.name))
    .sort()

  if (files.length === 0) throw new Error(`${zipPath} extracted to nothing.`)
  if (expectMembers !== undefined && files.length !== expectMembers) {
    throw new Error(
      `${zipPath} extracted ${files.length} files, expected ${expectMembers}. ` +
      'A member-count change is a format change — inspect before loading.',
    )
  }
  return files
}

export async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size
}

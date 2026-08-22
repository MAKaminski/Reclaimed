/**
 * A declared-spec argument parser, shared by every script.
 *
 * WHY THIS EXISTS. The old parser was a loose `--key value` reader returning
 * Record<string, string>, and `scripts/ingest.ts` checked `args['dry-run'] ===
 * 'true'`. So `--dryrun`, `--dry_run`, and `--dry-run=true` ALL produced
 * dryRun === false and silently ran a live load: hashing, staging, and diffing
 * against the production properties table, retiring rows and placing holds.
 *
 * A typo must never be the difference between "parse and report" and "mutate
 * every row in the database." So: flags are DECLARED, an undeclared key exits
 * 1, and a boolean that is not exactly true/false exits 1. The parser suggests
 * the nearest declared flag by edit distance, because the failure this replaces
 * was silent and the replacement should be obvious.
 */

export interface FlagSpec {
  type: 'string' | 'boolean' | 'number' | 'string[]'
  required?: boolean
  describe: string
  /** Shown in usage as `--flag <placeholder>`. */
  placeholder?: string
}

export type FlagValue<S extends FlagSpec> =
  S['type'] extends 'boolean' ? boolean
  : S['type'] extends 'number' ? number | undefined
  : S['type'] extends 'string[]' ? string[]
  : string | undefined

export type ParsedArgs<S extends Record<string, FlagSpec>> = {
  [K in keyof S]: FlagValue<S[K]>
}

/** Levenshtein, iterative, small inputs only. */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!
  }
  return prev[b.length]!
}

function nearest(key: string, candidates: string[]): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const d = editDistance(key.toLowerCase(), candidate.toLowerCase())
    if (d < bestDistance) { bestDistance = d; best = candidate }
  }
  // Only suggest something genuinely close, or a suggestion is noise.
  return bestDistance <= Math.max(2, Math.floor(key.length / 3)) ? best : null
}

export class ArgumentError extends Error {
  constructor(message: string, readonly usage: string) {
    super(`${message}\n\n${usage}`)
    this.name = 'ArgumentError'
  }
}

export function usageFor(spec: Record<string, FlagSpec>, command: string): string {
  const lines = [`Usage: ${command} [flags]`, '']
  const width = Math.max(...Object.keys(spec).map((k) => k.length)) + 12
  for (const [key, s] of Object.entries(spec)) {
    const shown = s.type === 'boolean'
      ? `--${key}`
      : `--${key} <${s.placeholder ?? s.type.replace('[]', '')}>`
    const req = s.required === true ? ' (required)' : ''
    lines.push(`  ${shown.padEnd(width)}${s.describe}${req}`)
  }
  return lines.join('\n')
}

export function parseArgs<S extends Record<string, FlagSpec>>(
  spec: S,
  command: string,
  argv: string[] = process.argv.slice(2),
): ParsedArgs<S> {
  const usage = usageFor(spec, command)
  const keys = Object.keys(spec)
  const raw: Record<string, string[]> = {}

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!
    if (!token.startsWith('--')) {
      throw new ArgumentError(`Unexpected positional argument "${token}".`, usage)
    }

    // --no-flag negates a boolean.
    let body = token.slice(2)
    let negated = false
    if (body.startsWith('no-') && spec[body.slice(3)]?.type === 'boolean') {
      body = body.slice(3)
      negated = true
    }

    let key = body
    let value: string | null = null
    const eq = body.indexOf('=')
    if (eq !== -1) { key = body.slice(0, eq); value = body.slice(eq + 1) }

    const declared = spec[key]
    if (declared === undefined) {
      const hint = nearest(key, keys)
      throw new ArgumentError(
        `Unknown flag "--${key}".${hint !== null ? ` Did you mean "--${hint}"?` : ''}`,
        usage,
      )
    }

    if (declared.type === 'boolean') {
      if (value === null) value = negated ? 'false' : 'true'
      else if (negated) throw new ArgumentError(`--no-${key} does not take a value.`, usage)
      if (value !== 'true' && value !== 'false') {
        throw new ArgumentError(
          `--${key} is a boolean and accepts only "true" or "false", not "${value}". ` +
          `Pass --${key} to enable it, or --no-${key} to disable it.`,
          usage,
        )
      }
    } else if (value === null) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new ArgumentError(`--${key} requires a value.`, usage)
      }
      value = next
      i += 1
    }

    if (declared.type === 'string[]') (raw[key] ??= []).push(value)
    else if (raw[key] !== undefined) {
      throw new ArgumentError(`--${key} was given more than once.`, usage)
    } else raw[key] = [value]
  }

  const out: Record<string, unknown> = {}
  for (const [key, s] of Object.entries(spec)) {
    const values = raw[key]

    if (values === undefined) {
      if (s.required === true) {
        throw new ArgumentError(`--${key} is required. ${s.describe}`, usage)
      }
      out[key] = s.type === 'boolean' ? false : s.type === 'string[]' ? [] : undefined
      continue
    }

    switch (s.type) {
      case 'boolean': out[key] = values[0] === 'true'; break
      case 'string[]': out[key] = values; break
      case 'number': {
        const n = Number(values[0])
        if (!Number.isFinite(n)) {
          throw new ArgumentError(`--${key} must be a number, got "${values[0]}".`, usage)
        }
        out[key] = n
        break
      }
      default: out[key] = values[0]
    }
  }

  return out as ParsedArgs<S>
}

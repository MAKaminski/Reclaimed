/**
 * CI gate for §1.2 — O.C.G.A. § 44-12-239(f).
 *
 * EVERY solicitation to an owner or apparent owner must carry the legend. This
 * gate fails the build if any template under templates/outbound/** renders
 * without it.
 *
 * There is no exemption for "internal preview". Previews get the legend too,
 * precisely so it can never be forgotten in the one artefact a human actually
 * looks at before a mailing goes out.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Every directory that could hold a solicitation.
 *
 * Originally only `templates/outbound` was scanned, which made the gate trivial
 * to sidestep: a solicitation at `emails/reminder.tsx` passed with no legend at
 * all. `email` is an ENABLED channel and there is no email template in the
 * original tree, so the first one written was likely to land outside it.
 */
const SCAN_DIRS = ['templates', 'emails', 'mail', 'app', 'components']

/** The primitives themselves, and the gate. Not solicitations. */
const NOT_SOLICITATIONS = [
  'components/SolicitationLegend.tsx',
  'lib/compliance/legend.ts',
  'lib/compliance/legendPdf.ts',
]

/** Filename or path fragments that mark a file as owner-facing. */
const SOLICITATION_HINTS = /(outbound|solicit|letter|mailer|campaign|firsttouch|first-touch|reminder|postcard|envelope)/i

/**
 * The only sanctioned render paths.
 *
 * buildSolicitationLetter is included as an INDIRECTION, not an exemption: it
 * lives in lib/outreach/letterPdf.ts, which is itself scanned below and must
 * itself call stampSolicitationLegend. A caller delegating to it is therefore
 * provably legended, one hop away.
 */
const REACT_PRIMITIVE = '<SolicitationLegend'
const PDF_PRIMITIVE = 'stampSolicitationLegend'
const LETTER_BUILDER = 'buildSolicitationLetter'

/** Modules that MUST themselves stamp the legend for the indirection to hold. */
const LEGEND_BEARING_MODULES = ['lib/outreach/letterPdf.ts']

/** Re-typing the legend instead of using a primitive defeats the whole gate. */
const INLINE_LEGEND = /THIS IS A SOLICITATION/i

interface Failure { file: string; reason: string }

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx|ts|html|mjml)$/.test(entry)) out.push(full)
  }
  return out
}

function main(): void {
  const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
    .filter((file) => {
      const rel = relative(ROOT, file)
      if (NOT_SOLICITATIONS.includes(rel)) return false
      // Anything under templates/ is in scope regardless of name; elsewhere,
      // only files whose path suggests owner-facing content.
      return rel.startsWith('templates/') || SOLICITATION_HINTS.test(rel)
    })

  const failures: Failure[] = []

  // An empty templates/ directory used to return success ("gate armed"), which
  // meant deleting or renaming the folder made this gate permanently green.
  const templatesDir = join(ROOT, 'templates/outbound')
  if (walk(templatesDir).length === 0) {
    failures.push({
      file: 'templates/outbound/',
      reason:
        'directory is missing or empty. Direct mail is the PRIMARY channel — an ' +
        'empty template tree means this gate is verifying nothing, which is how ' +
        'it silently stops protecting anything.',
    })
  }

  for (const file of files) {
    const rel = relative(ROOT, file)
    const source = readFileSync(file, 'utf8')

    const usesReact = source.includes(REACT_PRIMITIVE)
    const usesPdf = source.includes(PDF_PRIMITIVE)
    const usesBuilder = source.includes(LETTER_BUILDER)

    if (!usesReact && !usesPdf && !usesBuilder) {
      failures.push({
        file: rel,
        reason:
          'renders without the solicitation legend. Use <SolicitationLegend /> ' +
          '(components/SolicitationLegend.tsx) or stampSolicitationLegend() ' +
          '(lib/compliance/legendPdf.ts).',
      })
      continue
    }

    if (INLINE_LEGEND.test(source)) {
      failures.push({
        file: rel,
        reason:
          'inlines the legend text literally. The legend has exactly one ' +
          'definition (lib/compliance/legend.ts) so it can be byte-verified and ' +
          'sized correctly. Use the primitive.',
      })
    }

    // The point size is computed from the body font, never hard-coded.
    if (usesReact && !/maxBodyPointSize=/.test(source)) {
      failures.push({
        file: rel,
        reason:
          'does not pass maxBodyPointSize. § 44-12-239(f) requires 12pt OR larger ' +
          'than the body font, WHICHEVER IS LARGER — a computed value.',
      })
      continue
    }

    // The declared body size must match the largest font ACTUALLY used.
    //
    // Without this the whole §1.2 size rule is self-certified: a template could
    // declare maxBodyPointSize={1} while setting 20pt body copy, ship a 12pt
    // legend against 20pt text, and pass. That defeats "whichever is larger"
    // exactly, at $2,000 per piece mailed under § 44-12-239.2(a)(5).
    const declared = /maxBodyPointSize=\{?\s*([A-Za-z_$][\w$]*|\d+(?:\.\d+)?)/.exec(source)
    if (declared !== null) {
      const raw = declared[1]!
      // Resolve a constant reference to its literal, if it is defined here.
      let declaredPt = Number(raw)
      if (Number.isNaN(declaredPt)) {
        const constant = new RegExp(`${raw}\\s*(?::\\s*number)?\\s*=\\s*(\\d+(?:\\.\\d+)?)`).exec(source)
        declaredPt = constant === null ? Number.NaN : Number(constant[1]!)
      }

      const used = [...source.matchAll(/fontSize:\s*[`'"]?\$?\{?\s*([\d.]+)\s*\}?pt/g)]
        .map((m) => Number(m[1]))
        .filter((n) => Number.isFinite(n))

      if (Number.isNaN(declaredPt)) {
        failures.push({
          file: rel,
          reason:
            `declares maxBodyPointSize={${raw}}, which this check cannot resolve to ` +
            'a number. § 44-12-239(f) sizing must be verifiable, so declare a ' +
            'literal or a constant defined in the same file.',
        })
      } else if (used.length > 0) {
        const largest = Math.max(...used)
        if (largest > declaredPt) {
          failures.push({
            file: rel,
            reason:
              `declares maxBodyPointSize={${declaredPt}} but sets font sizes up to ` +
              `${largest}pt. The legend would be sized against the wrong body font — ` +
              '§ 44-12-239(f) requires 12pt OR LARGER THAN THE FONT USED.',
          })
        }
      }
    }
  }

  // The indirection is only sound if the module it points at actually stamps.
  for (const module of LEGEND_BEARING_MODULES) {
    let source: string
    try {
      source = readFileSync(join(ROOT, module), 'utf8')
    } catch {
      failures.push({
        file: module,
        reason: 'is referenced as a legend-bearing module but does not exist. ' +
          'Every caller delegating to it is therefore unlegended.',
      })
      continue
    }
    // Check for an actual CALL in executable code.
    //
    // Three things defeat a naive check, and all three were observed while
    // building this gate:
    //   · the IMPORT line contains the identifier
    //   · a DOC COMMENT describing the call contains it, parentheses and all
    //   · the identifier alone appears in unrelated prose
    // Strip comments and imports first, then require a call.
    const executable = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .split('\n')
      .filter((line) => !/^\s*import\b/.test(line))
      .join('\n')
    if (!new RegExp(`\\b${PDF_PRIMITIVE}\\s*\\(`).test(executable)) {
      failures.push({
        file: module,
        reason:
          'is treated as legend-bearing by this gate but no longer calls ' +
          'stampSolicitationLegend(). Every caller that delegates to it is now ' +
          'emitting an unlegended solicitation.',
      })
    }
  }

  if (failures.length > 0) {
    console.error('\n✗ SOLICITATION LEGEND MISSING — O.C.G.A. § 44-12-239(f)\n')
    for (const f of failures) console.error(`  ${f.file}\n    ${f.reason}\n`)
    console.error(
      '  An unlegended or defective solicitation is reachable under\n' +
      '  § 44-12-239.2(a)(5) at up to $2,000 PER ACT, with revocation and\n' +
      '  referral to the Attorney General.\n',
    )
    process.exit(1)
  }

  console.log(`✓ §1.2 all ${files.length} outbound template(s) carry the legend`)
}

main()

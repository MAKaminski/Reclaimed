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
const TEMPLATE_DIR = join(ROOT, 'templates/outbound')

/** The only sanctioned render paths. */
const REACT_PRIMITIVE = '<SolicitationLegend'
const PDF_PRIMITIVE = 'stampSolicitationLegend'

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
  const files = walk(TEMPLATE_DIR)

  if (files.length === 0) {
    console.log('✓ §1.2 no outbound templates present yet (gate armed)')
    return
  }

  const failures: Failure[] = []

  for (const file of files) {
    const rel = relative(ROOT, file)
    const source = readFileSync(file, 'utf8')

    const usesReact = source.includes(REACT_PRIMITIVE)
    const usesPdf = source.includes(PDF_PRIMITIVE)

    if (!usesReact && !usesPdf) {
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

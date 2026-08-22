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
 * THE PUBLIC SURFACE — a second file class, with the INVERSE rule.
 *
 * The hints regex above never matched `app/(public)/page.tsx`, so the public
 * tree was invisible to the one gate that exists to police owner-facing copy —
 * even though the seed lists `landing_page` as a legend channel. Widening the
 * hints would be wrong, because the public tree's rule is the opposite of the
 * outbound tree's:
 *
 *   outbound: you MUST render the legend.
 *   public:   you MUST NOT, unless registration says we are actually offering —
 *             and only OfferStateBanner decides that.
 *
 * Putting the legend on a page that expressly declines clients would assert
 * "THIS IS A SOLICITATION" about a page that is not one. That is a false
 * statement on a commercial page, reachable under § 44-12-239.2(a)(5) at $2,000
 * per act, quite apart from the Georgia FBPA private right of action.
 */
const PUBLIC_SURFACE_DIRS = ['app/(public)/', 'components/public/']

/** Copy modules that must not inline the legend either. */
const COPY_MODULES = ['lib/public/disclosure.ts']

/** The one file permitted to render the legend on the web. */
const OFFER_STATE_BANNER = 'components/public/OfferStateBanner.tsx'

/**
 * Educational quotation, permitted on exactly one page — but it must IMPORT the
 * constant rather than retype it, so there is still one definition.
 */
const LEGEND_QUOTING_PAGES = ['app/(public)/is-this-letter-real/page.tsx']

/** Anything that invites the reader to act. Must sit inside <WhenOffering>. */
const ENGAGEMENT_MARKERS = /<form|<input|<textarea|<button[^>]*type=["']submit|'use server'|data-cta=/

function isPublicSurface(rel: string): boolean {
  return PUBLIC_SURFACE_DIRS.some((d) => rel.startsWith(d))
}

/**
 * Strip comments before looking for a marker.
 *
 * This gate has now been fooled three separate times by text that merely
 * MENTIONS the thing being checked: an import line, a doc comment describing a
 * call (parentheses and all), and a comment stating a rule the file obeys. Any
 * marker search over raw source is checking prose, not code.
 */
function executableSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * next/og renders through satori, which supports a CSS subset and does NOT
 * resolve custom properties — an OG card physically cannot use the --fs-*
 * variables. It is exempted from the type-scale rule only, and remains subject
 * to the inline-legend and engagement checks. It carries its own derived
 * "not offering services" strap, which is the thing that actually matters for a
 * preview card seen with no surrounding disclosure.
 */
const RAW_FONT_SIZE_EXEMPT = ['app/(public)/opengraph-image.tsx']

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
      // The public tree is checked separately, under the inverse rule.
      if (isPublicSurface(rel)) return false
      // Anything under templates/ is in scope regardless of name; elsewhere,
      // only files whose path suggests owner-facing content.
      return rel.startsWith('templates/') || SOLICITATION_HINTS.test(rel)
    })

  const publicFiles = ['app', 'components']
    .flatMap((dir) => walk(join(ROOT, dir)))
    .filter((f) => isPublicSurface(relative(ROOT, f)))

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

  // ── The public surface, under the inverse rule ──────────────────────────
  if (publicFiles.length === 0) {
    failures.push({
      file: 'app/(public)/',
      reason:
        'the public tree is missing or empty. This gate is then verifying nothing ' +
        'about the surface § 44-12-239(f) actually names as a legend channel.',
    })
  }

  for (const file of publicFiles) {
    const rel = relative(ROOT, file)
    const source = readFileSync(file, 'utf8')
    const code = executableSource(source)
    const isBanner = rel === OFFER_STATE_BANNER

    // 1. Only OfferStateBanner may render the legend. Everywhere else, whether
    //    the legend appears is a compliance decision, not a page-author one.
    if (!isBanner && code.includes(REACT_PRIMITIVE)) {
      failures.push({
        file: rel,
        reason:
          `renders ${REACT_PRIMITIVE} directly. Only ${OFFER_STATE_BANNER} may decide ` +
          'which notice appears, because that decision is derived from registration ' +
          'state and must not be made per page.',
      })
    }

    // 2. The most important assertion in this gate. Inlining the legend text
    //    onto a page that is not a solicitation is a FALSE statement about that
    //    page — § 44-12-239.2(a)(5), up to $2,000 per act.
    if (INLINE_LEGEND.test(source) && !LEGEND_QUOTING_PAGES.includes(rel)) {
      failures.push({
        file: rel,
        reason:
          'inlines the solicitation legend text. On a page that expressly declines ' +
          'clients, "THIS IS A SOLICITATION" is FALSE — a misleading statement on a ' +
          'commercial page under § 44-12-239.2(a)(5). Render the notice through ' +
          `${OFFER_STATE_BANNER}, which chooses it from registration state.`,
      })
    }
    // The quoting page is exempt only while it imports the constant.
    if (LEGEND_QUOTING_PAGES.includes(rel) && !/SOLICITATION_LEGEND_GA/.test(source)) {
      failures.push({
        file: rel,
        reason:
          'quotes the legend without importing SOLICITATION_LEGEND_GA from ' +
          'lib/compliance/legend.ts. The legend has exactly one definition; a page ' +
          'teaching readers to recognise it must teach them the real one.',
      })
    }

    // 3. Every CTA and every contact capture must sit inside <WhenOffering>, so
    //    the no-solicitation rule holds regardless of what CDR_REGISTRATION_STATUS
    //    happens to be in this environment. A gate that only fires in one env is
    //    not a gate.
    if (ENGAGEMENT_MARKERS.test(code) && !code.includes('<WhenOffering')) {
      failures.push({
        file: rel,
        reason:
          'contains a form, input, submit button, server action or CTA marker that ' +
          'is not wrapped in <WhenOffering>. Inviting engagement while unregistered ' +
          'is a solicitation to enter into an agreement — § 44-12-239.2(a)(10), up ' +
          'to $2,000 per act.',
      })
    }

    // 4. No raw font sizes: the legend is sized against the LARGEST text on the
    //    page, so the scale must stay in lib/public/typeScale.ts where raising
    //    the hero visibly raises the legend.
    if (/fontSize:\s*['"`]?\d/.test(code) && !RAW_FONT_SIZE_EXEMPT.includes(rel)) {
      failures.push({
        file: rel,
        reason:
          'sets a raw fontSize. Public type must come from the --fs-* variables ' +
          'driven by lib/public/typeScale.ts, because § 44-12-239(f) sizes the legend ' +
          'at max(12pt, largest font + 1) — an uncapped page silently enlarges it.',
      })
    }

    // 5. §1.8, structurally: the public tree must not touch the database.
    if (/@\/lib\/db/.test(code)) {
      failures.push({
        file: rel,
        reason:
          'imports from @/lib/db. The public tree must never read the unclaimed ' +
          'property file — § 44-12-239.1(b) — and staying database-free is also what ' +
          'keeps these pages statically renderable.',
      })
    }
  }

  // The banner must DERIVE its state and offer no way to be told otherwise.
  {
    const rel = OFFER_STATE_BANNER
    let source: string | null = null
    try { source = readFileSync(join(ROOT, rel), 'utf8') } catch { source = null }

    if (source === null) {
      failures.push({ file: rel, reason: 'is missing. No public page can render a compliant notice without it.' })
    } else {
      const bannerCode = executableSource(source)
      if (!bannerCode.includes('getOfferState(')) {
        failures.push({
          file: rel,
          reason: 'does not call getOfferState(). The notice must be derived from ' +
            'registration state, never chosen by a caller.',
        })
      }
      if (/(offerState|state|registered|forceState|variant)\s*[?:]/.test(bannerCode)) {
        failures.push({
          file: rel,
          reason:
            'accepts a state-shaped prop. A compliance component with a state prop ' +
            'is one somebody eventually passes the wrong value to. It must take no ' +
            'props and derive its own state.',
        })
      }
    }
  }

  // Copy modules must not inline the legend either.
  for (const module of COPY_MODULES) {
    let source: string
    try { source = readFileSync(join(ROOT, module), 'utf8') } catch {
      failures.push({ file: module, reason: 'is missing; the public notice has no definition.' })
      continue
    }
    if (INLINE_LEGEND.test(source)) {
      failures.push({
        file: module,
        reason: 'inlines the solicitation legend. This module defines the ' +
          'PRE-REGISTRATION notice, which must not assert that the page is a solicitation.',
      })
    }
    if (!/PRE_REGISTRATION_DISCLOSURE/.test(source)) {
      failures.push({ file: module, reason: 'does not export PRE_REGISTRATION_DISCLOSURE.' })
    }
  }

  // The public layout must render both notices UNCONDITIONALLY.
  {
    const rel = 'app/(public)/layout.tsx'
    let source: string | null = null
    try { source = readFileSync(join(ROOT, rel), 'utf8') } catch { source = null }
    if (source === null) {
      failures.push({ file: rel, reason: 'is missing.' })
    } else {
      for (const required of ['<OfferStateBanner', '<StandingDisclosures']) {
        const line = source.split('\n').find((l) => l.includes(required))
        if (line === undefined) {
          failures.push({
            file: rel,
            reason: `does not render ${required} />. Every public page must carry it.`,
          })
        } else if (/&&|\?/.test(line)) {
          failures.push({
            file: rel,
            reason: `renders ${required} conditionally. The notice is not optional on ` +
              'any page, in any state.',
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
  console.log(
    `✓ §1.2 all ${publicFiles.length} public surface file(s) defer the notice to ` +
    'OfferStateBanner, inline no legend text, and gate every CTA on registration',
  )
}

main()

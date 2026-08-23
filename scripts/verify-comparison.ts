/**
 * CI gate — comparative claims about named third parties.
 *
 * Naming a competitor is the highest-risk copy on this site. § 44-12-239.2(a)(5)
 * reaches a false or misleading statement at $2,000 per act, and Georgia's Fair
 * Business Practices Act gives a named firm a private right of action with
 * treble damages. ADR-0010 already binds every factual claim on this site to a
 * source; a claim about somebody ELSE is where that rule earns its keep.
 *
 * Four checks, each of which has a failure mode a copy review would miss:
 *
 *   1. Provenance — every claim carries a source URL and a date. The types make
 *      these non-optional, but a type is not a gate: `as` casts, JSON, and a
 *      future refactor all route around it, and this file does not.
 *
 *   2. Staleness — an observation about a live website decays. "Publishes no
 *      fee" was true on the day it was read and may be false a month later, at
 *      which point OUR page is the false statement. Anything older than
 *      MAX_AGE_DAYS fails the build, which forces a re-read rather than letting
 *      a stale assertion sit there indefinitely.
 *
 *   3. No adjectives — the denylist is the whole editorial policy, expressed
 *      mechanically. "Publishes its fee: no" is an observation a reader can
 *      repeat in ten seconds. "Not transparent" is a characterisation, and the
 *      difference is the entire distance between reporting and disparagement.
 *
 *   4. Completeness — a named firm must have a value for every attribute. A
 *      table with gaps only where a rival does well is a lie told by omission,
 *      and it is the easiest one to tell by accident.
 */

import {
  ALTERNATIVES, ATTRIBUTES, RECLAIMED,
  type Alternative, type ComparisonClaim,
} from '../lib/public/comparison'

/**
 * Roughly six months. Long enough not to be busywork, short enough that a rival
 * who changed their pricing page does not leave us asserting something false.
 */
const MAX_AGE_DAYS = 190

/**
 * Words that characterise rather than describe.
 *
 * Split in two because they fail for different reasons. Pejoratives are
 * defamation risk. Superlatives are § 44-12-239.2(a)(5) risk — "best" and
 * "cheapest" are unfalsifiable puffery that a regulator may read as a
 * misleading statement, and we are in no position to claim either while
 * unregistered.
 */
const PEJORATIVE = [
  'scam', 'scammer', 'predatory', 'rip-off', 'ripoff', 'shady', 'sketchy',
  'dishonest', 'deceptive', 'fraudulent', 'fraud', 'misleading', 'unethical',
  'illegal', 'unlawful', 'violates', 'in violation', 'shell company',
  'untrustworthy', 'dodgy', 'sleazy', 'exploits', 'preys',
]

const SUPERLATIVE = [
  'best', 'worst', 'cheapest', 'most trusted', 'number one', '#1',
  'unmatched', 'unbeatable', 'superior to', 'better than', 'leading',
  'only firm', 'nobody else', 'no one else',
]

interface Failure { where: string; reason: string }

function daysSince(iso: string): number {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - then) / 86_400_000)
}

/** Every free-text field on a claim. Anything a reader can see must be checked. */
function proseOf(claim: ComparisonClaim): string {
  return `${claim.value} ${claim.detail ?? ''}`
}

function checkProse(text: string, where: string, failures: Failure[]): void {
  const haystack = text.toLowerCase()
  for (const word of PEJORATIVE) {
    if (haystack.includes(word)) {
      failures.push({
        where,
        reason:
          `contains the pejorative "${word}". Record what a source SAYS, not what ` +
          'it implies about the firm. § 44-12-239.2(a)(5) and the Georgia FBPA both ' +
          'reach a characterisation that turns out to be wrong.',
      })
    }
  }
  for (const word of SUPERLATIVE) {
    if (haystack.includes(word)) {
      failures.push({
        where,
        reason:
          `contains the superlative "${word}". Unfalsifiable comparative puffery is ` +
          'itself reachable as a misleading statement, and we are not registered.',
      })
    }
  }
}

function checkAlternative(alt: Alternative, failures: Failure[]): void {
  checkProse(alt.summary, `${alt.slug} summary`, failures)

  const seen = new Set<string>()

  for (const claim of alt.claims) {
    const where = `${alt.slug}.${claim.attribute}`
    seen.add(claim.attribute)

    if (claim.sourceUrl.trim() === '') {
      failures.push({ where, reason: 'has no sourceUrl. Every claim needs somewhere it came from.' })
    }
    if (claim.asOf.trim() === '') {
      failures.push({ where, reason: 'has no asOf date.' })
    } else {
      const age = daysSince(claim.asOf)
      if (age === Number.POSITIVE_INFINITY) {
        failures.push({ where, reason: `asOf "${claim.asOf}" is not a parseable date.` })
      } else if (age > MAX_AGE_DAYS) {
        failures.push({
          where,
          reason:
            `was observed ${age} days ago (limit ${MAX_AGE_DAYS}). Re-read the source. ` +
            'A live website changes, and a stale observation makes OUR page the false one.',
        })
      }
    }

    checkProse(proseOf(claim), where, failures)
  }

  // Completeness. Only enforced for entries that name a real company — a
  // category like "a probate attorney" is still required to be complete, but a
  // missing row there cannot defame anyone.
  for (const attribute of ATTRIBUTES) {
    if (!seen.has(attribute)) {
      failures.push({
        where: `${alt.slug}.${attribute}`,
        reason:
          'is missing. A comparison table with gaps exactly where a rival does well ' +
          'is a lie by omission. State "Not stated on the page reviewed" instead.',
      })
    }
  }
}

function main(): void {
  const failures: Failure[] = []

  for (const alt of ALTERNATIVES) checkAlternative(alt, failures)
  checkAlternative(RECLAIMED, failures)

  // We must never be the only entry that looks good on registration. This is a
  // specific, deliberate check rather than a general principle, because the
  // temptation to quietly soften it will arrive the moment somebody reads the
  // page and winces.
  const ours = RECLAIMED.claims.find((c) => c.attribute === 'registration_published')
  if (ours !== undefined && !/not registered/i.test(ours.value)) {
    failures.push({
      where: 'reclaimed.registration_published',
      reason:
        'no longer says we are unregistered. If that is because registration ISSUED, ' +
        'update this gate deliberately. If it is because the row was embarrassing, ' +
        'put it back — ADR-0010 rests on this site declining clients honestly.',
    })
  }

  if (failures.length > 0) {
    console.error('\n✗ COMPARATIVE CLAIMS DO NOT MEET THE EVIDENCE BAR\n')
    for (const f of failures) console.error(`  · ${f.where} ${f.reason}`)
    console.error(
      '\n  These pages name real companies. Every row must be something a reader\n' +
      '  can verify from the cited page in under a minute, observed recently.\n',
    )
    process.exit(1)
  }

  const claims = [...ALTERNATIVES, RECLAIMED].reduce((n, a) => n + a.claims.length, 0)
  console.log(
    `✓ comparison: ${ALTERNATIVES.length + 1} alternatives, ${claims} claims, ` +
    `all sourced and observed within ${MAX_AGE_DAYS} days`,
  )
}

main()

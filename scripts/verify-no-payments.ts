/**
 * CI gate for §1.1 — O.C.G.A. § 44-12-239.2(a)(12).
 *
 * "Receipt or SOLICITATION of consideration to be paid in advance of the
 * approval of a claim under this article."
 *
 * This kills the subscription, the per-claim-set fee, the card-on-file, the
 * "search fee", the "document prep fee", and any Stripe object created before
 * DOR approves. There is no payments integration in v1 and this script exists to
 * make adding one break the build loudly.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

const BANNED_PACKAGES = [
  'stripe', '@stripe/stripe-js', '@stripe/react-stripe-js', '@stripe/connect-js',
  'braintree', 'braintree-web', 'square', '@square/web-sdk',
  '@paypal/checkout-server-sdk', '@paypal/react-paypal-js', 'paypal-rest-sdk',
  'razorpay', '@adyen/api-library', '@adyen/adyen-web',
  '@lemonsqueezy/lemonsqueezy.js', '@paddle/paddle-node-sdk', 'paddle-sdk',
  'chargebee', 'recurly', '@recurly/recurly-js', 'plaid',
]

/** Source patterns that indicate a charge is being constructed. */
const BANNED_SOURCE_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bnew\s+Stripe\b/, why: 'Stripe client construction' },
  { pattern: /stripe\.(customers|charges|paymentIntents|subscriptions|checkout)\b/, why: 'Stripe API call' },
  { pattern: /\bcheckout\.sessions\.create\b/, why: 'checkout session creation' },
  { pattern: /['"]sk_(live|test)_/, why: 'Stripe secret key literal' },
  { pattern: /['"]pk_(live|test)_/, why: 'Stripe publishable key literal' },
]

const SCAN_DIRS = ['app', 'lib', 'scripts', 'db', 'templates']
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql)$/
const SKIP_FILES = new Set(['verify-no-payments.ts'])

interface Failure { file: string; detail: string }

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.test(entry) && !SKIP_FILES.has(entry)) out.push(full)
  }
  return out
}

function main(): void {
  const failures: Failure[] = []

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const installed = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const name of BANNED_PACKAGES) {
    if (name in installed) {
      failures.push({ file: 'package.json', detail: `payment SDK "${name}" is a dependency` })
    }
  }

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const contents = readFileSync(file, 'utf8')
      for (const { pattern, why } of BANNED_SOURCE_PATTERNS) {
        if (pattern.test(contents)) {
          failures.push({ file: file.replace(`${ROOT}/`, ''), detail: why })
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('\n✗ ADVANCE-FEE GUARDRAIL VIOLATED — O.C.G.A. § 44-12-239.2(a)(12)\n')
    for (const f of failures) console.error(`  ${f.file}: ${f.detail}`)
    console.error(
      '\n  Georgia prohibits receipt OR SOLICITATION of consideration paid in advance\n' +
      '  of claim approval. Sanctionable at up to $2,000 PER ACT with revocation.\n' +
      '  The only two legal revenue mechanics in GA are (1) contingency <=30% under a\n' +
      '  UP-CDR2 Recovery Agreement, paid by DOR at approval, and (2) outright purchase\n' +
      '  under UP-CDR4. Revenue arrives as a paper check. Model it as expected_receipt.\n',
    )
    process.exit(1)
  }

  console.log('✓ §1.1 no payment SDK, no charge construction (§ 44-12-239.2(a)(12))')
}

main()

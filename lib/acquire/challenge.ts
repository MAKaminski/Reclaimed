/**
 * The challenge tripwire.
 *
 * A source DECLARES that no access control stands in the way. A response can
 * PROVE otherwise. When they disagree, the wire wins.
 *
 * This is the control that matters most in the acquisition layer, and it exists
 * because of a specific human moment: a fetch returns 403, and the obvious next
 * move is to send a browser User-Agent and try again. That move is how a data
 * pipeline becomes a circumvention tool one commit at a time.
 *
 * So a detected control is not a transient fault to retry — it is a
 * CLASSIFICATION ERROR, and the error text says so and names the remedy. There
 * is deliberately no retry ladder, no backoff, and no header rotation anywhere
 * in this module.
 *
 * Under O.C.G.A. § 44-12-239(d) a conviction involving dishonesty bars CDR
 * registration for twenty years. The downside here is not a fine; it is the
 * business.
 */

export interface ChallengeSignal {
  /** The specific thing observed, quotable in an error. */
  marker: string
  detail: string
}

/** Header markers that indicate a bot-management product, with the statuses that matter. */
const HEADER_MARKERS: ReadonlyArray<{
  header: string
  statuses: number[] | 'any'
  detail: string
}> = [
  { header: 'cf-mitigated', statuses: 'any', detail: 'Cloudflare bot mitigation' },
  { header: 'x-datadome', statuses: [403, 429], detail: 'DataDome bot protection' },
  { header: 'akamai-grn', statuses: [403], detail: 'Akamai bot manager' },
  { header: 'x-iinfo', statuses: [403], detail: 'Imperva/Incapsula' },
  { header: 'www-authenticate', statuses: 'any', detail: 'HTTP authentication required' },
]

/** Body markers, checked only on a small head slice. */
const BODY_MARKERS: ReadonlyArray<{ pattern: RegExp; detail: string }> = [
  { pattern: /challenges\.cloudflare\.com/i, detail: 'Cloudflare Turnstile challenge' },
  { pattern: /cf-chl-/i, detail: 'Cloudflare challenge platform' },
  { pattern: /g-recaptcha|www\.google\.com\/recaptcha/i, detail: 'Google reCAPTCHA' },
  { pattern: /h-captcha|hcaptcha\.com/i, detail: 'hCaptcha' },
  { pattern: /data-sitekey/i, detail: 'CAPTCHA sitekey in markup' },
  { pattern: /Enable JavaScript and cookies to continue/i, detail: 'JS interstitial' },
]

export function detectChallenge(
  response: Pick<Response, 'status' | 'headers'>,
  bodyHead?: string,
): ChallengeSignal | null {
  const status = response.status

  for (const { header, statuses, detail } of HEADER_MARKERS) {
    const value = response.headers.get(header)
    if (value === null) continue
    if (statuses === 'any' || statuses.includes(status)) {
      return { marker: `${header}: ${value}`, detail }
    }
  }

  // Cloudflare alone is not evidence — it fronts an enormous share of the web
  // and serves plenty of files without interference. Only a challenge STATUS
  // from a Cloudflare edge counts.
  const server = response.headers.get('server')
  if (server !== null && /cloudflare/i.test(server) && [403, 429, 503].includes(status)) {
    return {
      marker: `server: ${server} with HTTP ${status}`,
      detail: 'Cloudflare edge refused the request',
    }
  }

  if (bodyHead !== undefined) {
    for (const { pattern, detail } of BODY_MARKERS) {
      const match = pattern.exec(bodyHead)
      if (match !== null) return { marker: match[0], detail }
    }
  }

  return null
}

export class ChallengeDetectedError extends Error {
  constructor(url: string, signal: ChallengeSignal, sourceKey: string) {
    super(
      `REFUSING TO CONTINUE: ${url} is behind a technical access control ` +
      `(${signal.marker} — ${signal.detail}).\n\n` +
      `Source "${sourceKey}" is classified "open"; the wire says otherwise, and the ` +
      'wire wins.\n\n' +
      'Do NOT add a User-Agent, do NOT retry, do NOT rotate headers, and do NOT ' +
      'drive a browser. Defeating a technical access control creates CFAA and state ' +
      'computer-crime exposure, and under O.C.G.A. § 44-12-239(d) a conviction ' +
      'involving dishonesty bars CDR registration for twenty years.\n\n' +
      `Instead: reclassify "${sourceKey}" as "restricted" in lib/acquire/sources.ts, ` +
      'record this observation as its AccessControl evidence, and obtain the file by ' +
      'hand.',
    )
    this.name = 'ChallengeDetectedError'
  }
}

/** Call on every response from an `open` fetch, before reading the body. */
export function assertNoChallenge(
  url: string,
  sourceKey: string,
  response: Pick<Response, 'status' | 'headers'>,
  bodyHead?: string,
): void {
  const signal = detectChallenge(response, bodyHead)
  if (signal !== null) throw new ChallengeDetectedError(url, signal, sourceKey)
}

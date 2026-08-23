import { API_VERSION, INTAKE_MAX_BYTES } from '@/lib/api/contract'
import { absoluteUrl, SITE_NAME } from '@/lib/public/site'

/**
 * GET /api/openapi.json — the machine-readable contract.
 *
 * Hand-written rather than generated. A generator would happily emit the shape
 * of every route in the app, and the point of this document is that it describes
 * a deliberately small surface: two endpoints, one of which only reports status.
 *
 * Reachable without the allowlist in lib/public/pages.ts because the path ends
 * in `.json`, which proxy.ts's matcher already skips.
 */
export const dynamic = 'force-static'

export function GET(): Response {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: `${SITE_NAME} Partner API`,
      version: API_VERSION,
      summary: 'Refer an unclaimed property claim to Reclaimed.',
      description:
        'Referrals in, nothing out. This API accepts a claim a partner wants Reclaimed ' +
        'to work; it is not a lookup or a data API and will not become one. ' +
        'O.C.G.A. § 44-12-239.1(b) permits a representative to receive the state file only ' +
        'to solicit the owners it names, so an endpoint answering "what do you hold for ' +
        'this name" is foreclosed. No response body echoes a property, a value, a holder, ' +
        'or a count.\n\n' +
        'Referrals are refused with 503 while Reclaimed is unregistered. Poll ' +
        '`/api/v1/status` to discover when that changes; it is derived from registration ' +
        'state, not configured.',
      contact: { url: absoluteUrl('/for-partners') },
    },
    servers: [{ url: absoluteUrl('/') }],
    paths: {
      [`/api/${API_VERSION}/status`]: {
        get: {
          summary: 'Capability discovery',
          description:
            'Always 200, including while closed. Tells you whether referrals are being ' +
            'accepted, why not, which jurisdictions are served, and the statutory fee cap ' +
            'per state.',
          responses: {
            '200': {
              description: 'Current capability.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Status' } } },
            },
          },
        },
      },
      [`/api/${API_VERSION}/intake`]: {
        post: {
          summary: 'Refer a claim',
          description:
            `Body limited to ${INTAKE_MAX_BYTES} bytes. \`reference\` is your idempotency ` +
            'key: resending the same reference returns 200 with `duplicate: true` rather ' +
            'than creating a second referral, because a timed-out POST is the normal case.\n\n' +
            'While closed, the registration check runs BEFORE the body is parsed — if we ' +
            'may not act on a referral we do not read one either.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Referral' } } },
          },
          responses: {
            '201': { description: 'Referral recorded.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Accepted' } } } },
            '200': { description: 'Duplicate reference; the original stands.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Accepted' } } } },
            '400': { description: 'Malformed or invalid body. Field paths only — values are never echoed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '413': { description: 'Body too large.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '422': { description: 'Jurisdiction not served.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '503': { description: 'Not registered; referrals closed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
    },
    components: {
      schemas: {
        Status: {
          type: 'object',
          required: ['apiVersion', 'acceptingReferrals', 'registrationStatus', 'reason'],
          properties: {
            apiVersion: { type: 'string' },
            acceptingReferrals: { type: 'boolean' },
            registrationStatus: {
              type: 'string',
              enum: ['unregistered', 'pending', 'active', 'suspended', 'revoked'],
            },
            reason: { type: 'string' },
            citation: { type: 'string' },
            jurisdictionsServed: {
              type: 'array', items: { type: 'string', minLength: 2, maxLength: 2 },
              description: 'States whose rules are verified. An empty array is a real answer.',
            },
            jurisdictionsResearched: { type: 'array', items: { type: 'string' } },
            feeCapPct: {
              type: 'object', additionalProperties: { type: ['number', 'null'] },
              description: 'Statutory ceiling on fees AND costs. null means NO percentage cap — not zero.',
            },
            documentation: { type: 'string' },
          },
        },
        Referral: {
          type: 'object',
          required: ['reference', 'partner', 'jurisdiction', 'claimant', 'claimantConsentAttested'],
          properties: {
            reference: { type: 'string', maxLength: 128, description: 'Your idempotency key.' },
            partner: {
              type: 'object',
              required: ['name', 'email'],
              properties: {
                name: { type: 'string', maxLength: 200 },
                email: { type: 'string', format: 'email' },
                registration: { type: 'string', maxLength: 64, description: 'Your own CDR or bar number, if any.' },
              },
            },
            jurisdiction: { type: 'string', minLength: 2, maxLength: 2, description: 'Two-letter state code.' },
            claimant: {
              type: 'object',
              required: ['name', 'kind', 'relationship'],
              properties: {
                name: { type: 'string', maxLength: 200 },
                kind: { type: 'string', enum: ['individual', 'entity', 'estate'] },
                relationship: { type: 'string', maxLength: 500, description: 'How you know them.' },
              },
            },
            property: {
              type: 'object',
              description:
                'A DESCRIPTION, never an identifier. There is no property_id field and there ' +
                'will not be one — quoting one of our identifiers would mean you had our file.',
              properties: {
                description: { type: 'string', maxLength: 2000 },
                estimatedValueUsd: { type: 'number', minimum: 0 },
              },
            },
            claimantConsentAttested: {
              const: true,
              description:
                'You attest the claimant knows about and consents to this referral. Literal true ' +
                'only — an unattested referral is a cold contact.',
            },
          },
        },
        Accepted: {
          type: 'object',
          required: ['reference', 'status'],
          properties: {
            reference: { type: 'string', description: 'Your own reference, echoed. Nothing else is returned.' },
            status: { type: 'string', enum: ['received'] },
            duplicate: { type: 'boolean' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  enum: ['not_registered', 'jurisdiction_not_served', 'invalid_payload', 'payload_too_large', 'duplicate_reference'],
                },
                message: { type: 'string' },
                citation: { type: 'string' },
                statusUrl: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }

  return Response.json(spec, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  })
}

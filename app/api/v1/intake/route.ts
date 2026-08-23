import { createClient } from '@supabase/supabase-js'
import {
  INTAKE_MAX_BYTES, ReferralSchema, capabilityStatus,
  intakeOpen, jurisdictionServable, type IntakeRefusal,
} from '@/lib/api/contract'

/**
 * POST /api/v1/intake — accept a referral from a partner.
 *
 * Direction of travel is the whole compliance argument: data arrives, nothing
 * leaves. The response echoes the caller's own `reference` and nothing else. No
 * property, no value, no holder, no count — see lib/api/contract.ts.
 *
 * Closed today, and the closure is derived rather than configured: it reads the
 * same offer state as every call to action on the site. Accepting a referral is
 * contact capture, and capturing the details of somebody who wants claim
 * services before we are registered is what § 44-12-239.2(a)(10) reaches.
 */
export const dynamic = 'force-dynamic'

function refuse(status: number, refusal: IntakeRefusal): Response {
  return Response.json({ error: refusal }, {
    status,
    headers: { 'access-control-allow-origin': '*' },
  })
}

export async function POST(request: Request): Promise<Response> {
  const status = capabilityStatus()

  // Registration is checked FIRST, before parsing.
  //
  // Deliberate: if we cannot accept a referral, we must not read one either. A
  // 400 for a malformed payload would mean we had already parsed a real person's
  // name and address out of a request we were never permitted to act on.
  if (!intakeOpen()) {
    return refuse(503, {
      code: 'not_registered',
      message:
        'Reclaimed is not currently registered and cannot accept referrals. ' +
        'Nothing was read from this request body.',
      citation: status.citation,
      statusUrl: '/api/v1/status',
    })
  }

  const raw = await request.text()
  if (raw.length > INTAKE_MAX_BYTES) {
    return refuse(413, {
      code: 'payload_too_large',
      message: `Referrals are limited to ${INTAKE_MAX_BYTES} bytes.`,
      statusUrl: '/api/v1/status',
    })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return refuse(400, {
      code: 'invalid_payload',
      message: 'Body is not valid JSON.',
      statusUrl: '/api/v1/status',
    })
  }

  const parsed = ReferralSchema.safeParse(json)
  if (!parsed.success) {
    return refuse(400, {
      code: 'invalid_payload',
      // Field paths only. Never the submitted VALUES — echoing a claimant's name
      // back in an error body puts personal data in the caller's logs.
      message: `Invalid referral. Problems at: ${
        parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', ')
      }`,
      statusUrl: '/api/v1/status',
    })
  }

  if (!jurisdictionServable(parsed.data.jurisdiction)) {
    return refuse(422, {
      code: 'jurisdiction_not_served',
      message:
        `We do not act in ${parsed.data.jurisdiction}. We operate only where that ` +
        'state’s rules have been verified against primary sources, because a ' +
        'wrong fee cap produces an over-cap agreement.',
      citation: 'O.C.G.A. § 44-12-224(d)(1) and state equivalents',
      statusUrl: '/api/v1/status',
    })
  }

  // Written as `anon`. That role holds INSERT on partner_referrals and no SELECT,
  // which is the "data in, nothing out" rule expressed as a grant rather than as
  // a convention — see migration 0033.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || key === undefined) {
    return refuse(503, {
      code: 'not_registered',
      message: 'Intake is temporarily unavailable.',
      statusUrl: '/api/v1/status',
    })
  }

  const supabase = createClient(url, key)
  const r = parsed.data

  const { error } = await supabase.from('partner_referrals').insert({
    reference: r.reference,
    partner_name: r.partner.name,
    partner_email: r.partner.email,
    partner_registration: r.partner.registration ?? null,
    jurisdiction: r.jurisdiction,
    claimant_name: r.claimant.name,
    claimant_kind: r.claimant.kind,
    relationship: r.claimant.relationship,
    property_description: r.property?.description ?? null,
    estimated_value_cents: r.property?.estimatedValueUsd === undefined
      ? null
      : Math.round(r.property.estimatedValueUsd * 100),
    claimant_consent_attested: r.claimantConsentAttested,
  })

  if (error !== null) {
    // 23505 is unique_violation on `reference`. That is the retry case, and a
    // retry must be idempotent rather than an error: the partner's first POST
    // succeeded and their client never saw the response.
    if (error.code === '23505') {
      return Response.json(
        { reference: r.reference, status: 'received', duplicate: true },
        { status: 200, headers: { 'access-control-allow-origin': '*' } },
      )
    }
    return refuse(500, {
      code: 'invalid_payload',
      message: 'Referral could not be recorded. Nothing was stored; retry with the same reference.',
      statusUrl: '/api/v1/status',
    })
  }

  // The response echoes the caller's OWN reference and nothing else. No id, no
  // property, no value, no count — anything we return is something we have
  // disclosed, and the point of this API is that we disclose nothing.
  return Response.json(
    { reference: r.reference, status: 'received' },
    { status: 201, headers: { 'access-control-allow-origin': '*' } },
  )
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    },
  })
}

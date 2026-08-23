import { capabilityStatus } from '@/lib/api/contract'

/**
 * GET /api/v1/status — capability discovery.
 *
 * Always 200, including while we are closed. A partner integrating against this
 * needs a stable endpoint that tells them whether referrals are open, why not,
 * and which jurisdictions we could lawfully act in — without POSTing a real
 * person's details to find out.
 *
 * `acceptingReferrals` is derived from registration state with no override, so
 * it flips on its own the moment registration issues and a deploy lands. Nobody
 * has to remember to change a flag here.
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return Response.json(capabilityStatus(), {
    headers: {
      // Short cache: this is the endpoint partners poll, and the value it
      // reports changes exactly once, so a stale minute is harmless and a
      // stampede is not.
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  })
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  })
}

/**
 * Email link confirmation — the server-side half of magic-link sign-in.
 *
 * WHY THIS EXISTS, and why /auth/callback was not enough:
 *
 * Supabase's default templates use {{ .ConfirmationURL }}, which routes through
 * /auth/v1/verify and returns the session in the URL **fragment**
 * (#access_token=…). A fragment is never transmitted to the server, so a
 * server-side route sees no credential at all and bounces the user back to the
 * sign-in page — which is exactly what happened.
 *
 * {{ .TokenHash }} + verifyOtp() is the server-side path: the hash arrives as a
 * normal query parameter, is exchanged here, and the session cookie is set
 * before any redirect happens.
 */

import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/db/supabase'

/** Link types we accept. Anything else is not a sign-in. */
const ACCEPTED: readonly EmailOtpType[] = ['magiclink', 'signup', 'email', 'invite', 'recovery']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(reason)}`, origin))

  if (tokenHash === null || type === null) {
    return fail('link_incomplete')
  }
  if (!ACCEPTED.includes(type)) {
    return fail('link_type_unsupported')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error !== null) {
    // Expired or already used. Both are normal — the link is single-use by
    // design — so say which rather than showing a bare failure.
    const expired = /expired|invalid/i.test(error.message)
    return fail(expired ? 'link_expired' : 'link_failed')
  }

  // Always our own origin. An open redirect on an auth route hands a live
  // session to somebody else's site.
  return NextResponse.redirect(new URL('/', origin))
}

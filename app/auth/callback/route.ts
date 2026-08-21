/**
 * Magic-link callback: exchange the one-time code for a session.
 *
 * This route authenticates. It does NOT authorise — landing here with a valid
 * code makes you a signed-in Supabase account, nothing more. Whether you see any
 * unclaimed property data is decided entirely by whether an administrator
 * created a `staff` row for you, and enforced by RLS on every table.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/supabase'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  // A link carrying token_hash belongs to /auth/confirm. Forward rather than
  // fail: which route an email points at is a template setting, and a template
  // edit should not lock everyone out.
  const tokenHash = url.searchParams.get('token_hash')
  if (code === null && tokenHash !== null) {
    const forward = new URL('/auth/confirm', url.origin)
    forward.search = url.search
    return NextResponse.redirect(forward)
  }

  if (code === null) {
    // Most often the email template used {{ .ConfirmationURL }}, which returns
    // the session in the URL FRAGMENT — never sent to the server. Use
    // {{ .TokenHash }} pointing at /auth/confirm instead.
    return NextResponse.redirect(new URL('/signin?error=link_incomplete', url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error !== null) {
    const expired = /expired|invalid/i.test(error.message)
    return NextResponse.redirect(
      new URL(`/signin?error=${expired ? 'link_expired' : 'link_failed'}`, url.origin),
    )
  }

  // Always to our own origin — never to a redirect target supplied in the URL.
  // An open redirect on an auth callback is how a session gets handed to
  // somebody else's site.
  return NextResponse.redirect(new URL('/', url.origin))
}

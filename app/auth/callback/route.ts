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

  if (code === null) {
    return NextResponse.redirect(new URL('/signin?error=missing_code', url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error !== null) {
    return NextResponse.redirect(new URL('/signin?error=invalid_link', url.origin))
  }

  // Always to our own origin — never to a redirect target supplied in the URL.
  // An open redirect on an auth callback is how a session gets handed to
  // somebody else's site.
  return NextResponse.redirect(new URL('/', url.origin))
}

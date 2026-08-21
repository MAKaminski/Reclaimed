/**
 * Session refresh, and the routing half of §1.8.
 *
 * Next 16 renamed the `middleware` file convention to `proxy`; the behaviour is
 * unchanged.
 *
 * Supabase sessions are refreshed here because a Server Component cannot set
 * cookies. This is NOT the access-control boundary — RLS is. It only keeps the
 * session alive and steers unauthenticated visitors to the sign-in page rather
 * than showing them an empty queue.
 *
 * If this file were deleted tomorrow, no unauthorised read would become
 * possible: every table denies by policy and `anon` has no schema grant at all.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ['/signin', '/auth/callback', '/auth/confirm', '/auth/finish', '/auth/signout']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || key === undefined) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Refreshes the session cookie as a side effect. Must be getUser(), not
  // getSession(): getSession trusts the cookie without revalidating it.
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  if (user === null && !isPublic) {
    return NextResponse.redirect(new URL('/signin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

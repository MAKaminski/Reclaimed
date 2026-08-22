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
 *
 * The public allowlist is DERIVED from lib/public/pages.ts rather than typed
 * here, so a page cannot exist in the sitemap while being redirected to
 * /signin. It remains an allowlist: anything not registered still requires a
 * session, so a new staff route is protected by default.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicPathnames } from '@/lib/public/pages'

/** Auth plumbing. Reachable without a session by definition. */
const AUTH_PATHS = ['/signin', '/auth/callback', '/auth/confirm', '/auth/finish', '/auth/signout']

const PUBLIC_PATHS = [...AUTH_PATHS, ...publicPathnames()]

function isPublicPath(path: string): boolean {
  // '/' must match exactly — startsWith('/') would open everything.
  return PUBLIC_PATHS.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)))
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Short-circuit BEFORE building a Supabase client. Anonymous traffic on the
  // public tree is the common case now, and it used to cost a network round
  // trip to Supabase on every crawler hit.
  if (isPublicPath(path)) return NextResponse.next({ request })

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

  if (user === null) {
    return NextResponse.redirect(new URL('/signin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    //
    // robots.txt / sitemap.xml / llms.txt are excluded here AND allowlisted
    // above. Belt and braces: a typo in this regex would otherwise take the
    // entire SEO surface offline silently, with a 302 to /signin that no
    // crawler would ever report.
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|llms\\.txt|opengraph-image|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)',
  ],
}

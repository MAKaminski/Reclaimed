import type { Metadata } from 'next'
import './globals.css'

/**
 * The root layout is deliberately INERT.
 *
 * It used to carry two things that are now pushed down into the group layouts:
 *
 *   1. `robots: { index: false }` — correct while this was a staff-only app,
 *      but it would silently noindex the public tree. Each group now declares
 *      its own posture, and `verify:public-surface` fails the build if any
 *      group other than (public) forgets to opt out.
 *
 *   2. <RegistrationBanner/>, which reads cookies() and therefore forced EVERY
 *      route — including anonymous crawler hits — to render dynamically and
 *      make a Supabase round trip. Public pages are static now.
 *
 * Nothing that reads a session or asserts an indexing posture may be added here.
 */
export const metadata: Metadata = {
  // § 44-12-239(g): the name must not suggest a government agency.
  title: 'Reclaimed',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

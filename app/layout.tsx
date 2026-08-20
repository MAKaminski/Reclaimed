import type { Metadata } from 'next'
import { RegistrationBanner } from '@/components/RegistrationBanner'

export const metadata: Metadata = {
  // § 44-12-239(g): the name must not suggest a government agency.
  title: 'Reclaimed — CDR Operations',
  description: 'Internal claim operations. Staff only.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          background: '#fafaf9',
          color: '#1c1917',
        }}
      >
        <RegistrationBanner />
        <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
          {children}
        </main>
      </body>
    </html>
  )
}

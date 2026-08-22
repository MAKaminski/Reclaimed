import type { Metadata } from 'next'
import { RegistrationBanner } from '@/components/RegistrationBanner'

/**
 * Staff surface. Never indexed — § 44-12-239.1(b) forbids redistributing the
 * Department's file, and every page in here reads it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegistrationBanner />
      <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>
    </>
  )
}

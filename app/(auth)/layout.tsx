import type { Metadata } from 'next'
import { RegistrationBanner } from '@/components/RegistrationBanner'

/**
 * Sign-in surface. Never indexed.
 *
 * The banner stays here deliberately: staff should see the kill-switch state
 * BEFORE authenticating, not after. tests/e2e/killSwitch.spec.ts asserts it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegistrationBanner />
      <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>
    </>
  )
}

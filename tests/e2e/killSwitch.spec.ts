/**
 * E2E — the auth boundary and the visible kill switch.
 *
 * Runs with CDR_REGISTRATION_STATUS unset, so the DEFAULT state is what gets
 * exercised. Nothing here signs in: the point is what an unauthenticated
 * visitor can reach, which is the § 44-12-239.1(b) question.
 *
 * NOTE: `/` is now the PUBLIC page and returns 200 to anonymous visitors. The
 * staff dashboard moved to /dashboard. Only routes that read the unclaimed
 * property file are in the redirect loop below.
 */

import { expect, test } from '@playwright/test'

test.describe('§1.4 the kill switch is visible before anyone signs in', () => {
  // The banner lives in the (auth) layout and therefore renders on the sign-in
  // page. That is deliberate: whether this system may send anything is not a
  // secret, and staff should see it before they authenticate.

  test('shows OUTBOUND BLOCKED while unregistered', async ({ page }) => {
    await page.goto('/signin')
    const banner = page.locator('header')
    await expect(banner).toContainText(/outbound blocked/i)
    await expect(banner).toContainText(/unregistered/i)
  })

  test('confirms the § 44-12-239(f) legend is byte-verified', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.locator('header')).toContainText(/byte-verified/i)
  })

  test('reports no legally-unresolved flag as enabled', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.locator('header')).not.toContainText(/flag\(s\) enabled/i)
  })
})

test.describe('§1.8 no unauthenticated route reaches the property data', () => {
  for (const path of ['/dashboard', '/queue', '/staff', '/workflow', '/property/GA0004821993']) {
    test(`${path} redirects an unauthenticated visitor to sign in`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/signin/)
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    })
  }

  test('the staff app is marked noindex', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('the PUBLIC page is not noindexed — it is meant to be found', async ({ page }) => {
    // The inverse assertion. Removing the global noindex flipped this repo's
    // default, so both directions need holding: staff noindexed, public not.
    await page.goto('/')
    const robots = page.locator('meta[name="robots"]')
    if (await robots.count() > 0) {
      await expect(robots).not.toHaveAttribute('content', /noindex/)
    }
  })
})

test.describe('sign-in is a one-time link, not a password', () => {
  test('offers no password field', async ({ page }) => {
    // This system holds owner PII from the § 44-12-239.1(a) file. A password is
    // one more credential that can be reused, phished, or leaked.
    await page.goto('/signin')
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /sign-in link/i })).toBeVisible()
  })

  test('says plainly that access is granted in advance, not on request', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.getByText(/staff only/i)).toBeVisible()
  })
})

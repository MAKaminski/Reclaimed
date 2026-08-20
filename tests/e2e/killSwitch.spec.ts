/**
 * E2E — the two paths that matter before registration completes.
 *
 * 1. The registration kill switch is VISIBLE, not merely enforced. Staff must be
 *    able to tell at a glance whether this system may send anything at all
 *    (§ 44-12-239.2(a)(10)).
 * 2. The property data has no public surface (§ 44-12-239.1(b)).
 */

import { expect, test } from '@playwright/test'

test.describe('§1.4 the kill switch is visible in the running app', () => {
  test('shows OUTBOUND BLOCKED while unregistered', async ({ page }) => {
    await page.goto('/')
    const banner = page.locator('header')
    await expect(banner).toContainText(/outbound blocked/i)
    await expect(banner).toContainText(/unregistered/i)
  })

  test('reports every gated action as blocked', async ({ page }) => {
    await page.goto('/')
    for (const action of [
      'Solicit owners', 'Generate agreements', 'Submit claims', 'Receive DOR bulk data',
    ]) {
      const row = page.locator('tr', { hasText: action })
      await expect(row).toContainText('blocked')
    }
  })

  test('confirms the legend is byte-verified', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toContainText(/byte-verified/i)
  })

  test('shows the Georgia rules actually in force', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('30% of min(claimed, value), costs included')).toBeVisible()
    await expect(page.getByText('PROHIBITED')).toBeVisible()
    await expect(page.getByText('state_pays_both_parties_directly')).toBeVisible()
  })

  test('shows both legally-unresolved flags OFF', async ({ page }) => {
    await page.goto('/')
    for (const flag of ['ENABLE_EXTERNAL_SKIPTRACE', 'ENABLE_RON_SIGNATURE']) {
      await expect(page.locator('div', { hasText: flag }).first()).toContainText('off')
    }
  })
})

test.describe('§1.8 there is no public view of the property data', () => {
  test('the work queue demands a sign-in and says why', async ({ page }) => {
    await page.goto('/queue')
    await expect(page.getByText(/sign in required/i)).toBeVisible()
    await expect(page.getByText(/44-12-239\.1\(b\)/)).toBeVisible()
  })

  test('the app is marked noindex', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })
})

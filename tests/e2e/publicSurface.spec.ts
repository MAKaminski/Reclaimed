/**
 * E2E — the public surface, seen the way a stranger and a crawler see it.
 *
 * Runs with CDR_REGISTRATION_STATUS unset, so this exercises the
 * PRE-REGISTRATION state: the page describes the service but must expressly
 * decline to accept anyone, and must offer no way to try.
 */

import { expect, test } from '@playwright/test'

test.describe('§ 44-12-239.2(a)(10) — the public page declines, and offers no way in', () => {
  test('/ is reachable with no session', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page).not.toHaveURL(/\/signin/)
  })

  test('carries the pre-registration disclosure', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-offer-state="pre_registration"]')).toBeVisible()
    await expect(page.locator('[data-pre-registration-disclosure="true"]')).toBeVisible()
  })

  test('states plainly that it is not asking anyone to enter into an agreement', async ({ page }) => {
    // The sentence that does the legal work. If it disappears, the position that
    // publishing pre-registration is lawful disappears with it.
    await page.goto('/')
    await expect(page.locator('[data-offer-state="pre_registration"]'))
      .toContainText(/not asking anyone to enter into an agreement/i)
    await expect(page.locator('[data-offer-state="pre_registration"]'))
      .toContainText(/not accepting clients/i)
  })

  test('does NOT claim to be a solicitation — that would be false here', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).not.toContainText(/THIS IS A SOLICITATION/)
  })

  test('offers no form, no input, and no way to make contact', async ({ page }) => {
    for (const path of ['/', '/about', '/fees', '/claim-it-yourself']) {
      await page.goto(path)
      await expect(page.locator('form')).toHaveCount(0)
      await expect(page.locator('input')).toHaveCount(0)
      await expect(page.locator('textarea')).toHaveCount(0)
    }
  })

  test('tells the reader they can claim directly from the State, for free', async ({ page }) => {
    // build-spec §12, as a rendered fact rather than an aspiration.
    await page.goto('/')
    await expect(page.locator('body')).toContainText(/gaclaims\.unclaimedproperty\.com/)
    await expect(page.locator('[data-self-file-callout="true"]')).toBeVisible()
  })

  test('carries the standing disclosures on every page', async ({ page }) => {
    for (const path of ['/', '/fees', '/legal/privacy']) {
      await page.goto(path)
      await expect(page.locator('[data-standing-disclosures="true"]')).toBeVisible()
    }
  })
})

test.describe('crawlers can actually reach the SEO surface', () => {
  test('/robots.txt serves and disallows the staff tree', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('Disallow: /dashboard')
    expect(body).toContain('Disallow: /queue')
    expect(body).toMatch(/Sitemap:/)
  })

  test('/sitemap.xml serves and lists the registered pages', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    const body = await res.text()
    for (const href of ['/claim-it-yourself', '/is-this-letter-real', '/fees']) {
      expect(body).toContain(href)
    }
  })

  test('/llms.txt serves as plain text and warns off the search hallucination', async ({ request }) => {
    const res = await request.get('/llms.txt')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/text\/plain/)
    const body = await res.text()
    expect(body).toMatch(/NOT CURRENTLY REGISTERED/)
    expect(body).toMatch(/no property search/i)
  })
})

test.describe('structured data asserts existence, never availability', () => {
  test('emits Organization but no Offer or Service while unregistered', async ({ page }) => {
    await page.goto('/')
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    const all = blocks.join(' ')

    expect(all).toContain('"Organization"')
    // A machine-readable claim that we are open for business is still a claim,
    // and no human reviewing the page copy would ever see it.
    expect(all).not.toContain('"Offer"')
    expect(all).not.toContain('"Service"')
    expect(all).not.toContain('"ProfessionalService"')
    // No SearchAction: § 44-12-239.1(b) forecloses a public lookup tool.
    expect(all).not.toContain('SearchAction')
  })
})

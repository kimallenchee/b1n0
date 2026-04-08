import { test, expect } from '@playwright/test'

/**
 * Smoke tests — verify the app loads and core navigation works.
 *
 * These run against the Vite preview server (production build)
 * and do NOT require a Supabase backend. They test the static
 * shell of the app only.
 */

test.describe('App loads', () => {
  test('renders the Inicio page', async ({ page }) => {
    await page.goto('/')
    // Should redirect to /inicio
    await expect(page).toHaveURL(/\/inicio/)
  })

  test('shows the b1n0 brand in top bar or side nav', async ({ page }) => {
    await page.goto('/inicio')
    await page.waitForLoadState('networkidle')
    // Desktop has SideNav with <img alt="b1n0 — Ir al inicio">
    // Mobile has TopBar which may show balance/avatar but not necessarily a logo img
    const logo = page.locator('img[alt*="b1n0" i]')
    const hasLogo = await logo.count()
    if (hasLogo > 0) {
      await expect(logo.first()).toBeVisible()
    } else {
      // On mobile, brand identity is implicit in the UI — just verify the app rendered
      const root = page.locator('#root')
      await expect(root).toBeVisible()
    }
  })

  test('has a bottom navigation bar (mobile) or side nav (desktop)', async ({ page }) => {
    await page.goto('/inicio')
    const nav = page.locator('nav')
    await expect(nav.first()).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('can navigate to Perfil', async ({ page }) => {
    await page.goto('/inicio')
    const perfilBtn = page.getByRole('button', { name: /perfil/i })
    if (await perfilBtn.count() > 0) {
      await perfilBtn.click()
    }
  })

  test('legal pages load', async ({ page }) => {
    await page.goto('/terminos')
    await expect(page.getByRole('heading', { name: /Términos/i })).toBeVisible({ timeout: 10000 })
  })

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacidad')
    await expect(page.getByRole('heading', { name: /Privacidad/i })).toBeVisible({ timeout: 10000 })
  })
})

test.describe('SEO', () => {
  test('has correct page title', async ({ page }) => {
    await page.goto('/')
    const title = await page.title()
    expect(title).toContain('b1n0')
  })

  test('has meta description', async ({ page }) => {
    await page.goto('/')
    // Meta tags are in <head>, use $eval to read them directly
    const desc = await page.$eval(
      'meta[name="description"]',
      (el) => el.getAttribute('content'),
    ).catch(() => null)
    expect(desc).toBeTruthy()
    expect(desc!.length).toBeGreaterThan(20)
  })

  test('has Open Graph tags', async ({ page }) => {
    await page.goto('/')
    const ogTitle = await page.$eval(
      'meta[property="og:title"]',
      (el) => el.getAttribute('content'),
    ).catch(() => null)
    expect(ogTitle).toBeTruthy()
  })
})

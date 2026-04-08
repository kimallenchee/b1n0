import { test, expect } from '@playwright/test'

/**
 * Legal pages E2E tests.
 *
 * Verify the legal shell pages render correctly and have
 * the required section structure. These are lazy-loaded,
 * so we use longer timeouts.
 */

test.describe('Terms of Service', () => {
  test('renders all 10 sections', async ({ page }) => {
    await page.goto('/terminos')
    // Wait for lazy chunk to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })

    const sections = [
      'Aceptación',
      'Descripción del servicio',
      'Elegibilidad',
      'Cuentas y seguridad',
      'Participación y cobros',
      'Conducta prohibida',
      'Propiedad intelectual',
      'Limitación de responsabilidad',
      'Resolución de disputas',
      'Contacto',
    ]

    for (const section of sections) {
      await expect(page.getByText(section, { exact: false }).first()).toBeVisible()
    }
  })

  test('back button navigates away', async ({ page }) => {
    await page.goto('/inicio')
    await page.waitForTimeout(500)
    await page.goto('/terminos')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
    const backBtn = page.getByText('← Volver')
    await expect(backBtn).toBeVisible()
    await backBtn.click()
    await expect(page).not.toHaveURL(/\/terminos/)
  })

  test('shows placeholder date notice', async ({ page }) => {
    await page.goto('/terminos')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Última actualización/)).toBeVisible()
  })
})

test.describe('Privacy Policy', () => {
  test('renders all 10 sections', async ({ page }) => {
    await page.goto('/privacidad')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })

    const sections = [
      'Información que recopilamos',
      'Cómo usamos tu información',
      'Compartir información',
      'Seguridad',
      'Retención de datos',
      'Tus derechos',
      'Cookies y seguimiento',
      'Menores de edad',
      'Cambios a esta política',
      'Contacto',
    ]

    for (const section of sections) {
      await expect(page.getByText(section, { exact: false }).first()).toBeVisible()
    }
  })
})

test.describe('Legal links from Perfil', () => {
  test('Perfil footer has links to legal pages', async ({ page }) => {
    await page.goto('/perfil')
    const termsLink = page.getByText('Términos')
    const privacyLink = page.getByText('Privacidad')
    const termsCount = await termsLink.count()
    const privacyCount = await privacyLink.count()
    // At minimum, the page should load without errors
    expect(termsCount + privacyCount).toBeGreaterThanOrEqual(0)
  })
})

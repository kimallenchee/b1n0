/**
 * i18n bootstrap — Spanish-only beta mode.
 *
 * b1n0 is Spanish-first by product decision. The ES/EN footer toggle
 * was removed pre-launch (2026-05-25) because there's no proof of
 * demand from non-Spanish users yet; English-locale browser users
 * get Chrome / Safari / Edge's native "Translate this page?" prompt
 * automatically because `<html lang="es">` is correctly set.
 *
 * IMPORTANT — language is HARDCODED to 'es' here regardless of any
 * `b1n0-lang` value left in a user's localStorage. We previously
 * persisted the user's toggle pick to localStorage, so users who
 * had selected EN before we removed the toggle would otherwise be
 * permanently stuck in (a half-broken) English because no UI exists
 * to flip them back. Forcing 'es' at init repaints them in Spanish
 * on the very next page load and the stale localStorage value is
 * cleared as a bonus.
 *
 * The full i18n infrastructure (en.json, useTranslation hooks across
 * the codebase) is intentionally left in place. To re-enable English:
 *   1. Restore the LanguageDetector usage below.
 *   2. Restore the ES/EN pill in Footer.tsx (search for the "Language
 *      toggle removed for beta" comment block).
 *   3. The existing t('...') calls flip back on automatically.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'
import en from './locales/en.json'

const STORAGE_KEY = 'b1n0-lang'

// Clear any stale 'b1n0-lang=en' from previous toggle sessions so the
// user's localStorage matches our hardcoded behaviour. Idempotent on
// repeated loads.
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
} catch {
  // localStorage blocked (incognito + 3p cookies disabled). Doesn't
  // matter — we're not relying on it anymore.
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: 'es',           // hardcoded — no detector
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false, // resources are bundled — no async load
    },
  })

export default i18n

/**
 * No-op kept for backward compat with any code that still imports it.
 * In Spanish-only mode this can't actually change the language —
 * the en.json bundle still ships for the eventual re-enable, but
 * nothing exposes a way to flip into it.
 */
export function setLanguage(_lang: 'es' | 'en') {
  // intentionally no-op
}

/**
 * Always returns 'es' in beta mode. Kept for backward compat.
 */
export function getLanguage(): 'es' | 'en' {
  return 'es'
}

/**
 * i18n bootstrap.
 *
 * b1n0 is Spanish-first — the canonical UI language is `es`. We added
 * English on 2026-05-21 because users outside Central America (investors,
 * partners, English-speaking diaspora) were bouncing on the all-Spanish
 * interface. Spanish stays the default; English is opt-in via the footer
 * toggle.
 *
 * Persistence: the chosen language is saved to localStorage under
 * `b1n0-lang`. We avoid relying purely on browser language detection
 * because a Guatemalan visitor on an English-locale phone (common with
 * iPhones bought in the US) still wants Spanish by default.
 *
 * Vocabulary rules: the b1n0 anti-gambling vocab (see CLAUDE.md) MUST
 * be honored in the English translations too. Map:
 *   - apostar / bet            → "place a vote" / "cast a vote", never "bet"
 *   - ganar / win              → "be right" / "collect", never "win"
 *   - perder / lose            → "not this time", never "lose"
 *   - cuotas / odds            → "split" / "share", never "odds"
 *   - stake / risk             → "entry"
 *   - payout / prize           → "payout" is OK (Robinhood-style, not gambling)
 *   - probabilidad             → "what the crowd thinks"
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import es from './locales/es.json'
import en from './locales/en.json'

const STORAGE_KEY = 'b1n0-lang'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false, // resources are bundled — no async load
    },
  })

export default i18n

/**
 * Set language and persist. Footer/toggle should call this — direct
 * use of i18n.changeLanguage() works too but won't update the document
 * `lang` attribute for screen readers + SEO.
 */
export function setLanguage(lang: 'es' | 'en') {
  i18n.changeLanguage(lang)
  document.documentElement.setAttribute('lang', lang)
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // localStorage disabled (incognito + 3p cookies blocked) — toggle still
    // works for the session, just won't persist.
  }
}

/**
 * Current language code, normalized to 'es' | 'en'. Useful for non-component
 * code that needs to branch on language (e.g. analytics events).
 */
export function getLanguage(): 'es' | 'en' {
  const lng = (i18n.language || 'es').toLowerCase()
  return lng.startsWith('en') ? 'en' : 'es'
}

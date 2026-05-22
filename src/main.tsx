import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { initMonitoring } from './lib/logger'

// Initialize error monitoring (no-op if VITE_SENTRY_DSN is not set)
initMonitoring(import.meta.env.VITE_SENTRY_DSN)

// Note: we intentionally do NOT mutate <html lang> here. The source
// language of the DOM is Spanish (index.html ships `<html lang="es">`).
// Google Translate Element reads <html lang> to detect the source —
// flipping it to "en" used to make Google conclude "already English"
// and refuse to translate. We remember the user's UI preference in
// localStorage ('b1n0-lang') and drive react-i18next + the widget
// from there; the <html lang> attribute stays "es" always.

// Apply saved theme before render to prevent flash
;(function initTheme() {
  const saved = localStorage.getItem('b1n0-theme')
  const html = document.documentElement
  const mode = saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'dark'
  let resolved: 'dark' | 'light' = 'dark'
  if (mode === 'system') {
    resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } else {
    resolved = mode
  }
  html.setAttribute('data-theme', resolved)
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

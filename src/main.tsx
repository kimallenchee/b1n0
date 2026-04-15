import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initMonitoring } from './lib/logger'

// Initialize error monitoring (no-op if VITE_SENTRY_DSN is not set)
initMonitoring(import.meta.env.VITE_SENTRY_DSN)

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

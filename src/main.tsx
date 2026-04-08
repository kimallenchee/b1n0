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
  if (saved === 'dark') {
    html.classList.add('dark')
    html.setAttribute('data-theme', 'dark')
  } else if (saved === 'light') {
    html.setAttribute('data-theme', 'light')
  }
  // No saved preference = @media query handles it
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

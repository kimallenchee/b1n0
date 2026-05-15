import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

interface ThemeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'b1n0-theme'

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw
  } catch {
    /* noop */
  }
  return 'dark'
}

function systemPrefersLight(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersLight() ? 'light' : 'dark'
  return mode
}

// Keep <meta name="theme-color"> in sync with the resolved theme so
// the mobile browser chrome (Safari/Chrome address bar, Android nav
// bar) matches the app background. Uses literal hex values that
// mirror --b1n0-bg in index.css; a CSS var() reference here would
// not work — browsers parse this meta value as a raw CSS color.
const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark:  '#0D0D0D',
  light: '#F5F2EC',
}
function syncThemeColorMeta(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredMode()))

  // Apply resolved theme to <html data-theme="..."> and update the
  // mobile-browser chrome via <meta name="theme-color">. Both side
  // effects live here so there's a single source of truth — anywhere
  // else that wrote data-theme or theme-color would race with this.
  useEffect(() => {
    const next = resolveTheme(mode)
    setResolved(next)
    document.documentElement.setAttribute('data-theme', next)
    syncThemeColorMeta(next)
  }, [mode])

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => {
      const next: ResolvedTheme = mq.matches ? 'light' : 'dark'
      setResolved(next)
      document.documentElement.setAttribute('data-theme', next)
      syncThemeColorMeta(next)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* noop */
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

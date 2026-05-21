// build: 2026-05-20T01:50 — risk-ack flow + investor PDF trust pack
import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { TopBar } from './components/layout/TopBar'
import { DesktopDock } from './components/layout/DesktopDock'
import { Inicio } from './pages/Inicio'
import { MisVotos } from './pages/MisLlamados'
import { Perfil } from './pages/Perfil'
import { mockUser } from './data/mockEvents'
import { useIsDesktop } from './hooks/useIsDesktop'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NowProvider } from './context/NowContext'
import { EventsProvider } from './context/EventsContext'
import { VoteProvider } from './context/VoteContext'
import { NotificationProvider } from './context/NotificationContext'
import { AuthPage } from './pages/AuthPage'
import { AuthModalProvider } from './context/AuthModalContext'
import { AuthModal } from './components/AuthModal'
import { setPricingRates } from './lib/pricing'
import { supabase } from './lib/supabase'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastProvider, useToast } from './components/Toast'
import { ThemeProvider } from './context/ThemeContext'
import { InstallPrompt } from './components/InstallPrompt'
import { TourProvider } from './context/TourContext'
import { AppTour } from './components/AppTour'
import { FirstTimeTourTrigger } from './components/FirstTimeTourTrigger'
import { ConfirmModalRoot } from './components/ConfirmModal'

// ── Lazy-loaded routes (code splitting) ──────────────────────
// These are heavy pages that most users don't visit on every session.
// Splitting them out keeps the initial bundle small.
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))
const Portafolio = lazy(() => import('./pages/Portafolio').then(m => ({ default: m.Portafolio })))
const Historial = lazy(() => import('./pages/Historial').then(m => ({ default: m.Historial })))
const EventDetailPage = lazy(() => import('./pages/EventDetailPage').then(m => ({ default: m.EventDetailPage })))
const TermsPage = lazy(() => import('./pages/Legal').then(m => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('./pages/Legal').then(m => ({ default: m.PrivacyPage })))
const Documentacion = lazy(() => import('./pages/Documentacion').then(m => ({ default: m.Documentacion })))
const ProfilePublic = lazy(() => import('./pages/ProfilePublic').then(m => ({ default: m.ProfilePublic })))
const Confianza = lazy(() => import('./pages/Confianza').then(m => ({ default: m.Confianza })))

function LazyFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px' }}>
      <p style={{ fontFamily: 'var(--font-body)', color: 'var(--b1n0-muted)', fontSize: '14px' }}>Cargando...</p>
    </div>
  )
}

const routes = (
  <Routes>
    <Route path="/" element={<Navigate to="/inicio" replace />} />
    <Route path="/inicio" element={<Inicio />} />
    <Route path="/en-vivo" element={<Navigate to="/inicio" replace />} />
    <Route path="/mis-votos" element={<MisVotos />} />
    <Route path="/perfil" element={<Perfil />} />
    <Route path="/portafolio" element={<Suspense fallback={<LazyFallback />}><Portafolio /></Suspense>} />
    <Route path="/historial" element={<Suspense fallback={<LazyFallback />}><Historial /></Suspense>} />
    <Route path="/ajustes" element={<Navigate to="/perfil" replace />} />
    <Route path="/admin" element={<ProtectedRoute requireAdmin><Suspense fallback={<LazyFallback />}><AdminPage /></Suspense></ProtectedRoute>} />
    <Route path="/eventos/:id" element={<Suspense fallback={<LazyFallback />}><EventDetailPage /></Suspense>} />
    <Route path="/terminos" element={<Suspense fallback={<LazyFallback />}><TermsPage /></Suspense>} />
    <Route path="/privacidad" element={<Suspense fallback={<LazyFallback />}><PrivacyPage /></Suspense>} />
    <Route path="/documentacion" element={<Suspense fallback={<LazyFallback />}><Documentacion /></Suspense>} />
    <Route path="/u/:username" element={<Suspense fallback={<LazyFallback />}><ProfilePublic /></Suspense>} />
    <Route path="/confianza" element={<Suspense fallback={<LazyFallback />}><Confianza /></Suspense>} />
  </Routes>
)

function DesktopLayout() {
  const { pathname } = useLocation()
  const { profile } = useAuth()
  const isAdmin = pathname.startsWith('/admin')
  // Hydrate the TopBar's `user` prop from the live profile so saldo
  // and avatar always reflect the current session. Same shape mobile
  // uses — no fork in the data path.
  const user = profile
    ? { ...mockUser, name: profile.name, tier: profile.tier, balance: profile.balance, totalPredictions: profile.totalPredictions, correctPredictions: profile.correctPredictions, totalCobrado: profile.totalCobrado, avatar: profile.avatarUrl ?? undefined }
    : mockUser

  return (
    /*
      Desktop chrome:
        - Thin TopBar at the top — same component as mobile, with its
          contents constrained to the same 1060px centered column as
          the page below so the wordmark sits flush with the leading
          edge of feed cards and the avatar sits flush with the right.
        - No left rail. The full viewport width below the TopBar
          belongs to content; the dock floats above its bottom edge.
        - Bottom padding on `main` keeps the last card clear of the
          dock at typical viewport heights.
    */
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--color-bg)', overflow: 'hidden' }}>
      {/* TopBar — constrained to same column as the content below.
          Border lives on the inner column rather than the outer
          full-viewport wrapper, so the line stops where the content
          stops instead of stretching to the screen edges. Cleaner
          for wide monitors. */}
      <div style={{ flexShrink: 0 }}>
        <div
          style={{
            maxWidth: isAdmin ? 'none' : '1060px',
            margin: '0 auto',
            padding: isAdmin ? '0 var(--space-7)' : 0,
            borderBottom: '1px solid var(--b1n0-border)',
          }}
        >
          <TopBar user={user} />
        </div>
      </div>
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0, display: 'flex', justifyContent: isAdmin ? 'flex-start' : 'center' }}>
        <div
          style={{
            width: '100%',
            maxWidth: isAdmin ? 'none' : '1060px',
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            // Reserves clearance for the floating dock so the last
            // feed card never sits underneath it. 88px = dock height
            // (~52) + bottom offset (~24) + a little breathing room.
            paddingBottom: isAdmin ? 0 : 88,
          }}
        >
          <ErrorBoundary>{routes}</ErrorBoundary>
        </div>
      </main>
      <DesktopDock />
    </div>
  )
}

function MobileLayout() {
  const { profile } = useAuth()
  const user = profile
    ? { ...mockUser, name: profile.name, tier: profile.tier, balance: profile.balance, totalPredictions: profile.totalPredictions, correctPredictions: profile.correctPredictions, totalCobrado: profile.totalCobrado, avatar: profile.avatarUrl ?? undefined }
    : mockUser

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        maxWidth: '480px',
        margin: '0 auto',
        background: 'var(--color-bg)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <TopBar user={user} />
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <ErrorBoundary>{routes}</ErrorBoundary>
      </main>
      {/* Same floating dock on mobile — replaces the old BottomNav.
          .feed-scroll containers across the app reserve bottom padding
          via index.css so cards never sit hidden under the dock. */}
      <DesktopDock />
    </div>
  )
}

const F = 'var(--font-body)'
const D = 'var(--font-display)'

function ForceChangePassword() {
  const { changePassword, signOut } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleChange(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 6) { setError('Mínimo 6 caracteres.'); return }
    if (pw !== pw2) { setError('Las contraseñas no coinciden.'); return }
    setError(null)
    setLoading(true)
    const err = await changePassword(pw)
    if (err) setError(err)
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
    color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--b1n0-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 380, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '38px', color: 'var(--b1n0-text-1)', letterSpacing: '-1px', marginBottom: '6px' , fontVariantNumeric: 'tabular-nums'}}>b1n0</p>
          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Cambiá tu contraseña</p>
        </div>
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '28px 24px' }}>
          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            Tu cuenta requiere una nueva contraseña antes de continuar.
          </p>
          <form onSubmit={handleChange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="password" placeholder="Nueva contraseña" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} style={inputStyle} />
            <input type="password" placeholder="Confirmar contraseña" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} style={inputStyle} />
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', textAlign: 'center' }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px', borderRadius: 'var(--radius-lg)', border: 'none',
              background: loading ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-si)', color: 'var(--b1n0-on-accent)',
              fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: loading ? 'default' : 'pointer', marginTop: '4px',
            }}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
          <button
            onClick={() => signOut()}
            style={{ marginTop: '16px', width: '100%', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

function AppContent() {
  const { session, profile, loading } = useAuth()
  const isDesktop = useIsDesktop()
  const { showSuccess } = useToast()

  // Show welcome toast when arriving from email confirmation
  useEffect(() => {
    const hash = window.location.hash
    if (session && (hash.includes('type=signup') || hash.includes('type=email'))) {
      showSuccess('¡Cuenta confirmada! Bienvenid@ a b1n0')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load platform rates on mount to sync client-side pricing with DB config
  useEffect(() => {
    supabase.from('platform_config').select('key, value').then(({ data }) => {
      if (!data) return
      const map: Record<string, number> = {}
      for (const r of data) map[r.key] = Number(r.value)
      setPricingRates({
        spreadLow: map.spread_low_pct !== undefined ? map.spread_low_pct / 100 : undefined,
        spreadHigh: map.spread_high_pct !== undefined ? map.spread_high_pct / 100 : undefined,
        feeRate: map.tx_fee_pct !== undefined ? map.tx_fee_pct / 100 : undefined,
        feeFloor: map.fee_floor_pct !== undefined ? map.fee_floor_pct / 100 : undefined,
        feeCeiling: map.fee_ceiling_pct !== undefined ? map.fee_ceiling_pct / 100 : undefined,
        sellFeeRate: map.sell_fee_pct !== undefined ? map.sell_fee_pct / 100 : undefined,
        resolutionSkim: map.resolution_skim_pct !== undefined ? map.resolution_skim_pct / 100 : undefined,
        depthThreshold: map.depth_threshold,
      })
    })
  }, [])

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--b1n0-muted)', fontSize: '14px' }}>
          Cargando...
        </p>
      </div>
    )
  }

  if (session && profile?.mustChangePassword) return <ForceChangePassword />

  return isDesktop ? <DesktopLayout /> : <MobileLayout />
}

export default function App() {
  // Root-level ErrorBoundary catches anything outside the route tree
  // (provider init crashes, theme bootstrap, etc.). Per-layout
  // boundaries below catch route render crashes so the chrome stays.
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={
            <ThemeProvider>
              <AuthProvider>
                <ToastProvider>
                  <NowProvider>
                    <EventsProvider>
                      <VoteProvider>
                        <NotificationProvider>
                          <AuthModalProvider>
                            <TourProvider>
                              <AppContent />
                              <AuthModal />
                              <InstallPrompt />
                              <AppTour />
                              <FirstTimeTourTrigger />
                              <ConfirmModalRoot />
                            </TourProvider>
                          </AuthModalProvider>
                        </NotificationProvider>
                      </VoteProvider>
                    </EventsProvider>
                  </NowProvider>
                </ToastProvider>
              </AuthProvider>
            </ThemeProvider>
          } />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

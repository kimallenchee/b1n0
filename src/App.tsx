import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { TopBar } from './components/layout/TopBar'
import { BottomNav } from './components/layout/BottomNav'
import { SideNav } from './components/layout/SideNav'
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

// ── Lazy-loaded routes (code splitting) ──────────────────────
// These are heavy pages that most users don't visit on every session.
// Splitting them out keeps the initial bundle small.
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))
const Portafolio = lazy(() => import('./pages/Portafolio').then(m => ({ default: m.Portafolio })))
const Historial = lazy(() => import('./pages/Historial').then(m => ({ default: m.Historial })))
const EventDetailPage = lazy(() => import('./pages/EventDetailPage').then(m => ({ default: m.EventDetailPage })))
const TermsPage = lazy(() => import('./pages/Legal').then(m => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('./pages/Legal').then(m => ({ default: m.PrivacyPage })))

function LazyFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px' }}>
      <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#78716C', fontSize: '14px' }}>Cargando...</p>
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
  </Routes>
)

function DesktopLayout() {
  const { pathname } = useLocation()
  const isAdmin = pathname.startsWith('/admin')
  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--color-bg)', overflow: 'hidden' }}>
      <SideNav />
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0, display: 'flex', justifyContent: isAdmin ? 'flex-start' : 'center' }}>
        <div style={{ width: '100%', maxWidth: isAdmin ? 'none' : '1060px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ErrorBoundary>{routes}</ErrorBoundary>
        </div>
      </main>
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
      <BottomNav />
    </div>
  )
}

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

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
    width: '100%', padding: '13px 16px', borderRadius: '12px',
    border: '1px solid rgba(0,0,0,0.1)', background: '#F0EDE6',
    color: '#1C1917', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 380, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '38px', color: '#1C1917', letterSpacing: '-1px', marginBottom: '6px' }}>b1n0</p>
          <p style={{ fontFamily: F, fontSize: '13px', color: '#78716C' }}>Cambiá tu contraseña</p>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '20px', padding: '28px 24px' }}>
          <p style={{ fontFamily: F, fontSize: '13px', color: '#78716C', marginBottom: '16px', lineHeight: 1.5 }}>
            Tu cuenta requiere una nueva contraseña antes de continuar.
          </p>
          <form onSubmit={handleChange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="password" placeholder="Nueva contraseña" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} style={inputStyle} />
            <input type="password" placeholder="Confirmar contraseña" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} style={inputStyle} />
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: '#b91c1c', textAlign: 'center' }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
              background: loading ? 'rgba(0,0,0,0.3)' : '#1C1917', color: '#fff',
              fontFamily: F, fontWeight: 600, fontSize: '14px', cursor: loading ? 'default' : 'pointer', marginTop: '4px',
            }}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
          <button
            onClick={() => signOut()}
            style={{ marginTop: '16px', width: '100%', fontFamily: F, fontSize: '13px', fontWeight: 600, color: '#78716C', background: 'none', border: 'none', cursor: 'pointer' }}
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
        depthThreshold: map.depth_threshold,
      })
    })
  }, [])

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#78716C', fontSize: '14px' }}>
          Cargando...
        </p>
      </div>
    )
  }

  if (session && profile?.mustChangePassword) return <ForceChangePassword />

  return isDesktop ? <DesktopLayout /> : <MobileLayout />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <NowProvider>
            <EventsProvider>
              <VoteProvider>
                <NotificationProvider>
                  <AuthModalProvider>
                    <AppContent />
                    <AuthModal />
                  </AuthModalProvider>
                </NotificationProvider>
              </VoteProvider>
            </EventsProvider>
          </NowProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

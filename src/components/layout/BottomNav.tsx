import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAuthModal } from '../../context/AuthModalContext'

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 22V12h6v10"/>
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

const tabs = [
  { path: '/inicio', Icon: HomeIcon, label: 'Inicio' },
  { path: '/historial', Icon: ClockIcon, label: 'Historial' },
  { path: '/perfil', Icon: PersonIcon, label: 'Perfil' },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { openAuth } = useAuthModal()

  return (
    <nav
      aria-label="Navegación principal"
      role="navigation"
      style={{
        display: 'flex',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'var(--b1n0-card)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map((tab) => {
        const active = location.pathname === tab.path
        const requiresAuth = tab.path !== '/inicio'
        return (
          <button
            key={tab.path}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (requiresAuth && !session) { openAuth(); return }
              navigate(tab.path)
            }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '3px', padding: '10px 4px', background: 'none', border: 'none',
              cursor: 'pointer', outline: 'none',
              color: active ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
            }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 28, borderRadius: 10, background: active ? 'var(--b1n0-si-bg)' : 'transparent', transition: 'background 0.15s' }}>
              <tab.Icon />
            </div>
            <span
              style={{
                fontFamily: '"DM Sans", sans-serif',
                fontSize: '10px', fontWeight: active ? 600 : 500,
                color: active ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
                lineHeight: 1,
              }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useAuthModal } from '../../context/AuthModalContext'
import { NotificationDrawer } from './NotificationDrawer'
import { HowItWorks } from '../HowItWorks'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 22V12h6v10"/>
    </svg>
  )
}
function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}
function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

const navItems = [
  { path: '/inicio', label: 'Inicio', Icon: HomeIcon },
  { path: '/perfil', label: 'Perfil', Icon: PersonIcon },
  { path: '/historial', label: 'Historial', Icon: ClockIcon },
]

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

export function SideNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut, session } = useAuth()
  const { unreadCount } = useNotifications()
  const { openAuth } = useAuthModal()
  const [notifOpen, setNotifOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const user = profile ?? { name: 'Tu', tier: 1 }
  const isLoggedIn = !!session

  return (
    <div style={{ width: 64, height: '100dvh', background: 'var(--b1n0-surface)', borderRight: '1px solid var(--b1n0-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 24px', flexShrink: 0, position: 'sticky', top: 0 }}>
      {/* Logo */}
      <button
        onClick={() => { navigate('/inicio'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        style={{ marginBottom: '24px', display: 'block', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <img src="/b1n0-logo.png" alt="b1n0 — Ir al inicio" style={{ height: '22px', objectFit: 'contain' }} />
      </button>

      {/* Nav */}
      <nav aria-label="Navegación principal" style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, width: '100%', alignItems: 'center' }}>
        {navItems.map(({ path, label, Icon }) => {
          const active = location.pathname === path
          const requiresAuth = path !== '/inicio'
          return (
            <button
              key={path}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (requiresAuth && !isLoggedIn) { openAuth(); return }
                navigate(path)
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '10px', border: 'none', background: active ? 'var(--b1n0-si-bg)' : 'transparent', cursor: 'pointer', color: active ? 'var(--b1n0-si)' : 'var(--b1n0-muted)', transition: 'background 0.15s' }}
            >
              <Icon />
            </button>
          )
        })}
        {/* Notifications */}
        <button
          title="Notificaciones"
          aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
          onClick={() => { if (!isLoggedIn) { openAuth(); return } setNotifOpen(true) }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--b1n0-muted)', transition: 'background 0.15s', position: 'relative' }}
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              minWidth: 16, height: 16, borderRadius: '8px',
              background: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: F, fontWeight: 700, fontSize: '9px', color: '#fff',
              padding: '0 4px',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* How it works */}
        <button
          title="¿Cómo funciona?"
          aria-label="¿Cómo funciona?"
          onClick={() => setHowOpen(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--b1n0-muted)', transition: 'background 0.15s' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>

        {profile?.isAdmin && (
          <button
            title="Admin"
            onClick={() => navigate('/admin')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '10px', border: 'none', background: location.pathname === '/admin' ? 'var(--b1n0-si-bg)' : 'transparent', cursor: 'pointer', color: location.pathname === '/admin' ? 'var(--b1n0-si)' : 'var(--b1n0-muted)', transition: 'background 0.15s', marginTop: '8px' }}
          >
            <ShieldIcon />
          </button>
        )}
      </nav>

      {/* User / Login */}
      <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        {isLoggedIn ? (
          <>
            <button
              onClick={() => navigate('/perfil')}
              title={profile?.username ? `@${profile.username}` : user.name}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--b1n0-si-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', overflow: 'hidden' }}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontFamily: F, fontWeight: 700, fontSize: '13px', color: 'var(--b1n0-si)' }}>
                  {user.name.charAt(0)}
                </span>
              )}
            </button>
            <button
              onClick={signOut}
              title="Cerrar sesión"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--b1n0-muted)', transition: 'color 0.15s' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={() => openAuth('login')}
            title="Iniciar sesión"
            style={{ width: 40, height: 40, borderRadius: '10px', border: '1px solid var(--b1n0-border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--b1n0-si)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
          </button>
        )}
      </div>
      {notifOpen && <NotificationDrawer onClose={() => setNotifOpen(false)} />}
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  )
}

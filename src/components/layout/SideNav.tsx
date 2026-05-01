import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { House, User as UserIcon, Clock, ShieldCheck, Bell, Question, SignIn, SignOut } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useAuthModal } from '../../context/AuthModalContext'
import { NotificationDrawer } from './NotificationDrawer'
import { HowItWorks } from '../HowItWorks'

const F = 'var(--font-body)'
const NUM_FONT = 'var(--font-num)'

const navItems = [
  { path: '/inicio',    label: 'Inicio',    Icon: House },
  { path: '/perfil',    label: 'Perfil',    Icon: UserIcon },
  { path: '/historial', label: 'Historial', Icon: Clock },
]

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
    <div
      style={{
        width: 64,
        height: '100dvh',
        background: 'var(--b1n0-surface)',
        borderRight: '1px solid var(--b1n0-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--space-7) 0 var(--space-7)',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Logo */}
      <button
        onClick={() => { navigate('/inicio'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        style={{
          marginBottom: 'var(--space-7)',
          display: 'block',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <img src="/b1n0-logo.png" alt="b1n0 — Ir al inicio" style={{ height: '22px', objectFit: 'contain' }} />
      </button>

      {/* Nav */}
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1, width: '100%', alignItems: 'center' }}
      >
        {navItems.map(({ path, label, Icon }) => {
          const active = location.pathname === path
          const requiresAuth = path !== '/inicio'
          return (
            <NavButton
              key={path}
              ariaLabel={label}
              ariaCurrent={active}
              active={active}
              onClick={() => {
                if (requiresAuth && !isLoggedIn) { openAuth(); return }
                navigate(path)
              }}
            >
              <Icon size={20} weight={active ? 'fill' : 'regular'} />
            </NavButton>
          )
        })}

        {/* Notifications */}
        <NavButton
          ariaLabel={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
          active={false}
          onClick={() => { if (!isLoggedIn) { openAuth(); return } setNotifOpen(true) }}
          style={{ position: 'relative' }}
        >
          <Bell size={20} weight={unreadCount > 0 ? 'fill' : 'regular'} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                minWidth: 14,
                height: 14,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--b1n0-no)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: NUM_FONT,
                fontWeight: 700,
                fontSize: '9px',
                color: 'var(--b1n0-bg)',
                padding: '0 4px',
                fontVariantNumeric: 'tabular-nums',
                border: '1.5px solid var(--b1n0-surface)',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </NavButton>

        {/* How it works */}
        <NavButton ariaLabel="¿Cómo funciona?" active={false} onClick={() => setHowOpen(true)}>
          <Question size={20} weight="regular" />
        </NavButton>

        {profile?.isAdmin && (
          <NavButton
            ariaLabel="Admin"
            active={location.pathname === '/admin'}
            onClick={() => navigate('/admin')}
            style={{ marginTop: 'var(--space-3)' }}
          >
            <ShieldCheck size={20} weight={location.pathname === '/admin' ? 'fill' : 'regular'} />
          </NavButton>
        )}
      </nav>

      {/* User / Login */}
      <div
        style={{
          borderTop: '1px solid var(--b1n0-border)',
          paddingTop: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        {isLoggedIn ? (
          <>
            <button
              onClick={() => navigate('/perfil')}
              title={profile?.username ? `@${profile.username}` : user.name}
              aria-label="Mi perfil"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--b1n0-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                overflow: 'hidden',
                boxShadow: '0 0 0 1px var(--b1n0-border)',
                transition: 'box-shadow var(--duration-fast) var(--ease-out)',
              }}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontFamily: F, fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--b1n0-text-1)' }}>
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <NavButton
              ariaLabel="Cerrar sesión"
              active={false}
              onClick={signOut}
              size={36}
            >
              <SignOut size={18} weight="regular" />
            </NavButton>
          </>
        ) : (
          <NavButton
            ariaLabel="Iniciar sesión"
            active={false}
            onClick={() => openAuth('login')}
            style={{ border: '1px solid var(--b1n0-border)' }}
            color="var(--b1n0-si)"
          >
            <SignIn size={20} weight="regular" />
          </NavButton>
        )}
      </div>
      {notifOpen && <NotificationDrawer onClose={() => setNotifOpen(false)} />}
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  )
}

/**
 * Sidebar nav button — uniform 40x40 (or smaller), brand-active state
 * via fill icon + colored background tint, hover via background only.
 */
function NavButton({
  children,
  onClick,
  ariaLabel,
  ariaCurrent,
  active,
  style,
  size = 40,
  color,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
  ariaCurrent?: boolean
  active: boolean
  style?: React.CSSProperties
  size?: number
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={ariaCurrent ? 'page' : undefined}
      title={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 'var(--radius-md)',
        border: 'none',
        background: active ? 'var(--b1n0-si-bg)' : 'transparent',
        cursor: 'pointer',
        color: color ?? (active ? 'var(--b1n0-si)' : 'var(--b1n0-muted)'),
        transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

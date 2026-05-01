import { useLocation, useNavigate } from 'react-router-dom'
import { House, Clock, User } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { useAuthModal } from '../../context/AuthModalContext'

const tabs = [
  { path: '/inicio',    Icon: House, label: 'Inicio' },
  { path: '/historial', Icon: Clock, label: 'Historial' },
  { path: '/perfil',    Icon: User,  label: 'Perfil' },
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
        borderTop: '1px solid var(--b1n0-border)',
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
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              padding: '10px 4px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              outline: 'none',
              color: active ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
              transition: 'color var(--duration-fast) var(--ease-out)',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 28,
                borderRadius: 'var(--radius-md)',
                background: active ? 'var(--b1n0-si-bg)' : 'transparent',
                transition: 'background var(--duration-fast) var(--ease-out)',
              }}
            >
              {/*
                Phosphor weight choice: 'fill' on active (a moment of confidence),
                'regular' otherwise (1.5px stroke, balanced negative space).
                Size: 22px – feels right against the 11px label below; smaller
                than typical 24px lucide nav icons for a more refined feel.
              */}
              <tab.Icon size={22} weight={active ? 'fill' : 'regular'} />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-2xs)',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
                letterSpacing: 'var(--tracking-tight)',
                lineHeight: 1,
              }}
            >
              {tab.label}
            </span>
        
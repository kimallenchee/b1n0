import { useLocation, useNavigate } from 'react-router-dom'
import { House, Clock, User } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useAuthModal } from '../../context/AuthModalContext'

// Tabs are defined as i18n keys, resolved inside the component. Keeping
// `path` and `Icon` static avoids needless reconfiguration on language
// flip; only the visible label re-renders.
const tabs = [
  { path: '/inicio',    Icon: House, labelKey: 'nav.home' },
  { path: '/historial', Icon: Clock, labelKey: 'nav.history' },
  { path: '/perfil',    Icon: User,  labelKey: 'nav.profile' },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { openAuth } = useAuthModal()
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.home')}
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
        const label = t(tab.labelKey)
        return (
          <button
            key={tab.path}
            aria-label={label}
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
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

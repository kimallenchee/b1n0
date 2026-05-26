import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  House,
  Clock,
  ShieldCheck,
  Bell,
  SignIn,
  SignOut,
  User as UserIcon,
} from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useAuthModal } from '../../context/AuthModalContext'
import { NotificationPopover } from './NotificationPopover'
import { useTranslation } from 'react-i18next'

/**
 * DesktopDock — floating, centered, bottom-anchored navigation pill.
 *
 *   [Inicio]  [Historial]  [Bell]  [?]  [Shield]  [Perfil]  [⏏]
 *
 * Every slot is a uniform 40×40 button with a 20px Phosphor glyph
 * inside. No separators — the consistent button rhythm is its own
 * design language. The dock reads as one fluid surface with seven
 * equal-weight icons.
 *
 * Why the User icon instead of the avatar image:
 *   - Uniform optical weight across the whole row
 *   - Avatar images vary in color/contrast; the icon is predictable
 *   - Matches the iconography vocabulary the rest of the dock uses
 *   - Active state (teal tint + fill weight) reads consistently
 *
 * Order is left-to-right by frequency-of-use rather than category:
 *   1. Inicio       — primary destination
 *   2. Historial    — frequent secondary destination
 *   3. Bell         — passive (just shows count) but high glance value
 *   4. How          — onboarding / reference
 *   5. Shield       — admin (only when applicable)
 *   6. Perfil       — identity
 *   7. Sign out     — terminal action, sits at the far edge
 */

export function DesktopDock() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut, session } = useAuth()
  const { unreadCount } = useNotifications()
  const { openAuth } = useAuthModal()
  const { t } = useTranslation()
  const [notifOpen, setNotifOpen] = useState(false)

  const isLoggedIn = !!session
  const isAdminPath = location.pathname.startsWith('/admin')
  const isPerfilPath = location.pathname.startsWith('/perfil')

  // Capture the bell button DOM node so the popover can anchor to it
  // and render its notch pointing at the right horizontal position.
  const bellRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <nav
        aria-label={t('nav.home')}
        className="b1n0-dock"
        style={{
          position: 'fixed',
          // Sit just above the iOS home-indicator gesture area on mobile.
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          // Tighter gap on mobile (1px) → looser on desktop via CSS class
          // override below. Keeps every icon visible inside an iPhone-SE
          // 320px viewport even with the admin shield slot present.
          gap: '2px',
          background: 'color-mix(in srgb, var(--b1n0-card) 80%, transparent)',
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: 'var(--radius-pill)',
          padding: 'var(--space-2)',
          boxShadow:
            '0 16px 48px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255,255,255,0.02) inset',
          // Cap width so the dock never crosses the safe horizontal margins
          // on phones; on desktop it grows to fit content.
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        {/* Inicio */}
        <DockButton
          ariaLabel={t('nav.home')}
          tooltip={t('nav.home')}
          active={location.pathname === '/inicio'}
          onClick={() => navigate('/inicio')}
        >
          <House size={20} weight={location.pathname === '/inicio' ? 'fill' : 'regular'} />
        </DockButton>

        {/* Historial */}
        <DockButton
          ariaLabel={t('nav.history')}
          tooltip={t('nav.history')}
          active={location.pathname === '/historial'}
          onClick={() => {
            if (!isLoggedIn) { openAuth(); return }
            navigate('/historial')
          }}
        >
          <Clock size={20} weight={location.pathname === '/historial' ? 'fill' : 'regular'} />
        </DockButton>

        {/* Notifications — bell button doubles as the popover anchor.
            We use a button ref instead of a position calculation so the
            popover's notch tracks the bell even if the dock shifts. */}
        <button
          ref={bellRef}
          onClick={() => {
            if (!isLoggedIn) { openAuth(); return }
            setNotifOpen((v) => !v)
          }}
          aria-label={t('topbar.notifications')}
          aria-expanded={notifOpen}
          title={t('topbar.notifications')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-pill)',
            border: 'none',
            background: notifOpen ? 'var(--b1n0-si-bg)' : 'transparent',
            cursor: 'pointer',
            color: notifOpen
              ? 'var(--b1n0-si)'
              : unreadCount > 0
                ? 'var(--b1n0-text-1)'
                : 'var(--b1n0-muted)',
            transition:
              'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            flexShrink: 0,
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            if (!notifOpen) {
              e.currentTarget.style.background = 'var(--b1n0-surface)'
              e.currentTarget.style.color = 'var(--b1n0-text-1)'
            }
          }}
          onMouseLeave={(e) => {
            if (!notifOpen) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color =
                unreadCount > 0 ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)'
            }
          }}
        >
          <Bell size={20} weight={unreadCount > 0 || notifOpen ? 'fill' : 'regular'} />
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
                fontFamily: 'var(--font-num)',
                fontWeight: 700,
                fontSize: '9px',
                color: 'var(--b1n0-bg)',
                padding: '0 4px',
                fontVariantNumeric: 'tabular-nums',
                border: '1.5px solid var(--b1n0-card)',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Admin — only when profile.isAdmin */}
        {profile?.isAdmin && (
          <DockButton
            ariaLabel={t('nav.admin')}
            tooltip={t('nav.admin')}
            active={isAdminPath}
            onClick={() => navigate('/admin')}
          >
            <ShieldCheck size={20} weight={isAdminPath ? 'fill' : 'regular'} />
          </DockButton>
        )}

        {/* Perfil — UserIcon to match the iconography vocabulary of the rest
            of the dock. The avatar picture lives on the profile page itself
            where it has room to breathe. */}
        <DockButton
          ariaLabel={t('nav.profile')}
          tooltip={profile?.username ? `@${profile.username}` : t('nav.profile')}
          active={isPerfilPath}
          onClick={() => {
            if (!isLoggedIn) { openAuth(); return }
            navigate('/perfil')
          }}
        >
          <UserIcon size={20} weight={isPerfilPath ? 'fill' : 'regular'} />
        </DockButton>

        {/* Sign out / sign in — terminal action at the far edge */}
        {isLoggedIn ? (
          <DockButton
            ariaLabel={t('auth.logOut')}
            tooltip={t('auth.logOut')}
            active={false}
            onClick={signOut}
          >
            <SignOut size={18} weight="regular" />
          </DockButton>
        ) : (
          <DockButton
            ariaLabel={t('auth.logIn')}
            tooltip={t('auth.logIn')}
            active={false}
            color="var(--b1n0-si)"
            onClick={() => openAuth('login')}
          >
            <SignIn size={20} weight="regular" />
          </DockButton>
        )}
      </nav>

      {notifOpen && (
        <NotificationPopover
          anchorRef={bellRef}
          onClose={() => setNotifOpen(false)}
        />
      )}
    </>
  )
}

/**
 * DockButton — uniform 40×40 button. Active state gets a brand-tinted
 * background; hover gets a subtle surface tint. No transforms, no
 * shadow changes — the only thing that moves on hover is the
 * background and color.
 */
function DockButton({
  children,
  onClick,
  ariaLabel,
  tooltip,
  active,
  color,
  relative,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
  tooltip?: string
  active: boolean
  color?: string
  relative?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      title={tooltip}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        background: active ? 'var(--b1n0-si-bg)' : 'transparent',
        cursor: 'pointer',
        color: color ?? (active ? 'var(--b1n0-si)' : 'var(--b1n0-muted)'),
        transition:
          'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
        flexShrink: 0,
        position: relative ? 'relative' : undefined,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--b1n0-surface)'
          e.currentTarget.style.color = 'var(--b1n0-text-1)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = color ?? 'var(--b1n0-muted)'
        }
      }}
    >
      {children}
    </button>
  )
}

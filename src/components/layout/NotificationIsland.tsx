import { useState } from 'react'
import { Bell } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useAuthModal } from '../../context/AuthModalContext'
import { NotificationDrawer } from './NotificationDrawer'

/**
 * NotificationIsland — top-right floating bell + badge.
 *
 * Lives in the desktop chrome only. Opens the same NotificationDrawer
 * the dock used to open. Same glass-pill treatment as the dock so the
 * two visually rhyme — they read as part of one chrome system, just
 * placed at opposite corners of the viewport.
 *
 * Visual specs:
 *   - 40×40 hit area (matches dock buttons)
 *   - 24px from the top edge, 24px from the right edge
 *   - Glass pill background with backdrop-blur — feels like a member
 *     of the floating-chrome family alongside the dock
 *   - Unread badge sits at top-right of the bell, ringed in card color
 *     so it doesn't visually fuse with the pill background
 *
 * Logged-out behavior: tapping prompts auth instead of opening the
 * drawer. We still render the button so the chrome layout is stable
 * across auth states (no layout shift after sign-in).
 */
export function NotificationIsland() {
  const { session } = useAuth()
  const { unreadCount } = useNotifications()
  const { openAuth } = useAuthModal()
  const [open, setOpen] = useState(false)

  const handleClick = () => {
    if (!session) {
      openAuth()
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} notificaciones nuevas`
            : 'Notificaciones'
        }
        title="Notificaciones"
        style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-pill)',
          background: 'color-mix(in srgb, var(--b1n0-card) 80%, transparent)',
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          border: '1px solid var(--b1n0-border)',
          boxShadow:
            '0 12px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255,255,255,0.02) inset',
          cursor: 'pointer',
          color: unreadCount > 0 ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
          transition:
            'color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--b1n0-text-1)'
          e.currentTarget.style.background =
            'color-mix(in srgb, var(--b1n0-card) 92%, transparent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color =
            unreadCount > 0 ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)'
          e.currentTarget.style.background =
            'color-mix(in srgb, var(--b1n0-card) 80%, transparent)'
        }}
      >
        <Bell size={20} weight={unreadCount > 0 ? 'fill' : 'regular'} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--b1n0-no)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-num)',
              fontWeight: 700,
              fontSize: '10px',
              color: 'var(--b1n0-bg)',
              fontVariantNumeric: 'tabular-nums',
              border: '2px solid var(--b1n0-bg)',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && <NotificationDrawer onClose={() => setOpen(false)} />}
    </>
  )
}

import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ChartBar,
  Trophy,
  Target,
  CurrencyDollar,
  Clock,
  Sparkle,
  HandWaving,
  Handshake,
  ChatCircle,
  At,
  CheckCircle,
  Bank,
  Warning,
  ArrowUp,
  Bell as BellFallback,
  X,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useNotifications } from '../../context/NotificationContext'
import type { Notification } from '../../context/NotificationContext'

/**
 * NotificationPopover — anchored to a trigger button (typically the
 * Bell in the desktop dock).
 *
 * Renders as a floating card *above* the anchor (since the dock lives
 * at the bottom of the viewport). A small triangular notch points down
 * at the trigger so the cause-and-effect is visually obvious.
 *
 * Behavior:
 *   - Closes on outside click, Esc key, and route change
 *   - Slide-up + fade-in animation (220ms ease-out)
 *   - Internal scroll past 520px tall — header stays sticky
 *   - Click-through transparent backdrop (no full-screen dim)
 *
 * Design language:
 *   - Same glass-pill chrome as the dock and notification island —
 *     reads as a member of the same chrome family
 *   - Phosphor icons, semantic weights (fill on unread, regular on
 *     read), tabular nums on counts
 *
 * Usage:
 *   const bellRef = useRef<HTMLButtonElement>(null)
 *   const [open, setOpen] = useState(false)
 *   <button ref={bellRef} onClick={() => setOpen(true)}>...</button>
 *   {open && <NotificationPopover anchorRef={bellRef} onClose={() => setOpen(false)} />}
 */

const F = 'var(--font-body)'
const D = 'var(--font-display)'
const NUM = 'var(--font-num)'

const POPOVER_WIDTH = 380
const POPOVER_MAX_HEIGHT = 520
const ANCHOR_GAP = 14   // px between trigger and popover bottom edge
const VIEWPORT_PADDING = 16

const typeConfig: Record<string, { Icon: Icon; color: string; label: string }> = {
  posicion_creada:     { Icon: ChartBar,       color: 'var(--b1n0-teal-500)',   label: 'Posición' },
  evento_resuelto:     { Icon: Target,         color: 'var(--b1n0-si)',         label: 'Resuelto' },
  resultado:           { Icon: Trophy,         color: 'var(--b1n0-si)',         label: 'Resultado' },
  posicion_vendida:    { Icon: CurrencyDollar, color: 'var(--b1n0-orange-500)', label: 'Venta' },
  evento_por_cerrar:   { Icon: Clock,          color: 'var(--b1n0-orange-500)', label: 'Por cerrar' },
  nuevo_evento:        { Icon: Sparkle,        color: '#6366f1',                label: 'Nuevo' },
  solicitud_amistad:   { Icon: HandWaving,     color: 'var(--b1n0-teal-500)',   label: 'Social' },
  amistad_aceptada:    { Icon: Handshake,      color: 'var(--b1n0-teal-500)',   label: 'Social' },
  respuesta_comentario:{ Icon: ChatCircle,     color: '#6366f1',                label: 'Comentario' },
  mencion:             { Icon: At,             color: '#6366f1',                label: 'Mención' },
  deposito_confirmado: { Icon: CheckCircle,    color: 'var(--b1n0-si)',         label: 'Depósito' },
  retiro_procesado:    { Icon: Bank,           color: 'var(--b1n0-muted)',      label: 'Retiro' },
  saldo_bajo:          { Icon: Warning,        color: 'var(--b1n0-orange-500)', label: 'Saldo' },
  nivel_subio:         { Icon: ArrowUp,        color: 'var(--b1n0-teal-500)',   label: 'Nivel' },
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days > 0) return `hace ${days}d`
  if (hrs > 0) return `hace ${hrs}h`
  if (mins > 1) return `hace ${mins}m`
  return 'ahora'
}

/**
 * Splits notifications into "Hoy" / "Ayer" / "Esta semana" / "Antes"
 * groups for visual hierarchy. Returns groups in display order; empty
 * groups are filtered out.
 */
function groupByAge(notifications: Notification[]) {
  const now = Date.now()
  const dayMs = 86_400_000
  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Hoy', items: [] },
    { label: 'Ayer', items: [] },
    { label: 'Esta semana', items: [] },
    { label: 'Antes', items: [] },
  ]
  for (const n of notifications) {
    const age = now - new Date(n.createdAt).getTime()
    if (age < dayMs) groups[0].items.push(n)
    else if (age < 2 * dayMs) groups[1].items.push(n)
    else if (age < 7 * dayMs) groups[2].items.push(n)
    else groups[3].items.push(n)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function NotificationPopover({
  anchorRef,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { notifications, markRead, markAllRead, dismissOne, clearAll } = useNotifications()
  const popoverRef = useRef<HTMLDivElement>(null)

  // Layout state — recalculated on mount, on resize, and on scroll
  const [pos, setPos] = useState<{ left: number; top: number; height: number; notchOffset: number } | null>(null)
  const [visible, setVisible] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length
  const groups = groupByAge(notifications)

  /** Recalculate popover position relative to the anchor. */
  useEffect(() => {
    function place() {
      const a = anchorRef.current?.getBoundingClientRect()
      if (!a) return

      // Try to center the popover horizontally on the anchor.
      let left = a.left + a.width / 2 - POPOVER_WIDTH / 2
      // Constrain to viewport (with padding).
      const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING
      if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING
      if (left > maxLeft) left = maxLeft

      // Position above the anchor.
      // Limit height by available space above anchor.
      const availableHeight = a.top - ANCHOR_GAP - VIEWPORT_PADDING
      const height = Math.min(POPOVER_MAX_HEIGHT, availableHeight)
      const top = a.top - ANCHOR_GAP - height

      // Notch — points at the anchor's horizontal center, relative to
      // the popover's left edge.
      const anchorCenter = a.left + a.width / 2
      const notchOffset = Math.max(20, Math.min(POPOVER_WIDTH - 20, anchorCenter - left))

      setPos({ left, top, height, notchOffset })
    }

    place()
    requestAnimationFrame(() => setVisible(true))
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef])

  /** Close on outside click. */
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      handleClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Close on Esc. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  function handleTap(n: Notification) {
    if (!n.read) markRead(n.id)
    const eventId = n.data.event_id as string | undefined
    if (
      eventId &&
      ['evento_resuelto', 'resultado', 'posicion_creada', 'posicion_vendida', 'evento_por_cerrar', 'nuevo_evento'].includes(n.type)
    ) {
      handleClose()
      navigate(`/eventos/${eventId}`)
    } else if (['solicitud_amistad', 'amistad_aceptada'].includes(n.type)) {
      handleClose()
      navigate('/perfil')
    } else if (n.type === 'respuesta_comentario' && eventId) {
      handleClose()
      navigate(`/eventos/${eventId}`)
    } else if (['deposito_confirmado', 'retiro_procesado', 'saldo_bajo'].includes(n.type)) {
      handleClose()
      navigate('/historial')
    }
  }

  if (!pos) return null

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Notificaciones"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: POPOVER_WIDTH,
        height: pos.height,
        zIndex: 9999,
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.02) inset',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.22s var(--ease-out), transform 0.22s var(--ease-out)',
      }}
    >
      {/* Notch — small triangle pointing down at the anchor */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -7,
          left: pos.notchOffset - 7,
          width: 14,
          height: 14,
          background: 'var(--b1n0-card)',
          border: '1px solid var(--b1n0-border)',
          borderTop: 'none',
          borderLeft: 'none',
          transform: 'rotate(45deg)',
          borderBottomRightRadius: 2,
        }}
      />

      {/* Header — sticky, with title + unread badge + actions + close */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-5) var(--space-5) var(--space-4)',
          borderBottom: '1px solid var(--b1n0-border)',
          background: 'var(--b1n0-card)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <p
            style={{
              fontFamily: D,
              fontWeight: 800,
              fontSize: 'var(--text-md)',
              color: 'var(--b1n0-text-1)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            Notificaciones
          </p>
          {unreadCount > 0 && (
            <span
              style={{
                fontFamily: NUM,
                fontWeight: 700,
                fontSize: 'var(--text-2xs)',
                color: 'var(--b1n0-bg)',
                background: 'var(--b1n0-si)',
                padding: '2px 7px',
                borderRadius: 'var(--radius-pill)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: F,
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--b1n0-muted)',
                padding: 'var(--space-1) var(--space-2)',
                borderRadius: 'var(--radius-md)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b1n0-text-1)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b1n0-muted)')}
            >
              Marcar leídas
            </button>
          )}
          <button
            onClick={handleClose}
            aria-label="Cerrar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-md)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--b1n0-muted)',
              transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--b1n0-surface)'
              e.currentTarget.style.color = 'var(--b1n0-text-1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--b1n0-muted)'
            }}
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Body — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) 0' }}>
        {notifications.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-9) var(--space-6)',
              textAlign: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <BellFallback size={32} weight="regular" color="var(--b1n0-muted)" />
            <p style={{ fontFamily: D, fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--b1n0-text-1)' }}>
              No hay nada nuevo
            </p>
            <p style={{ fontFamily: F, fontSize: 'var(--text-xs)', color: 'var(--b1n0-muted)', maxWidth: 240, lineHeight: 1.5 }}>
              Esto se pone bueno pronto. Cuando alguien se mueva, te avisamos acá.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div
                style={{
                  fontFamily: F,
                  fontSize: 'var(--text-2xs)',
                  fontWeight: 700,
                  letterSpacing: 'var(--tracking-caps)',
                  textTransform: 'uppercase',
                  color: 'var(--b1n0-muted)',
                  padding: 'var(--space-3) var(--space-5) var(--space-2)',
                }}
              >
                {g.label}
              </div>
              {g.items.map((n) => (
                <NotifRow
                  key={n.id}
                  n={n}
                  onTap={() => handleTap(n)}
                  onDismiss={() => dismissOne(n.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer — bulk action when there's anything to clear */}
      {notifications.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 'var(--space-3)',
            borderTop: '1px solid var(--b1n0-border)',
            background: 'var(--b1n0-card)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={clearAll}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: F,
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--b1n0-muted)',
              padding: 'var(--space-1) var(--space-3)',
              borderRadius: 'var(--radius-md)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b1n0-no)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b1n0-muted)')}
          >
            Borrar todas
          </button>
        </div>
      )}
    </div>,
    document.body
  )
}

/**
 * NotifRow — single notification entry. Read state mutes opacity to
 * 0.6; unread keeps full opacity + a teal-tinted icon background +
 * fill-weight Phosphor icon.
 */
function NotifRow({ n, onTap, onDismiss }: { n: Notification; onTap: () => void; onDismiss: () => void }) {
  const cfg = typeConfig[n.type] || { Icon: BellFallback, color: 'var(--b1n0-muted)', label: '' }
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-5)',
        background: hovered ? 'var(--b1n0-surface)' : 'transparent',
        cursor: 'pointer',
        transition: 'background var(--duration-fast) var(--ease-out)',
        borderLeft: `2px solid ${n.read ? 'transparent' : cfg.color}`,
        opacity: n.read ? 0.65 : 1,
      }}
    >
      <button
        onClick={onTap}
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-start',
          flex: 1,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: 0,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-md)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
          }}
        >
          <cfg.Icon size={16} weight={n.read ? 'regular' : 'fill'} color={cfg.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily: F,
              fontWeight: n.read ? 500 : 700,
              fontSize: 'var(--text-sm)',
              color: 'var(--b1n0-text-1)',
              lineHeight: 1.3,
              marginBottom: '2px',
            }}
          >
            {n.title}
          </p>
          {n.body && (
            <p
              style={{
                fontFamily: F,
                fontSize: 'var(--text-xs)',
                color: 'var(--b1n0-text-2)',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {n.body}
            </p>
          )}
          <span
            style={{
              fontFamily: F,
              fontSize: 'var(--text-2xs)',
              color: 'var(--b1n0-muted)',
              marginTop: '4px',
              display: 'block',
            }}
          >
            {timeAgo(n.createdAt)}
          </span>
        </div>
      </button>

      {/* Dismiss X — only visible on hover, otherwise reserves the space */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        title="Eliminar"
        aria-label="Eliminar notificación"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--b1n0-muted)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity var(--duration-fast) var(--ease-out)',
          flexShrink: 0,
          borderRadius: 'var(--radius-md)',
          marginTop: '2px',
        }}
      >
        <X size={12} weight="bold" />
      </button>
    </div>
  )
}

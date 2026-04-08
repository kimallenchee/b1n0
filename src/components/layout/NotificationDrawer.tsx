import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import type { Notification } from '../../context/NotificationContext'
import { useEffect, useState } from 'react'

const F = '"DM Sans", sans-serif'

/* ── Type config: icon, accent color, label ── */
const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
  posicion_creada:     { icon: '📊', color: 'var(--b1n0-teal-500)',   label: 'Posición' },
  evento_resuelto:     { icon: '📢', color: 'var(--b1n0-si)',         label: 'Resuelto' },
  resultado:           { icon: '🎯', color: 'var(--b1n0-si)',         label: 'Resultado' },
  posicion_vendida:    { icon: '💰', color: 'var(--b1n0-orange-500)', label: 'Venta' },
  evento_por_cerrar:   { icon: '⏰', color: 'var(--b1n0-orange-500)', label: 'Por cerrar' },
  nuevo_evento:        { icon: '🆕', color: '#2E1065',               label: 'Nuevo' },
  solicitud_amistad:   { icon: '👋', color: 'var(--b1n0-teal-500)',   label: 'Social' },
  amistad_aceptada:    { icon: '🤝', color: 'var(--b1n0-teal-500)',   label: 'Social' },
  respuesta_comentario:{ icon: '💬', color: '#2E1065',               label: 'Comentario' },
  mencion:             { icon: '📌', color: '#2E1065',               label: 'Mención' },
  deposito_confirmado: { icon: '✅', color: 'var(--b1n0-si)',         label: 'Depósito' },
  retiro_procesado:    { icon: '🏦', color: 'var(--b1n0-muted)',      label: 'Retiro' },
  saldo_bajo:          { icon: '⚠️', color: 'var(--b1n0-orange-500)', label: 'Saldo' },
  nivel_subio:         { icon: '⬆️', color: 'var(--b1n0-teal-500)',   label: 'Nivel' },
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

function NotifRow({ n, onTap, onDismiss }: { n: Notification; onTap: () => void; onDismiss: () => void }) {
  const cfg = typeConfig[n.type] || { icon: '🔔', color: 'var(--b1n0-muted)', label: '' }
  const [hovered, setHovered] = useState(false)
  const [dismissHovered, setDismissHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: '12px', alignItems: 'flex-start',
        padding: '14px 16px 14px 0',
        marginLeft: '16px',
        background: hovered ? 'var(--b1n0-surface)' : n.read ? 'transparent' : 'var(--b1n0-notif-unread)',
        borderBottom: '1px solid var(--b1n0-border)',
        borderLeft: `3px solid ${n.read ? 'transparent' : cfg.color}`,
        paddingLeft: '14px',
        transition: 'background 0.15s ease',
        borderRadius: '0 8px 8px 0',
        marginBottom: '2px',
        position: 'relative',
      }}
    >
      <button onClick={onTap} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
        {/* Icon with colored circle background */}
        <div style={{
          width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
          fontSize: '16px',
        }}>
          {cfg.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <p style={{
              fontFamily: F, fontWeight: n.read ? 500 : 700, fontSize: '13px',
              color: 'var(--b1n0-text-1)', flex: 1, lineHeight: 1.3,
            }}>
              {n.title}
            </p>
            {!n.read && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: cfg.color, flexShrink: 0,
                boxShadow: `0 0 6px ${cfg.color}`,
              }} />
            )}
          </div>
          {n.body && (
            <p style={{
              fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-2)',
              lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {n.body}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
            {cfg.label && (
              <span style={{
                fontFamily: F, fontSize: '10px', fontWeight: 600,
                color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                {cfg.label}
              </span>
            )}
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
              {timeAgo(n.createdAt)}
            </span>
          </div>
        </div>
      </button>
      {/* Dismiss X */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        onMouseEnter={() => setDismissHovered(true)}
        onMouseLeave={() => setDismissHovered(false)}
        style={{
          background: dismissHovered ? 'var(--b1n0-surface)' : 'none',
          border: 'none', cursor: 'pointer',
          padding: '4px 6px', color: 'var(--b1n0-muted)',
          fontSize: '14px', lineHeight: 1, flexShrink: 0,
          borderRadius: '6px', marginTop: '2px',
          opacity: hovered ? 1 : 0.4,
          transition: 'opacity 0.15s ease, background 0.15s ease',
        }}
        title="Eliminar"
      >
        ✕
      </button>
    </div>
  )
}

export function NotificationDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { notifications, markRead, markAllRead, dismissOne, clearAll } = useNotifications()
  const [visible, setVisible] = useState(false)
  const unreadCount = notifications.filter(n => !n.read).length

  // Slide-in animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 250)
  }

  const handleTap = (n: Notification) => {
    if (!n.read) markRead(n.id)
    const eventId = n.data.event_id as string | undefined
    if (eventId && ['evento_resuelto', 'resultado', 'posicion_creada', 'posicion_vendida', 'evento_por_cerrar', 'nuevo_evento'].includes(n.type)) {
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

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(2px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9999,
        width: '100%', maxWidth: '400px',
        background: 'var(--b1n0-bg)',
        borderLeft: '1px solid var(--b1n0-border)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '-8px 0 30px rgba(255,255,255,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 18px 16px',
          borderBottom: '1px solid var(--b1n0-border)',
          background: 'var(--b1n0-card)',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: '18px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px' }}>
              Notificaciones
            </p>
            {unreadCount > 0 && (
              <span style={{
                fontFamily: F, fontSize: '11px', fontWeight: 700,
                color: '#fff', background: 'var(--b1n0-teal-500)',
                borderRadius: '10px', padding: '2px 8px', lineHeight: '16px',
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: '12px', fontWeight: 600,
                  color: 'var(--b1n0-teal-500)', padding: '4px 8px',
                  borderRadius: '6px', transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--b1n0-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Marcar leído
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: '12px', fontWeight: 600,
                  color: 'var(--b1n0-no)', padding: '4px 8px',
                  borderRadius: '6px', transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--b1n0-no-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Borrar todo
              </button>
            )}
            <button
              onClick={handleClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: F, fontSize: '18px', color: 'var(--b1n0-muted)',
                padding: '4px 8px', lineHeight: 1, borderRadius: '6px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--b1n0-surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, padding: '8px 0' }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.4 }}>🔔</div>
              <p style={{ fontFamily: F, fontSize: '15px', fontWeight: 600, color: 'var(--b1n0-text-2)', marginBottom: '6px' }}>
                Todo al día
              </p>
              <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>
                No tenés notificaciones nuevas. Cuando alguien interactúe con tus posiciones o eventos, aparecerán acá.
              </p>
            </div>
          ) : (
            notifications.map(n => (
              <NotifRow key={n.id} n={n} onTap={() => handleTap(n)} onDismiss={() => dismissOne(n.id)} />
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

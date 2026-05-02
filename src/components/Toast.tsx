import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react'

/**
 * Unified toast system.
 *
 * The API (showToast/showError/showSuccess) is preserved from the original
 * implementation so every existing callsite keeps working. What changed:
 *
 *   - Phosphor icons (with semantic weight) replace the unicode glyphs
 *   - Bottom-of-viewport positioning above BottomNav, with safe-area inset
 *   - Brand-accent borders, restrained palette (uses --b1n0-si / --b1n0-no)
 *   - Renders via Portal so it floats above any z-index context
 *   - Click-to-dismiss anywhere on the toast, not just the X button
 *   - Up to 3 toasts visible at once; older ones get pushed out
 */

type ToastType = 'error' | 'success' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
  duration: number
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
  showInfo: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3600) => {
    const id = ++nextId
    setToasts((prev) => {
      // Cap visible toasts at 3 — drop the oldest if we're at the cap.
      const next = [...prev, { id, message, type, duration }]
      return next.slice(-3)
    })
  }, [])

  const showError = useCallback(
    (message: string) => showToast(message, 'error', 4500),
    [showToast]
  )
  const showSuccess = useCallback(
    (message: string) => showToast(message, 'success', 3200),
    [showToast]
  )
  const showInfo = useCallback(
    (message: string) => showToast(message, 'info', 3200),
    [showToast]
  )

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess, showInfo }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0 || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        // Sits above the mobile BottomNav (~64px) plus safe-area inset.
        bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 'var(--space-2)',
        width: 'min(92vw, 420px)',
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>,
    document.body
  )
}

const intentMeta: Record<ToastType, { Icon: typeof CheckCircle; color: string; bg: string }> = {
  success: { Icon: CheckCircle,    color: 'var(--b1n0-si)',     bg: 'var(--b1n0-si-bg)' },
  error:   { Icon: WarningCircle,  color: 'var(--b1n0-no)',     bg: 'var(--b1n0-no-bg)' },
  info:    { Icon: Info,           color: 'var(--b1n0-text-2)', bg: 'var(--b1n0-surface)' },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const meta = intentMeta[toast.type]
  const [phase, setPhase] = useState<'enter' | 'visible'>('enter')

  useEffect(() => {
    const enterT = setTimeout(() => setPhase('visible'), 20)
    const exitT = setTimeout(() => onRemove(toast.id), toast.duration)
    return () => {
      clearTimeout(enterT)
      clearTimeout(exitT)
    }
  }, [toast.id, toast.duration, onRemove])

  return (
    <button
      onClick={() => onRemove(toast.id)}
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-5)',
        background: 'var(--b1n0-card)',
        border: `1px solid ${meta.color}`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        opacity: phase === 'enter' ? 0 : 1,
        transform: phase === 'enter' ? 'translateY(8px) scale(0.98)' : 'translateY(0) scale(1)',
        transition: 'opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out)',
        pointerEvents: 'auto',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
          background: meta.bg,
          flexShrink: 0,
        }}
      >
        <meta.Icon size={18} weight="fill" color={meta.color} />
      </span>
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--b1n0-text-1)',
          letterSpacing: 'var(--tracking-tight)',
          lineHeight: 1.35,
        }}
      >
        {toast.message}
      </span>
      <X size={14} weight="bold" color="var(--b1n0-muted)" />
    </button>
  )
}

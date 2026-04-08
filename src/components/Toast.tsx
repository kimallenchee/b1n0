import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

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
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const showError = useCallback((message: string) => {
    showToast(message, 'error', 5000)
  }, [showToast])

  const showSuccess = useCallback((message: string) => {
    showToast(message, 'success', 3000)
  }, [showToast])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

// ─── Toast Container ─────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '420px',
        width: 'calc(100% - 32px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

// ─── Single Toast ────────────────────────────────────────────────────────────

const bgColors: Record<ToastType, string> = {
  error: 'rgba(248,113,113,0.08)',
  success: 'rgba(74,222,128,0.08)',
  info: '#141414',
}

const borderColors: Record<ToastType, string> = {
  error: 'rgba(239, 68, 68, 0.3)',
  success: 'rgba(34, 197, 94, 0.3)',
  info: 'rgba(99, 102, 241, 0.3)',
}

const iconColors: Record<ToastType, string> = {
  error: '#f87171',
  success: '#4ade80',
  info: '#C4B5FD',
}

const icons: Record<ToastType, string> = {
  error: '\u2716',   // ✖
  success: '\u2714', // ✔
  info: '\u2139',    // ℹ
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), toast.duration)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  return (
    <div
      style={{
        background: bgColors[toast.type],
        border: `1px solid ${borderColors[toast.type]}`,
        borderRadius: '12px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontFamily: '"DM Sans", sans-serif',
        fontSize: '13px',
        color: '#f2efea',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
        animation: 'toast-slide-in 0.25s ease-out',
      }}
      role="alert"
      aria-live="polite"
    >
      <span style={{ color: iconColors[toast.type], fontSize: '16px', flexShrink: 0 }}>
        {icons[toast.type]}
      </span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: '#5e5a54',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '0 2px',
          flexShrink: 0,
        }}
        aria-label="Cerrar"
      >
        &times;
      </button>
    </div>
  )
}

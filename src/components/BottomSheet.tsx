import type { ReactNode } from 'react'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}

export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.15)', zIndex: 200 }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 201,
          background: 'var(--b1n0-card)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(255,255,255,0.08)',
          maxWidth: '660px',
          margin: '0 auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: '2px', background: 'var(--b1n0-border)' }} />
        </div>

        {/* Title row */}
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px', borderBottom: '1px solid var(--b1n0-border)' }}>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: 'var(--b1n0-text-1)' }}>{title}</p>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '18px', color: 'var(--b1n0-muted)', padding: '4px 0 4px 8px', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </>
  )
}

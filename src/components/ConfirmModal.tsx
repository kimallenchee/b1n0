/**
 * ConfirmModal — app-wide confirm() replacement.
 *
 * Two pieces:
 *   1. <ConfirmModalRoot /> — mounted once near the root of the app
 *      (inside the provider stack in App.tsx). It listens to a tiny
 *      pub/sub store, renders the active modal, and resolves the
 *      pending promise when the user picks an option.
 *   2. useConfirm() — returns an async function. Call it with the
 *      modal options and `await` its result (boolean). Resolves true
 *      if the user confirms, false on cancel / Escape / backdrop click.
 *
 * Designed to feel like the AppTour modal (centered, blurred backdrop,
 * brand-aligned card) so the visual language stays consistent.
 *
 * Why a pub/sub instead of a Context provider with state? The hook can
 * be called from anywhere — including async code paths inside event
 * handlers — without needing to thread props or context through every
 * caller. The store lives outside React; only the root component
 * subscribes to re-render on changes.
 */

import { useEffect, useState } from 'react'

export interface ConfirmOptions {
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  id: number
  resolve: (ok: boolean) => void
}

// ── Tiny external store ───────────────────────────────────────
// Outside React so it survives re-renders and lets useConfirm()
// publish from anywhere without needing context.
let nextId = 1
let pending: PendingConfirm | null = null
const listeners = new Set<() => void>()

function emit() { for (const l of listeners) l() }

function publish(opts: ConfirmOptions): Promise<boolean> {
  // Only one modal can be open at a time. If something is already
  // pending, cancel it before opening the new one.
  if (pending) {
    const prev = pending
    pending = null
    prev.resolve(false)
  }
  return new Promise<boolean>((resolve) => {
    pending = { ...opts, id: nextId++, resolve }
    emit()
  })
}

function resolveCurrent(ok: boolean) {
  const cur = pending
  if (!cur) return
  pending = null
  emit()
  cur.resolve(ok)
}

// ── Hook ──────────────────────────────────────────────────────

export function useConfirm() {
  return publish
}

// ── Root component ────────────────────────────────────────────

const F_BODY = 'var(--font-body)'
const F_DISPLAY = 'var(--font-display)'

export function ConfirmModalRoot() {
  // Subscribe to the store via a version counter so React re-renders
  // whenever the pending modal changes.
  const [, setVersion] = useState(0)
  useEffect(() => {
    const l = () => setVersion((v) => v + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])

  const current = pending

  // Escape key = cancel
  useEffect(() => {
    if (!current) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') resolveCurrent(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!current) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [current])

  if (!current) return null

  const confirmBg = current.danger ? 'var(--b1n0-error)' : 'var(--b1n0-si)'
  const confirmFg = current.danger ? '#fff' : 'var(--b1n0-on-accent)'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
      onClick={(e) => { if (e.target === e.currentTarget) resolveCurrent(false) }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'b1n0ConfirmFade 180ms ease-out',
      }}
    >
      <style>{`
        @keyframes b1n0ConfirmFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes b1n0ConfirmSlide {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--b1n0-card)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: 'var(--radius-2xl, 20px)',
          padding: '22px 22px 18px',
          animation: 'b1n0ConfirmSlide 200ms ease-out',
        }}
        key={current.id}
      >
        <h2
          style={{
            fontFamily: F_DISPLAY,
            fontWeight: 800,
            fontSize: 18,
            color: 'var(--b1n0-text-1)',
            margin: 0,
            marginBottom: 8,
            letterSpacing: '-0.3px',
          }}
        >
          {current.title}
        </h2>
        <p
          style={{
            fontFamily: F_BODY,
            fontSize: 14,
            color: 'var(--b1n0-muted)',
            lineHeight: 1.5,
            margin: 0,
            marginBottom: 18,
          }}
        >
          {current.body}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => resolveCurrent(false)}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--b1n0-border)',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: F_BODY,
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--b1n0-text-1)',
            }}
          >
            {current.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            onClick={() => resolveCurrent(true)}
            autoFocus
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-lg)',
              border: 'none',
              background: confirmBg,
              cursor: 'pointer',
              fontFamily: F_BODY,
              fontWeight: 700,
              fontSize: 13,
              color: confirmFg,
            }}
          >
            {current.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

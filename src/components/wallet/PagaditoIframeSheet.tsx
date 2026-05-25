/**
 * PagaditoIframeSheet — full-screen overlay that hosts Pagadito's
 * hosted payment iframe (via Redbajas).
 *
 * Why an iframe and not a form: the user's PAN must never touch
 * b1n0's frontend or our edge functions. Pagadito iframes run in
 * their own origin (sandbox-payer.pagadito.com / payer.pagadito.com)
 * and we are out of PCI scope.
 *
 * Lifecycle:
 *   1. Component mounts with an amount
 *   2. Calls the `redbajas-payment` edge function → receives iframe URL
 *      + session token + payment_tx id
 *   3. Renders iframe at full viewport
 *   4. Listens for postMessage from the iframe (Pagadito posts a
 *      success/cancel signal when the user finishes)
 *   5. Also polls the payment_transactions row via Supabase realtime —
 *      defensive in case the iframe postMessage is missed (e.g. user
 *      navigated away mid-flow but the webhook still settled)
 *   6. On confirmed settlement, fires `onSuccess(amount)` and the
 *      WalletSheet flips to the "done" screen
 *
 * The component takes care of its own loading + error states so the
 * WalletSheet caller only needs to provide { amount, onClose, onSuccess }.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Spinner, WarningCircle } from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'

const F = 'var(--font-body)'

interface PagaditoIframeSheetProps {
  amount: number
  currency?: string
  description?: string
  onClose: () => void
  /** Fired once we confirm the payment_transactions row flipped to 'settled'. */
  onSuccess: (settledAmount: number) => void
}

type Phase = 'initiating' | 'ready' | 'completed' | 'failed'

interface SessionInfo {
  sessionToken: string
  iframeUrl: string
  paymentTransactionId: string
  expiresAt: string
}

export function PagaditoIframeSheet({
  amount,
  currency = 'USD',
  description,
  onClose,
  onSuccess,
}: PagaditoIframeSheetProps) {
  const [phase, setPhase] = useState<Phase>('initiating')
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Initiate the Pagadito session as soon as the sheet opens.
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession()
        if (!authSession?.access_token) {
          throw new Error('Necesitás iniciar sesión para depositar.')
        }
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redbajas-payment`
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({ amount, currency, description }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const data: SessionInfo = await res.json()
        if (cancelled) return
        setSession(data)
        setPhase('ready')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setPhase('failed')
      }
    }
    init()
    return () => { cancelled = true }
  }, [amount, currency, description])

  // Subscribe to the payment_transactions row via realtime. When the
  // webhook flips status to 'settled' we react immediately, even if
  // the postMessage from the iframe got missed (cross-origin issues
  // are common on mobile WebKit).
  useEffect(() => {
    if (!session?.paymentTransactionId) return
    const channel = supabase
      .channel(`payment_tx_${session.paymentTransactionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_transactions',
          filter: `id=eq.${session.paymentTransactionId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string; net_amount?: number }
          if (next.status === 'settled') {
            setPhase('completed')
            onSuccess(Number(next.net_amount) || amount)
          } else if (next.status === 'failed' || next.status === 'cancelled') {
            setError('La transacción no pudo completarse.')
            setPhase('failed')
          }
        },
      )
      .subscribe()

    subscriptionRef.current = channel
    return () => { channel.unsubscribe() }
  }, [session?.paymentTransactionId, onSuccess, amount])

  // Listen for postMessage from the Pagadito iframe. Pagadito's docs
  // don't define an explicit event shape; this is a best-effort
  // listener that recognizes common patterns. The realtime subscription
  // above is the authoritative path; this just provides UX snappiness.
  useEffect(() => {
    if (!session) return
    function handleMessage(e: MessageEvent) {
      const origin = e.origin
      if (!origin.includes('pagadito.com')) return
      const data = typeof e.data === 'object' && e.data ? e.data as Record<string, unknown> : {}
      const kind = String(data.event || data.type || '').toLowerCase()
      if (kind.includes('success') || kind.includes('approved') || kind.includes('settled')) {
        // Defer to realtime to flip phase — but visually acknowledge
        setPhase('completed')
      } else if (kind.includes('cancel') || kind.includes('declined') || kind.includes('error')) {
        setError('Pago cancelado o rechazado.')
        setPhase('failed')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [session])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: 'var(--b1n0-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--b1n0-border)',
          background: 'var(--b1n0-surface)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 999,
            border: 'none',
            background: 'transparent',
            color: 'var(--b1n0-text-1)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={20} weight="regular" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: 'var(--b1n0-text-1)', margin: 0 }}>
            Depositar {currency} {amount.toFixed(2)}
          </p>
          <p style={{ fontFamily: F, fontSize: 11, color: 'var(--b1n0-muted)', margin: 0 }}>
            Pago seguro · Pagadito
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {phase === 'initiating' && (
          <CenteredState>
            <Spinner size={28} weight="regular" />
            <p style={{ fontFamily: F, fontSize: 13, color: 'var(--b1n0-muted)', marginTop: 12 }}>
              Preparando tu sesión segura…
            </p>
          </CenteredState>
        )}

        {phase === 'failed' && (
          <CenteredState>
            <WarningCircle size={32} weight="regular" color="var(--b1n0-error)" />
            <p style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: 'var(--b1n0-text-1)', marginTop: 12 }}>
              Algo salió mal
            </p>
            <p style={{ fontFamily: F, fontSize: 12, color: 'var(--b1n0-muted)', marginTop: 4, textAlign: 'center', maxWidth: 280 }}>
              {error || 'No pudimos iniciar el pago. Intentá de nuevo.'}
            </p>
            <button
              onClick={onClose}
              style={{
                marginTop: 20,
                padding: '10px 18px',
                borderRadius: 999,
                border: '1px solid var(--b1n0-border)',
                background: 'var(--b1n0-card)',
                color: 'var(--b1n0-text-1)',
                fontFamily: F,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Volver
            </button>
          </CenteredState>
        )}

        {phase === 'completed' && (
          <CenteredState>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                background: 'var(--b1n0-si-bg)',
                color: 'var(--b1n0-si)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <p style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: 'var(--b1n0-text-1)', marginTop: 12 }}>
              Depósito confirmado
            </p>
            <p style={{ fontFamily: F, fontSize: 12, color: 'var(--b1n0-muted)', marginTop: 4 }}>
              Tu saldo se actualizó.
            </p>
          </CenteredState>
        )}

        {phase === 'ready' && session && (
          <iframe
            src={session.iframeUrl}
            title="Pagadito"
            allow="payment"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'white',
            }}
          />
        )}
      </div>
    </div>
  )
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}

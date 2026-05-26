/**
 * BetaGate — pre-launch landing page at `/`.
 *
 * Until b1n0 opens public access, first-time visitors land here. They
 * enter an email, we record it (with IP + user-agent via beta-signup
 * edge function), then redirect them into /inicio. Returning visitors
 * who've already passed the gate (localStorage flag) skip straight to
 * /inicio without ever seeing this page.
 *
 * Three visual phases:
 *   - 'input'     : email field + CTA
 *   - 'submitting': mid-flight loading spinner
 *   - 'success'   : "Bienvenido de vuelta" / "Gracias por participar"
 *                   message, then auto-redirect after ~1.6s
 *
 * Errors (network, invalid email) surface inline above the input
 * without leaving the page.
 *
 * Styling follows the b1n0 theme: dark background, Syne for the hero,
 * Inter for body, --b1n0-si as the accent. Centered card layout, no
 * footer (the gate is intentionally minimal — every other page has
 * Footer, this one doesn't).
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, EnvelopeSimple, SpinnerGap } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

const BETA_PASSED_KEY = 'b1n0-beta-passed'

type Phase = 'input' | 'submitting' | 'success'

interface BetaGateProps {
  /** Called when the user has cleared the gate (either fresh or returning). */
  onCleared?: () => void
}

export function BetaGate({ onCleared }: BetaGateProps) {
  const navigate = useNavigate()
  const { resolved } = useTheme()

  const [phase, setPhase] = useState<Phase>('input')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isReturning, setIsReturning] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Autofocus the input on mount — every interaction starts there.
  useEffect(() => {
    if (phase === 'input') inputRef.current?.focus()
  }, [phase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError('Ingresá un correo válido.')
      return
    }
    setPhase('submitting')

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/beta-signup`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          referrer: typeof document !== 'undefined' ? document.referrer : '',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'invalid_email') {
          throw new Error('Correo inválido. Probá otro.')
        }
        throw new Error('No pudimos registrarte. Intentá de nuevo.')
      }
      const data = await res.json() as { isReturning?: boolean }
      setIsReturning(Boolean(data.isReturning))

      // Persist locally so they skip the gate on future visits.
      try {
        localStorage.setItem(BETA_PASSED_KEY, '1')
        localStorage.setItem('b1n0-beta-email', trimmed)
      } catch {
        // Storage blocked — gate will re-appear next visit. Not fatal.
      }

      setPhase('success')

      // Hold the success screen briefly so the user reads it, then redirect.
      window.setTimeout(() => {
        onCleared?.()
        navigate('/inicio', { replace: true })
      }, 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
      setPhase('input')
    }
  }

  const logoSrc = resolved === 'light'
    ? '/brand/b1n0-logo-fullcolor.svg'
    : '/brand/b1n0-logo-white.svg'

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--b1n0-bg)',
        color: 'var(--b1n0-text-1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: F,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle radial-glow backdrop — same as Inicio's hero so the
          visual identity carries through. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 30%, var(--b1n0-si-bg) 0%, transparent 55%)',
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 28,
        }}
      >
        {/* Logo */}
        <img
          src={logoSrc}
          alt="b1n0"
          style={{ height: 36, width: 'auto', display: 'block' }}
        />

        {phase !== 'success' ? (
          <>
            {/* Hero */}
            <div>
              <h1
                style={{
                  fontFamily: D,
                  fontWeight: 800,
                  fontSize: 36,
                  lineHeight: 1.1,
                  letterSpacing: -1.5,
                  color: 'var(--b1n0-text-1)',
                  margin: 0,
                  marginBottom: 12,
                }}
              >
                Estás invitado al beta.
              </h1>
              <p
                style={{
                  fontFamily: F,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: 'var(--b1n0-muted)',
                  margin: 0,
                  maxWidth: 360,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                b1n0 es un mercado de opciones sobre eventos para Centroamérica. Dejá tu correo y te dejamos entrar.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ width: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  background: 'var(--b1n0-card)',
                  border: error
                    ? '1px solid var(--b1n0-error)'
                    : '1px solid var(--b1n0-border)',
                  borderRadius: 999,
                  padding: '6px 6px 6px 14px',
                  transition: 'border-color 0.15s',
                }}
              >
                <EnvelopeSimple
                  size={18}
                  weight="regular"
                  color="var(--b1n0-muted)"
                  style={{ flexShrink: 0, marginRight: 8 }}
                />
                <input
                  ref={inputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={phase === 'submitting'}
                  placeholder="tu@correo.com"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--b1n0-text-1)',
                    fontFamily: F,
                    fontSize: 15,
                    padding: '8px 0',
                  }}
                />
                <button
                  type="submit"
                  disabled={phase === 'submitting'}
                  aria-label="Entrar"
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: 'none',
                    background: phase === 'submitting'
                      ? 'var(--b1n0-disabled-bg)'
                      : 'var(--b1n0-si)',
                    color: phase === 'submitting'
                      ? 'var(--b1n0-muted)'
                      : 'var(--b1n0-on-accent)',
                    cursor: phase === 'submitting' ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {phase === 'submitting' ? (
                    <SpinnerGap size={18} weight="bold" style={{ animation: 'b1n0-spin 1s linear infinite' }} />
                  ) : (
                    <ArrowRight size={18} weight="bold" />
                  )}
                </button>
              </div>
              {error && (
                <p
                  role="alert"
                  style={{
                    fontFamily: F,
                    fontSize: 12,
                    color: 'var(--b1n0-error)',
                    margin: '10px 4px 0',
                    textAlign: 'left',
                  }}
                >
                  {error}
                </p>
              )}
            </form>

            {/* Minimal skip — same visual weight as the legal-style
                line it replaces, but it's a real link that drops the
                user into /inicio without writing any beta_signups row. */}
            <p
              style={{
                fontFamily: F,
                fontSize: 11,
                color: 'var(--b1n0-muted)',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              ¿Solo querés echar un vistazo?{' '}
              <button
                type="button"
                onClick={() => {
                  // Mark beta as passed so they don't see this page on
                  // subsequent visits, then navigate. No email captured.
                  try { localStorage.setItem('b1n0-beta-passed', '1') } catch {}
                  navigate('/inicio', { replace: true })
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--b1n0-si)',
                  fontFamily: F,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                Saltar al sitio
              </button>
            </p>
          </>
        ) : (
          // Success state — single confident line + caret-style loader
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              animation: 'b1n0-fade-in 0.4s ease-out',
            }}
          >
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
                fontFamily: D,
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <h2
              style={{
                fontFamily: D,
                fontWeight: 800,
                fontSize: 24,
                lineHeight: 1.2,
                letterSpacing: -0.8,
                color: 'var(--b1n0-text-1)',
                margin: 0,
              }}
            >
              {isReturning ? 'Bienvenido de vuelta.' : 'Gracias por participar.'}
            </h2>
            <p
              style={{
                fontFamily: F,
                fontSize: 14,
                color: 'var(--b1n0-muted)',
                margin: 0,
              }}
            >
              {isReturning ? 'Te llevamos al feed…' : 'Tu acceso al beta está activo. Te llevamos al feed…'}
            </p>
          </div>
        )}
      </div>

      {/* Inline keyframes — keeps the page self-contained. */}
      <style>{`
        @keyframes b1n0-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes b1n0-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/**
 * Helper used by routing — true if the visitor has already cleared the
 * beta gate (or is an authenticated existing user).
 */
export function hasBetaAccess(): boolean {
  try {
    return localStorage.getItem(BETA_PASSED_KEY) === '1'
  } catch {
    return false
  }
}

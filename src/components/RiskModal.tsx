/**
 * RiskModal — first-deposit risk acknowledgment.
 *
 * Shown EXACTLY ONCE per user, before their very first deposit. The
 * regulator-facing point of this surface is that we can produce
 * evidence (server-side `profiles.risk_acknowledged_at` timestamp)
 * showing the user saw and accepted this warning before any money
 * moved.
 *
 * Behavior:
 *   - Opens when `open` is true.
 *   - User taps "Entiendo y acepto" → onAccept() fires, which the
 *     parent uses to (1) call supabase.rpc('acknowledge_risk') for
 *     the server-side audit record and (2) refreshProfile so the
 *     riskAcknowledgedAt in context updates, gating future opens.
 *   - "Cancelar" closes the modal without consenting; the parent
 *     should NOT proceed with the deposit flow in that case.
 *
 * Not a generic confirmation — this is a regulatory artifact. Copy
 * is fixed and kept in voseo Spanish to match the rest of the app.
 *
 * Why a dedicated component (not the existing ConfirmModal): the
 * shape is different (multiple bullets + heading + branded warning
 * icon area), and we want the regulatory copy versioned with this
 * file so changes are auditable in git history.
 */

import { Warning } from '@phosphor-icons/react'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

interface RiskModalProps {
  open: boolean
  onAccept: () => void
  onCancel: () => void
  loading?: boolean
}

export function RiskModal({ open, onAccept, onCancel, loading = false }: RiskModalProps) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'fadeIn var(--duration-fast) var(--ease-out)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460,
          width: '100%',
          background: 'var(--b1n0-card)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          fontFamily: F,
        }}
      >
        {/* ── Header with brand warning treatment ─────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 'var(--space-4)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--b1n0-no-bg, rgba(245,158,11,0.15))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Warning size={22} weight="bold" color="var(--b1n0-no)" />
          </div>
          <h2
            id="risk-modal-title"
            style={{
              fontFamily: D,
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--b1n0-text-1)',
              margin: 0,
              letterSpacing: '-0.5px',
            }}
          >
            Antes de continuar
          </h2>
        </div>

        {/* ── Disclosures ─────────────────────────────────────── */}
        <p
          style={{
            fontSize: 14,
            color: 'var(--b1n0-text-1)',
            margin: 0,
            marginBottom: 'var(--space-4)',
            lineHeight: 1.6,
          }}
        >
          Antes de hacer tu primer depósito, queremos que tengas claro
          qué es y qué no es b1n0:
        </p>

        <ul
          style={{
            margin: 0,
            marginBottom: 'var(--space-5)',
            paddingLeft: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <RiskBullet>
            Los llamados implican <strong>riesgo de pérdida del capital</strong>.
            No hay retornos garantizados.
          </RiskBullet>
          <RiskBullet>
            b1n0 <strong>no es una inversión</strong>, no es un instrumento
            financiero, no es una casa de apuestas y no es un casino. Es
            un mercado de opinión sobre eventos.
          </RiskBullet>
          <RiskBullet>
            El acceso es para <strong>mayores de 18 años</strong>.
          </RiskBullet>
          <RiskBullet>
            Sos responsable de cumplir las leyes y obligaciones fiscales
            aplicables en tu jurisdicción.
          </RiskBullet>
        </ul>

        <p
          style={{
            fontSize: 12,
            color: 'var(--b1n0-muted)',
            margin: 0,
            marginBottom: 'var(--space-5)',
            lineHeight: 1.55,
          }}
        >
          Tu aceptación queda registrada con fecha y hora. Podés
          consultar los términos completos en{' '}
          <a
            href="/terminos"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--b1n0-si)', textDecoration: 'underline' }}
          >
            /terminos
          </a>{' '}
          y la política de confianza en{' '}
          <a
            href="/confianza"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--b1n0-si)', textDecoration: 'underline' }}
          >
            /confianza
          </a>
          .
        </p>

        {/* ── Actions ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 'var(--radius-pill)',
              background: 'transparent',
              border: '1px solid var(--b1n0-border)',
              color: 'var(--b1n0-muted)',
              fontFamily: F,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onAccept}
            disabled={loading}
            style={{
              flex: 2,
              padding: '12px 16px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--b1n0-si)',
              border: 'none',
              color: 'var(--b1n0-on-accent)',
              fontFamily: F,
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Registrando…' : 'Entiendo y acepto'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RiskBullet({ children }: { children: React.ReactNode }) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        fontSize: 13.5,
        color: 'var(--b1n0-text-1)',
        lineHeight: 1.55,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--b1n0-no)',
          marginTop: 7,
        }}
      />
      <span>{children}</span>
    </li>
  )
}

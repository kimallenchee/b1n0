import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/* ═══════════════════════════════════════════════════════════════
   SponsorConsentModal
   ───────────────────────────────────────────────────────────────
   Pre-deposit gate. Before EventManager calls deposit_lp_capital
   (or deposit_lp_capital_with_consent) on behalf of a sponsor,
   this modal recaps the four scenarios and requires explicit
   per-scenario acknowledgement.

   Loads the active LP terms from lp_consent_versions (RLS allows
   any authenticated user to read), shows the markdown terms, and
   collects checkbox state for each required scenario. On submit,
   passes consent_version + acknowledgements back to the caller.

   Usage:
     <SponsorConsentModal
       sponsorName="Kim Chee"
       amount={5000}
       returnPct={0.08}
       onCancel={() => setShowConsent(false)}
       onAccept={(version, acks) => {
         // call deposit_lp_capital_with_consent with these
       }}
     />
   ═══════════════════════════════════════════════════════════════ */

const F = 'var(--font-body)'
const D = 'var(--font-display)'

const SCENARIO_LABELS: Record<string, { title: string; desc: string }> = {
  balanced: {
    title: 'Mercado balanceado',
    desc: 'Si las apuestas quedan parejas, mi capital LP se devuelve sin retorno (cero ganancia, cero pérdida — capital comprometido por nada).',
  },
  favorite_wins: {
    title: 'Favorito gana lopsided',
    desc: 'Si la multitud apuesta heavy a un lado y ese lado gana, mi capital LP cubre la diferencia entre el bet_pool y los pagos a ganadores. Esto puede ser un porcentaje significativo del capital depositado.',
  },
  underdog_wins: {
    title: 'Underdog gana lopsided',
    desc: 'Si la multitud apuesta heavy a un lado y el otro lado gana, las apuestas perdedoras quedan al LP. Aquí mi capital genera retorno.',
  },
  void: {
    title: 'Evento anulado',
    desc: 'Si el evento se anula por cualquier motivo, recupero mi principal completo pero sin margen — no gano nada por el tiempo que el capital estuvo comprometido.',
  },
}

interface ConsentVersion {
  version: string
  terms_md: string
  scenarios_required: string[]
}

interface Props {
  sponsorName: string
  amount: number
  returnPct: number
  onCancel: () => void
  onAccept: (version: string, acknowledgements: Record<string, boolean>) => void | Promise<void>
}

export function SponsorConsentModal({ sponsorName, amount, returnPct, onCancel, onAccept }: Props) {
  const [active, setActive] = useState<ConsentVersion | null>(null)
  const [acks, setAcks] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Load the active terms version on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: err } = await supabase
        .from('lp_consent_versions')
        .select('version, terms_md, scenarios_required')
        .eq('active', true)
        .order('effective_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (err || !data) {
        setError(err?.message ?? 'No se pudo cargar la versión activa de los términos.')
        setLoading(false)
        return
      }
      setActive(data as ConsentVersion)
      // Initialize all required scenarios as unchecked.
      const initial: Record<string, boolean> = {}
      for (const s of data.scenarios_required ?? []) initial[s] = false
      setAcks(initial)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const allChecked = active?.scenarios_required.every((s) => acks[s] === true) ?? false

  async function handleAccept() {
    if (!active || !allChecked) return
    setSubmitting(true)
    try {
      await onAccept(active.version, acks)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        maxWidth: 640, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--b1n0-border)' }}>
          <div style={{ fontSize: 11, color: 'var(--b1n0-no)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 4 }}>
            Consentimiento requerido
          </div>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: 22, color: 'var(--b1n0-text-1)' }}>
            Depósito LP de ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 13, color: 'var(--b1n0-muted)', marginTop: 4 }}>
            {sponsorName} · {(returnPct * 100).toFixed(1)}% margen sobre fees
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <p style={{ fontFamily: F, fontSize: 13, color: 'var(--b1n0-muted)' }}>
              Cargando términos...
            </p>
          )}

          {error && (
            <p style={{
              fontFamily: F, fontSize: 13, color: 'var(--b1n0-no)',
              background: 'var(--b1n0-no-bg)', padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
            }}>
              {error}
            </p>
          )}

          {active && (
            <>
              <div style={{ fontSize: 11, color: 'var(--b1n0-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Términos {active.version}
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.6, color: 'var(--b1n0-text-2)',
                background: 'var(--b1n0-bg)', padding: '14px 18px',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--b1n0-border)',
                whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto',
                marginBottom: 20,
              }}>
                {active.terms_md}
              </div>

              <div style={{ fontSize: 11, color: 'var(--b1n0-text-1)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Confirmá que entendés cada escenario
              </div>

              {active.scenarios_required.map((key) => {
                const meta = SCENARIO_LABELS[key] ?? { title: key, desc: '' }
                const checked = !!acks[key]
                return (
                  <label
                    key={key}
                    style={{
                      display: 'grid', gridTemplateColumns: '20px 1fr', gap: 12,
                      padding: '12px 0', borderBottom: '1px dashed var(--b1n0-border)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setAcks((a) => ({ ...a, [key]: e.target.checked }))}
                      style={{ width: 18, height: 18, marginTop: 3, accentColor: 'var(--b1n0-si)' }}
                    />
                    <div>
                      <div style={{ fontFamily: D, fontWeight: 700, fontSize: 14, color: 'var(--b1n0-text-1)' }}>
                        {meta.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--b1n0-text-2)', lineHeight: 1.5, marginTop: 2 }}>
                        {meta.desc}
                      </div>
                    </div>
                  </label>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--b1n0-border)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--b1n0-surface)' }}>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '10px 18px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--b1n0-border)', background: 'transparent',
              color: 'var(--b1n0-text-2)', fontFamily: F, fontWeight: 600, fontSize: 13,
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleAccept}
            disabled={!allChecked || submitting}
            style={{
              padding: '10px 18px', borderRadius: 'var(--radius-md)',
              border: 'none',
              background: !allChecked || submitting ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-si)',
              color: !allChecked || submitting ? 'var(--b1n0-muted)' : 'var(--b1n0-on-accent)',
              fontFamily: F, fontWeight: 700, fontSize: 13,
              cursor: !allChecked || submitting ? 'default' : 'pointer',
            }}
          >
            {submitting ? 'Procesando...' : 'Acepto y depositar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SponsorConsentModal

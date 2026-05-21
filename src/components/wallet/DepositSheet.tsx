import { useState } from 'react'
import { CreditCard, CurrencyDollar, Money } from '@phosphor-icons/react'
import { BottomSheet } from '../BottomSheet'
import { RiskModal } from '../RiskModal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

interface DepositSheetProps {
  open: boolean
  onClose: () => void
}

type Step = 'method' | 'amount' | 'card' | 'done'
type Method = 'tarjeta' | 'transferencia' | 'efectivo'

const methods: { id: Method; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: 'tarjeta',
    label: 'Tarjeta de débito / crédito',
    sub: 'Acreditación inmediata · sin comisión',
    icon: (
      <CreditCard size={22} weight="regular" color="var(--b1n0-text-1)" />
    ),
  },
  {
    id: 'transferencia',
    label: 'Transferencia bancaria',
    sub: 'Depósitos mayores · 1–2 días hábiles',
    icon: (
      <CurrencyDollar size={22} weight="regular" color="var(--b1n0-text-1)" />
    ),
  },
  {
    id: 'efectivo',
    label: 'Depósito en efectivo',
    sub: 'Puntos autorizados · acreditación en 24h',
    icon: (
      <Money size={22} weight="regular" color="var(--b1n0-text-1)" />
    ),
  },
]

const quickAmounts = [25, 50, 100, 250]

export function DepositSheet({ open, onClose }: DepositSheetProps) {
  const { profile, refreshProfile } = useAuth()
  const [step, setStep] = useState<Step>('method')
  const [method, setMethod] = useState<Method>('tarjeta')
  // Risk gate: if the user has never acknowledged the risk warning,
  // we intercept the deposit sheet with RiskModal first. The
  // acknowledgement is captured server-side via the acknowledge_risk
  // RPC so we have an immutable audit trail of when each user first
  // accepted the disclosures. Once profile.riskAcknowledgedAt is set,
  // this modal never appears again for that user.
  const needsRiskAck = open && profile != null && profile.riskAcknowledgedAt == null
  const [ackLoading, setAckLoading] = useState(false)
  async function handleAcceptRisk() {
    setAckLoading(true)
    try {
      await supabase.rpc('acknowledge_risk')
      await refreshProfile()
    } finally {
      setAckLoading(false)
    }
  }
  const [amount, setAmount] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountNum = parseFloat(amount) || 0
  const validAmount = amountNum >= 25

  const handleClose = () => {
    setStep('method')
    setAmount('')
    setCardNumber('')
    setCardExpiry('')
    setCardCvc('')
    setCardName('')
    setError(null)
    onClose()
  }

  const handleSelectMethod = (m: Method) => {
    setMethod(m)
    setStep('amount')
  }

  const handleAmountNext = () => {
    if (!validAmount) return
    if (method === 'tarjeta') {
      setStep('card')
    } else {
      handleDeposit()
    }
  }

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4)
    if (digits.length > 2) return digits.slice(0, 2) + '/' + digits.slice(2)
    return digits
  }

  const cardValid = cardNumber.replace(/\s/g, '').length >= 15 && cardExpiry.length >= 5 && cardCvc.length >= 3 && cardName.trim().length > 1

  const handleDeposit = async () => {
    setLoading(true)
    setError(null)

    // TODO: Replace with actual payment processor integration
    // For now, calls the existing deposit_balance RPC
    const { data, error: err } = await supabase.rpc('deposit_balance', {
      p_amount: amountNum,
      p_label: `Depósito vía ${method}`,
    })

    if (err) {
      setError(err.message)
    } else if (data?.error) {
      setError(data.error as string)
    } else {
      setStep('done')
      await refreshProfile()
    }
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
    color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }

  const title = step === 'method' ? 'Depositar' : step === 'card' ? 'Datos de tarjeta' : step === 'done' ? 'Depositar' : 'Depositar'

  // While the risk modal is up, we don't render the deposit sheet —
  // the user must accept (or cancel) the disclosures first. On accept,
  // refreshProfile() flips riskAcknowledgedAt and the sheet renders
  // on the next pass.
  if (needsRiskAck) {
    return (
      <RiskModal
        open={true}
        loading={ackLoading}
        onAccept={handleAcceptRisk}
        onCancel={handleClose}
      />
    )
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={title}>
      <div style={{ padding: '0 20px 40px' }}>

        {/* ── Step 1: Method selection ── */}
        {step === 'method' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
            {methods.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelectMethod(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '16px 18px', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-card-hover-border)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-border)')}
              >
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-lg)', background: 'var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {m.icon}
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 600, fontSize: '14px', color: 'var(--b1n0-text-1)', marginBottom: '2px' }}>{m.label}</p>
                  <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{m.sub}</p>
                </div>
                <span style={{ marginLeft: 'auto', fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: Amount entry ── */}
        {step === 'amount' && (
          <>
            <button
              onClick={() => setStep('method')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 16px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              ‹ Cambiar método
            </button>

            {/* Large amount display */}
            <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontFamily: D, fontWeight: 700, fontSize: '28px', color: 'var(--b1n0-muted)' , fontVariantNumeric: 'tabular-nums'}}>$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  autoFocus
                  style={{
                    background: 'none', border: 'none', outline: 'none',
                    fontFamily: D, fontWeight: 800, fontSize: '42px', color: 'var(--b1n0-text-1)',
                    width: `${Math.max(1, amount.length || 1) * 28}px`, textAlign: 'center',
                    appearance: 'textfield', MozAppearance: 'textfield',
                  }}
                />
              </div>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-si)', marginTop: '6px' }}>
                Sin comisión en tu primer depósito
              </p>
            </div>

            {/* Quick amount pills */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '16px 0 24px' }}>
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(amountNum + q))}
                  style={{
                    padding: '9px 18px', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                    cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--b1n0-surface)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--b1n0-card)')}
                >
                  +${q}
                </button>
              ))}
            </div>

            {/* Payment method indicator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--b1n0-surface)', marginBottom: '16px' }}>
              <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>
                Método: {method === 'tarjeta' ? 'Tarjeta' : method === 'transferencia' ? 'Transferencia' : 'Efectivo'}
              </span>
              <button onClick={() => setStep('method')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>
                Cambiar
              </button>
            </div>

            {!validAmount && amount.length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '12px', textAlign: 'center' }}>
                Mínimo Q25 por depósito.
              </p>
            )}

            {error && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', marginBottom: '12px', textAlign: 'center' }}>{error}</p>
            )}

            <button
              onClick={handleAmountNext}
              disabled={!validAmount || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none',
                background: validAmount && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: validAmount && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: validAmount && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Procesando...' : method === 'tarjeta' ? 'Continuar →' : 'Confirmar depósito →'}
            </button>

            {method === 'transferencia' && validAmount && (
              <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)' }}>
                <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Datos para transferencia</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { l: 'Banco', v: 'Banco Industrial' },
                    { l: 'Cuenta', v: '000-000000-0' },
                    { l: 'Nombre', v: 'b1n0 S.A.' },
                    { l: 'Referencia', v: 'Tu usuario' },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{l}</span>
                      <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {method === 'efectivo' && validAmount && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '14px', textAlign: 'center', lineHeight: 1.5 }}>
                Presentá el código que recibirás en cualquier punto autorizado b1n0.
              </p>
            )}
          </>
        )}

        {/* ── Step 3: Card details (tarjeta only) ── */}
        {step === 'card' && (
          <>
            <button
              onClick={() => setStep('amount')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 16px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              ‹ Volver
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-text-1)' , fontVariantNumeric: 'tabular-nums'}}>${amountNum.toLocaleString()}</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>Depósito vía tarjeta</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="Número de tarjeta"
                maxLength={19}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/AA"
                  maxLength={5}
                  style={{ ...inputStyle, width: '50%' }}
                />
                <input
                  type="text"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="CVC"
                  maxLength={4}
                  style={{ ...inputStyle, width: '50%' }}
                />
              </div>
              <input
                type="text"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Nombre en la tarjeta"
                style={inputStyle}
              />
            </div>

            {error && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', marginBottom: '12px', textAlign: 'center' }}>{error}</p>
            )}

            <button
              onClick={handleDeposit}
              disabled={!cardValid || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none',
                background: cardValid && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: cardValid && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: cardValid && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : `Depositar Q${amountNum.toLocaleString()} →`}
            </button>

            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginTop: '14px', lineHeight: 1.5 }}>
              Al confirmar, autorizás el cargo a tu tarjeta. Este pago no se puede cancelar.
            </p>
          </>
        )}

        {/* ── Step 4: Success ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--b1n0-si-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-si)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '6px' , fontVariantNumeric: 'tabular-nums'}}>¡Listo!</p>
            <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', marginBottom: '28px' }}>
              ${amountNum.toLocaleString()} acreditados a tu saldo.
            </p>
            <button
              onClick={handleClose}
              style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-si)', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-on-accent)' }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

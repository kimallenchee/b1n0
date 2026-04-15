import { useState } from 'react'
import { BottomSheet } from '../BottomSheet'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface RetiroSheetProps {
  open: boolean
  onClose: () => void
}

type Step = 'method' | 'amount' | 'bank' | 'done'
type Method = 'transferencia' | 'efectivo'

const methods: { id: Method; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: 'transferencia',
    label: 'Transferencia bancaria',
    sub: 'Acreditación en 1–2 días hábiles',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  {
    id: 'efectivo',
    label: 'Retiro en efectivo',
    sub: 'Puntos autorizados · disponible en 24h',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M2 10h2m16 0h2M2 14h2m16 0h2"/>
      </svg>
    ),
  },
]

const quickAmounts = [50, 100, 250, 500]

export function RetiroSheet({ open, onClose }: RetiroSheetProps) {
  const { refreshProfile } = useAuth()
  const [step, setStep] = useState<Step>('method')
  const [method, setMethod] = useState<Method>('transferencia')
  const [amount, setAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountNum = parseFloat(amount) || 0
  const validAmount = amountNum >= 50

  const handleClose = () => {
    setStep('method')
    setAmount('')
    setBankName('')
    setBankAccount('')
    setBankHolder('')
    setError(null)
    onClose()
  }

  const handleSelectMethod = (m: Method) => {
    setMethod(m)
    setStep('amount')
  }

  const handleAmountNext = () => {
    if (!validAmount) return
    if (method === 'transferencia') {
      setStep('bank')
    } else {
      handleWithdraw()
    }
  }

  const bankValid = bankName.trim().length > 1 && bankAccount.trim().length > 3 && bankHolder.trim().length > 1

  const handleWithdraw = async () => {
    setLoading(true)
    setError(null)

    // TODO: Replace with actual withdrawal processor
    const { data, error: err } = await supabase.rpc('withdraw_balance', {
      p_amount: amountNum,
      p_method: method,
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
    width: '100%', padding: '13px 16px', borderRadius: '12px',
    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
    color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="Retirar">
      <div style={{ padding: '0 20px 40px' }}>

        {/* ── Step 1: Method ── */}
        {step === 'method' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
            {methods.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelectMethod(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '16px 18px', borderRadius: '14px',
                  border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-card-hover-border)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-border)')}
              >
                <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

        {/* ── Step 2: Amount ── */}
        {step === 'amount' && (
          <>
            <button
              onClick={() => setStep('method')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 16px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              ‹ Cambiar método
            </button>

            <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontFamily: D, fontWeight: 700, fontSize: '28px', color: 'var(--b1n0-muted)' }}>Q</span>
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
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '16px 0 24px' }}>
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  style={{
                    padding: '9px 16px', borderRadius: '10px',
                    border: '1px solid var(--b1n0-border)', background: amountNum === q ? 'var(--b1n0-surface)' : 'var(--b1n0-card)',
                    cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px',
                    color: amountNum === q ? 'var(--b1n0-on-accent)' : 'var(--b1n0-text-1)',
                    transition: 'all 0.15s',
                  }}
                >
                  Q{q}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', background: 'var(--b1n0-surface)', marginBottom: '16px' }}>
              <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>
                Método: {method === 'transferencia' ? 'Transferencia' : 'Efectivo'}
              </span>
              <button onClick={() => setStep('method')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>
                Cambiar
              </button>
            </div>

            {!validAmount && amount.length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '12px', textAlign: 'center' }}>
                Mínimo Q50 por retiro.
              </p>
            )}

            {error && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '12px', textAlign: 'center' }}>{error}</p>
            )}

            <button
              onClick={handleAmountNext}
              disabled={!validAmount || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: validAmount && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: validAmount && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: validAmount && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : method === 'transferencia' ? 'Continuar →' : 'Confirmar retiro →'}
            </button>

            {method === 'efectivo' && validAmount && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '14px', textAlign: 'center', lineHeight: 1.5 }}>
                Recibirás un código para presentar en cualquier punto autorizado b1n0.
              </p>
            )}
          </>
        )}

        {/* ── Step 3: Bank details (transferencia only) ── */}
        {step === 'bank' && (
          <>
            <button
              onClick={() => setStep('amount')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 16px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              ‹ Volver
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-text-1)' }}>Q{amountNum.toLocaleString()}</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>Retiro vía transferencia</p>
            </div>

            <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Cuenta destino</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco (ej. Banrural, BI)" style={inputStyle} />
              <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Número de cuenta" style={inputStyle} />
              <input type="text" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} placeholder="Titular de la cuenta" style={inputStyle} />
            </div>

            {error && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '12px', textAlign: 'center' }}>{error}</p>
            )}

            <button
              onClick={handleWithdraw}
              disabled={!bankValid || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: bankValid && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: bankValid && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: bankValid && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : `Retirar Q${amountNum.toLocaleString()} →`}
            </button>

            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginTop: '14px', lineHeight: 1.5 }}>
              Los retiros se procesan en 1–2 días hábiles. No se puede cancelar una vez confirmado.
            </p>
          </>
        )}

        {/* ── Step 4: Success ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--b1n0-si-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>Retiro en proceso</p>
            <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', marginBottom: '28px' }}>
              Q{amountNum.toLocaleString()} vía {method === 'transferencia' ? 'transferencia bancaria' : 'efectivo'}.
            </p>
            <button
              onClick={handleClose}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--b1n0-si)', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-on-accent)' }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

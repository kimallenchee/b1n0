import { useState } from 'react'
import { BottomSheet } from '../BottomSheet'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useVotes } from '../../context/VoteContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface WalletSheetProps {
  open: boolean
  onClose: () => void
  initialTab?: 'depositar' | 'retirar'
}

type DepositMethod = 'tarjeta' | 'transferencia' | 'efectivo'
type RetiroMethod = 'transferencia' | 'efectivo'

type Step = 'home' | 'deposit-method' | 'deposit-amount' | 'deposit-card' | 'retiro-method' | 'retiro-amount' | 'retiro-bank' | 'done'

const depositMethods: { id: DepositMethod; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: 'tarjeta',
    label: 'Tarjeta de débito / crédito',
    sub: 'Acreditación inmediata',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'transferencia',
    label: 'Transferencia bancaria',
    sub: '1–2 días hábiles',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  {
    id: 'efectivo',
    label: 'Depósito en efectivo',
    sub: 'Puntos autorizados · 24h',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  },
]

const retiroMethods: { id: RetiroMethod; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: 'transferencia',
    label: 'Transferencia bancaria',
    sub: '1–2 días hábiles',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  {
    id: 'efectivo',
    label: 'Retiro en efectivo',
    sub: 'Puntos autorizados · 24h',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M2 10h2m16 0h2M2 14h2m16 0h2"/>
      </svg>
    ),
  },
]

const depositQuick = [25, 50, 100, 250]
const retiroQuick = [50, 100, 250, 500]

export function WalletSheet({ open, onClose, initialTab = 'depositar' }: WalletSheetProps) {
  const { refreshProfile } = useAuth()
  const { balance } = useVotes()
  const [tab, setTab] = useState<'depositar' | 'retirar'>(initialTab)
  const [step, setStep] = useState<Step>('home')
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('tarjeta')
  const [retiroMethod, setRetiroMethod] = useState<RetiroMethod>('transferencia')
  const [amount, setAmount] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolder, setBankHolder] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneType, setDoneType] = useState<'deposit' | 'retiro'>('deposit')

  const amountNum = parseFloat(amount) || 0
  const validDepositAmount = amountNum >= 25
  const validRetiroAmount = amountNum >= 50

  const handleClose = () => {
    setStep('home')
    setAmount('')
    setCardNumber(''); setCardExpiry(''); setCardCvc(''); setCardName('')
    setBankName(''); setBankAccount(''); setBankHolder('')
    setError(null)
    onClose()
  }

  const switchTab = (t: 'depositar' | 'retirar') => {
    setTab(t)
    setStep('home')
    setAmount('')
    setError(null)
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
  const bankValid = bankName.trim().length > 1 && bankAccount.trim().length > 3 && bankHolder.trim().length > 1

  // ── Deposit flow ──
  const handleDepositMethodSelect = (m: DepositMethod) => {
    setDepositMethod(m)
    setStep('deposit-amount')
  }
  const handleDepositAmountNext = () => {
    if (!validDepositAmount) return
    if (depositMethod === 'tarjeta') setStep('deposit-card')
    else handleDeposit()
  }
  const handleDeposit = async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.rpc('deposit_balance', { p_amount: amountNum, p_label: `Depósito vía ${depositMethod}` })
    if (err) setError(err.message)
    else if (data?.error) setError(data.error as string)
    else { setDoneType('deposit'); setStep('done'); await refreshProfile() }
    setLoading(false)
  }

  // ── Retiro flow ──
  const handleRetiroMethodSelect = (m: RetiroMethod) => {
    setRetiroMethod(m)
    setStep('retiro-amount')
  }
  const handleRetiroAmountNext = () => {
    if (!validRetiroAmount) return
    if (retiroMethod === 'transferencia') setStep('retiro-bank')
    else handleWithdraw()
  }
  const handleWithdraw = async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.rpc('withdraw_balance', { p_amount: amountNum, p_method: retiroMethod })
    if (err) setError(err.message)
    else if (data?.error) setError(data.error as string)
    else { setDoneType('retiro'); setStep('done'); await refreshProfile() }
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px', borderRadius: '12px',
    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
    color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }

  const isDeposit = tab === 'depositar'

  return (
    <BottomSheet open={open} onClose={handleClose} title="Billetera">
      <div style={{ padding: '0 20px 40px' }}>

        {/* ── Tab switcher ── */}
        {step === 'home' && (
          <>
            {/* Balance display */}
            <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Saldo disponible</p>
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '36px', color: 'var(--b1n0-text-1)', letterSpacing: '-1px', lineHeight: 1 }}>
                Q{balance.toLocaleString()}
              </p>
            </div>

            {/* Deposit / Withdraw toggle */}
            <div style={{ display: 'flex', background: 'var(--b1n0-surface)', borderRadius: '12px', padding: '3px', marginBottom: '16px' }}>
              {(['depositar', 'retirar'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                    background: tab === t ? 'var(--b1n0-card)' : 'transparent',
                    boxShadow: tab === t ? '0 1px 3px var(--b1n0-border)' : 'none',
                    cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px',
                    color: tab === t ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {t === 'depositar' ? '↓ Depositar' : '↑ Retirar'}
                </button>
              ))}
            </div>

            {/* Method list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(isDeposit ? depositMethods : retiroMethods).map((m) => (
                <button
                  key={m.id}
                  onClick={() => isDeposit ? handleDepositMethodSelect(m.id as DepositMethod) : handleRetiroMethodSelect(m.id as RetiroMethod)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '14px 16px', borderRadius: '12px',
                    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-card-hover-border)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-border)')}
                >
                  <div style={{ width: 36, height: 36, borderRadius: '10px', background: isDeposit ? 'var(--b1n0-si-bg)' : 'var(--status-enjuego-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {m.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)', marginBottom: '1px' }}>{m.label}</p>
                    <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{m.sub}</p>
                  </div>
                  <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Deposit: Amount ── */}
        {step === 'deposit-amount' && (
          <>
            <button onClick={() => setStep('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ‹ Cambiar método
            </button>

            {/* Direction badge */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-si)', background: 'var(--b1n0-si-bg)', borderRadius: '6px', padding: '4px 10px' }}>
                ↓ DEPOSITAR
              </span>
            </div>

            <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
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

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '16px 0 20px' }}>
              {depositQuick.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(amountNum + q))}
                  style={{
                    padding: '8px 16px', borderRadius: '10px',
                    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                    cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-text-1)',
                  }}
                >
                  +Q{q}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: 'var(--b1n0-surface)', marginBottom: '14px' }}>
              <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>
                Método: {depositMethod === 'tarjeta' ? 'Tarjeta' : depositMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'}
              </span>
              <button onClick={() => setStep('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>Cambiar</button>
            </div>

            {!validDepositAmount && amount.length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '10px', textAlign: 'center' }}>Mínimo Q25 por depósito.</p>
            )}
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}

            <button
              onClick={handleDepositAmountNext}
              disabled={!validDepositAmount || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: validDepositAmount && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: validDepositAmount && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: validDepositAmount && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : depositMethod === 'tarjeta' ? 'Continuar →' : 'Confirmar depósito →'}
            </button>

            {depositMethod === 'transferencia' && validDepositAmount && (
              <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: 'var(--b1n0-surface)' }}>
                <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Datos para transferencia</p>
                {[
                  { l: 'Banco', v: 'Banco Industrial' },
                  { l: 'Cuenta', v: '000-000000-0' },
                  { l: 'Nombre', v: 'b1n0 S.A.' },
                  { l: 'Referencia', v: 'Tu usuario' },
                ].map(({ l, v }) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{l}</span>
                    <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {depositMethod === 'efectivo' && validDepositAmount && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '12px', textAlign: 'center', lineHeight: 1.5 }}>
                Presentá el código que recibirás en cualquier punto autorizado b1n0.
              </p>
            )}
          </>
        )}

        {/* ── Deposit: Card ── */}
        {step === 'deposit-card' && (
          <>
            <button onClick={() => setStep('deposit-amount')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ‹ Volver
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-si)', background: 'var(--b1n0-si-bg)', borderRadius: '6px', padding: '4px 10px' }}>↓ DEPOSITAR</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-text-1)' }}>Q{amountNum.toLocaleString()}</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>Depósito vía tarjeta</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              <input type="text" value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="Número de tarjeta" maxLength={19} style={inputStyle} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="text" value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/AA" maxLength={5} style={{ ...inputStyle, width: '50%' }} />
                <input type="text" value={cardCvc} onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="CVC" maxLength={4} style={{ ...inputStyle, width: '50%' }} />
              </div>
              <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Nombre en la tarjeta" style={inputStyle} />
            </div>
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}
            <button
              onClick={handleDeposit}
              disabled={!cardValid || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: cardValid && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: cardValid && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: cardValid && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : `Depositar Q${amountNum.toLocaleString()} →`}
            </button>
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginTop: '12px', lineHeight: 1.5 }}>
              Al confirmar, autorizás el cargo a tu tarjeta.
            </p>
          </>
        )}

        {/* ── Retiro: Amount ── */}
        {step === 'retiro-amount' && (
          <>
            <button onClick={() => setStep('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ‹ Cambiar método
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-gold)', background: 'var(--status-enjuego-bg)', borderRadius: '6px', padding: '4px 10px' }}>
                ↑ RETIRAR
              </span>
            </div>

            <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
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
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '6px' }}>
                Disponible: Q{balance.toLocaleString()}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '16px 0 20px' }}>
              {retiroQuick.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  style={{
                    padding: '8px 14px', borderRadius: '10px',
                    border: '1px solid var(--b1n0-border)',
                    background: amountNum === q ? 'var(--b1n0-text-1)' : 'var(--b1n0-card)',
                    cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px',
                    color: amountNum === q ? 'var(--b1n0-on-accent)' : 'var(--b1n0-text-1)',
                  }}
                >
                  Q{q}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: 'var(--b1n0-surface)', marginBottom: '14px' }}>
              <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>
                Método: {retiroMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'}
              </span>
              <button onClick={() => setStep('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>Cambiar</button>
            </div>

            {!validRetiroAmount && amount.length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '10px', textAlign: 'center' }}>Mínimo Q50 por retiro.</p>
            )}
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}

            <button
              onClick={handleRetiroAmountNext}
              disabled={!validRetiroAmount || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: validRetiroAmount && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: validRetiroAmount && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: validRetiroAmount && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : retiroMethod === 'transferencia' ? 'Continuar →' : 'Confirmar retiro →'}
            </button>

            {retiroMethod === 'efectivo' && validRetiroAmount && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '12px', textAlign: 'center', lineHeight: 1.5 }}>
                Recibirás un código para presentar en cualquier punto autorizado b1n0.
              </p>
            )}
          </>
        )}

        {/* ── Retiro: Bank details ── */}
        {step === 'retiro-bank' && (
          <>
            <button onClick={() => setStep('retiro-amount')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ‹ Volver
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-gold)', background: 'var(--status-enjuego-bg)', borderRadius: '6px', padding: '4px 10px' }}>↑ RETIRAR</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-text-1)' }}>Q{amountNum.toLocaleString()}</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>Retiro vía transferencia</p>
            </div>
            <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Cuenta destino</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco (ej. Banrural, BI)" style={inputStyle} />
              <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Número de cuenta" style={inputStyle} />
              <input type="text" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} placeholder="Titular de la cuenta" style={inputStyle} />
            </div>
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}
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
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginTop: '12px', lineHeight: 1.5 }}>
              Los retiros se procesan en 1–2 días hábiles.
            </p>
          </>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: doneType === 'deposit' ? 'var(--b1n0-si-bg)' : 'var(--status-enjuego-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={doneType === 'deposit' ? 'var(--b1n0-si)' : 'var(--b1n0-gold)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>
              {doneType === 'deposit' ? '¡Listo!' : 'Retiro en proceso'}
            </p>
            <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', marginBottom: '28px' }}>
              {doneType === 'deposit'
                ? `Q${amountNum.toLocaleString()} acreditados a tu saldo.`
                : `Q${amountNum.toLocaleString()} vía ${retiroMethod === 'transferencia' ? 'transferencia bancaria' : 'efectivo'}.`
              }
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

import { useState } from 'react'
import { CreditCard, CurrencyDollar, Money, Warning } from '@phosphor-icons/react'
import { BottomSheet } from '../BottomSheet'
import { AnimatedNumber } from '../AnimatedNumber'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useVotes } from '../../context/VoteContext'
import { PagaditoIframeSheet } from './PagaditoIframeSheet'
import { usePaymentFlags } from '../../hooks/usePaymentFlags'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

interface WalletSheetProps {
  open: boolean
  onClose: () => void
  initialTab?: 'depositar' | 'retirar'
}

type DepositMethod = 'tarjeta' | 'transferencia'
type RetiroMethod = 'tarjeta' | 'transferencia'

type Step = 'home' | 'deposit-method' | 'deposit-amount' | 'deposit-card' | 'retiro-method' | 'retiro-amount' | 'retiro-bank' | 'done'

// Method definitions are static. The "Próximamente" badge is layered
// on at render time based on the corresponding feature flag — keeps
// the method list as a single source of truth and lets each flag
// flip independently when its vendor signs.
interface MethodDef<T extends string> {
  id: T
  label: string
  sub: string
  icon: React.ReactNode
  /** Which feature flag gates this method ('cardDeposits' | 'bankDeposits' | etc). */
  flag: 'cardDeposits' | 'cardWithdrawals' | 'bankDeposits' | 'bankWithdrawals'
}

const depositMethods: MethodDef<DepositMethod>[] = [
  {
    id: 'tarjeta',
    label: 'Tarjeta de débito / crédito',
    sub: 'Acreditación inmediata',
    icon: <CreditCard size={20} weight="regular" color="var(--b1n0-text-1)" />,
    flag: 'cardDeposits',
  },
  {
    id: 'transferencia',
    label: 'Cuenta bancaria',
    sub: '1–2 días hábiles',
    icon: <CurrencyDollar size={20} weight="regular" color="var(--b1n0-text-1)" />,
    flag: 'bankDeposits',
  },
]

const retiroMethods: MethodDef<RetiroMethod>[] = [
  {
    id: 'tarjeta',
    label: 'Tarjeta de débito / crédito',
    sub: 'Devolución a la tarjeta original',
    icon: <CreditCard size={20} weight="regular" color="var(--b1n0-text-1)" />,
    flag: 'cardWithdrawals',
  },
  {
    id: 'transferencia',
    label: 'Cuenta bancaria',
    sub: '1–2 días hábiles',
    icon: <Money size={20} weight="regular" color="var(--b1n0-text-1)" />,
    flag: 'bankWithdrawals',
  },
]

const depositQuick = [25, 50, 100, 250]
const retiroQuick = [50, 100, 250, 500]

export function WalletSheet({ open, onClose, initialTab = 'depositar' }: WalletSheetProps) {
  const { refreshProfile, profile } = useAuth()
  const { balance } = useVotes()
  // Risk acknowledgment gate. Renders an inline disclosure overlay
  // when the user clicks a deposit method for the first time AND
  // has never acknowledged. acknowledge_risk RPC writes a server-side
  // timestamp the first time it's called and returns the existing
  // timestamp on subsequent calls — idempotent audit primitive for
  // regulator inquiries.
  const needsRiskAck = profile != null && profile.riskAcknowledgedAt == null
  const [showRiskModal, setShowRiskModal] = useState(false)
  const [pendingMethod, setPendingMethod] = useState<DepositMethod | null>(null)
  const [ackLoading, setAckLoading] = useState(false)
  async function handleAcceptRisk() {
    setAckLoading(true)
    try {
      await supabase.rpc('acknowledge_risk')
      await refreshProfile()
      if (pendingMethod) {
        setDepositMethod(pendingMethod)
        setStep('deposit-amount')
        setPendingMethod(null)
      }
      setShowRiskModal(false)
    } finally {
      setAckLoading(false)
    }
  }
  function handleCancelRisk() {
    setShowRiskModal(false)
    setPendingMethod(null)
  }
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
  // Pagadito iframe overlay state — when true, the full-screen
  // PagaditoIframeSheet sits on top of this BottomSheet and the user
  // completes the card flow inside Pagadito's hosted UI.
  const [pagaditoOpen, setPagaditoOpen] = useState(false)

  // Feature flags — each (rail, direction) pair flips on independently
  // when the relevant vendor contract goes live. While false, the UI
  // shows the method but with a "Próximamente" badge and the click is
  // a no-op (no broken server roundtrip).
  const flags = usePaymentFlags()

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
    // First-deposit risk gate: if the user has never acknowledged,
    // intercept here. The modal will set step + method on accept.
    if (needsRiskAck) {
      setPendingMethod(m)
      setShowRiskModal(true)
      return
    }
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
    width: '100%', padding: '13px 16px', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
    color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }

  const isDeposit = tab === 'depositar'

  // Inline risk-acknowledgment overlay. Rendered as a sibling to
  // BottomSheet so it stacks above with its own z-index. We keep the
  // JSX inline (no extracted component) to avoid Vite tree-shaking
  // issues we saw with a standalone RiskModal file — this guarantees
  // the disclosure code lives in the same module that the app already
  // resolves and bundles.
  const riskOverlay = showRiskModal ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={handleCancelRisk}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460, width: '100%',
          background: 'var(--b1n0-card)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          fontFamily: F,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-4)' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--b1n0-no-bg, rgba(245,158,11,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Warning size={22} weight="bold" color="var(--b1n0-no)" />
          </div>
          <h2 id="risk-modal-title" style={{
            fontFamily: D, fontSize: 20, fontWeight: 800,
            color: 'var(--b1n0-text-1)', margin: 0, letterSpacing: '-0.5px',
          }}>
            Antes de continuar
          </h2>
        </div>
        <p style={{ fontSize: 14, color: 'var(--b1n0-text-1)', margin: 0, marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
          Antes de hacer tu primer depósito, queremos que tengas claro qué es y qué no es b1n0:
        </p>
        <ul style={{
          margin: 0, marginBottom: 'var(--space-5)',
          paddingLeft: 0, listStyle: 'none',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
        }}>
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: 'var(--b1n0-text-1)', lineHeight: 1.55 }}>
            <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: 'var(--b1n0-no)', marginTop: 7 }} />
            <span>Los votos implican <strong>riesgo de pérdida del capital</strong>. No hay retornos garantizados.</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: 'var(--b1n0-text-1)', lineHeight: 1.55 }}>
            <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: 'var(--b1n0-no)', marginTop: 7 }} />
            <span>b1n0 <strong>no es una inversión</strong>, no es un instrumento financiero, no es una casa de apuestas y no es un casino.</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: 'var(--b1n0-text-1)', lineHeight: 1.55 }}>
            <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: 'var(--b1n0-no)', marginTop: 7 }} />
            <span>El acceso es para <strong>mayores de 18 años</strong>.</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: 'var(--b1n0-text-1)', lineHeight: 1.55 }}>
            <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: 'var(--b1n0-no)', marginTop: 7 }} />
            <span>Sos responsable de cumplir las leyes y obligaciones fiscales aplicables en tu jurisdicción.</span>
          </li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--b1n0-muted)', margin: 0, marginBottom: 'var(--space-5)', lineHeight: 1.55 }}>
          Tu aceptación queda registrada con fecha y hora. Términos completos en{' '}
          <a href="/terminos" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--b1n0-si)', textDecoration: 'underline' }}>/terminos</a>.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            onClick={handleCancelRisk}
            disabled={ackLoading}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 'var(--radius-pill)',
              background: 'transparent', border: '1px solid var(--b1n0-border)',
              color: 'var(--b1n0-muted)', fontFamily: F, fontSize: 14, fontWeight: 600,
              cursor: ackLoading ? 'default' : 'pointer', opacity: ackLoading ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleAcceptRisk}
            disabled={ackLoading}
            style={{
              flex: 2, padding: '12px 16px', borderRadius: 'var(--radius-pill)',
              background: 'var(--b1n0-si)', border: 'none',
              color: 'var(--b1n0-on-accent)', fontFamily: F, fontSize: 14, fontWeight: 700,
              cursor: ackLoading ? 'default' : 'pointer', opacity: ackLoading ? 0.7 : 1,
            }}
          >
            {ackLoading ? 'Registrando…' : 'Entiendo y acepto'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
    {riskOverlay}
    <BottomSheet open={open} onClose={handleClose} title="Billetera">
      <div style={{ padding: '0 20px 40px' }}>

        {/* ── Tab switcher ── */}
        {step === 'home' && (
          <>
            {/* Balance display */}
            <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Saldo disponible</p>
              <AnimatedNumber
                value={balance}
                prefix="$"
                decimals={2}
                duration={650}
                style={{
                  display: 'block',
                  fontFamily: D,
                  fontWeight: 800,
                  fontSize: '36px',
                  color: 'var(--b1n0-text-1)',
                  letterSpacing: '-1px',
                  lineHeight: 1,
                }}
              />
            </div>

            {/* Deposit / Withdraw toggle — slim sliding-underline (canonical) */}
            <div style={{ position: 'relative', display: 'flex', marginBottom: '18px', borderBottom: '1px solid var(--b1n0-border)' }}>
              {(['depositar', 'retirar'] as const).map((t) => {
                const isOn = tab === t
                return (
                  <button
                    key={t}
                    onClick={() => switchTab(t)}
                    style={{
                      flex: 1,
                      padding: '10px 4px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: F,
                      fontWeight: 600,
                      fontSize: '13px',
                      color: isOn ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                      letterSpacing: 'var(--tracking-tight)',
                      transition: 'color var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    {t === 'depositar' ? '↓ Depositar' : '↑ Retirar'}
                  </button>
                )
              })}
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: -1,
                  left: tab === 'depositar' ? 0 : '50%',
                  width: '50%',
                  height: 2,
                  background: 'var(--b1n0-si)',
                  borderRadius: '2px 2px 0 0',
                  transition: 'left var(--duration-base) var(--ease-out)',
                }}
              />
            </div>

            {/* Method list.
                Each method's `flag` decides whether the tile is live or
                "Próximamente". A disabled tile is dimmed, shows the badge,
                and click is a no-op (no broken server roundtrip until
                Kim signs the vendor and flips the flag in platform_config). */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(isDeposit ? depositMethods : retiroMethods).map((m) => {
                const enabled = flags[m.flag]
                return (
                  <button
                    key={m.id}
                    disabled={!enabled}
                    onClick={() => {
                      if (!enabled) return
                      if (isDeposit) handleDepositMethodSelect(m.id as DepositMethod)
                      else handleRetiroMethodSelect(m.id as RetiroMethod)
                    }}
                    aria-disabled={!enabled}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '14px 16px', borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                      cursor: enabled ? 'pointer' : 'default',
                      textAlign: 'left', width: '100%',
                      transition: 'border-color 0.15s, opacity 0.15s',
                      opacity: enabled ? 1 : 0.55,
                    }}
                    onMouseEnter={(e) => { if (enabled) e.currentTarget.style.borderColor = 'var(--b1n0-card-hover-border)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-border)' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', background: isDeposit ? 'var(--b1n0-si-bg)' : 'var(--status-enjuego-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {m.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                        <p style={{ fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)', margin: 0 }}>{m.label}</p>
                        {!enabled && !flags.loading && (
                          <span
                            style={{
                              fontFamily: F,
                              fontSize: '9px',
                              fontWeight: 700,
                              letterSpacing: '0.5px',
                              textTransform: 'uppercase',
                              color: 'var(--b1n0-muted)',
                              background: 'var(--b1n0-surface)',
                              border: '1px solid var(--b1n0-border)',
                              borderRadius: 999,
                              padding: '2px 7px',
                            }}
                          >
                            Próximamente
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{m.sub}</p>
                    </div>
                    {enabled && (
                      <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>›</span>
                    )}
                  </button>
                )
              })}
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
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-si)', background: 'var(--b1n0-si-bg)', borderRadius: 'var(--radius-md)', padding: '4px 10px' }}>
                ↓ DEPOSITAR
              </span>
            </div>

            <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
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
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '16px 0 20px' }}>
              {depositQuick.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(amountNum + q))}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                    cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-text-1)',
                  }}
                >
                  +${q}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--b1n0-surface)', marginBottom: '14px' }}>
              <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>
                Método: {depositMethod === 'tarjeta' ? 'Tarjeta' : 'Cuenta bancaria'}
              </span>
              <button onClick={() => setStep('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>Cambiar</button>
            </div>

            {!validDepositAmount && amount.length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '10px', textAlign: 'center' }}>Mínimo Q25 por depósito.</p>
            )}
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}

            <button
              onClick={handleDepositAmountNext}
              disabled={!validDepositAmount || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none',
                background: validDepositAmount && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: validDepositAmount && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: validDepositAmount && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : depositMethod === 'tarjeta' ? 'Continuar →' : 'Confirmar depósito →'}
            </button>

            {depositMethod === 'transferencia' && validDepositAmount && (
              <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--b1n0-surface)' }}>
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
          </>
        )}

        {/* ── Deposit: Card ──
            The actual card capture happens in Pagadito's hosted iframe
            (PagaditoIframeSheet). This step is just the launch screen
            confirming what the user is about to pay. The iframe sheet
            covers the whole viewport once opened. */}
        {step === 'deposit-card' && (
          <>
            <button onClick={() => setStep('deposit-amount')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ‹ Volver
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-si)', background: 'var(--b1n0-si-bg)', borderRadius: 'var(--radius-md)', padding: '4px 10px' }}>↓ DEPOSITAR</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-text-1)' , fontVariantNumeric: 'tabular-nums'}}>${amountNum.toLocaleString()}</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>Depósito vía tarjeta</p>
            </div>
            <div
              style={{
                background: 'var(--b1n0-card)',
                border: '1px solid var(--b1n0-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '14px',
                marginBottom: '14px',
              }}
            >
              <p style={{ fontFamily: F, fontSize: 12, color: 'var(--b1n0-muted)', margin: 0, lineHeight: 1.55 }}>
                Vas a completar el pago en una ventana segura de <strong style={{ color: 'var(--b1n0-text-1)' }}>Pagadito</strong>.
                Tus datos de tarjeta nunca pasan por b1n0.
              </p>
            </div>
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}
            <button
              onClick={() => setPagaditoOpen(true)}
              disabled={loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none',
                background: !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              Continuar a Pagadito →
            </button>
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginTop: '12px', lineHeight: 1.5 }}>
              Procesamiento seguro · PCI DSS · El cargo aparece como "B1N0".
            </p>
          </>
        )}

        {/* Pagadito iframe — full-screen overlay, mounted only when needed.
            Sits above the WalletSheet via z-index 1500. */}
        {pagaditoOpen && (
          <PagaditoIframeSheet
            amount={amountNum}
            currency="USD"
            description={`Saldo b1n0 ${amountNum.toFixed(2)} USD`}
            onClose={() => setPagaditoOpen(false)}
            onSuccess={async (settledAmount) => {
              setPagaditoOpen(false)
              setAmount(String(settledAmount))
              setDoneType('deposit')
              setStep('done')
              await refreshProfile()
            }}
          />
        )}

        {/* ── Retiro: Amount ── */}
        {step === 'retiro-amount' && (
          <>
            <button onClick={() => setStep('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '4px 0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ‹ Cambiar método
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-gold)', background: 'var(--status-enjuego-bg)', borderRadius: 'var(--radius-md)', padding: '4px 10px' }}>
                ↑ RETIRAR
              </span>
            </div>

            <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
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
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '6px' }}>
                Disponible: ${balance.toLocaleString()}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '16px 0 20px' }}>
              {retiroQuick.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  style={{
                    padding: '8px 14px', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--b1n0-border)',
                    background: amountNum === q ? 'var(--b1n0-text-1)' : 'var(--b1n0-card)',
                    cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px',
                    color: amountNum === q ? 'var(--b1n0-on-accent)' : 'var(--b1n0-text-1)',
                  }}
                >
                  ${q}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--b1n0-surface)', marginBottom: '14px' }}>
              <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>
                Método: {retiroMethod === 'transferencia' ? 'Cuenta bancaria' : 'Tarjeta'}
              </span>
              <button onClick={() => setStep('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>Cambiar</button>
            </div>

            {!validRetiroAmount && amount.length > 0 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '10px', textAlign: 'center' }}>Mínimo Q50 por retiro.</p>
            )}
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}

            <button
              onClick={handleRetiroAmountNext}
              disabled={!validRetiroAmount || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none',
                background: validRetiroAmount && !loading ? 'var(--b1n0-si)' : 'var(--b1n0-disabled-bg)',
                cursor: validRetiroAmount && !loading ? 'pointer' : 'default',
                fontFamily: F, fontWeight: 700, fontSize: '14px', color: validRetiroAmount && !loading ? 'var(--b1n0-on-accent)' : 'var(--b1n0-muted)',
              }}
            >
              {loading ? 'Procesando...' : retiroMethod === 'transferencia' ? 'Continuar →' : 'Confirmar retiro →'}
            </button>

            {retiroMethod === 'tarjeta' && validRetiroAmount && (
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '12px', textAlign: 'center', lineHeight: 1.5 }}>
                El monto será devuelto a la tarjeta original utilizada para depositar.
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
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-gold)', background: 'var(--status-enjuego-bg)', borderRadius: 'var(--radius-md)', padding: '4px 10px' }}>↑ RETIRAR</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-text-1)' , fontVariantNumeric: 'tabular-nums'}}>${amountNum.toLocaleString()}</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '4px' }}>Retiro vía transferencia</p>
            </div>
            <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Cuenta destino</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco (ej. Banrural, BI)" style={inputStyle} />
              <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Número de cuenta" style={inputStyle} />
              <input type="text" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} placeholder="Titular de la cuenta" style={inputStyle} />
            </div>
            {error && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-error)', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}
            <button
              onClick={handleWithdraw}
              disabled={!bankValid || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none',
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
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '6px' , fontVariantNumeric: 'tabular-nums'}}>
              {doneType === 'deposit' ? '¡Listo!' : 'Retiro en proceso'}
            </p>
            <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', marginBottom: '28px' }}>
              {doneType === 'deposit'
                ? `Q${amountNum.toLocaleString()} acreditados a tu saldo.`
                : `Q${amountNum.toLocaleString()} vía ${retiroMethod === 'transferencia' ? 'cuenta bancaria' : 'tarjeta'}.`
              }
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
    </>
  )
}

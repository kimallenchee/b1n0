import { useState, useEffect } from 'react'
import type { Event } from '../../types'
import { SplitBar } from './SplitBar'
import { useAuth } from '../../context/AuthContext'
import { usePricingEngine } from '../../hooks/usePricingEngine'
import type { MarketState } from '../../lib/pricing'
import { midPctToAsk } from '../../lib/pricing'
import { supabase } from '../../lib/supabase'

interface EntryFlowProps {
  event: Event
  onClose: () => void
  onConfirm: (side: string, amount: number, skipRpc?: boolean, cobro?: number) => void
  initialSide?: string
  compact?: boolean
}

// "Messi::yes" → "Messi — SÍ", "yes" → "SÍ", etc.
function displaySide(s: string): string {
  if (s === 'yes') return 'SÍ'
  if (s === 'no') return 'NO'
  if (s.includes('::')) {
    const [label, dir] = s.split('::')
    return `${label} — ${dir === 'yes' ? 'SÍ' : 'NO'}`
  }
  return s
}

function compositeLabel(s: string): string {
  return s.includes('::') ? s.split('::')[0] : s
}
function compositeDir(s: string): 'yes' | 'no' {
  return s.includes('::') ? (s.split('::')[1] as 'yes' | 'no') : 'yes'
}

interface OptionItem { label: string; pct: number }

const quickPicks = [25, 50, 100, 250]


function parseOptionItems(options: string[] | undefined): OptionItem[] {
  if (!options) return []
  return options.map((o) => {
    const parts = o.split(':')
    if (parts.length >= 3) {
      const pct = parseFloat(parts[parts.length - 2]) || 0
      const label = parts.slice(0, parts.length - 2).join(':')
      return { label, pct }
    }
    if (parts.length === 2) return { label: parts[0], pct: parseFloat(parts[1]) || 0 }
    return { label: o, pct: 0 }
  })
}

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

export function EntryFlow({ event, onClose, onConfirm, initialSide, compact = false }: EntryFlowProps) {
  const { session } = useAuth()
  const isOpen = event.eventType === 'open'

  const tierLocked = false
  const openOptions = parseOptionItems(event.options)

  const [step, setStep] = useState<1 | 2 | 3>(initialSide ? 2 : 1)
  const [side, setSide] = useState<string | null>(initialSide ?? null)
  const [amount, setAmount] = useState<string>('')
  const [market, setMarket] = useState<MarketState | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // Option pricing preview (for open events)
  const [optionPreview, setOptionPreview] = useState<import('../../lib/pricing').PurchasePreview | null>(null)
  // Live option percentages from option_markets shares
  const [liveOptPcts, setLiveOptPcts] = useState<Record<string, number>>({})

  const { preview, previewPurchaseRpc, executePurchase, executeOptionPurchase, previewOptionPurchase, fetchMarket, fetchOptionMarkets, lastErrorRef } = usePricingEngine(market)

  // Fetch binary market on mount, or option markets for open events
  useEffect(() => {
    if (!isOpen) {
      fetchMarket(event.id).then((m) => { if (m) setMarket(m) })
    } else {
      fetchOptionMarkets(event.id).then((opts) => {
        const pcts: Record<string, number> = {}
        for (const o of opts) {
          const total = o.yesShares + o.noShares
          pcts[o.optionLabel] = total > 0 ? Math.round(o.yesShares / total * 100) : 50
        }
        setLiveOptPcts(pcts)
      })
    }
  }, [event.id, isOpen])

  // Fetch option preview when side/amount changes (open events)
  const amountNum = parseFloat(amount) || 0

  useEffect(() => {
    if (!isOpen || !side || amountNum <= 0) { setOptionPreview(null); return }
    let cancelled = false
    // Use preview_purchase with composite side (e.g. "España::yes") — same as desktop panel
    const compositeSide = side.includes('::') ? side : `${side}::yes`
    const t = setTimeout(async () => {
      const { data, error: rpcErr } = await supabase.rpc('preview_purchase', {
        p_event_id: event.id,
        p_side: compositeSide,
        p_gross: amountNum,
      })
      if (cancelled) return
      if (rpcErr || !data || !data.valid) { setOptionPreview(null); return }
      setOptionPreview({
        grossAmount: amountNum,
        fee:            Number(data.fee) || 0,
        feeRate:        Number(data.fee_rate) || 0,
        net:            Number(data.net) || 0,
        price:          Number(data.price) || 0,
        midPrice:       Number(data.mid_price) || 0,
        spreadRate:     Number(data.spread_rate) || 0,
        spreadCaptured: 0,
        contracts:      Number(data.contracts) || 0,
        payoutIfWin:    Number(data.payout_if_win || data.est_payout) || 0,
        yesLiaAfter:    0,
        noLiaAfter:     0,
        poolAfter: {
          committed: Number(data.pool_committed) || 0,
          remaining: Number(data.pool_remaining) || 0,
          pctUsed:   Number(data.pool_total) > 0 ? (Number(data.pool_committed) / Number(data.pool_total)) : 0,
        },
        valid: true,
      })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isOpen, event.id, side, amountNum])

  // For binary: use RPC preview (dynamic fees)
  const [binaryPreview, setBinaryPreview] = useState<import('../../lib/pricing').PurchasePreview | null>(null)
  useEffect(() => {
    if (isOpen || !side || amountNum <= 0) { setBinaryPreview(null); return }
    let cancelled = false
    previewPurchaseRpc(event.id, side as 'yes' | 'no', amountNum).then((rpcPx) => {
      if (!cancelled) {
        if (rpcPx) {
          setBinaryPreview(rpcPx)
        } else {
          // Fallback to client-side if RPC fails
          setBinaryPreview(preview(side as 'yes' | 'no', amountNum))
        }
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, event.id, side, amountNum])

  // Use option preview for open events, binary RPC preview for binary
  const activePx = isOpen ? optionPreview : binaryPreview

  const cobro    = activePx?.payoutIfWin ?? 0
  const fee      = activePx?.fee ?? null
  const feeRatePct = activePx?.feeRate && activePx.feeRate > 0
    ? (activePx.feeRate * 100).toFixed(1)
    : fee !== null && amountNum > 0
      ? (Math.round((fee / amountNum) * 1000) / 10).toFixed(1)
      : '—'
  const price    = activePx?.price ?? null
  const poolFull = activePx?.valid === false && activePx.reason === 'Pool cap reached'

  const yesDisplayPct = market
    ? Math.round((market.yesShares / (market.yesShares + market.noShares)) * 100)
    : event.yesPercent
  const noDisplayPct = market
    ? Math.round((market.noShares / (market.yesShares + market.noShares)) * 100)
    : event.noPercent

  const amountValid = amountNum >= event.minEntry && amountNum <= event.maxEntry && !poolFull

  const handleSideSelect = (s: string) => {
    setSide(s)
    setStep(2)
  }


  const handleConfirm = async () => {
    if (!side) return
    setConfirming(true)
    setConfirmError(null)

    let usedPricingEngine = false

    if (isOpen && session?.user?.id) {
      // Open event: use execute_option_purchase
      const label = compositeLabel(side)
      const dir = compositeDir(side)
      const result = await executeOptionPurchase(event.id, session.user.id, label, dir, amountNum)
      if (!result) {
        const errMsg = lastErrorRef.current ?? 'No se pudo registrar. Intentá de nuevo.'
        setConfirmError(errMsg)
        setConfirming(false)
        return
      }
      usedPricingEngine = true
    } else if (!isOpen && session?.user?.id) {
      // Binary event: use execute_purchase (always use RPC, market state not needed)
      const result = await executePurchase(event.id, session.user.id, side as 'yes' | 'no', amountNum)
      if (!result) {
        const errMsg = lastErrorRef.current ?? 'No se pudo registrar. Intentá de nuevo.'
        setConfirmError(errMsg)
        setConfirming(false)
        return
      }
      usedPricingEngine = true
      fetchMarket(event.id).then((m) => { if (m) setMarket(m) })
    }

    setConfirming(false)
    onConfirm(side, amountNum, usedPricingEngine, cobro)
  }

  return (
    <div
      style={{ background: 'var(--b1n0-surface)', borderRadius: '14px', padding: '18px', marginTop: '12px', border: '1px solid rgba(255,255,255,0.06)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Tier locked ── */}
      {tierLocked && (
        <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>
            Nivel {event.tierRequired} requerido
          </p>
          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            Este evento requiere Nivel {event.tierRequired}. Verificá tu cuenta para participar.
          </p>
          <a
            href="/perfil"
            style={{ display: 'inline-block', padding: '11px 24px', borderRadius: '10px', background: 'var(--b1n0-text-1)', color: 'var(--b1n0-bg)', fontFamily: F, fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}
          >
            Subir a Nivel {event.tierRequired} →
          </a>
          <button
            onClick={onClose}
            style={{ display: 'block', width: '100%', marginTop: '10px', padding: '10px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ── Step 1: Pick side / option ── */}
      {!tierLocked && step === 1 && (
        <div>
          {isOpen ? (
            /* Open event: option list with tug-of-war bars */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {openOptions.map((opt) => {
                const livePct = liveOptPcts[opt.label] ?? opt.pct
                return (
                  <div key={opt.label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-text-1)' }}>{opt.label}</span>
                    </div>
                    <SplitBar
                      yesPercent={livePct}
                      noPercent={100 - livePct}
                      compact
                      onClickSi={() => handleSideSelect(`${opt.label}::yes`)}
                      onClickNo={() => handleSideSelect(`${opt.label}::no`)}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            /* Binary: green/red pills matching desktop */
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleSideSelect('yes')}
                style={{ flex: 1, padding: '12px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: '14px', fontWeight: 700, transition: 'all 0.15s',
                  background: 'var(--b1n0-si)', color: '#fff',
                }}
              >
                SÍ {midPctToAsk(yesDisplayPct).toFixed(2)}
              </button>
              <button
                onClick={() => handleSideSelect('no')}
                style={{ flex: 1, padding: '12px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: '14px', fontWeight: 700, transition: 'all 0.15s',
                  background: 'var(--b1n0-no)', color: '#fff',
                }}
              >
                NO {midPctToAsk(noDisplayPct).toFixed(2)}
              </button>
            </div>
          )}

          <button onClick={onClose} style={{ marginTop: '12px', width: '100%', padding: '10px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>
            Cerrar
          </button>
        </div>
      )}

      {/* ── Step 2: Amount + Confirm (combined) ── */}
      {!tierLocked && step === 2 && (
        <div>
          {/* Side toggle — switch without going back */}
          {!isOpen ? (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button
                onClick={() => setSide('yes')}
                style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: '13px', fontWeight: 700, transition: 'all 0.15s',
                  background: side === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-si-bg)',
                  color: side === 'yes' ? '#fff' : 'var(--b1n0-si)',
                }}
              >
                SÍ {midPctToAsk(yesDisplayPct).toFixed(2)}
              </button>
              <button
                onClick={() => setSide('no')}
                style={{ flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: '13px', fontWeight: 700, transition: 'all 0.15s',
                  background: side === 'no' ? 'var(--b1n0-no)' : 'var(--b1n0-no-bg)',
                  color: side === 'no' ? '#fff' : 'var(--b1n0-no)',
                }}
              >
                NO {midPctToAsk(noDisplayPct).toFixed(2)}
              </button>
            </div>
          ) : (
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>{side ? displaySide(side) : ''}</span>
              <button onClick={() => setStep(1)} style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-teal-500)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cambiar</button>
            </div>
          )}

          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '10px' }}>¿Cuánto querés poner?</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--b1n0-card)', borderRadius: '10px', padding: '12px 16px', border: '1px solid var(--b1n0-border)', marginBottom: '12px' }}>
            <span style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-muted)' }}>{event.currency}</span>
            <input
              autoFocus
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min={event.minEntry}
              max={event.maxEntry}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: D, fontWeight: 700, fontSize: '22px', color: 'var(--b1n0-text-1)', letterSpacing: '-1px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {quickPicks.filter((q) => q <= event.maxEntry).map((q) => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: `1px solid ${amount === String(q) ? 'var(--b1n0-text-1)' : 'var(--b1n0-border)'}`, background: amount === String(q) ? 'var(--b1n0-card)' : 'var(--b1n0-surface)', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 500, color: amount === String(q) ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)' }}
              >
                {event.currency}{q}
              </button>
            ))}
          </div>

          {/* Amount slider */}
          <div style={{ marginBottom: '14px', padding: '0 2px' }}>
            <input
              type="range"
              min={event.minEntry}
              max={event.maxEntry}
              step={event.minEntry >= 50 ? 10 : 5}
              value={amountNum || event.minEntry}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: '100%', accentColor: 'var(--b1n0-surface)', cursor: 'pointer', height: '6px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>{event.currency}{event.minEntry}</span>
              <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>{event.currency}{event.maxEntry}</span>
            </div>
          </div>

          {amountNum > 0 && (
            <div style={{ background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '12px 14px', marginBottom: '10px', border: '1px solid var(--b1n0-border)' }}>
              {/* Breakdown table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Tu entrada</span>
                  <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-1)', fontWeight: 500 }}>{event.currency}{amountNum.toFixed(2)}</span>
                </div>
                {fee !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Comisión ({feeRatePct}%)</span>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>−{event.currency}{fee.toFixed(2)}</span>
                  </div>
                )}
                {fee !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Neto al pool</span>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-1)', fontWeight: 500 }}>{event.currency}{(amountNum - (fee ?? 0)).toFixed(2)}</span>
                  </div>
                )}
                {price !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Precio</span>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{price.toFixed(2)}</span>
                  </div>
                )}
                {activePx && activePx.contracts > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Contratos</span>
                    <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{activePx.contracts.toFixed(2)}</span>
                  </div>
                )}
              </div>
              {/* Cobro highlight */}
              <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Cobro estimado</span>
                  <span style={{ fontFamily: D, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-text-1)', letterSpacing: '-1px' }}>
                    ~{event.currency}{cobro.toFixed(2)}
                  </span>
                </div>
              </div>
              {/* Explainer */}
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                Se descuentan {event.currency}{amountNum.toFixed(2)} de tu saldo. El cobro final depende del pool total al resolver.
              </p>
            </div>
          )}

          {poolFull && (
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '10px', padding: '8px 10px', background: 'var(--b1n0-no-bg)', borderRadius: '8px' }}>
              Pool lleno — reducí el monto
            </p>
          )}

          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '14px' }}>
            Desde {event.currency}{event.minEntry} · Máx {event.currency}{event.maxEntry}
          </p>

          <button
            onClick={handleConfirm}
            disabled={!amountValid || confirming}
            style={{
              width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
              background: !amountValid || confirming ? 'var(--b1n0-border)' : (side === 'no' || side?.endsWith('::no')) ? 'var(--b1n0-no)' : 'var(--b1n0-si)',
              cursor: amountValid && !confirming ? 'pointer' : 'not-allowed',
              fontFamily: F, fontWeight: 700, fontSize: '14px', color: amountValid && !confirming ? '#fff' : 'var(--b1n0-muted)', marginBottom: '8px',
              transition: 'all 0.15s',
            }}
          >
            {confirming ? 'Procesando...' : `Comprar ${side ? displaySide(side) : ''} — ${event.currency}${amount || '0'}`}
          </button>
          {confirmError && (
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-no)', textAlign: 'center', marginBottom: '6px' }}>{confirmError}</p>
          )}
          <button onClick={onClose} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>
            Cerrar
          </button>
        </div>
      )}

      {/* ── Step 3: Confirm ── */}
      {!tierLocked && step === 3 && (
        <div>
          <div style={{ background: 'var(--b1n0-card)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resumen de tu voto</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)' }}>Posición</span>
                <span style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)' }}>
                  {side ? displaySide(side) : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)' }}>Tu entrada</span>
                <span style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
                  {event.currency}{amountNum.toFixed(2)}
                </span>
              </div>
              {fee !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Comisión ({feeRatePct}%)</span>
                  <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>−{event.currency}{fee.toFixed(2)}</span>
                </div>
              )}
              {fee !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Neto al pool</span>
                  <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', fontWeight: 500 }}>{event.currency}{(amountNum - (fee ?? 0)).toFixed(2)}</span>
                </div>
              )}
              {price !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Precio bloqueado</span>
                  <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>{price.toFixed(2)}</span>
                </div>
              )}
              {activePx && activePx.contracts > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Contratos</span>
                  <span style={{ fontFamily: D, fontWeight: 700, fontSize: '13px', color: 'var(--b1n0-text-1)' }}>{activePx.contracts.toFixed(2)}</span>
                </div>
              )}
              {/* Cobro highlight */}
              <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '10px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>Cobro estimado</span>
                <span style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
                  ~{event.currency}{cobro.toFixed(2)}
                </span>
              </div>
              {/* Balance impact */}
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                Se descuentan {event.currency}{amountNum.toFixed(2)} de tu saldo. El cobro final depende del pool total.
              </p>
            </div>
          </div>

          {confirmError && (
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginBottom: '12px', padding: '8px 10px', background: 'var(--b1n0-no-bg)', borderRadius: '8px' }}>
              {confirmError}
            </p>
          )}

          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: confirming ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-surface)', cursor: confirming ? 'default' : 'pointer', fontFamily: F, fontWeight: 600, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '0.8px', marginBottom: '8px' }}
          >
            {confirming ? 'Registrando...' : 'CONFIRMAR VOTO'}
          </button>
          <button onClick={() => { setStep(2); setConfirmError(null) }} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>
            Volver
          </button>
        </div>
      )}
    </div>
  )
}

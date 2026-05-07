import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { callRpc } from '../../lib/rpc'
import { setPricingRates } from '../../lib/pricing'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
  color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)',
  textTransform: 'uppercase', letterSpacing: '0.4px',
  marginBottom: '5px', display: 'block',
}

export function RatesPanel() {
  const defaultRates: Record<string, number> = {
    sponsor_margin_pct: 15,
    tx_fee_pct: 2.5,
    spread_low_pct: 1,
    spread_high_pct: 2,
    fee_floor_pct: 1,
    fee_ceiling_pct: 5,
    sell_fee_pct: 2,
    depth_threshold: 50000,
    resolution_skim_pct: 5,
    // ── Volume-aware fee curve dials (added by 20260506_unified_fees migration)
    maker_rebate_count: 10,        // first N bets/event get fee=0
    volume_factor_threshold: 5000, // bet_pool $ at which fee hits ceiling
    skew_bump_threshold: 0.30,     // |mid-0.5| above which bump applies
    skew_bump_pct: 0.5,            // extra % fee on lopsided markets
  }

  const [platformRates, setPlatformRates] = useState(defaultRates)
  const [ratesDraft, setRatesDraft] = useState(defaultRates)
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesSaving, setRatesSaving] = useState<Record<string, boolean>>({})
  const [ratesSaved, setRatesSaved] = useState<Record<string, boolean>>({})
  const [ratesError, setRatesError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const loadRates = async () => {
      setRatesLoading(true)
      const { data, error } = await supabase.from('platform_config').select('key, value')
      if (!isMounted) return
      if (error) {
        logger.error('RatesPanel: load platform_config failed', { error: error.message })
        setRatesError('No se pudieron cargar las tarifas: ' + error.message)
        setRatesLoading(false)
        return
      }
      if (data) {
        const map: Record<string, number> = {}
        for (const row of data) {
          if (row.value !== null) map[row.key] = Number(row.value)
        }
        const merged = {
          sponsor_margin_pct: map.sponsor_margin_pct ?? 15,
          tx_fee_pct: map.tx_fee_pct ?? 2.5,
          spread_low_pct: map.spread_low_pct ?? 1,
          spread_high_pct: map.spread_high_pct ?? 2,
          fee_floor_pct: map.fee_floor_pct ?? 1,
          fee_ceiling_pct: map.fee_ceiling_pct ?? 5,
          sell_fee_pct: map.sell_fee_pct ?? 2,
          depth_threshold: map.depth_threshold ?? 50000,
          resolution_skim_pct: map.resolution_skim_pct ?? 5,
          maker_rebate_count: map.maker_rebate_count ?? 10,
          volume_factor_threshold: map.volume_factor_threshold ?? 5000,
          skew_bump_threshold: map.skew_bump_threshold ?? 0.30,
          skew_bump_pct: map.skew_bump_pct ?? 0.5,
        }
        setPlatformRates(merged)
        setRatesDraft(merged)
      }
      setRatesLoading(false)
    }
    loadRates().catch((err: unknown) => {
      logger.error('RatesPanel: loadRates threw', { error: err })
    })
    return () => { isMounted = false }
  }, [])

  async function saveRate(key: string, value: number) {
    setRatesSaving((s) => ({ ...s, [key]: true }))
    setRatesError(null)
    const { error } = await callRpc('update_platform_config', { p_key: key, p_value: value })
    if (error) {
      setRatesError(`No se pudo guardar ${key}: ${error.message}`)
    } else {
      setPlatformRates((r) => {
        const next = { ...r, [key]: value }
        // Hot-reload the in-app pricing tokens so FEE_RATE / SELL_FEE_RATE
        // / RESOLUTION_SKIM in pricing.ts pick up the new value immediately
        // — no page reload needed. Mirrors what App.tsx does at boot,
        // scoped to the keys that pricing.ts actually consumes.
        setPricingRates({
          spreadLow:      next.spread_low_pct      != null ? Number(next.spread_low_pct)      / 100 : undefined,
          spreadHigh:     next.spread_high_pct     != null ? Number(next.spread_high_pct)     / 100 : undefined,
          feeRate:        next.tx_fee_pct          != null ? Number(next.tx_fee_pct)          / 100 : undefined,
          feeFloor:       next.fee_floor_pct       != null ? Number(next.fee_floor_pct)       / 100 : undefined,
          feeCeiling:     next.fee_ceiling_pct     != null ? Number(next.fee_ceiling_pct)     / 100 : undefined,
          sellFeeRate:    next.sell_fee_pct        != null ? Number(next.sell_fee_pct)        / 100 : undefined,
          resolutionSkim: next.resolution_skim_pct != null ? Number(next.resolution_skim_pct) / 100 : undefined,
          depthThreshold: next.depth_threshold     != null ? Number(next.depth_threshold)         : undefined,
        })
        return next
      })
      setRatesSaved((s) => ({ ...s, [key]: true }))
      setTimeout(() => setRatesSaved((s) => ({ ...s, [key]: false })), 2500)
    }
    setRatesSaving((s) => ({ ...s, [key]: false }))
  }

  const btnStyle = (key: string, isRange = false, key2?: string): React.CSSProperties => {
    const saving = ratesSaving[key]
    const saved = ratesSaved[key] || (key2 && ratesSaved[key2])
    const changed = isRange ? (ratesDraft[key] !== platformRates[key] || (key2 && ratesDraft[key2!] !== platformRates[key2!])) : ratesDraft[key] !== platformRates[key]
    return { padding: '6px 14px', borderRadius: '7px', border: 'none', background: saved ? 'var(--b1n0-si)' : (saving || !changed) ? 'rgba(255,255,255,0.08)' : 'var(--b1n0-si)', color: 'var(--b1n0-bg)', fontFamily: F, fontWeight: 600, fontSize: '11px', cursor: 'pointer', transition: 'background 0.2s' }
  }
  const btnLabel = (key: string, key2?: string) => (ratesSaved[key] || (key2 && ratesSaved[key2])) ? '✓' : ratesSaving[key] ? '...' : '↑'

  const compactInput: React.CSSProperties = { ...inputStyle, width: '65px', fontFamily: D, fontSize: '16px', fontWeight: 700, textAlign: 'center', padding: '6px 8px' }

  return (
    <div>
      <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '10px' }}>
        Los cambios toman efecto inmediatamente.
      </p>
      {ratesError && (
        <p
          style={{
            fontFamily: F,
            fontSize: '12px',
            color: 'var(--b1n0-no)',
            background: 'rgba(248,113,113,0.08)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '10px',
          }}
        >
          {ratesError}
        </p>
      )}

      {ratesLoading ? (
        <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Cargando...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>

          {/* ── Dynamic Buy Fee ── */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px', borderLeft: '3px solid #C4B5FD' }}>
            <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: '#C4B5FD', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Cut 2 — Comisión compras
            </p>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
              Alta en 50/50 + pool bajo, baja con favorito claro + pool profundo.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Piso</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <input type="number" min={0} max={10} step={0.1} value={ratesDraft.fee_floor_pct ?? 1} onChange={(e) => setRatesDraft((d) => ({ ...d, fee_floor_pct: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Techo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <input type="number" min={0} max={20} step={0.1} value={ratesDraft.fee_ceiling_pct ?? 5} onChange={(e) => setRatesDraft((d) => ({ ...d, fee_ceiling_pct: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <button onClick={async () => { await saveRate('fee_floor_pct', ratesDraft.fee_floor_pct ?? 1); await saveRate('fee_ceiling_pct', ratesDraft.fee_ceiling_pct ?? 5) }} disabled={ratesSaving.fee_floor_pct || (ratesDraft.fee_floor_pct === platformRates.fee_floor_pct && ratesDraft.fee_ceiling_pct === platformRates.fee_ceiling_pct)} style={btnStyle('fee_floor_pct', true, 'fee_ceiling_pct')}>
                {btnLabel('fee_floor_pct', 'fee_ceiling_pct')}
              </button>
            </div>
            {(ratesDraft.fee_floor_pct !== platformRates.fee_floor_pct || ratesDraft.fee_ceiling_pct !== platformRates.fee_ceiling_pct) && (
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: {platformRates.fee_floor_pct}%–{platformRates.fee_ceiling_pct}%</p>
            )}
          </div>

          {/* ── Flat Sell Fee ── */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px', borderLeft: '3px solid var(--b1n0-no)' }}>
            <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-no)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Cut 2b — Comisión venta
            </p>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
              Tasa fija al vender contratos antes de resolución.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Tasa</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <input type="number" min={0} max={10} step={0.1} value={ratesDraft.sell_fee_pct ?? 2} onChange={(e) => setRatesDraft((d) => ({ ...d, sell_fee_pct: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <button onClick={() => saveRate('sell_fee_pct', ratesDraft.sell_fee_pct ?? 2)} disabled={ratesSaving.sell_fee_pct || ratesDraft.sell_fee_pct === platformRates.sell_fee_pct} style={btnStyle('sell_fee_pct')}>
                {btnLabel('sell_fee_pct')}
              </button>
            </div>
            {ratesDraft.sell_fee_pct !== platformRates.sell_fee_pct && (
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: {platformRates.sell_fee_pct}%</p>
            )}
          </div>

          {/* ── Spread ── */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px', borderLeft: '3px solid var(--b1n0-gold)' }}>
            <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Cut 3 — Spread AMM
            </p>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
              Rango bid/ask. Diferencia entre ask y mid = spread capturado.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Mín</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <input type="number" min={0} max={20} step={0.1} value={ratesDraft.spread_low_pct} onChange={(e) => setRatesDraft((d) => ({ ...d, spread_low_pct: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Máx</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <input type="number" min={0} max={20} step={0.1} value={ratesDraft.spread_high_pct} onChange={(e) => setRatesDraft((d) => ({ ...d, spread_high_pct: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <button onClick={async () => { await saveRate('spread_low_pct', ratesDraft.spread_low_pct); await saveRate('spread_high_pct', ratesDraft.spread_high_pct) }} disabled={ratesSaving.spread_low_pct || (ratesDraft.spread_low_pct === platformRates.spread_low_pct && ratesDraft.spread_high_pct === platformRates.spread_high_pct)} style={btnStyle('spread_low_pct', true, 'spread_high_pct')}>
                {btnLabel('spread_low_pct', 'spread_high_pct')}
              </button>
            </div>
            {(ratesDraft.spread_low_pct !== platformRates.spread_low_pct || ratesDraft.spread_high_pct !== platformRates.spread_high_pct) && (
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: {platformRates.spread_low_pct}%–{platformRates.spread_high_pct}%</p>
            )}
          </div>

          {/* ── Depth Threshold ── */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px', borderLeft: '3px solid var(--b1n0-si)' }}>
            <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-si)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Cut 3b — Umbral profundidad
            </p>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
              Pool mínimo para mercado "maduro". Debajo, comisión sube.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Umbral</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>$</span>
                  <input type="number" min={1000} max={1000000} step={1000} value={ratesDraft.depth_threshold ?? 50000} onChange={(e) => setRatesDraft((d) => ({ ...d, depth_threshold: parseFloat(e.target.value) || 50000 }))} style={{ ...compactInput, width: '90px' }} />
                </div>
              </div>
              <button onClick={() => saveRate('depth_threshold', ratesDraft.depth_threshold ?? 50000)} disabled={ratesSaving.depth_threshold || ratesDraft.depth_threshold === platformRates.depth_threshold} style={btnStyle('depth_threshold')}>
                {btnLabel('depth_threshold')}
              </button>
            </div>
            {ratesDraft.depth_threshold !== platformRates.depth_threshold && (
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: ${Number(platformRates.depth_threshold ?? 50000).toLocaleString()}</p>
            )}
            <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', marginTop: '6px' }}>
              Q5K → <strong style={{ color: 'var(--b1n0-text-1)' }}>{(5000 / (ratesDraft.depth_threshold ?? 50000) * 100).toFixed(0)}%</strong> · ${((ratesDraft.depth_threshold ?? 50000) / 1000).toFixed(0)}K+ → <strong style={{ color: 'var(--b1n0-si)' }}>100%</strong>
            </p>
          </div>

          {/* ── Resolution Skim — spans full width ── */}
          {(() => {
            const key = 'resolution_skim_pct'
            return (
              <div style={{ gridColumn: '1 / -1', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px', borderLeft: '3px solid #14b8a6' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: '#14b8a6', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Cut 4 — Resolución
                    </p>
                    <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>
                      % descontado del cobro de ganadores → tesorería. Perdedores no afectados.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <input type="number" min={0} max={25} step={0.5} value={ratesDraft[key] ?? 5} onChange={(e) => setRatesDraft((d) => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                      <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                    </div>
                    <button onClick={() => saveRate(key, ratesDraft[key] ?? 5)} disabled={ratesSaving[key] || ratesDraft[key] === platformRates[key]} style={btnStyle(key)}>
                      {btnLabel(key)}
                    </button>
                  </div>
                </div>
                {ratesDraft[key] !== platformRates[key] && (
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: {platformRates[key]}%</p>
                )}
                <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', marginTop: '6px' }}>
                  Q1,000 cobro → descuento <strong style={{ color: '#14b8a6' }}>${(((ratesDraft[key] ?? 5) * 10)).toFixed(0)}</strong> · usuario recibe <strong style={{ color: 'var(--b1n0-text-1)' }}>${(1000 - (ratesDraft[key] ?? 5) * 10).toFixed(0)}</strong>
                </p>
              </div>
            )
          })()}

          {/* ── Cut 5 — Maker rebate + volume scaling + skew bump ── */}
          {/* Full-width card. Four dials feed the unified fee curve every
              time preview_purchase or execute_purchase runs. Each has its
              own save button so you can tune one knob without dirtying
              the others. */}
          <div style={{ gridColumn: '1 / -1', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px', borderLeft: '3px solid #4ade80' }}>
            <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: '#4ade80', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Cut 5 — Maker rebate y skew
            </p>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
              Las primeras N entradas de cada evento son sin comisión. Después, la comisión escala con el volumen y sube en mercados muy desequilibrados.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Maker rebate (entradas gratis)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="number" min={0} max={100} step={1} value={ratesDraft.maker_rebate_count ?? 10} onChange={(e) => setRatesDraft((d) => ({ ...d, maker_rebate_count: parseInt(e.target.value, 10) || 0 }))} style={compactInput} />
                  <button onClick={() => saveRate('maker_rebate_count', ratesDraft.maker_rebate_count ?? 10)} disabled={ratesSaving.maker_rebate_count || ratesDraft.maker_rebate_count === platformRates.maker_rebate_count} style={btnStyle('maker_rebate_count')}>
                    {btnLabel('maker_rebate_count')}
                  </button>
                </div>
                {ratesDraft.maker_rebate_count !== platformRates.maker_rebate_count && (
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: {platformRates.maker_rebate_count}</p>
                )}
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Umbral volumen ($)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>$</span>
                  <input type="number" min={100} max={100000} step={100} value={ratesDraft.volume_factor_threshold ?? 5000} onChange={(e) => setRatesDraft((d) => ({ ...d, volume_factor_threshold: parseFloat(e.target.value) || 0 }))} style={{ ...compactInput, width: '85px' }} />
                  <button onClick={() => saveRate('volume_factor_threshold', ratesDraft.volume_factor_threshold ?? 5000)} disabled={ratesSaving.volume_factor_threshold || ratesDraft.volume_factor_threshold === platformRates.volume_factor_threshold} style={btnStyle('volume_factor_threshold')}>
                    {btnLabel('volume_factor_threshold')}
                  </button>
                </div>
                {ratesDraft.volume_factor_threshold !== platformRates.volume_factor_threshold && (
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: ${Number(platformRates.volume_factor_threshold).toLocaleString()}</p>
                )}
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Umbral skew (|mid−0.5|)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="number" min={0} max={0.5} step={0.05} value={ratesDraft.skew_bump_threshold ?? 0.30} onChange={(e) => setRatesDraft((d) => ({ ...d, skew_bump_threshold: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                  <button onClick={() => saveRate('skew_bump_threshold', ratesDraft.skew_bump_threshold ?? 0.30)} disabled={ratesSaving.skew_bump_threshold || ratesDraft.skew_bump_threshold === platformRates.skew_bump_threshold} style={btnStyle('skew_bump_threshold')}>
                    {btnLabel('skew_bump_threshold')}
                  </button>
                </div>
                {ratesDraft.skew_bump_threshold !== platformRates.skew_bump_threshold && (
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: {platformRates.skew_bump_threshold}</p>
                )}
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '9px' }}>Bump skew (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="number" min={0} max={5} step={0.1} value={ratesDraft.skew_bump_pct ?? 0.5} onChange={(e) => setRatesDraft((d) => ({ ...d, skew_bump_pct: parseFloat(e.target.value) || 0 }))} style={compactInput} />
                  <span style={{ fontFamily: D, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                  <button onClick={() => saveRate('skew_bump_pct', ratesDraft.skew_bump_pct ?? 0.5)} disabled={ratesSaving.skew_bump_pct || ratesDraft.skew_bump_pct === platformRates.skew_bump_pct} style={btnStyle('skew_bump_pct')}>
                    {btnLabel('skew_bump_pct')}
                  </button>
                </div>
                {ratesDraft.skew_bump_pct !== platformRates.skew_bump_pct && (
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', marginTop: '4px' }}>DB: {platformRates.skew_bump_pct}%</p>
                )}
              </div>
            </div>
            <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', marginTop: '10px', lineHeight: 1.5 }}>
              Bet #1–{ratesDraft.maker_rebate_count ?? 10}: <strong style={{ color: '#4ade80' }}>0%</strong> · Bet posterior, $1K vol: <strong style={{ color: 'var(--b1n0-text-1)' }}>~{(((ratesDraft.fee_floor_pct ?? 1) + ((ratesDraft.fee_ceiling_pct ?? 5) - (ratesDraft.fee_floor_pct ?? 1)) * Math.min(1000 / (ratesDraft.volume_factor_threshold ?? 5000), 1))).toFixed(2)}%</strong> · Pool maduro: <strong style={{ color: 'var(--b1n0-text-1)' }}>{ratesDraft.fee_ceiling_pct ?? 5}%</strong> · Skew bump: <strong style={{ color: 'var(--b1n0-text-1)' }}>+{ratesDraft.skew_bump_pct ?? 0.5}%</strong>
            </p>
          </div>

        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
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
  }

  const [platformRates, setPlatformRates] = useState(defaultRates)
  const [ratesDraft, setRatesDraft] = useState(defaultRates)
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesSaving, setRatesSaving] = useState<Record<string, boolean>>({})
  const [ratesSaved, setRatesSaved] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let isMounted = true
    const loadRates = async () => {
      setRatesLoading(true)
      const { data } = await supabase.from('platform_config').select('key, value')
      if (isMounted && data) {
        const map: Record<string, number> = {}
        for (const row of data) map[row.key] = Number(row.value)
        const merged = {
          sponsor_margin_pct: map.sponsor_margin_pct ?? 15,
          tx_fee_pct: map.tx_fee_pct ?? 2.5,
          spread_low_pct: map.spread_low_pct ?? 1,
          spread_high_pct: map.spread_high_pct ?? 2,
          fee_floor_pct: map.fee_floor_pct ?? 1,
          fee_ceiling_pct: map.fee_ceiling_pct ?? 5,
          sell_fee_pct: map.sell_fee_pct ?? 2,
          depth_threshold: map.depth_threshold ?? 50000,
        }
        setPlatformRates(merged)
        setRatesDraft(merged)
      }
      if (isMounted) setRatesLoading(false)
    }
    loadRates()
    return () => { isMounted = false }
  }, [])

  async function saveRate(key: string, value: number) {
    setRatesSaving((s) => ({ ...s, [key]: true }))
    const { error } = await supabase.rpc('update_platform_config', { p_key: key, p_value: value })
    if (error) {
      // Silent error handling
    } else {
      setPlatformRates((r) => ({ ...r, [key]: value }))
      setRatesSaved((s) => ({ ...s, [key]: true }))
      setTimeout(() => setRatesSaved((s) => ({ ...s, [key]: false })), 2500)
    }
    setRatesSaving((s) => ({ ...s, [key]: false }))
  }

  return (
    <div style={{ maxWidth: '540px' }}>
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: 'var(--b1n0-text-1)', marginBottom: '4px' }}>
        Tarifas de plataforma
      </p>
      <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '20px' }}>
        Los cambios toman efecto inmediatamente en nuevas transacciones y eventos.
      </p>

      {ratesLoading ? (
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Cargando...</p>
      ) : (
        <>
          {/* ── Dynamic Buy Fee ── */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', marginBottom: '12px' }}>
            <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#C4B5FD', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Comisión dinámica (compras)
            </p>
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
              La comisión se ajusta automáticamente: <strong>alta</strong> cuando el mercado es incierto (50/50) y el pool es bajo, <strong>baja</strong> cuando hay un favorito claro y el pool es profundo.
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <label style={labelStyle}>Piso (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number" min={0} max={10} step={0.1}
                    value={ratesDraft.fee_floor_pct ?? 1}
                    onChange={(e) => setRatesDraft((d) => ({ ...d, fee_floor_pct: parseFloat(e.target.value) || 0 }))}
                    style={{ ...inputStyle, width: '80px', fontFamily: D, fontSize: '18px', fontWeight: 700, textAlign: 'center' }}
                  />
                  <span style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <label style={labelStyle}>Techo (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number" min={0} max={20} step={0.1}
                    value={ratesDraft.fee_ceiling_pct ?? 5}
                    onChange={(e) => setRatesDraft((d) => ({ ...d, fee_ceiling_pct: parseFloat(e.target.value) || 0 }))}
                    style={{ ...inputStyle, width: '80px', fontFamily: D, fontSize: '18px', fontWeight: 700, textAlign: 'center' }}
                  />
                  <span style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    await saveRate('fee_floor_pct', ratesDraft.fee_floor_pct ?? 1)
                    await saveRate('fee_ceiling_pct', ratesDraft.fee_ceiling_pct ?? 5)
                  }}
                  disabled={ratesSaving.fee_floor_pct || (ratesDraft.fee_floor_pct === platformRates.fee_floor_pct && ratesDraft.fee_ceiling_pct === platformRates.fee_ceiling_pct)}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: (ratesSaved.fee_floor_pct || ratesSaved.fee_ceiling_pct) ? '#4ade80' : (ratesSaving.fee_floor_pct || (ratesDraft.fee_floor_pct === platformRates.fee_floor_pct && ratesDraft.fee_ceiling_pct === platformRates.fee_ceiling_pct)) ? 'rgba(255,255,255,0.08)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  {(ratesSaved.fee_floor_pct || ratesSaved.fee_ceiling_pct) ? '✓ Guardado' : ratesSaving.fee_floor_pct ? 'Guardando...' : 'Guardar →'}
                </button>
              </div>
            </div>
            {(ratesDraft.fee_floor_pct !== platformRates.fee_floor_pct || ratesDraft.fee_ceiling_pct !== platformRates.fee_ceiling_pct) && (
              <p style={{ fontFamily: F, fontSize: '11px', color: '#FFD474', marginTop: '8px' }}>
                Actual en DB: {platformRates.fee_floor_pct}% – {platformRates.fee_ceiling_pct}%
              </p>
            )}
            <div style={{ marginTop: '12px', background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px 12px' }}>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '4px', fontWeight: 600 }}>Ejemplos en Q100:</p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                50/50 + pool bajo → <span style={{ color: 'var(--b1n0-text-1)', fontWeight: 700 }}>Q{((ratesDraft.fee_ceiling_pct ?? 5)).toFixed(2)}</span> comisión ({ratesDraft.fee_ceiling_pct ?? 5}%)
              </p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                90/10 + pool profundo → <span style={{ color: 'var(--b1n0-text-1)', fontWeight: 700 }}>Q{((ratesDraft.fee_floor_pct ?? 1)).toFixed(2)}</span> comisión ({ratesDraft.fee_floor_pct ?? 1}%)
              </p>
            </div>
          </div>

          {/* ── Flat Sell Fee ── */}
          {(() => {
            const key = 'sell_fee_pct'
            return (
              <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', marginBottom: '12px' }}>
                <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#f87171', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Comisión de venta (fija)
                </p>
                <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
                  Tasa fija que se cobra cuando un usuario vende sus contratos antes de la resolución.
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Tasa (%)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number" min={0} max={10} step={0.1}
                        value={ratesDraft[key] ?? 2}
                        onChange={(e) => setRatesDraft((d) => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))}
                        style={{ ...inputStyle, width: '90px', fontFamily: D, fontSize: '18px', fontWeight: 700, textAlign: 'center' }}
                      />
                      <span style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                    </div>
                    {ratesDraft[key] !== platformRates[key] && (
                      <p style={{ fontFamily: F, fontSize: '11px', color: '#FFD474', marginTop: '4px' }}>
                        Actual en DB: {platformRates[key]}%
                      </p>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <button
                      onClick={() => saveRate(key, ratesDraft[key] ?? 2)}
                      disabled={ratesSaving[key] || ratesDraft[key] === platformRates[key]}
                      style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: ratesSaved[key] ? '#4ade80' : (ratesSaving[key] || ratesDraft[key] === platformRates[key]) ? 'rgba(255,255,255,0.08)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                    >
                      {ratesSaved[key] ? '✓ Guardado' : ratesSaving[key] ? 'Guardando...' : 'Guardar →'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Depth Threshold ── */}
          {(() => {
            const key = 'depth_threshold'
            return (
              <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', marginBottom: '12px' }}>
                <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#4ade80', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Umbral de profundidad
                </p>
                <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
                  Pool mínimo para considerar un mercado "maduro". Debajo de este umbral, la comisión sube para compensar la baja liquidez.
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Umbral (Q)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>Q</span>
                      <input
                        type="number" min={1000} max={1000000} step={1000}
                        value={ratesDraft[key] ?? 50000}
                        onChange={(e) => setRatesDraft((d) => ({ ...d, [key]: parseFloat(e.target.value) || 50000 }))}
                        style={{ ...inputStyle, width: '120px', fontFamily: D, fontSize: '18px', fontWeight: 700, textAlign: 'center' }}
                      />
                    </div>
                    {ratesDraft[key] !== platformRates[key] && (
                      <p style={{ fontFamily: F, fontSize: '11px', color: '#FFD474', marginTop: '4px' }}>
                        Actual en DB: Q{Number(platformRates[key] ?? 50000).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <button
                      onClick={() => saveRate(key, ratesDraft[key] ?? 50000)}
                      disabled={ratesSaving[key] || ratesDraft[key] === platformRates[key]}
                      style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: ratesSaved[key] ? '#4ade80' : (ratesSaving[key] || ratesDraft[key] === platformRates[key]) ? 'rgba(255,255,255,0.08)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                    >
                      {ratesSaved[key] ? '✓ Guardado' : ratesSaving[key] ? 'Guardando...' : 'Guardar →'}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: '12px', background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px 12px' }}>
                  <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                    Pool Q5K → depth factor <span style={{ color: 'var(--b1n0-text-1)', fontWeight: 700 }}>{(5000 / (ratesDraft[key] ?? 50000) * 100).toFixed(0)}%</span>
                    {' · '}Pool Q{((ratesDraft[key] ?? 50000) / 1000).toFixed(0)}K+ → <span style={{ color: '#4ade80', fontWeight: 700 }}>100%</span> (sin penalidad)
                  </p>
                </div>
              </div>
            )
          })()}

          {/* ── Spread ── */}
          <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', marginBottom: '12px' }}>
            <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#FFD474', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Spread del mercado (AMM)
            </p>
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
              Rango bid/ask. Bajo en 50/50, sube en mercados desequilibrados. La diferencia entre ask y mid es el spread capturado.
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Mínimo (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number" min={0} max={20} step={0.1}
                    value={ratesDraft.spread_low_pct}
                    onChange={(e) => setRatesDraft((d) => ({ ...d, spread_low_pct: parseFloat(e.target.value) || 0 }))}
                    style={{ ...inputStyle, width: '80px', fontFamily: D, fontSize: '18px', fontWeight: 700, textAlign: 'center' }}
                  />
                  <span style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Máximo (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number" min={0} max={20} step={0.1}
                    value={ratesDraft.spread_high_pct}
                    onChange={(e) => setRatesDraft((d) => ({ ...d, spread_high_pct: parseFloat(e.target.value) || 0 }))}
                    style={{ ...inputStyle, width: '80px', fontFamily: D, fontSize: '18px', fontWeight: 700, textAlign: 'center' }}
                  />
                  <span style={{ fontFamily: D, fontSize: '18px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>%</span>
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    await saveRate('spread_low_pct', ratesDraft.spread_low_pct)
                    await saveRate('spread_high_pct', ratesDraft.spread_high_pct)
                  }}
                  disabled={ratesSaving.spread_low_pct || (ratesDraft.spread_low_pct === platformRates.spread_low_pct && ratesDraft.spread_high_pct === platformRates.spread_high_pct)}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: (ratesSaved.spread_low_pct || ratesSaved.spread_high_pct) ? '#4ade80' : (ratesSaving.spread_low_pct || (ratesDraft.spread_low_pct === platformRates.spread_low_pct && ratesDraft.spread_high_pct === platformRates.spread_high_pct)) ? 'rgba(255,255,255,0.08)' : '#4ade80', color: '#0d0d0d', fontFamily: F, fontWeight: 600, fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  {(ratesSaved.spread_low_pct || ratesSaved.spread_high_pct) ? '✓ Guardado' : ratesSaving.spread_low_pct ? 'Guardando...' : 'Guardar →'}
                </button>
              </div>
            </div>
            {(ratesDraft.spread_low_pct !== platformRates.spread_low_pct || ratesDraft.spread_high_pct !== platformRates.spread_high_pct) && (
              <p style={{ fontFamily: F, fontSize: '11px', color: '#FFD474', marginTop: '8px' }}>
                Actual en DB: {platformRates.spread_low_pct}% – {platformRates.spread_high_pct}%
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

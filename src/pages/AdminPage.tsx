import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../context/EventsContext'
import { supabase } from '../lib/supabase'
import { RevenuePanel } from '../components/admin/RevenuePanel'
import { RatesPanel } from '../components/admin/RatesPanel'
import { UsersPanel } from '../components/admin/UsersPanel'
import { TreasuryPanel } from '../components/admin/TreasuryPanel'
import { EventManager } from '../components/admin/EventManager'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

// ── Helpers ────────────────────────────────────────────────

interface OptionRow { label: string; pct: number; pool: number }

function serializeOptions(opts: OptionRow[]): string[] {
  return opts.map((o) => `${o.label}:${o.pct}:${o.pool}`)
}

function optionTotal(opts: OptionRow[]): number {
  return Math.round(opts.reduce((sum, o) => sum + (o.pct || 0), 0))
}

// ── Shared styles ──────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
  border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)',
  color: 'var(--b1n0-text-1)', fontFamily: F, fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
}


// RevenuePanel extracted to components/admin/RevenuePanel.tsx


// ── Main component ─────────────────────────────────────────

export function AdminPage() {
  const { profile } = useAuth()
  const { refetch } = useEvents()
  const navigate = useNavigate()

  const [view, setView] = useState<'manage' | 'revenue' | 'rates' | 'users' | 'treasury'>('manage')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')



  // ── Platform rates (loaded from platform_config table) ──
  const defaultRates: Record<string, number> = { sponsor_margin_pct: 15, tx_fee_pct: 2.5, spread_low_pct: 1, spread_high_pct: 2, fee_floor_pct: 1, fee_ceiling_pct: 5, sell_fee_pct: 2, depth_threshold: 50000 }
  const [platformRates, setPlatformRates] = useState(defaultRates)

  // Load platform rates on mount so the create form always shows current margin %
  useEffect(() => {
    let isMounted = true
    const loadRates = async () => {
      const { data } = await supabase.from('platform_config').select('key, value')
      if (isMounted && data) {
        const map: Record<string, number> = {}
        for (const row of data) map[row.key] = Number(row.value)
        const merged = {
          sponsor_margin_pct: map.sponsor_margin_pct ?? 15,
          tx_fee_pct:         map.tx_fee_pct         ?? 2.5,
          spread_low_pct:     map.spread_low_pct      ?? 1,
          spread_high_pct:    map.spread_high_pct     ?? 2,
          fee_floor_pct:      map.fee_floor_pct       ?? 1,
          fee_ceiling_pct:    map.fee_ceiling_pct     ?? 5,
          sell_fee_pct:       map.sell_fee_pct        ?? 2,
          depth_threshold:    map.depth_threshold     ?? 50000,
        }
        setPlatformRates(merged)
      }
    }
    loadRates()
    return () => { isMounted = false }
  }, [])


  if (!profile?.isAdmin) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-text-1)' }}>Acceso restringido</p>
        <button onClick={() => navigate('/inicio')} style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          Volver al inicio
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '12px 20px 60px', maxWidth: '100%' }}>

      {/* Compact header: tabs left, date filter right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '2px', gap: '1px' }}>
          {([['manage', 'Gestionar'], ['revenue', 'Ingresos'], ['rates', 'Tarifas'], ['users', 'Usuarios'], ['treasury', 'Tesorería']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => { setView(v) }}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: F, fontWeight: 600, fontSize: '12px',
                background: view === v ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: view === v ? '#fff' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
                ...(view === v ? { boxShadow: '0 1px 3px rgba(0,0,0,0.3)' } : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Date range filter — visible on Ingresos + Tesorería */}
        {(view === 'revenue' || view === 'treasury') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--b1n0-border)',
                background: 'var(--b1n0-surface)', color: 'var(--b1n0-text-1)',
                fontFamily: F, fontSize: '11px', outline: 'none',
              }}
            />
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--b1n0-border)',
                background: 'var(--b1n0-surface)', color: 'var(--b1n0-text-1)',
                fontFamily: F, fontSize: '11px', outline: 'none',
              }}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo('') }}
                style={{ padding: '4px 8px', borderRadius: '5px', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'var(--b1n0-muted)', fontFamily: F, fontSize: '10px', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════ EVENT MANAGER (Gestionar view) ═══════════════ */}
      {view === 'manage' && <EventManager platformRates={platformRates} />}

      {/* Create form now lives inside EventManager */}

      {/* ═══════════════ REVENUE VIEW ═══════════════ */}
      {view === 'revenue' && <RevenuePanel dateFrom={dateFrom} dateTo={dateTo} />}


      {/* ═══════════════ RATES VIEW ═══════════════ */}
      {view === 'rates' && <RatesPanel />}

      {/* ════════════════════════════════════════════════════════════════
          USUARIOS TAB
         ════════════════════════════════════════════════════════════════ */}
      {view === 'users' && <UsersPanel />}

      {/* ════════ TESORERÍA ════════ */}
      {view === 'treasury' && <TreasuryPanel />}

    </div>
  )
}

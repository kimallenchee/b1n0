import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../context/EventsContext'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { RevenuePanel } from '../components/admin/RevenuePanel'
import { RatesPanel } from '../components/admin/RatesPanel'
import { UsersPanel } from '../components/admin/UsersPanel'
import { TreasuryPanel } from '../components/admin/TreasuryPanel'
import { EventManager } from '../components/admin/EventManager'
import { HealthPanel } from '../components/admin/HealthPanel'
import { AuditPanel } from '../components/admin/AuditPanel'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

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
  width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-lg)',
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

  const [view, setView] = useState<'manage' | 'revenue' | 'rates' | 'users' | 'treasury' | 'health' | 'audit'>('manage')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Hidden Sentry-trigger button — surfaces only in dev or with the
  // ?debug=sentry URL flag so we can verify monitoring receives errors.
  const showSentryTrigger =
    import.meta.env.DEV ||
    (typeof window !== 'undefined' && window.location.search.includes('debug=sentry'))



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


  // ProtectedRoute already gates this route with a server-verified
  // is_admin check via check_admin_status RPC. We keep this client-side
  // check as a defense-in-depth backstop — the page should not render
  // anything sensitive if both flags fail.
  if (!profile?.isAdmin) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-text-1)' , fontVariantNumeric: 'tabular-nums'}}>Acceso restringido</p>
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
        {/* Admin tabs — slim sliding-underline (canonical), horizontally
             scrollable on narrow viewports so the new Auditoría tab
             doesn't push the date filter offscreen. */}
        {(() => {
          const tabs: ReadonlyArray<readonly [typeof view, string]> = [
            ['manage', 'Gestionar'],
            ['revenue', 'Ingresos'],
            ['rates', 'Tarifas'],
            ['users', 'Usuarios'],
            ['treasury', 'Tesorería'],
            ['health', 'Salud'],
            ['audit', 'Auditoría'],
          ] as const
          const idx = Math.max(0, tabs.findIndex(([v]) => v === view))
          return (
            <div style={{ position: 'relative', display: 'flex', borderBottom: '1px solid var(--b1n0-border)', flex: '1 1 auto', minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {tabs.map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => { setView(v) }}
                  style={{
                    flex: '1 1 0',
                    minWidth: 92,
                    padding: '10px 12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: F,
                    fontWeight: 600,
                    fontSize: '12px',
                    color: view === v ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                    letterSpacing: 'var(--tracking-tight)',
                    whiteSpace: 'nowrap',
                    transition: 'color var(--duration-fast) var(--ease-out)',
                  }}
                >
                  {label}
                </button>
              ))}
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: -1,
                  left: `${(idx / tabs.length) * 100}%`,
                  width: `${(1 / tabs.length) * 100}%`,
                  height: 2,
                  background: 'var(--b1n0-si)',
                  borderRadius: '2px 2px 0 0',
                  transition: 'left var(--duration-base) var(--ease-out)',
                }}
              />
            </div>
          )
        })()}
        {/* Date range filter — visible on Ingresos + Tesorería */}
        {(view === 'revenue' || view === 'treasury') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: '5px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--b1n0-border)',
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
                padding: '5px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--b1n0-border)',
                background: 'var(--b1n0-surface)', color: 'var(--b1n0-text-1)',
                fontFamily: F, fontSize: '11px', outline: 'none',
              }}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo('') }}
                style={{ padding: '4px 8px', borderRadius: 'var(--radius-md)', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'var(--b1n0-muted)', fontFamily: F, fontSize: '10px', cursor: 'pointer' }}
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

      {/* ════════ PLATFORM HEALTH ════════ */}
      {view === 'health' && <HealthPanel />}

      {/* ════════ ADMIN ACTIONS AUDIT ════════ */}
      {view === 'audit' && <AuditPanel />}

      {/* ── Hidden Sentry verification trigger (dev / ?debug=sentry) ── */}
      {showSentryTrigger && (
        <div
          style={{
            marginTop: '32px',
            padding: '12px',
            border: '1px dashed var(--b1n0-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(248,113,113,0.04)',
          }}
        >
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '8px' }}>
            Debug — sólo visible en desarrollo o con <code>?debug=sentry</code>
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                logger.error('Sentry verification trigger (logger.error)', {
                  source: 'AdminPage debug trigger',
                  triggered_at: new Date().toISOString(),
                })
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--b1n0-border)',
                background: 'var(--b1n0-surface)',
                fontFamily: F,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--b1n0-gold)',
              }}
            >
              logger.error → Sentry
            </button>
            <button
              onClick={() => {
                throw new Error('Sentry verification trigger (uncaught throw)')
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid #fecaca',
                background: 'rgba(248,113,113,0.08)',
                fontFamily: F,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--b1n0-no)',
              }}
            >
              throw → ErrorBoundary
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

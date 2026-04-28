import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { callRpc } from '../../lib/rpc'
import { useTreasuryId } from '../../hooks/useTreasuryId'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

// ── Local types (selects are projections of Database rows) ────────

interface ProfileBalanceRow {
  id: string
  balance: number | null
  is_admin: boolean | null
}

interface EventRow {
  id: string
  question: string | null
  status: string | null
  ends_at: string | null
}

interface ActivePositionRow {
  gross_amount: number | null
  fee_paid: number | null
  status: string | null
}

interface BalanceLedgerSumRow {
  type: string
  amount: number
}

interface BalanceLedgerEntry {
  id: string
  user_id: string
  amount: number
  type: string
  created_at: string
  label: string | null
  balance_after: number | null
}

interface RateLimitRow {
  user_id: string
  action: string
  created_at: string
}

interface ErrorLogRow {
  id: number | string
  source: string
  message: string
  context: Record<string, unknown> | null
  created_at: string
}

const fmtQ = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const card: React.CSSProperties = {
  background: 'var(--b1n0-card)',
  border: '1px solid var(--b1n0-border)',
  borderRadius: '12px',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: 0,
}

const sectionHead: React.CSSProperties = {
  fontFamily: F,
  fontSize: '10px',
  fontWeight: 700,
  color: 'var(--b1n0-muted)',
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
}

/**
 * HealthPanel — sixth admin tab.
 *
 * Shows the operational health of b1n0 in one place so the team can
 * confirm money is reconciled and the queue is clean before flipping
 * any toggles. Five blocks:
 *
 *   1. Treasury reconciliation: treasury balance vs. user balances
 *      vs. unresolved-event liability.
 *   2. Stale events: closed events past ends_at but not yet
 *      settled, with a "settle now" jump.
 *   3. Pending withdrawals: schema check (real PSP wiring is post-
 *      this-pass; we surface what's queryable now).
 *   4. Recent errors: last 50 entries from `error_log` (admin-only
 *      RLS) — Sentry's API isn't reachable from the browser.
 *   5. Rate-limit hits: count by action in the trailing 24h.
 */
export function HealthPanel() {
  const { treasuryId } = useTreasuryId()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Reconciliation ─────────────────────────────
  const [treasuryBalance, setTreasuryBalance] = useState(0)
  const [userBalanceTotal, setUserBalanceTotal] = useState(0)
  const [activePositionNet, setActivePositionNet] = useState(0)
  const [netDeposits, setNetDeposits] = useState(0)

  // ── Stale events ───────────────────────────────
  const [staleEvents, setStaleEvents] = useState<EventRow[]>([])

  // ── Pending withdrawals (schema scaffolded; rows expected post-PSP) ─
  const [pendingWithdrawals, setPendingWithdrawals] = useState<BalanceLedgerEntry[]>([])

  // ── Recent errors ──────────────────────────────
  const [recentErrors, setRecentErrors] = useState<ErrorLogRow[]>([])
  const [errorsAvailable, setErrorsAvailable] = useState<boolean>(true)

  // ── Rate-limit hits (last 24h) ─────────────────
  const [rateLimitHits, setRateLimitHits] = useState<Record<string, number>>({})

  // ── Settle-now state ───────────────────────────
  const [settling, setSettling] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Reconciliation invariant:
  //   netDeposits  = deposits - withdrawals (money users have put into the platform, net)
  //   totalLiquid  = treasury + non-treasury user balances + active-position user contributions
  //
  // These should match. The "active-position user contribution" is
  // sum(gross_amount - fee_paid) across active positions — the money
  // users staked that hasn't paid out yet. We deliberately do NOT use
  // event_markets.pool_committed because that is the worst-case payout
  // (often inflated by sponsor margin and LP capital), not user money.
  const totalLiquid = useMemo(
    () => treasuryBalance + userBalanceTotal + activePositionNet,
    [treasuryBalance, userBalanceTotal, activePositionNet]
  )

  const reconcileDelta = useMemo(
    () => Math.round((netDeposits - totalLiquid) * 100) / 100,
    [netDeposits, totalLiquid]
  )

  const reconcileOk = useMemo(() => Math.abs(reconcileDelta) < 0.5, [reconcileDelta])

  const loadAll = useCallback(async () => {
    if (!treasuryId) return
    setLoading(true)
    setLoadError(null)
    setActionMsg(null)

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    try {
      const [treasuryRes, profilesRes, positionsRes, ledgerRes, eventsRes, withdrawRes, rateRes] =
        await Promise.all([
          supabase.from('profiles').select('id, balance, is_admin').eq('id', treasuryId).maybeSingle(),
          supabase.from('profiles').select('id, balance, is_admin'),
          // Active positions — the user-funded portion currently in markets.
          supabase
            .from('positions')
            .select('gross_amount, fee_paid, status')
            .eq('status', 'active'),
          // All deposit/withdraw entries from balance_ledger so we can
          // compute net deposits across the platform.
          supabase.from('balance_ledger').select('type, amount').in('type', ['deposit', 'withdraw']),
          supabase.from('events').select('id, question, status, ends_at'),
          // balance_ledger entries that look like queued withdrawals.
          // Once PSP is wired, this can move to a dedicated table.
          supabase
            .from('balance_ledger')
            .select('id, user_id, amount, type, created_at, label, balance_after')
            .like('type', 'withdraw%')
            .order('created_at', { ascending: false })
            .limit(25),
          supabase
            .from('rate_limits')
            .select('user_id, action, created_at')
            .gte('created_at', since24h)
            .limit(1000),
        ])

      if (treasuryRes.error) {
        logger.error('HealthPanel: treasury balance load failed', { error: treasuryRes.error.message })
      }
      if (profilesRes.error) {
        logger.error('HealthPanel: profiles load failed', { error: profilesRes.error.message })
        throw new Error(profilesRes.error.message)
      }
      if (positionsRes.error) {
        logger.error('HealthPanel: positions load failed', { error: positionsRes.error.message })
        throw new Error(positionsRes.error.message)
      }
      if (ledgerRes.error) {
        logger.error('HealthPanel: balance_ledger load failed', { error: ledgerRes.error.message })
        throw new Error(ledgerRes.error.message)
      }
      if (eventsRes.error) {
        logger.error('HealthPanel: events load failed', { error: eventsRes.error.message })
        throw new Error(eventsRes.error.message)
      }
      if (withdrawRes.error) {
        logger.error('HealthPanel: pending withdrawals load failed', { error: withdrawRes.error.message })
      }
      if (rateRes.error) {
        logger.error('HealthPanel: rate_limits load failed', { error: rateRes.error.message })
      }

      const treasuryRow = treasuryRes.data as ProfileBalanceRow | null
      setTreasuryBalance(Number(treasuryRow?.balance ?? 0))

      // User balances exclude the treasury account itself.
      const profileRows = (profilesRes.data ?? []) as ProfileBalanceRow[]
      const userTotal = profileRows
        .filter((p) => p.id !== treasuryId)
        .reduce((s, p) => s + (Number(p.balance) || 0), 0)
      setUserBalanceTotal(userTotal)

      // Active-position user contributions = sum(gross - fee). This is
      // the money users actually put into the markets that has neither
      // been paid out nor refunded yet — the part of "unresolved
      // liability" that is backed by user funds.
      const positionRows = (positionsRes.data ?? []) as ActivePositionRow[]
      const positionNet = positionRows.reduce(
        (s, p) => s + ((Number(p.gross_amount) || 0) - (Number(p.fee_paid) || 0)),
        0
      )
      setActivePositionNet(Math.round(positionNet * 100) / 100)

      // Net deposits = sum(deposit) - sum(withdraw) from balance_ledger.
      const ledgerRows = (ledgerRes.data ?? []) as BalanceLedgerSumRow[]
      const deposits = ledgerRows
        .filter((r) => r.type === 'deposit')
        .reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const withdrawals = ledgerRows
        .filter((r) => r.type === 'withdraw')
        .reduce((s, r) => s + (Number(r.amount) || 0), 0)
      // withdraw amounts are stored negative in balance_ledger, so
      // adding them gives net deposits without flipping the sign.
      setNetDeposits(Math.round((deposits + withdrawals) * 100) / 100)

      // Stale = open/closed events past ends_at, not resolved.
      const eventRows = (eventsRes.data ?? []) as EventRow[]
      const now = Date.now()
      const stale = eventRows
        .filter(
          (e) =>
            e.status !== 'resolved' &&
            e.status !== 'draft' &&
            e.ends_at != null &&
            new Date(e.ends_at).getTime() < now
        )
        .sort((a, b) => {
          const ta = a.ends_at ? new Date(a.ends_at).getTime() : 0
          const tb = b.ends_at ? new Date(b.ends_at).getTime() : 0
          return ta - tb
        })
      setStaleEvents(stale)

      setPendingWithdrawals(((withdrawRes.data ?? []) as unknown) as BalanceLedgerEntry[])

      const rateRows = (rateRes.data ?? []) as RateLimitRow[]
      const rateCounts: Record<string, number> = {}
      for (const r of rateRows) {
        rateCounts[r.action] = (rateCounts[r.action] ?? 0) + 1
      }
      setRateLimitHits(rateCounts)

      // Errors live in the (newly added) error_log table. If the table
      // isn't there yet (older deploy), fall back gracefully.
      const errorsRes = await supabase
        .from('error_log')
        .select('id, source, message, context, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (errorsRes.error) {
        // Table may not exist on older deploys — soft-fail.
        logger.warn('HealthPanel: error_log unavailable (may not be migrated yet)', {
          error: errorsRes.error.message,
        })
        setRecentErrors([])
        setErrorsAvailable(false)
      } else {
        setRecentErrors(((errorsRes.data ?? []) as unknown) as ErrorLogRow[])
        setErrorsAvailable(true)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      setLoadError('No se pudieron cargar las métricas: ' + msg)
    } finally {
      setLoading(false)
    }
  }, [treasuryId])

  useEffect(() => {
    loadAll().catch((err: unknown) => {
      logger.error('HealthPanel: loadAll threw', { error: err })
    })
  }, [loadAll])

  async function settleNow(eventId: string, fallbackResult: 'yes' | 'no' = 'yes') {
    if (!confirm(`Resolver evento ${eventId.slice(0, 8)} con resultado "${fallbackResult.toUpperCase()}"?`)) {
      return
    }
    setSettling(eventId)
    setActionMsg(null)
    const { data, error } = await callRpc('settle_event', {
      p_event_id: eventId,
      p_result: fallbackResult,
    })
    setSettling(null)
    if (error) {
      setActionMsg(`Error: ${error.message}`)
      return
    }
    setActionMsg(`Evento ${eventId.slice(0, 8)} resuelto. ${JSON.stringify(data ?? {}).slice(0, 80)}`)
    await loadAll()
  }

  if (loading) {
    return (
      <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', padding: '40px 0', textAlign: 'center' }}>
        Cargando métricas de salud...
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {loadError && (
        <p
          style={{
            fontFamily: F,
            fontSize: '12px',
            color: '#f87171',
            background: 'rgba(248,113,113,0.08)',
            padding: '8px 12px',
            borderRadius: '8px',
            margin: 0,
          }}
        >
          {loadError}
        </p>
      )}
      {actionMsg && (
        <p
          style={{
            fontFamily: F,
            fontSize: '12px',
            color: 'var(--b1n0-text-1)',
            background: 'rgba(20,184,166,0.08)',
            padding: '8px 12px',
            borderRadius: '8px',
            margin: 0,
          }}
        >
          {actionMsg}
        </p>
      )}

      {/* ─── 1. Treasury reconciliation ───────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
          <p style={sectionHead}>Reconciliación de tesorería</p>
          <span
            style={{
              fontFamily: F,
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '12px',
              background: reconcileOk ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              color: reconcileOk ? '#4ade80' : '#f87171',
            }}
          >
            {reconcileOk ? 'OK' : 'Δ Q' + fmtQ(reconcileDelta)}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {[
            { label: 'Saldo tesorería', val: `Q${fmtQ(treasuryBalance)}`, color: 'var(--b1n0-text-1)' },
            { label: 'Saldo usuarios', val: `Q${fmtQ(userBalanceTotal)}`, color: 'var(--b1n0-text-1)' },
            { label: 'Posiciones activas', val: `Q${fmtQ(activePositionNet)}`, color: '#FFD474' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px' }}>
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>{label}</p>
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color }}>{val}</p>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', margin: 0 }}>
          Depósitos netos: <strong style={{ color: 'var(--b1n0-text-1)' }}>Q{fmtQ(netDeposits)}</strong>
          {' '}· Total en sistema:{' '}
          <strong style={{ color: 'var(--b1n0-text-1)' }}>Q{fmtQ(totalLiquid)}</strong>
        </p>
        {!reconcileOk && (
          <p style={{ fontFamily: F, fontSize: '11px', color: '#f87171', margin: 0 }}>
            Discrepancia &gt; Q0.50 entre depósitos netos y total en sistema — revisá entradas recientes en balance_ledger antes de mover fondos.
          </p>
        )}
      </div>

      {/* ─── 2. Stale events ───────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={sectionHead}>Eventos vencidos sin resolver ({staleEvents.length})</p>
          <button
            onClick={() => loadAll()}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--b1n0-border)',
              background: 'var(--b1n0-surface)',
              fontFamily: F,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--b1n0-muted)',
            }}
          >
            Refrescar
          </button>
        </div>
        {staleEvents.length === 0 ? (
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
            Sin eventos vencidos. Buen trabajo.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {staleEvents.slice(0, 10).map((e) => (
              <div
                key={e.id}
                style={{
                  background: 'var(--b1n0-surface)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      fontFamily: F,
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--b1n0-text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {e.question || e.id.slice(0, 8)}
                  </p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
                    Vence: {e.ends_at ? new Date(e.ends_at).toLocaleString('es-GT') : '—'} · Estado: {e.status || '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    disabled={settling === e.id}
                    onClick={() => settleNow(e.id, 'yes')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#14b8a6',
                      color: '#0d0d0d',
                      fontFamily: F,
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: settling === e.id ? 'not-allowed' : 'pointer',
                      opacity: settling === e.id ? 0.6 : 1,
                    }}
                  >
                    Resolver SÍ
                  </button>
                  <button
                    disabled={settling === e.id}
                    onClick={() => settleNow(e.id, 'no')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--b1n0-border)',
                      background: 'var(--b1n0-card)',
                      color: 'var(--b1n0-text-1)',
                      fontFamily: F,
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: settling === e.id ? 'not-allowed' : 'pointer',
                      opacity: settling === e.id ? 0.6 : 1,
                    }}
                  >
                    Resolver NO
                  </button>
                </div>
              </div>
            ))}
            {staleEvents.length > 10 && (
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                + {staleEvents.length - 10} más
              </p>
            )}
          </div>
        )}
      </div>

      {/* ─── 3. Pending withdrawals ───────────────────────────────── */}
      <div style={card}>
        <p style={sectionHead}>Retiros pendientes ({pendingWithdrawals.length})</p>
        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
          Hasta que se integre el PSP, esto refleja entradas <code>balance_ledger.type LIKE 'withdraw%'</code>.
        </p>
        {pendingWithdrawals.length === 0 ? (
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Sin retiros recientes.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
            {pendingWithdrawals.slice(0, 10).map((w) => (
              <div
                key={w.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 80px 100px',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: 'var(--b1n0-surface)',
                  fontFamily: F,
                  fontSize: '11px',
                  color: 'var(--b1n0-text-1)',
                  alignItems: 'center',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--b1n0-muted)' }}>
                  {w.user_id.slice(0, 8)}…
                </span>
                <span style={{ fontWeight: 600 }}>Q{fmtQ(Math.abs(Number(w.amount) || 0))}</span>
                <span style={{ color: 'var(--b1n0-muted)' }}>{w.type}</span>
                <span style={{ color: 'var(--b1n0-muted)' }}>
                  {new Date(w.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 4. Recent errors ─────────────────────────────────────── */}
      <div style={card}>
        <p style={sectionHead}>Errores recientes ({recentErrors.length})</p>
        {!errorsAvailable ? (
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
            La tabla <code>error_log</code> no está migrada todavía. Aplicá la migración 20260427_harden_admin_authorization.sql.
          </p>
        ) : recentErrors.length === 0 ? (
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Sin errores recientes — ✓.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
            {recentErrors.map((e) => (
              <div
                key={String(e.id)}
                style={{
                  background: 'var(--b1n0-surface)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontFamily: F,
                  fontSize: '11px',
                  color: 'var(--b1n0-text-1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, color: '#f87171' }}>{e.source}</span>
                  <span style={{ color: 'var(--b1n0-muted)', fontSize: '10px' }}>
                    {new Date(e.created_at).toLocaleString('es-GT')}
                  </span>
                </div>
                <p
                  style={{
                    color: 'var(--b1n0-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    margin: 0,
                  }}
                  title={e.message}
                >
                  {e.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 5. Rate limit hits ───────────────────────────────────── */}
      <div style={card}>
        <p style={sectionHead}>Rate-limit hits — últimas 24h</p>
        {Object.keys(rateLimitHits).length === 0 ? (
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Sin actividad de rate-limit.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            {Object.entries(rateLimitHits)
              .sort((a, b) => b[1] - a[1])
              .map(([action, count]) => (
                <div
                  key={action}
                  style={{
                    background: 'var(--b1n0-surface)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                  }}
                >
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {action}
                  </p>
                  <p style={{ fontFamily: D, fontSize: '16px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>
                    {count}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

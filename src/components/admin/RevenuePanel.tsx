import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface PredictionRow {
  id: string
  side: string
  amount: number
  potential_cobro: number
  fee_paid: number
  status: string
  created_at: string
  resolved_at: string | null
  profiles: { name: string } | null
  events: { question: string; category: string; event_type: string } | null
}

interface TxRow {
  position_id: string | null
  gross_amount: number
  fee_deducted: number
  net_to_pool: number
  spread_captured: number
  success: boolean
  tx_type: string | null
}

interface PositionRow {
  id: string
  event_id: string
  side: string
  gross_amount: number
  fee_paid: number
  payout_if_win: number
  price_at_purchase: number
  status: string
  created_at: string
  user_id: string
}

interface MarketRow {
  event_id: string
  yes_shares: number
  no_shares: number
  pool_total: number
  pool_committed: number
  lp_capital: number
  bet_pool: number
  fees_collected: number
  lp_return_pct: number
}


function RevenuePanel({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string } = {}) {
  const [predictions, setPredictions] = useState<PredictionRow[]>([])
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [markets, setMarkets] = useState<MarketRow[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [eventMap, setEventMap] = useState<Record<string, { question: string; category: string; event_type: string }>>({})
  const [resolvedCount, setResolvedCount] = useState(0)
  const [totalEvents, setTotalEvents] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'won' | 'lost' | 'sold'>('all')
  const [txView, setTxView] = useState<'purchases' | 'sales'>('purchases')
  const [limit, setLimit] = useState(50)
  const [lpDepositsAll, setLpDepositsAll] = useState<{ event_id: string; user_id: string; amount: number; return_pct: number; status: string; fees_at_deposit: number; created_at: string }[]>([])
  const [lpExpanded, setLpExpanded] = useState(false)
  const [lpRowExpanded, setLpRowExpanded] = useState<string | null>(null)
  const [skimTotal, setSkimTotal] = useState(0)
  const [rates, setRates] = useState({ sponsor_margin_pct: 15, tx_fee_pct: 2.5, spread_low_pct: 4, spread_high_pct: 8, fee_floor_pct: 1, fee_ceiling_pct: 5, sell_fee_pct: 2, depth_threshold: 50000 })

  useEffect(() => {
    loadData()
  }, [dateFrom, dateTo])

  useEffect(() => {
    // Load platform rates for accurate spread/fee display
    supabase.from('platform_config').select('key, value').then(({ data }) => {
      if (data) {
        const map: Record<string, number> = {}
        for (const row of data) map[row.key] = Number(row.value)
        setRates({
          sponsor_margin_pct: map.sponsor_margin_pct ?? 15,
          tx_fee_pct: map.tx_fee_pct ?? 2.5,
          spread_low_pct: map.spread_low_pct ?? 1,
          spread_high_pct: map.spread_high_pct ?? 2,
          fee_floor_pct: map.fee_floor_pct ?? 1,
          fee_ceiling_pct: map.fee_ceiling_pct ?? 5,
          sell_fee_pct: map.sell_fee_pct ?? 2,
          depth_threshold: map.depth_threshold ?? 50000,
        })
      }
    })
  }, [])

  async function loadData() {
    setLoading(true)
    // Build date filter helpers
    const fromISO = dateFrom ? `${dateFrom}T00:00:00` : undefined
    const toISO = dateTo ? `${dateTo}T23:59:59` : undefined
    const [predRes, eventsRes, allEventsRes, txRes, posRes, marketRes, profilesRes, eventsFullRes, lpRes] = await Promise.all([
      supabase
        .from('predictions')
        .select('id, side, amount, potential_cobro, fee_paid, status, created_at, resolved_at, profiles(name), events(question, category, event_type)')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('events').select('id').eq('status', 'resolved'),
      supabase.from('events').select('id'),
      supabase.from('market_transactions').select('position_id, gross_amount, fee_deducted, net_to_pool, spread_captured, success, tx_type'),
      (() => {
        let q = supabase.from('positions').select('id, event_id, side, gross_amount, fee_paid, payout_if_win, price_at_purchase, status, created_at, user_id').order('created_at', { ascending: false }).limit(500)
        if (fromISO) q = q.gte('created_at', fromISO)
        if (toISO) q = q.lte('created_at', toISO)
        return q
      })(),
      supabase.from('event_markets').select('event_id, yes_shares, no_shares, pool_total, pool_committed, lp_capital, bet_pool, fees_collected, lp_return_pct, sponsor_amount'),
      supabase.from('profiles').select('id, name'),
      supabase.from('events').select('id, question, category, event_type'),
      supabase.from('lp_deposits').select('event_id, user_id, amount, return_pct, status, fees_at_deposit, payout, created_at'),
    ]) as [any, any, any, any, any, any, any, any, any]
    // Build lookup maps for positions (no FK joins on positions table)
    const pMap: Record<string, string> = {}
    if (profilesRes.data) for (const p of profilesRes.data) pMap[p.id] = p.name || '—'
    setProfileMap(pMap)
    const eMap: Record<string, { question: string; category: string; event_type: string }> = {}
    if (eventsFullRes.data) for (const e of eventsFullRes.data) eMap[e.id] = { question: e.question, category: e.category, event_type: e.event_type }
    setEventMap(eMap)

    if (predRes.data) setPredictions(predRes.data as unknown as PredictionRow[])
    if (eventsRes.data) setResolvedCount(eventsRes.data.length)
    if (allEventsRes.data) setTotalEvents(allEventsRes.data.length)
    if (txRes.data) setTransactions(txRes.data as TxRow[])
    if (posRes.data) setPositions(posRes.data as unknown as PositionRow[])
    if (marketRes.data) setMarkets(marketRes.data as MarketRow[])
    if (lpRes.data) setLpDepositsAll(lpRes.data as any[])
    // Load resolution skim total from treasury ledger
    let skimQuery = supabase
      .from('balance_ledger')
      .select('amount')
      .eq('user_id', '00000000-0000-0000-0000-000000000001')
      .eq('type', 'skim')
    if (fromISO) skimQuery = skimQuery.gte('created_at', fromISO)
    if (toISO) skimQuery = skimQuery.lte('created_at', toISO)
    const { data: skimRows } = await skimQuery
    if (skimRows) setSkimTotal(skimRows.reduce((s, r) => s + (Number(r.amount) || 0), 0))
    setLoading(false)
  }

  // ── LP Commission: sum of all LP return_pct × (fees + spread) per event ──
  // Group LP deposits by event, sum their return_pct
  const lpByEvent: Record<string, { totalPct: number; lps: { user_id: string; return_pct: number; amount: number; fees_at_deposit: number; created_at: string }[] }> = {}
  for (const lp of lpDepositsAll) {
    if (!lpByEvent[lp.event_id]) lpByEvent[lp.event_id] = { totalPct: 0, lps: [] }
    lpByEvent[lp.event_id].totalPct += lp.return_pct
    lpByEvent[lp.event_id].lps.push({ user_id: lp.user_id, return_pct: lp.return_pct, amount: lp.amount, fees_at_deposit: lp.fees_at_deposit || 0, created_at: lp.created_at })
  }
  // ── CUT 2: Transaction fees (positions are source of truth — no prediction double-count) ──
  const successTx = transactions.filter(t => t.success)
  const cut2FromTx = successTx.reduce((s, t) => s + (t.fee_deducted || 0), 0)
  const cut2FromPos = positions.reduce((s, p) => s + (p.fee_paid || 0), 0)
  const cut2Total = cut2FromTx > 0 ? cut2FromTx : cut2FromPos
  const cut2VolumeFromTx = successTx.reduce((s, t) => s + (t.gross_amount || 0), 0)
  const cut2VolumeFromPos = positions.reduce((s, p) => s + (p.gross_amount || 0), 0)
  const cut2Volume = cut2VolumeFromTx > 0 ? cut2VolumeFromTx : cut2VolumeFromPos
  const cut2Count = successTx.length > 0 ? successTx.length : positions.length

  // ── CUT 3: Spread captured (real data from market_transactions) ──
  const cut3Purchases = successTx.filter(t => t.tx_type !== 'sale').reduce((s, t) => s + (t.spread_captured || 0), 0)
  const cut3Sales = successTx.filter(t => t.tx_type === 'sale').reduce((s, t) => s + (t.spread_captured || 0), 0)
  const cut3FromTx = cut3Purchases + cut3Sales
  // Fallback estimate if spread_captured column not yet populated
  const totalNetPaid = positions.reduce((s, p) => s + ((p.gross_amount || 0) - (p.fee_paid || 0)), 0)
  const avgSpread = (rates.spread_low_pct + rates.spread_high_pct) / 2 / 100
  const cut3Est = cut3FromTx > 0 ? cut3FromTx : Math.round(totalNetPaid * avgSpread * 100) / 100
  const cut3PoolTotal = markets.reduce((s, m) => s + (m.pool_total || 0), 0)
  const cut3Committed = markets.reduce((s, m) => s + (m.pool_committed || 0), 0)
  const cut3IsReal = cut3FromTx > 0

  // ── Volume from positions (source of truth) ──
  const buyVolume = positions.reduce((s, p) => s + (p.gross_amount || 0), 0)
  const wonPayout = positions.filter((p) => p.status === 'won').reduce((s, p) => s + (p.payout_if_win || 0), 0)
  const lostVolume = positions.filter((p) => p.status === 'lost').reduce((s, p) => s + (p.gross_amount || 0), 0)
  const lpReturned = lpDepositsAll.filter(lp => lp.status === 'returned' || lp.status === 'partial_loss').reduce((s, lp) => s + (Number((lp as any).payout) || 0), 0)
  const totalPaidOut = wonPayout + lpReturned

  // ── Totals ──
  // totalRevenue computed after lpCommissionTotal is calculated (below)

  // ── Transaction list: individual positions (each trade is its own row) ──
  // Build spread lookup from market_transactions — separate purchase vs sale
  const spreadByPurchase: Record<string, number> = {}
  const spreadBySale: Record<string, number> = {}
  for (const tx of transactions) {
    if (!tx.position_id) continue
    if (tx.tx_type === 'sale') {
      spreadBySale[tx.position_id] = tx.spread_captured || 0
    } else {
      spreadByPurchase[tx.position_id] = tx.spread_captured || 0
    }
  }

  // Estimate spread per position from price when real data unavailable
  // Uses platform rates from state (loaded from platform_config)
  const sLow = rates.spread_low_pct / 100
  const sHigh = rates.spread_high_pct / 100

  function estimateSpread(price: number, grossAmount: number, feePaid: number): number {
    if (!price || price <= 0 || price >= 1) return 0
    const skew = Math.abs(price - 0.5) / 0.5
    const spreadRate = sLow + (sHigh - sLow) * skew
    const halfSpread = spreadRate / 2
    const mid = Math.max(0.01, price - halfSpread)
    const net = grossAmount - feePaid
    if (net <= 0) return 0
    return Math.round((net / mid - net / price) * 100) / 100
  }

  // Derive mid-price from ask price (reverse the spread formula)
  function askToMid(ask: number): number {
    if (!ask || ask <= 0 || ask >= 1) return ask
    let mid = ask
    for (let i = 0; i < 5; i++) {
      const skew = Math.abs(mid - 0.5) / 0.5
      const halfSpread = (sLow + (sHigh - sLow) * skew) / 2
      mid = ask - halfSpread
    }
    return Math.round(mid * 1000) / 1000
  }

  // ── LP Commission: compute from per-transaction fee+spread (matches row-level display) ──
  // Sum the same way each row computes: for each transaction, find active LPs at that time,
  // multiply their return_pct × (fee + spread) for that transaction, and sum it all up.
  let lpCommissionTotal = 0
  const lpCommByEventAccum: Record<string, { fees: number; commission: number; lpCuts: Record<string, { return_pct: number; amount: number; totalCut: number; fees_at_deposit: number; totalMargins: number }> }> = {}
  // We need the unified tx list — but it's defined later. Use positions + transactions directly.
  const allPosTxs = positions.map(p => ({
    eventId: p.event_id,
    fee: p.fee_paid || 0,
    spreadQ: spreadByPurchase[p.id] != null && spreadByPurchase[p.id] > 0
      ? spreadByPurchase[p.id]
      : estimateSpread(p.price_at_purchase || 0, p.gross_amount || 0, p.fee_paid || 0),
    created_at: p.created_at,
  }))
  for (const tx of allPosTxs) {
    const evLps = lpByEvent[tx.eventId]
    if (!evLps || evLps.lps.length === 0) continue
    const txMargins = tx.fee + tx.spreadQ
    const txTime = new Date(tx.created_at).getTime()
    const activeLps = evLps.lps.filter(lp => new Date(lp.created_at).getTime() <= txTime)
    if (activeLps.length === 0) continue
    if (!lpCommByEventAccum[tx.eventId]) lpCommByEventAccum[tx.eventId] = { fees: 0, commission: 0, lpCuts: {} }
    lpCommByEventAccum[tx.eventId].fees += txMargins
    for (const lp of activeLps) {
      const cut = Math.round(lp.return_pct * txMargins * 100) / 100
      lpCommissionTotal += cut
      lpCommByEventAccum[tx.eventId].commission += cut
      const lpKey = lp.user_id + '_' + lp.return_pct
      if (!lpCommByEventAccum[tx.eventId].lpCuts[lpKey]) {
        lpCommByEventAccum[tx.eventId].lpCuts[lpKey] = { return_pct: lp.return_pct, amount: lp.amount, totalCut: 0, fees_at_deposit: lp.fees_at_deposit, totalMargins: 0 }
      }
      lpCommByEventAccum[tx.eventId].lpCuts[lpKey].totalCut += cut
      lpCommByEventAccum[tx.eventId].lpCuts[lpKey].totalMargins += txMargins
    }
  }
  const lpCommissionByEvent = Object.entries(lpCommByEventAccum).map(([eventId, data]) => ({
    eventId,
    question: eventMap[eventId]?.question || eventId.slice(0, 8),
    totalMargins: Math.round(data.fees * 100) / 100,
    commission: Math.round(data.commission * 100) / 100,
    lps: Object.values(data.lpCuts).map(lp => ({
      user_id: '',
      return_pct: lp.return_pct,
      amount: lp.amount,
      fees_at_deposit: lp.fees_at_deposit,
      delta_fees: Math.round(lp.totalMargins * 100) / 100,
      cut: Math.round(lp.totalCut * 100) / 100,
    })),
  }))

  const totalRevenue = cut2Total + cut3Est + skimTotal - lpCommissionTotal

  // Build sale tx lookup: position_id → sale TxRow
  const saleTxByPosition: Record<string, TxRow> = {}
  for (const tx of transactions) {
    if (tx.tx_type === 'sale' && tx.position_id) saleTxByPosition[tx.position_id] = tx
  }

  interface UnifiedTx { id: string; eventId: string; side: string; amount: number; net: number; midPrice: number; askPrice: number; bidPrice: number; spreadPct: number; contracts: number; cobro: number; fee: number; spreadQ: number; status: string; created_at: string; userName: string; eventQuestion: string; source: 'position' | 'prediction'; txType: 'purchase' | 'sale' }
  const positionTxs: UnifiedTx[] = positions.map((p) => {
    const fee = p.fee_paid || 0
    const net = p.gross_amount - fee
    const askPrice = p.price_at_purchase || 0
    const midPrice = askToMid(askPrice)
    const skew = midPrice > 0 && midPrice < 1 ? Math.abs(midPrice - 0.5) / 0.5 : 0
    const spreadPct = midPrice > 0 ? Math.round((sLow + (sHigh - sLow) * skew) * 1000) / 10 : 0
    const contracts = p.payout_if_win || (net > 0 && askPrice > 0 ? Math.round(net / askPrice * 100) / 100 : 0)
    const realSpread = spreadByPurchase[p.id]
    const spreadQ = realSpread != null && realSpread > 0
      ? realSpread
      : estimateSpread(askPrice, p.gross_amount, fee)
    return {
      id: p.id, eventId: p.event_id, side: p.side, amount: p.gross_amount, net, midPrice, askPrice, bidPrice: 0, spreadPct, contracts, cobro: p.payout_if_win, fee, spreadQ, status: p.status, created_at: p.created_at,
      userName: profileMap[p.user_id] || '—', eventQuestion: eventMap[p.event_id]?.question || '—', source: 'position' as const, txType: 'purchase' as const,
    }
  })

  // Generate sale rows for sold positions (from market_transactions where tx_type='sale')
  const saleTxs: UnifiedTx[] = positions
    .filter((p) => p.status === 'sold' && saleTxByPosition[p.id])
    .map((p) => {
      const saleTx = saleTxByPosition[p.id]
      const fee = saleTx.fee_deducted || 0
      const gross = saleTx.gross_amount || 0
      const net = saleTx.net_to_pool || (gross - fee)
      const spreadQ = saleTx.spread_captured || 0
      const contracts = p.payout_if_win || 0
      // Derive bid from gross/contracts, mid from (gross + spreadQ)/contracts
      const bidPrice = contracts > 0 ? gross / contracts : 0
      const midPrice = contracts > 0 ? (gross + spreadQ) / contracts : 0
      const skew = midPrice > 0 && midPrice < 1 ? Math.abs(midPrice - 0.5) / 0.5 : 0
      const spreadPct = midPrice > 0 ? Math.round((sLow + (sHigh - sLow) * skew) * 1000) / 10 : 0
      return {
        id: `${p.id}_sale`, eventId: p.event_id, side: p.side, amount: gross, net, midPrice, askPrice: 0, bidPrice,
        spreadPct, contracts, cobro: net, fee, spreadQ,
        status: 'sold', created_at: p.created_at, txType: 'sale' as const,
        userName: profileMap[p.user_id] || '—', eventQuestion: eventMap[p.event_id]?.question || '—', source: 'position' as const,
      }
    })

  const sellVolume = saleTxs.reduce((s, t) => s + t.amount, 0)

  // predictionTxs excluded from display — kept for reference only
  void predictions
  const unifiedTxs = [...positionTxs, ...saleTxs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const viewTxs = txView === 'purchases'
    ? unifiedTxs.filter((t) => t.txType === 'purchase')
    : unifiedTxs.filter((t) => t.txType === 'sale')
  const filtered = filter === 'all' ? viewTxs : viewTxs.filter((t) => t.status === filter)
  const visible = filtered.slice(0, limit)

  const statusColor = (s: string) => s === 'won' ? '#4ade80' : s === 'lost' ? 'var(--b1n0-muted)' : s === 'sold' ? '#C4B5FD' : '#FFD474'
  const statusLabel = (s: string) => s === 'won' ? 'Ganado' : s === 'lost' ? 'Perdido' : s === 'sold' ? 'Vendido' : 'Activo'

  const fmtQ = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) {
    return <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', padding: '40px 0', textAlign: 'center' }}>Cargando datos de ingresos...</p>
  }

  return (
    <div>
      {/* ── Total revenue hero ── */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '8px' }}>
          Ingreso total de la plataforma
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '12px' }}>
          <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)' }}>Q</span>
          <span style={{ fontFamily: D, fontSize: '48px', fontWeight: 700, color: 'var(--b1n0-text-1)', letterSpacing: '-2px' }}>{fmtQ(totalRevenue)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
          {[
            { label: 'Eventos totales', val: String(totalEvents) },
            { label: 'Resueltos', val: String(resolvedCount) },
            { label: 'Posiciones', val: String(positions.length) },
            { label: 'Ventas', val: String(saleTxs.length), color: '#C4B5FD' },
            { label: 'Pagado a usuarios', val: `Q${fmtQ(totalPaidOut)}` },
            { label: 'Neto', val: `Q${fmtQ(totalRevenue - totalPaidOut)}`, color: totalRevenue > totalPaidOut ? '#4ade80' : '#f87171' },
            { label: 'Resolución', val: `Q${fmtQ(skimTotal)}`, color: '#14b8a6' },
            { label: 'Neto (sin margen)', val: `Q${fmtQ(cut2Total + cut3Est + skimTotal)}`, color: '#C4B5FD' },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' }}>{label}</p>
              <p style={{ fontFamily: F, fontSize: '14px', fontWeight: 600, color: color || 'var(--b1n0-text-1)' }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Four revenue cuts — 2×2 grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>

        {/* Cut 1 — LP Commission */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', borderTop: '3px solid #f87171', minWidth: 0 }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#f87171', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
            CUT 1 — COMISIÓN LP
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '6px' }}>
            <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>-Q</span>
            <span style={{ fontFamily: D, fontSize: '32px', fontWeight: 700, color: '#f87171', letterSpacing: '-1px' }}>{fmtQ(lpCommissionTotal)}</span>
          </div>
          <div style={{ background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>LPs activos</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{lpDepositsAll.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Eventos con LP</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{lpCommissionByEvent.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Fees+Spread (base)</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>Q{fmtQ(lpCommissionByEvent.reduce((s, ev) => s + ev.totalMargins, 0))}</span>
            </div>
          </div>
          {/* Expandable LP breakdown */}
          <button
            onClick={() => setLpExpanded(!lpExpanded)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', color: '#f87171', fontWeight: 600, padding: 0, marginBottom: lpExpanded ? '8px' : 0 }}
          >
            {lpExpanded ? 'Ocultar detalle ▲' : 'Ver detalle por LP ▼'}
          </button>
          {lpExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              {lpCommissionByEvent.map((ev) => (
                <div key={ev.eventId} style={{ background: 'rgba(248,113,113,0.08)', borderRadius: '6px', padding: '8px' }}>
                  <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-text-1)', marginBottom: '4px' }}>{ev.question}</p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '4px' }}>
                    Fees totales: Q{fmtQ(ev.totalMargins)} · Comisión LP: Q{fmtQ(ev.commission)}
                  </p>
                  {ev.lps.map((lp, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
                        LP Q{fmtQ(lp.amount)} ({(lp.return_pct * 100).toFixed(0)}% × Q{fmtQ(lp.delta_fees)} fees+spread)
                      </span>
                      <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: '#f87171' }}>
                        -Q{fmtQ(lp.cut)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {lpCommissionByEvent.length === 0 && (
                <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>Sin LPs registrados.</p>
              )}
            </div>
          )}
        </div>

        {/* Cut 2 — Transaction Fee */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', borderTop: '3px solid #C4B5FD', minWidth: 0 }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#C4B5FD', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
            CUT 2 — COMISIÓN TRANSACCIÓN
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '6px' }}>
            <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Q</span>
            <span style={{ fontFamily: D, fontSize: '32px', fontWeight: 700, color: '#C4B5FD', letterSpacing: '-1px' }}>{fmtQ(cut2Total)}</span>
          </div>
          <div style={{ background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Volumen posiciones</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>Q{fmtQ(cut2Volume)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Tasa dinámica</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#C4B5FD' }}>{rates.fee_floor_pct ?? 1}% – {rates.fee_ceiling_pct ?? 5}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Posiciones totales</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{cut2Count}</span>
            </div>
            {(() => {
              const saleFees = transactions.filter(t => t.tx_type === 'sale').reduce((s, t) => s + (t.fee_deducted || 0), 0)
              const purchaseFees = Math.round((cut2Total - saleFees) * 100) / 100
              return saleFees > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Fee compras</span>
                    <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>Q{fmtQ(purchaseFees)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Fee ventas</span>
                    <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#C4B5FD' }}>Q{fmtQ(saleFees)}</span>
                  </div>
                </>
              ) : null
            })()}
          </div>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>
            Comisión cobrada en cada compra y reventa de contratos binarios.
          </p>
        </div>

        {/* Cut 3 — Spread */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', borderTop: '3px solid #FFD474', minWidth: 0 }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#FFD474', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
            CUT 3 — EL SPREAD
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '6px' }}>
            <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>{cut3IsReal ? 'Q' : '~Q'}</span>
            <span style={{ fontFamily: D, fontSize: '32px', fontWeight: 700, color: '#FFD474', letterSpacing: '-1px' }}>{fmtQ(cut3Est)}</span>
          </div>
          <div style={{ background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Spread compras</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#4ade80' }}>Q{fmtQ(cut3Purchases)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Spread ventas</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#C4B5FD' }}>Q{fmtQ(cut3Sales)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Rango dinámico</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#FFD474' }}>{rates.spread_low_pct}%–{rates.spread_high_pct}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Fuente</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: cut3IsReal ? '#4ade80' : 'var(--b1n0-text-2)' }}>{cut3IsReal ? 'Datos reales' : 'Estimado'}</span>
            </div>
          </div>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>
            {cut3IsReal
              ? 'Spread capturado: compras (ask &gt; mid) + ventas (mid &gt; bid).'
              : 'Estimado — ejecutá el SQL de spread dinámico para datos reales.'}
          </p>
        </div>

        {/* Cut 4 — Resolution Skim */}
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '20px', borderTop: '3px solid #14b8a6', minWidth: 0 }}>
          <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: '#14b8a6', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
            CUT 4 — COMISIÓN DE RESOLUCIÓN
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '6px' }}>
            <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>Q</span>
            <span style={{ fontFamily: D, fontSize: '32px', fontWeight: 700, color: '#14b8a6', letterSpacing: '-1px' }}>{fmtQ(skimTotal)}</span>
          </div>
          <div style={{ background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Eventos resueltos</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{resolvedCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Promedio por evento</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#14b8a6' }}>Q{resolvedCount > 0 ? fmtQ(skimTotal / resolvedCount) : '0'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Destino</span>
              <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#4ade80' }}>Tesorería</span>
            </div>
          </div>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', lineHeight: 1.5 }}>
            5% descontado del cobro de ganadores al resolver. Configurable en Tarifas.
          </p>
        </div>
      </div>

      {/* ── Volume breakdown ── */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '12px' }}>
          Desglose de volumen
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Volumen compras', val: buyVolume, color: 'var(--b1n0-text-1)' },
            { label: 'Volumen ventas', val: sellVolume, color: '#C4B5FD' },
            { label: 'Pagado (ganadores)', val: wonPayout, color: '#FFD474' },
            { label: 'Retenido (perdedores)', val: lostVolume, color: '#4ade80' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '12px', minWidth: 0 }}>
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '4px' }}>{label}</p>
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color, letterSpacing: '-0.5px' }}>
                <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>Q</span>{fmtQ(val)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Transaction history ── */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '16px' }}>
        {/* Header: title + toggle + filters */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Historial de transacciones ({filtered.length})
            </p>
            {/* Compras / Ventas toggle */}
            <div style={{ display: 'flex', background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '2px' }}>
              {(['purchases', 'sales'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => { setTxView(v); setFilter('all'); setLimit(50) }}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontFamily: F, fontWeight: 600, fontSize: '12px',
                    background: txView === v ? (v === 'purchases' ? '#4ade80' : '#C4B5FD') : 'transparent',
                    color: txView === v ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {v === 'purchases' ? `Compras (${unifiedTxs.filter(t => t.txType === 'purchase').length})` : `Ventas (${unifiedTxs.filter(t => t.txType === 'sale').length})`}
                </button>
              ))}
            </div>
          </div>
          {/* Status filters */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(txView === 'purchases'
              ? (['all', 'active', 'won', 'lost', 'sold'] as const)
              : (['all', 'sold'] as const)
            ).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setLimit(50) }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontFamily: F, fontWeight: 600, fontSize: '11px',
                  background: filter === f ? 'var(--b1n0-surface)' : 'var(--b1n0-card)',
                  color: filter === f ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                }}
              >
                {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : f === 'won' ? 'Ganados' : f === 'lost' ? 'Perdidos' : 'Vendidos'}
              </button>
            ))}
          </div>
        </div>

        {/* Sale summary stats (only in sales view) */}
        {txView === 'sales' && saleTxs.length > 0 && (() => {
          const totalSaleGross = saleTxs.reduce((s, t) => s + t.amount, 0)
          const totalSaleFee = saleTxs.reduce((s, t) => s + t.fee, 0)
          const totalSaleSpread = saleTxs.reduce((s, t) => s + t.spreadQ, 0)
          const totalSaleRevenue = totalSaleFee + totalSaleSpread
          return (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[
                { label: 'Volumen ventas', val: `Q${fmtQ(totalSaleGross)}`, color: 'var(--b1n0-text-1)' },
                { label: 'Fee cobrado', val: `Q${fmtQ(totalSaleFee)}`, color: '#C4B5FD' },
                { label: 'Spread capturado', val: `Q${fmtQ(totalSaleSpread)}`, color: '#FFD474' },
                { label: 'Revenue total ventas', val: `Q${fmtQ(totalSaleRevenue)}`, color: '#4ade80' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ flex: '1 1 100px', background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '3px' }}>{label}</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color, letterSpacing: '-0.3px' }}>{val}</p>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Scrollable table */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', scrollbarWidth: 'thin' }}>
          {visible.length === 0 ? (
            <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', padding: '20px 0', textAlign: 'center' }}>
              {txView === 'sales' ? 'No hay ventas registradas.' : 'No hay transacciones.'}
            </p>
          ) : txView === 'purchases' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
              <thead>
                <tr>
                  {['Usuario', 'Evento', 'Lado', 'Entrada', 'Neto', 'Mid', 'Ask', 'Spread %', 'Contratos', 'Cobro', 'Fee', 'Spread Q', 'LP Com.', 'Estado', 'Fecha'].map((h) => (
                    <th key={h} style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--b1n0-card)', zIndex: 1 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 500, color: 'var(--b1n0-text-1)', padding: '8px 6px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.userName}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', padding: '8px 6px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.eventQuestion}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-text-1)', padding: '8px 6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {t.side}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      Q{fmtQ(t.amount)}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      Q{fmtQ(t.net)}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {t.midPrice?.toFixed(3) || '—'}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {t.askPrice?.toFixed(3) || '—'}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', color: '#FFD474', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {t.spreadPct > 0 ? `${t.spreadPct.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {t.contracts > 0 ? t.contracts.toFixed(2) : '—'}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      Q{fmtQ(t.cobro)}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#C4B5FD', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      Q{fmtQ(t.fee)}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#FFD474', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      Q{fmtQ(t.spreadQ)}
                    </td>
                    <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#f87171', padding: '8px 6px', whiteSpace: 'nowrap', position: 'relative' }}>
                      {(() => {
                        const evLps = lpByEvent[t.eventId]
                        if (!evLps || evLps.lps.length === 0) return '—'
                        const txMargins = t.fee + t.spreadQ
                        const txTime = new Date(t.created_at).getTime()
                        // Only count LPs deposited BEFORE this transaction
                        const activeLps = evLps.lps.filter(lp => new Date(lp.created_at).getTime() <= txTime)
                        if (activeLps.length === 0) return '—'
                        let lpCut = 0
                        for (const lp of activeLps) {
                          lpCut += Math.round(lp.return_pct * txMargins * 100) / 100
                        }
                        if (lpCut <= 0) return '—'
                        const isOpen = lpRowExpanded === t.id
                        return (
                          <div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setLpRowExpanded(isOpen ? null : t.id) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#f87171', padding: 0, textDecoration: 'underline dotted' }}
                            >
                              -Q{fmtQ(lpCut)} {isOpen ? '▲' : '▼'}
                            </button>
                            {isOpen && (
                              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 10, background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '8px', padding: '10px', minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' }}>
                                  Desglose LP · Fees: Q{fmtQ(txMargins)}
                                </p>
                                {activeLps.map((lp, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: i < activeLps.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                                    <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
                                      {profileMap[lp.user_id] || lp.user_id.slice(0, 8)} ({(lp.return_pct * 100).toFixed(0)}%)
                                    </span>
                                    <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: '#f87171' }}>
                                      -Q{fmtQ(Math.round(lp.return_pct * txMargins * 100) / 100)}
                                    </span>
                                  </div>
                                ))}
                                {evLps.lps.length > activeLps.length && (
                                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                                    {evLps.lps.length - activeLps.length} LP(s) se unieron después
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{
                        fontFamily: F, fontSize: '9px', fontWeight: 700, color: statusColor(t.status),
                        background: `${statusColor(t.status)}15`, padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap',
                      }}>
                        {statusLabel(t.status)}
                      </span>
                    </td>
                    <td style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {new Date(t.created_at).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Sales table — different columns relevant to sell revenue */
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr>
                  {['Usuario', 'Evento', 'Lado', 'Contratos', 'Mid', 'Bid', 'Spread %', 'Bruto', 'Fee', 'Spread Q', 'Revenue', 'Pagado', 'Fecha'].map((h) => (
                    <th key={h} style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--b1n0-card)', zIndex: 1 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const revenue = t.fee + t.spreadQ
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 500, color: 'var(--b1n0-text-1)', padding: '8px 6px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.userName}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', padding: '8px 6px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.eventQuestion}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-text-1)', padding: '8px 6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {t.side}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        {t.contracts > 0 ? t.contracts.toFixed(2) : '—'}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        {t.midPrice > 0 ? t.midPrice.toFixed(3) : '—'}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#C4B5FD', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        {t.bidPrice > 0 ? t.bidPrice.toFixed(3) : '—'}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', color: '#FFD474', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        {t.spreadPct > 0 ? `${t.spreadPct.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-text-1)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        Q{fmtQ(t.amount)}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#C4B5FD', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        Q{fmtQ(t.fee)}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#FFD474', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        Q{fmtQ(t.spreadQ)}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: '#4ade80', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        Q{fmtQ(revenue)}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        Q{fmtQ(t.net)}
                      </td>
                      <td style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        {new Date(t.created_at).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Load more */}
        {visible.length < filtered.length && (
          <button
            onClick={() => setLimit((l) => l + 50)}
            style={{ width: '100%', padding: '10px', marginTop: '10px', borderRadius: '8px', border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-surface)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)' }}
          >
            Cargar más ({filtered.length - visible.length} restantes)
          </button>
        )}
      </div>
    </div>
  )
}

export { RevenuePanel }

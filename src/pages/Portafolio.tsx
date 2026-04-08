import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVotes } from '../context/VoteContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { midPctToAsk, midPctToBid, SELL_FEE_RATE, round2 } from '../lib/pricing'
import type { UserPrediction } from '../types'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const categoryColors: Record<string, string> = {
  deportes: '#93C5FD', politica: '#C4B5FD', economia: '#FFD474',
  geopolitica: '#FCA5A5', cultura: '#F9A8D4', tecnologia: '#7DD3FC',
  finanzas: '#6EE7B7', otro: 'var(--b1n0-muted)',
}

const categoryLabels: Record<string, string> = {
  deportes: 'Deportes', politica: 'Política', economia: 'Economía',
  geopolitica: 'Geopolítica', cultura: 'Cultura', tecnologia: 'Tecnología',
  finanzas: 'Finanzas', otro: 'Otro',
}

function displaySide(s: string): string {
  if (s === 'yes') return 'SÍ'
  if (s === 'no') return 'NO'
  if (s.includes('::')) {
    const [label, dir] = s.split('::')
    return `${label} — ${dir === 'yes' ? 'SÍ' : 'NO'}`
  }
  return s
}

function isNoSide(s: string): boolean {
  return s === 'no' || (s.includes('::') && s.split('::')[1] === 'no')
}

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins}m`
  if (hours < 24) return `Hace ${hours}h`
  if (days < 7) return `Hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })
}

type SortKey = 'pnl' | 'value' | 'recent'

// Live price info per position
interface SellPreview {
  contracts: number
  bidPrice: number
  gross: number      // contracts × bid
  fee: number        // gross × FEE_RATE
  net: number        // what the user actually receives
}

interface LivePrice {
  currentAsk: number   // current ask price (what they'd see now)
  currentBid: number   // current bid price (what they'd get if selling)
  currentMid: number   // mid price (for mark-to-market valuation)
  entryAsk: number     // what they paid per contract
  sell?: SellPreview   // only present when live data available
}

function PositionCard({
  pred,
  livePrice,
  parimutuelValue,
  contractsMap,
  expanded,
  onToggle,
  onClick,
  onSell,
  selling,
  saleNet,
}: {
  pred: UserPrediction
  livePrice: LivePrice | null
  parimutuelValue: number | null
  contractsMap: Record<string, number>
  expanded: boolean
  onToggle: () => void
  onClick: () => void
  onSell: (positionId: string) => void
  selling: boolean
  saleNet: number  // actual sale proceeds (0 if not sold)
}) {
  const [confirmingSell, setConfirmingSell] = useState(false)
  const color = categoryColors[pred.event.category] || 'var(--b1n0-muted)'
  const noSide = isNoSide(pred.side)
  const sideColor = noSide ? '#f87171' : '#4ade80'
  const sideBg = noSide ? 'var(--b1n0-no-bg)' : 'var(--b1n0-si-bg)'

  const statusColor = pred.status === 'won' ? '#4ade80' : pred.status === 'lost' ? '#f87171' : '#4ade80'
  const statusLabel = pred.status === 'won' ? 'Correcto' : pred.status === 'lost' ? 'Incorrecto' : 'Activo'

  // Entry price: net / contracts = (amount * 0.975) / potentialCobro
  const entryPrice = livePrice?.entryAsk ?? (pred.potentialCobro > 0 ? (pred.amount * 0.975) / pred.potentialCobro : 0)
  const currentPrice = livePrice?.currentAsk ?? entryPrice
  // Use actual contracts from positions, fall back to potentialCobro for resolved
  const contractKey = `${pred.eventId}::${pred.side}`
  const contracts = contractsMap[contractKey] ?? pred.potentialCobro

  // Parimutuel valuation: (myShares / totalSideShares) × poolTotal
  const currentValue = parimutuelValue ?? (contracts * (livePrice?.currentMid ?? entryPrice))
  const invested = pred.amount

  const isSold = pred.status === 'sold'

  const pnl = pred.status === 'won'
    ? pred.potentialCobro - invested
    : isSold
    ? saleNet - invested
    : pred.status === 'lost'
    ? -invested
    : currentValue - invested

  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
  const isUp = pnl >= 0

  const maxPayoutPct = invested > 0 ? ((pred.potentialCobro / invested) - 1) * 100 : 0

  return (
    <div style={{
      background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)',
      borderRadius: '14px', overflow: 'hidden',
    }}>
      {/* Main card — click to expand */}
      <div
        onClick={onToggle}
        style={{ padding: '16px', cursor: 'pointer' }}
      >
        {/* Top: category + status + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
          }} />
          <span style={{
            fontFamily: F, fontSize: '10px', fontWeight: 700, color: color,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            {categoryLabels[pred.event.category] || 'Otro'}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{
            fontFamily: F, fontSize: '10px', fontWeight: 600, color: statusColor,
            background: `${statusColor}18`, borderRadius: '5px', padding: '2px 7px',
          }}>
            {statusLabel}
          </span>
          <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
            {timeAgo(pred.createdAt)}
          </span>
        </div>

        {/* Event question */}
        <p style={{
          fontFamily: F, fontSize: '13px', fontWeight: 500, color: 'var(--b1n0-muted)',
          lineHeight: 1.4, marginBottom: '6px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {pred.event.question}
        </p>

        {/* Side badge + option */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span style={{
            fontFamily: F, fontSize: '12px', fontWeight: 700,
            color: sideColor, background: sideBg,
            borderRadius: '6px', padding: '3px 9px',
          }}>
            {displaySide(pred.side)}
          </span>
        </div>

        {/* Price row: entry → current → P&L */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Entry price */}
            <div>
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                Entrada
              </p>
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: 'var(--b1n0-muted)', letterSpacing: '-0.5px' }}>
                {entryPrice.toFixed(2)}
              </p>
            </div>
            <span style={{ color: 'var(--b1n0-text-2)', fontSize: '14px', marginBottom: '-2px' }}>→</span>
            {/* Current price */}
            <div>
              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                {pred.status === 'active' ? 'Actual' : pred.status === 'won' ? 'Ganó' : 'Final'}
              </p>
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: pred.status === 'won' ? '#4ade80' : pred.status === 'lost' ? '#f87171' : 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
                {pred.status === 'active' ? currentPrice.toFixed(2) : pred.status === 'won' ? '✓' : '✗'}
              </p>
            </div>
          </div>

          {/* P&L */}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
              P&L
            </p>
            <p style={{
              fontFamily: D, fontWeight: 700, fontSize: '17px',
              color: pred.status === 'active' ? (isUp ? '#4ade80' : '#f87171') : (pred.status === 'won' ? '#4ade80' : '#f87171'),
              letterSpacing: '-0.5px',
            }}>
              {isUp ? '+' : ''}Q{pnl.toFixed(2)}
            </p>
            <p style={{
              fontFamily: F, fontSize: '10px', fontWeight: 700,
              color: isUp ? '#4ade80' : '#f87171',
            }}>
              {isUp ? '+' : ''}{pnlPct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--b1n0-border)', padding: '16px',
          background: 'var(--b1n0-surface)',
        }}>
          {/* Detail grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Invertido', value: `Q${invested.toFixed(2)}`, color: 'var(--b1n0-text-1)' },
              { label: 'Contratos', value: contracts.toFixed(2), color: 'var(--b1n0-text-1)' },
              { label: pred.status === 'active' ? 'Valor actual' : 'Resultado',
                value: pred.status === 'won' ? `Q${(pred.potentialCobro || 0).toFixed(2)}`
                  : pred.status === 'lost' ? 'Q0.00'
                  : pred.status === 'active' ? `Q${currentValue.toFixed(2)}` : '—',
                color: pred.status === 'won' ? '#4ade80' : pred.status === 'lost' ? '#f87171' : 'var(--b1n0-text-1)' },
              { label: pred.status === 'active' ? 'Si gana' : 'Cobrado',
                value: pred.status === 'won' ? `Q${(pred.potentialCobro || 0).toFixed(2)}`
                  : pred.status === 'lost' ? 'Q0.00'
                  : `Q${(parimutuelValue ?? pred.potentialCobro).toFixed(2)}`,
                color: pred.status === 'won' ? '#4ade80' : pred.status === 'lost' ? '#f87171' : '#4ade80',
                sub: pred.status === 'active' ? `+${(invested > 0 ? (((parimutuelValue ?? pred.potentialCobro) / invested) - 1) * 100 : 0).toFixed(0)}%` : undefined },
            ].map((item) => (
              <div key={item.label}>
                <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                  {item.label}
                </p>
                <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: item.color, letterSpacing: '-0.3px' }}>
                  {item.value}
                </p>
                {'sub' in item && item.sub && (
                  <p style={{ fontFamily: F, fontSize: '10px', color: '#4ade80', marginTop: '1px' }}>{item.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onClick() }}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px',
                border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-text-1)',
                cursor: 'pointer',
              }}
            >
              Ver evento →
            </button>
            {pred.status === 'active' && livePrice?.sell && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingSell(true) }}
                disabled={selling}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px',
                  border: 'none', background: selling ? 'rgba(255,255,255,0.12)' : 'var(--b1n0-surface)',
                  fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff',
                  cursor: selling ? 'default' : 'pointer',
                }}
              >
                {selling ? 'Vendiendo...' : `Salida anticipada Q${livePrice.sell.net.toFixed(2)}`}
              </button>
            )}
          </div>

          {/* Sell confirmation sheet */}
          {confirmingSell && livePrice?.sell && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                marginTop: '12px', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)',
                borderRadius: '12px', padding: '16px',
              }}
            >
              <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>
                Salida anticipada
              </p>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '14px', lineHeight: 1.4 }}>
                Salir antes del resultado tiene un descuento por spread y comisión. Si esperás al resultado, tu cobro potencial es mayor.
              </p>

              {/* Comparison: hold vs sell */}
              {parimutuelValue !== null && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ flex: 1, padding: '10px', background: 'var(--b1n0-si-bg)', borderRadius: '10px', border: '1px solid var(--b1n0-border)', textAlign: 'center' }}>
                    <p style={{ fontFamily: F, fontSize: '9px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Si gana</p>
                    <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: '#4ade80' }}>Q{parimutuelValue.toFixed(2)}</p>
                  </div>
                  <div style={{ flex: 1, padding: '10px', background: 'rgba(255,212,116,0.10)', borderRadius: '10px', border: '1px solid var(--b1n0-border)', textAlign: 'center' }}>
                    <p style={{ fontFamily: F, fontSize: '9px', color: '#FFD474', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Salida ahora</p>
                    <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: '#FFD474' }}>Q{livePrice.sell.net.toFixed(2)}</p>
                  </div>
                </div>
              )}

              {/* Breakdown rows */}
              {[
                { label: 'Contratos', value: livePrice.sell.contracts.toFixed(2) },
                { label: 'Precio de venta (bid)', value: livePrice.sell.bidPrice.toFixed(4) },
                { label: 'Valor bruto', value: `Q${livePrice.sell.gross.toFixed(2)}` },
                { label: 'Comisión plataforma', value: `-Q${livePrice.sell.fee.toFixed(2)}`, color: 'var(--b1n0-no)' },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{row.label}</span>
                  <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: (row as { color?: string }).color || 'var(--b1n0-text-1)' }}>
                    {row.value}
                  </span>
                </div>
              ))}

              {/* Net total */}
              <div style={{
                borderTop: '1px solid var(--b1n0-border)', paddingTop: '10px', marginTop: '4px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>Recibís</span>
                <span style={{ fontFamily: D, fontWeight: 800, fontSize: '20px', color: '#FFD474', letterSpacing: '-0.5px' }}>
                  Q{livePrice.sell.net.toFixed(2)}
                </span>
              </div>

              {/* P&L comparison */}
              {(() => {
                const diff = round2(livePrice.sell.net - pred.amount)
                const isGain = diff >= 0
                return (
                  <p style={{ fontFamily: F, fontSize: '11px', color: isGain ? '#4ade80' : '#f87171', marginTop: '6px', textAlign: 'right' }}>
                    {isGain ? '+' : ''}Q{diff.toFixed(2)} vs tu entrada de Q{pred.amount.toFixed(2)}
                  </p>
                )
              })()}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button
                  onClick={() => setConfirmingSell(false)}
                  disabled={selling}
                  style={{
                    flex: 1, padding: '11px', borderRadius: '10px',
                    border: '1px solid var(--b1n0-border)', background: 'var(--b1n0-card)',
                    fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { setConfirmingSell(false); onSell(pred.id) }}
                  disabled={selling}
                  style={{
                    flex: 1, padding: '11px', borderRadius: '10px',
                    border: 'none', background: selling ? 'rgba(255,255,255,0.12)' : 'var(--b1n0-surface)',
                    fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff',
                    cursor: selling ? 'default' : 'pointer',
                  }}
                >
                  {selling ? 'Vendiendo...' : 'Confirmar venta'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Portafolio() {
  const navigate = useNavigate()
  const { predictions, refreshPredictions } = useVotes()
  const { session, profile, refreshProfile } = useAuth()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'resolved'>('active')
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortKey>('pnl')
  const [sellingId, setSellingId] = useState<string | null>(null)
  const [sellError, setSellError] = useState<string | null>(null)

  // ── LP Dashboard state ──
  interface LpPosition {
    id: string
    event_id: string
    amount: number
    return_pct: number
    status: string
    payout: number | null
    fees_at_deposit: number
    spread_at_deposit: number
    created_at: string
    event_question: string
    event_status: string
    fees_collected: number  // current total fees on this event
    spread_collected: number  // current total spread on this event
  }
  const [lpPositions, setLpPositions] = useState<LpPosition[]>([])
  const [lpLoading, setLpLoading] = useState(false)

  const fetchLpPositions = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return
    setLpLoading(true)
    const { data: deposits } = await supabase
      .from('lp_deposits')
      .select('id, event_id, amount, return_pct, status, payout, fees_at_deposit, spread_at_deposit, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (!deposits || deposits.length === 0) { setLpPositions([]); setLpLoading(false); return }

    // Fetch event info + market fees for each event
    const eventIds = [...new Set(deposits.map(d => d.event_id))]
    const [evRes, mktRes] = await Promise.all([
      supabase.from('events').select('id, question, status').in('id', eventIds),
      supabase.from('event_markets').select('event_id, fees_collected, spread_collected').in('event_id', eventIds),
    ])
    const evMap: Record<string, { question: string; status: string }> = {}
    if (evRes.data) for (const e of evRes.data) evMap[e.id] = { question: e.question, status: e.status }
    const feesMap: Record<string, number> = {}
    const spreadMap: Record<string, number> = {}
    if (mktRes.data) for (const m of mktRes.data as any[]) {
      feesMap[m.event_id] = Number(m.fees_collected) || 0
      spreadMap[m.event_id] = Number(m.spread_collected) || 0
    }

    setLpPositions(deposits.map(d => ({
      ...d,
      fees_at_deposit: d.fees_at_deposit || 0,
      spread_at_deposit: d.spread_at_deposit || 0,
      event_question: evMap[d.event_id]?.question || d.event_id.slice(0, 8),
      event_status: evMap[d.event_id]?.status || 'open',
      fees_collected: feesMap[d.event_id] || 0,
      spread_collected: spreadMap[d.event_id] || 0,
    })))
    setLpLoading(false)
  }, [session?.user?.id])

  useEffect(() => { fetchLpPositions() }, [fetchLpPositions])

  async function handleSell(positionId: string) {
    const uid = session?.user?.id
    if (!uid) return
    setSellingId(positionId)
    setSellError(null)

    const { data, error: err } = await supabase.rpc('execute_sell', {
      p_position_id: positionId,
      p_user_id: uid,
    })

    if (err) {
      setSellError(err.message)
    } else if (data?.error) {
      setSellError(data.error as string)
    } else {
      // Refresh everything
      await Promise.all([refreshPredictions(), refreshProfile(), fetchLiveData()])
    }
    setSellingId(null)
  }

  // Live prices: eventId → { yesMidPct, noMidPct } for binary, or eventId → { optLabel → midPct } for open
  const [liveBinaryMap, setLiveBinaryMap] = useState<Record<string, { yes: number; no: number }>>({})
  const [liveOptMap, setLiveOptMap] = useState<Record<string, Record<string, number>>>({})
  // Parimutuel pool data: eventId → { poolTotal, yesShares, noShares }
  const [poolDataMap, setPoolDataMap] = useState<Record<string, { poolTotal: number; yesShares: number; noShares: number; lpCapital: number; betPool: number }>>({})
  // Actual contracts held per event+side (from positions table)
  const [contractsMap, setContractsMap] = useState<Record<string, number>>({})
  // Per-position contracts: positionId → contracts (for accurate sell preview)
  const [positionContractsMap, setPositionContractsMap] = useState<Record<string, number>>({})
  // Entry prices from positions table
  const [entryPrices, setEntryPrices] = useState<Record<string, number>>({})
  // Sale proceeds: position_id → net_to_pool (what user received)
  const [saleProceeds, setSaleProceeds] = useState<Record<string, number>>({})

  useEffect(() => {
    refreshPredictions()
    refreshProfile()
  }, [])

  // Fetch live market data + entry prices
  const fetchLiveData = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return

    const eventIds = [...new Set(predictions.map((p) => p.eventId))]
    if (eventIds.length === 0) return

    const [emRes, omRes, posRes, saleRes] = await Promise.all([
      supabase.from('event_markets').select('event_id, yes_shares, no_shares, pool_total, lp_capital, bet_pool').in('event_id', eventIds),
      supabase.from('option_markets').select('event_id, option_label, yes_shares, no_shares').in('event_id', eventIds).eq('status', 'open'),
      supabase.from('positions').select('id, event_id, price_at_purchase, contracts, side, status').eq('user_id', uid).in('event_id', eventIds),
      supabase.from('market_transactions').select('position_id, net_to_pool').eq('user_id', uid).eq('tx_type', 'sale'),
    ])

    // Binary prices + parimutuel pool data
    const binMap: Record<string, { yes: number; no: number }> = {}
    const poolMap: Record<string, { poolTotal: number; yesShares: number; noShares: number; lpCapital: number; betPool: number }> = {}
    if (emRes.data) {
      for (const row of emRes.data as { event_id: string; yes_shares: number; no_shares: number; pool_total: number; lp_capital: number; bet_pool: number }[]) {
        const total = Number(row.yes_shares) + Number(row.no_shares)
        poolMap[row.event_id] = {
          poolTotal: Number(row.pool_total) || 0,
          yesShares: Number(row.yes_shares) || 0,
          noShares: Number(row.no_shares) || 0,
          lpCapital: Number(row.lp_capital) || 0,
          betPool: Number(row.bet_pool) || 0,
        }
        if (total > 0) {
          binMap[row.event_id] = {
            yes: Number(row.yes_shares) / total * 100,
            no: Number(row.no_shares) / total * 100,
          }
        }
      }
    }
    setLiveBinaryMap(binMap)
    setPoolDataMap(poolMap)

    // Build user contracts map: eventId+side → totalContracts (from active positions only)
    // Also build per-position contracts map: positionId → contracts (for accurate sell preview)
    const userContractsMap: Record<string, number> = {}
    const perPositionContracts: Record<string, number> = {}
    if (posRes.data) {
      for (const row of posRes.data as { id: string; event_id: string; price_at_purchase: number; contracts: number; side: string; status: string }[]) {
        if (row.status && row.status !== 'active') continue
        const key = `${row.event_id}::${row.side}`
        userContractsMap[key] = (userContractsMap[key] || 0) + Number(row.contracts)
        perPositionContracts[row.id] = Number(row.contracts)
      }
    }
    setContractsMap(userContractsMap)
    setPositionContractsMap(perPositionContracts)

    // Option prices
    const optMap: Record<string, Record<string, number>> = {}
    if (omRes.data) {
      for (const row of omRes.data as { event_id: string; option_label: string; yes_shares: number; no_shares: number }[]) {
        const total = Number(row.yes_shares) + Number(row.no_shares)
        if (!optMap[row.event_id]) optMap[row.event_id] = {}
        optMap[row.event_id][row.option_label] = total > 0 ? Number(row.yes_shares) / total * 100 : 50
      }
    }
    setLiveOptMap(optMap)

    // Entry prices from positions
    const entries: Record<string, number> = {}
    if (posRes.data) {
      for (const row of posRes.data as { id: string; price_at_purchase: number }[]) {
        entries[row.id] = Number(row.price_at_purchase) || 0
      }
    }
    setEntryPrices(entries)

    // Sale proceeds: position_id → net amount user received
    const sales: Record<string, number> = {}
    if (saleRes.data) {
      for (const row of saleRes.data as { position_id: string; net_to_pool: number }[]) {
        sales[row.position_id] = Number(row.net_to_pool) || 0
      }
    }
    setSaleProceeds(sales)
  }, [session?.user?.id, predictions.length])

  useEffect(() => { fetchLiveData() }, [fetchLiveData])

  // Auto-refresh live prices every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => { fetchLiveData() }, 10_000)
    return () => clearInterval(interval)
  }, [fetchLiveData])

  // Compute live price for a prediction
  function getLivePrice(pred: UserPrediction): LivePrice | null {
    if (pred.status !== 'active') return null

    // Entry price
    const storedEntry = entryPrices[pred.id]
    const derivedEntry = pred.potentialCobro > 0 ? (pred.amount * 0.975) / pred.potentialCobro : 0
    const entryAsk = storedEntry || derivedEntry

    // Current prices — will be overwritten when live data loads
    let currentMid = 0.50  // neutral fallback until live data arrives
    let currentAsk = entryAsk
    let hasLiveData = false
    const side = pred.side
    const eid = pred.eventId
    const isBinary = pred.event.eventType !== 'open'

    if (isBinary) {
      const live = liveBinaryMap[eid]
      if (live) {
        const midPct = side === 'yes' ? live.yes : side === 'no' ? live.no : live.yes
        currentMid = midPct / 100
        currentAsk = midPctToAsk(midPct)
        hasLiveData = true
      }
    } else {
      // Open event: extract option label from side
      const label = side.includes('::') ? side.split('::')[0] : side
      const optPcts = liveOptMap[eid]
      if (optPcts && optPcts[label] !== undefined) {
        currentMid = optPcts[label] / 100
        currentAsk = midPctToAsk(optPcts[label])
        hasLiveData = true
      }
    }

    // Bid price — only meaningful with live market data
    const currentBid = hasLiveData ? midPctToBid(currentMid * 100) : 0

    // Sell preview: what THIS POSITION would get (not total side)
    // Uses actual position contracts for accuracy (not ratio estimate)
    // Capped: sell value can never exceed parimutuel win value
    let sell: SellPreview | undefined
    if (hasLiveData && currentBid > 0) {
      // Use actual position contracts if available, fall back to ratio estimate
      const actualContracts = positionContractsMap[pred.id]
      let myContracts: number
      if (actualContracts !== undefined && actualContracts > 0) {
        myContracts = round2(actualContracts)
      } else {
        // Fallback: estimate via ratio (for resolved positions without contracts data)
        const ck = `${pred.eventId}::${pred.side}`
        const totalSideContracts = contractsMap[ck] ?? 0
        const allSidePreds = predictions.filter(pp => pp.eventId === pred.eventId && pp.side === pred.side && pp.status === 'active')
        const totalSideInvested = allSidePreds.reduce((ss, pp) => ss + pp.amount, 0)
        const myRatio = totalSideInvested > 0 ? pred.amount / totalSideInvested : 0
        myContracts = round2(totalSideContracts * myRatio)
      }
      let gross = round2(myContracts * currentBid)

      // Cap: sell net can't exceed parimutuel value for this position
      const pmVal = getParimutuelValue(pred)
      if (pmVal !== null && gross > pmVal) gross = round2(pmVal)

      const fee = round2(gross * SELL_FEE_RATE)
      let net = round2(gross - fee)
      // Final cap: net sell can never exceed parimutuel win value
      if (pmVal !== null && net > pmVal) net = round2(pmVal)
      sell = { contracts: myContracts, bidPrice: currentBid, gross, fee, net }
    }

    return { entryAsk, currentAsk, currentBid, currentMid, sell }
  }

  // Parimutuel valuation: (myShares / totalSideShares) × distributablePool
  // distributablePool = poolTotal - lpCapital (LP capital is returned to LPs first at resolution)
  // Get parimutuel value for a SIDE on an event (not per-prediction)
  // Returns what ALL your shares on this side would get if this side wins
  function getParimutuelValueForSide(eventId: string, side: string, eventType: string): number | null {
    const pool = poolDataMap[eventId]
    if (!pool || pool.betPool <= 0) return null

    // Distributable = pool_total minus LP capital (sponsor money IS prize money)
    // When no sponsor, pool_total = bet_pool. When sponsor exists, it's prize money.
    const distributable = pool.poolTotal - pool.lpCapital
    const isBinary = eventType !== 'open'

    if (isBinary) {
      const contractKey = `${eventId}::${side}`
      const myShares = contractsMap[contractKey]
      if (!myShares || myShares <= 0) return null

      const sideShares = (side === 'yes' || (!side.includes('::') && side !== 'no'))
        ? pool.yesShares
        : pool.noShares
      if (sideShares <= 0) return null
      return (myShares / sideShares) * distributable
    }
    return null
  }

  // Per-prediction value: proportional share of side value based on this prediction's contracts
  function getParimutuelValue(pred: UserPrediction): number | null {
    const sideValue = getParimutuelValueForSide(pred.eventId, pred.side, pred.event.eventType ?? 'binary')
    if (sideValue === null) return null

    // This prediction's share of the side (based on contracts ratio)
    const contractKey = `${pred.eventId}::${pred.side}`
    const totalMyShares = contractsMap[contractKey]
    if (!totalMyShares || totalMyShares <= 0) return null

    // pred.potentialCobro represents this prediction's contracts proportion
    // Use gross_amount ratio as proxy for share of the side
    const allSidePreds = predictions.filter(p => p.eventId === pred.eventId && p.side === pred.side && p.status === 'active')
    const totalSideInvested = allSidePreds.reduce((s, p) => s + p.amount, 0)
    if (totalSideInvested <= 0) return null

    return sideValue * (pred.amount / totalSideInvested)
  }

  // Compute unrealized P&L for a position (parimutuel model)
  function getUnrealizedPnl(pred: UserPrediction, lp: LivePrice | null): number {
    if (pred.status === 'won') return pred.potentialCobro - pred.amount
    if (pred.status === 'lost') return -pred.amount

    // Parimutuel: use pool-proportional valuation
    const pmValue = getParimutuelValue(pred)
    if (pmValue !== null) return pmValue - pred.amount

    // Fallback for open events or missing data
    if (!lp) return 0
    const currentValue = pred.potentialCobro * lp.currentMid
    return currentValue - pred.amount
  }

  const active = predictions.filter((p) => p.status === 'active')
  const resolved = predictions.filter((p) => p.status !== 'active')
  const won = resolved.filter((p) => p.status === 'won')

  const totalInvested = active.reduce((s, p) => s + p.amount, 0)

  // ── Parimutuel-aware aggregation: group by event, pick best-case side per event ──
  // For each event, calculate what you'd get if YES wins vs NO wins,
  // then take the better outcome. You can't win on BOTH sides.
  const uniqueEventIds = [...new Set(active.map(p => p.eventId))]
  let totalCurrentValue = 0
  let totalPotentialReturn = 0

  for (const eid of uniqueEventIds) {
    const eventPreds = active.filter(p => p.eventId === eid)
    const eventType = eventPreds[0]?.event.eventType ?? 'binary'

    const yesVal = getParimutuelValueForSide(eid, 'yes', eventType) ?? 0
    const noVal = getParimutuelValueForSide(eid, 'no', eventType) ?? 0
    const pool = poolDataMap[eid]

    // Best case: whichever side wins gives you more
    totalPotentialReturn += Math.max(yesVal, noVal)

    // Current value: weight by probability
    if (pool && pool.yesShares + pool.noShares > 0) {
      const yesProb = pool.yesShares / (pool.yesShares + pool.noShares)
      totalCurrentValue += (yesVal * yesProb) + (noVal * (1 - yesProb))
    } else {
      totalCurrentValue += Math.max(yesVal, noVal) * 0.5
    }
  }

  const totalUnrealizedPnl = totalCurrentValue - totalInvested
  const totalUnrealizedPct = totalInvested > 0 ? (totalUnrealizedPnl / totalInvested) * 100 : 0

  // Total sell value: what you'd get if you sold everything now
  // Capped: can never exceed Si Gana (selling should always be worse than winning)
  const rawSellValue = active.reduce((s, p) => {
    const lp = getLivePrice(p)
    return s + (lp?.sell ? lp.sell.net : 0)
  }, 0)
  const totalSellValue = Math.min(rawSellValue, totalPotentialReturn > 0 ? totalPotentialReturn : rawSellValue)
  const isPortfolioUp = totalUnrealizedPnl >= 0

  const historicalPL = resolved.reduce((s, p) =>
    p.status === 'won' ? s + (p.potentialCobro - p.amount)
    : p.status === 'sold' ? s + ((saleProceeds[p.id] || 0) - p.amount)
    : s - p.amount, 0)
  const accuracy = resolved.length > 0 ? Math.round((won.length / resolved.length) * 100) : null

  // Filter + sort
  const displayList = (tab === 'active' ? active : resolved)
    .filter((p) => filter === 'all' || p.event.category === filter)

  const sorted = [...displayList].sort((a, b) => {
    if (sortBy === 'pnl') {
      return getUnrealizedPnl(b, getLivePrice(b)) - getUnrealizedPnl(a, getLivePrice(a))
    }
    if (sortBy === 'value') return b.amount - a.amount
    if (sortBy === 'recent') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    return 0
  })

  const categories = [...new Set(predictions.map((p) => p.event.category))]

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '0 16px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px 0 4px' }}>
        <button
          onClick={() => navigate('/perfil')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '22px', color: 'var(--b1n0-muted)', padding: 0, lineHeight: 1, flexShrink: 0 }}
        >
          ←
        </button>
        <div>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', lineHeight: 1.1 }}>Mi Portafolio</p>
          {profile && (
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{profile.name}</p>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '20px 0 8px' }}>
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            En juego
          </p>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
            Q{totalInvested.toFixed(0)}
          </p>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            {active.length} posicion{active.length !== 1 ? 'es' : ''}
          </p>
        </div>

        <div style={{ background: 'var(--b1n0-card)', border: `1px solid ${isPortfolioUp ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: '14px', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            P&L no realizado
          </p>
          <p style={{
            fontFamily: D, fontWeight: 800, fontSize: '22px',
            color: active.length === 0 ? 'var(--b1n0-muted)' : isPortfolioUp ? '#4ade80' : '#f87171',
            letterSpacing: '-0.5px',
          }}>
            {active.length > 0 ? `${isPortfolioUp ? '+' : ''}Q${totalUnrealizedPnl.toFixed(2)}` : '—'}
          </p>
          {active.length > 0 && (
            <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: isPortfolioUp ? '#4ade80' : '#f87171', marginTop: '2px' }}>
              {isPortfolioUp ? '+' : ''}{totalUnrealizedPct.toFixed(1)}% si tu lado gana
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Si gana
          </p>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: '#4ade80', letterSpacing: '-0.5px' }}>
            {active.length > 0 ? `Q${totalPotentialReturn.toFixed(0)}` : '—'}
          </p>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            {active.length > 0 ? `+${((totalPotentialReturn / totalInvested - 1) * 100).toFixed(0)}% retorno parimutuel` : 'Sin posiciones'}
          </p>
        </div>

        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Salida anticipada
          </p>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: totalSellValue >= totalInvested ? 'var(--b1n0-text-1)' : '#f87171', letterSpacing: '-0.5px' }}>
            {active.length > 0 && totalSellValue > 0 ? `Q${totalSellValue.toFixed(2)}` : '—'}
          </p>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            {active.length > 0 && totalSellValue > 0 ? `Si vendés todo ahora` : 'Sin datos de mercado'}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '3px', marginBottom: '12px' }}>
        {([
          ['active', `Activos (${active.length})`],
          ['resolved', `Resueltos (${resolved.length})`],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '9px', borderRadius: '7px', border: 'none',
              cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px',
              background: tab === t ? 'var(--b1n0-card)' : 'transparent',
              color: tab === t ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters + sort */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              fontFamily: F, fontWeight: 600, fontSize: '11px',
              background: filter === 'all' ? 'var(--b1n0-card)' : 'transparent',
              color: filter === 'all' ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
            }}
          >
            Todas
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: F, fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap',
                background: filter === cat ? categoryColors[cat] + '22' : 'transparent',
                color: filter === cat ? categoryColors[cat] : 'var(--b1n0-muted)',
              }}
            >
              {categoryLabels[cat] || cat}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {([
            ['pnl', 'P&L'],
            ['value', 'Valor'],
            ['recent', 'Reciente'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              style={{
                padding: '3px 8px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                fontFamily: F, fontWeight: 500, fontSize: '10px',
                background: sortBy === key ? 'var(--b1n0-surface)' : 'transparent',
                color: sortBy === key ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Resolved sub-stats */}
      {tab === 'resolved' && resolved.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          {[
            { label: 'Correctos', value: String(won.length), color: '#4ade80' },
            { label: 'Incorrectos', value: String(resolved.length - won.length), color: '#f87171' },
            { label: 'Historial P&L', value: `${historicalPL >= 0 ? '+' : ''}Q${Math.abs(historicalPL).toFixed(2)}`, color: historicalPL >= 0 ? '#4ade80' : '#f87171' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: s.color, letterSpacing: '-0.5px' }}>{s.value}</p>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Position list */}
      {sorted.length === 0 ? (
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: 'var(--b1n0-text-1)', marginBottom: '8px' }}>
            {tab === 'active' ? 'Sin posiciones activas' : 'Sin eventos resueltos'}
          </p>
          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', lineHeight: 1.5, marginBottom: '20px' }}>
            {tab === 'active'
              ? 'Cuando participás en un evento, tu posición aparece aquí.'
              : 'Los eventos que se cierren y resuelvan mostrarán tus resultados.'}
          </p>
          {tab === 'active' && (
            <button
              onClick={() => navigate('/inicio')}
              style={{ padding: '11px 24px', borderRadius: '10px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: '#fff' }}
            >
              Explorar eventos →
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sellError && (
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', textAlign: 'center', padding: '8px', background: 'var(--b1n0-no-bg)', borderRadius: '8px' }}>
              {sellError}
            </p>
          )}
          {sorted.map((pred) => (
            <PositionCard
              key={pred.id}
              pred={pred}
              livePrice={getLivePrice(pred)}
              parimutuelValue={getParimutuelValue(pred)}
              contractsMap={contractsMap}
              expanded={expandedId === pred.id}
              onToggle={() => setExpandedId(expandedId === pred.id ? null : pred.id)}
              onClick={() => navigate(`/eventos/${pred.eventId}`)}
              onSell={handleSell}
              selling={sellingId === pred.id}
              saleNet={saleProceeds[pred.id] || 0}
            />
          ))}
        </div>
      )}

      {/* ═══════════════ LP DASHBOARD ═══════════════ */}
      {lpPositions.length > 0 && (
        <div style={{ marginTop: '24px', marginBottom: '16px' }}>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)', marginBottom: '12px' }}>
            Capital LP
          </p>

          {/* LP Summary cards */}
          {(() => {
            const totalDeposited = lpPositions.reduce((s, lp) => s + lp.amount, 0)
            const activeDeposits = lpPositions.filter(lp => lp.status === 'active')
            const returnedDeposits = lpPositions.filter(lp => lp.status === 'returned' || lp.status === 'partial_loss')
            const totalActiveCapital = activeDeposits.reduce((s, lp) => s + lp.amount, 0)
            const totalEarnedEstimate = activeDeposits.reduce((s, lp) => {
              const totalMargins = lp.fees_collected + lp.spread_collected
              const marginsAtDeposit = lp.fees_at_deposit + lp.spread_at_deposit
              return s + lp.return_pct * Math.max(totalMargins - marginsAtDeposit, 0)
            }, 0)
            const totalPaidOut = returnedDeposits.reduce((s, lp) => s + (lp.payout || 0), 0)
            const totalReturnedCapital = returnedDeposits.reduce((s, lp) => s + lp.amount, 0)
            const totalProfit = totalPaidOut - totalReturnedCapital + totalEarnedEstimate
            const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Capital activo</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: '#C4B5FD', letterSpacing: '-0.5px' }}>Q{fmt(totalActiveCapital)}</p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{activeDeposits.length} evento{activeDeposits.length !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Ganancia estimada</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: totalProfit >= 0 ? '#4ade80' : '#f87171', letterSpacing: '-0.5px' }}>
                    {totalProfit >= 0 ? '+' : ''}Q{fmt(totalProfit)}
                  </p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>Fees ganados como LP</p>
                </div>
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Total depositado</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>Q{fmt(totalDeposited)}</p>
                </div>
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Cobrado</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: '#4ade80', letterSpacing: '-0.5px' }}>Q{fmt(totalPaidOut)}</p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{returnedDeposits.length} resuelto{returnedDeposits.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            )
          })()}

          {/* Individual LP positions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lpPositions.map((lp) => {
              const totalMargins = lp.fees_collected + lp.spread_collected
              const marginsAtDeposit = lp.fees_at_deposit + lp.spread_at_deposit
              const deltaMargins = Math.max(totalMargins - marginsAtDeposit, 0)
              const estimatedEarning = Math.round(lp.return_pct * deltaMargins * 100) / 100
              const isActive = lp.status === 'active'
              const isReturned = lp.status === 'returned'
              const statusColor = isActive ? '#C4B5FD' : isReturned ? '#4ade80' : '#f87171'
              const statusLabel = isActive ? 'Activo' : isReturned ? 'Retornado' : 'Pérdida parcial'
              const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

              return (
                <div key={lp.id} style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
                      {lp.event_question}
                    </p>
                    <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: statusColor, background: `${statusColor}15`, padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Capital</p>
                      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)' }}>Q{fmt(lp.amount)}</p>
                    </div>
                    <div>
                      <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>% de fees</p>
                      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: '#C4B5FD' }}>{(lp.return_pct * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Fees post-depósito</p>
                      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)' }}>Q{fmt(deltaMargins)}</p>
                    </div>
                    <div>
                      <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        {isActive ? 'Ganancia est.' : 'Cobrado'}
                      </p>
                      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: '#4ade80' }}>
                        {isActive ? `+Q${fmt(estimatedEarning)}` : `Q${fmt(lp.payout || 0)}`}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '6px' }}>
                    Depositado {new Date(lp.created_at).toLocaleString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

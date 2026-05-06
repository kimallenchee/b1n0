import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVotes } from '../context/VoteContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { midPctToAsk, midPctToBid, SELL_FEE_RATE, RESOLUTION_SKIM, round2 } from '../lib/pricing'
import type { UserPrediction } from '../types'
import { usePageMeta } from '../hooks/usePageMeta'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

// RESOLUTION_SKIM is imported from ../lib/pricing — its value is hydrated
// at app boot from platform_config.resolution_skim_pct (managed in the
// admin Tarifas panel), mirroring how SELL_FEE_RATE / FEE_RATE flow.

const categoryColors: Record<string, string> = {
  deportes: '#93C5FD', politica: '#C4B5FD', economia: 'var(--b1n0-gold)',
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
  potentialPayout,
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
  potentialPayout: number
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
  const sideColor = noSide ? 'var(--b1n0-no)' : 'var(--b1n0-si)'
  const sideBg = noSide ? 'var(--b1n0-no-bg)' : 'var(--b1n0-si-bg)'

  const statusColor = pred.status === 'won' ? 'var(--b1n0-si)' : pred.status === 'lost' ? 'var(--b1n0-no)' : 'var(--b1n0-si)'
  const statusLabel = pred.status === 'won' ? 'Correcto' : pred.status === 'lost' ? 'Incorrecto' : 'Activo'

  // Entry price: net / contracts = (amount * 0.975) / potentialCobro
  const entryPrice = livePrice?.entryAsk ?? (pred.potentialCobro > 0 ? (pred.amount * 0.975) / pred.potentialCobro : 0)
  const currentPrice = livePrice?.currentAsk ?? entryPrice
  // Use actual contracts from positions, fall back to potentialCobro for resolved
  const contractKey = `${pred.eventId}::${pred.side}`
  const contracts = contractsMap[contractKey] ?? pred.potentialCobro

  // Mark-to-market value: contracts × current mid price.
  // potentialPayout (Kalshi: contracts × $0.95) is what they'd get if their
  // side wins, NOT the current value — those are different mental models.
  const currentValue = contracts * (livePrice?.currentMid ?? entryPrice)
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
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
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
            background: `${statusColor}18`, borderRadius: 'var(--radius-md)', padding: '2px 7px',
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
            borderRadius: 'var(--radius-md)', padding: '3px 9px',
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
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '17px', color: pred.status === 'won' ? 'var(--b1n0-si)' : pred.status === 'lost' ? 'var(--b1n0-no)' : 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
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
              color: pred.status === 'active' ? (isUp ? 'var(--b1n0-si)' : 'var(--b1n0-no)') : (pred.status === 'won' ? 'var(--b1n0-si)' : 'var(--b1n0-no)'),
              letterSpacing: '-0.5px',
            }}>
              {isUp ? '+' : ''}${pnl.toFixed(2)}
            </p>
            <p style={{
              fontFamily: F, fontSize: '10px', fontWeight: 700,
              color: isUp ? 'var(--b1n0-si)' : 'var(--b1n0-no)',
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
                color: pred.status === 'won' ? 'var(--b1n0-si)' : pred.status === 'lost' ? 'var(--b1n0-no)' : 'var(--b1n0-text-1)' },
              { label: pred.status === 'active' ? 'Si gana' : 'Cobrado',
                value: pred.status === 'won' ? `Q${(pred.potentialCobro || 0).toFixed(2)}`
                  : pred.status === 'lost' ? 'Q0.00'
                  : `Q${(potentialPayout || pred.potentialCobro).toFixed(2)}`,
                color: pred.status === 'won' ? 'var(--b1n0-si)' : pred.status === 'lost' ? 'var(--b1n0-no)' : 'var(--b1n0-si)',
                sub: pred.status === 'active' ? `+${(invested > 0 ? (((potentialPayout || pred.potentialCobro) / invested) - 1) * 100 : 0).toFixed(0)}%` : undefined },
            ].map((item) => (
              <div key={item.label}>
                <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                  {item.label}
                </p>
                <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: item.color, letterSpacing: '-0.3px' }}>
                  {item.value}
                </p>
                {'sub' in item && item.sub && (
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-si)', marginTop: '1px' }}>{item.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onClick() }}
              style={{
                flex: 1, padding: '10px', borderRadius: 'var(--radius-lg)',
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
                  flex: 1, padding: '10px', borderRadius: 'var(--radius-lg)',
                  border: 'none', background: selling ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-text-1)',
                  fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-bg)',
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
                borderRadius: 'var(--radius-lg)', padding: '16px',
              }}
            >
              <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)', marginBottom: '6px' }}>
                Salida anticipada
              </p>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '14px', lineHeight: 1.4 }}>
                Salir antes del resultado tiene un descuento por spread y comisión. Si esperás al resultado, tu cobro potencial es mayor.
              </p>

              {/* Comparison: hold vs sell */}
              {potentialPayout > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ flex: 1, padding: '10px', background: 'var(--b1n0-si-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--b1n0-border)', textAlign: 'center' }}>
                    <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-si)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Si gana</p>
                    <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-si)' }}>${potentialPayout.toFixed(2)}</p>
                  </div>
                  <div style={{ flex: 1, padding: '10px', background: 'rgba(255,212,116,0.10)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--b1n0-border)', textAlign: 'center' }}>
                    <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Salida ahora</p>
                    <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-gold)' }}>${livePrice.sell.net.toFixed(2)}</p>
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
                <span style={{ fontFamily: D, fontWeight: 800, fontSize: '20px', color: 'var(--b1n0-gold)', letterSpacing: '-0.5px' , fontVariantNumeric: 'tabular-nums'}}>
                  ${livePrice.sell.net.toFixed(2)}
                </span>
              </div>

              {/* P&L comparison */}
              {(() => {
                const diff = round2(livePrice.sell.net - pred.amount)
                const isGain = diff >= 0
                return (
                  <p style={{ fontFamily: F, fontSize: '11px', color: isGain ? 'var(--b1n0-si)' : 'var(--b1n0-no)', marginTop: '6px', textAlign: 'right' }}>
                    {isGain ? '+' : ''}${diff.toFixed(2)} vs tu entrada de ${pred.amount.toFixed(2)}
                  </p>
                )
              })()}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button
                  onClick={() => setConfirmingSell(false)}
                  disabled={selling}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 'var(--radius-lg)',
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
                    flex: 1, padding: '11px', borderRadius: 'var(--radius-lg)',
                    border: 'none', background: selling ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-text-1)',
                    fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-bg)',
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
  usePageMeta({
    title: 'Portafolio · b1n0',
    description: 'Posiciones activas, P/L en tiempo real. Seguí tus llamados en b1n0.',
  })
  const navigate = useNavigate()
  const { predictions, refreshPredictions } = useVotes()
  const { session, profile, refreshProfile } = useAuth()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'resolved'>('active')
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortKey>('pnl')
  // Top-level toggle for the Portafolio page: predictions vs LP
  // capital. The two domains have very different summary metrics
  // and lifecycle, so each gets its own dedicated view rather than
  // sharing a column on the same page.
  const [topTab, setTopTab] = useState<'predictions' | 'lp'>('predictions')

  // Capital LP sub-tab — separate from the main `tab` state above
  // (which controls user-position positions vs resolved). LPs have
  // their own activos/resueltos split.
  const [lpTab, setLpTab] = useState<'active' | 'resolved'>('active')

  // Per-event resolution timestamps for the LP chart. Voided events
  // already carry voided_at on the events row; settled events need
  // a separate fetch from admin_actions where action_type='settle_event'.
  const [lpReturnTimes, setLpReturnTimes] = useState<Record<string, string>>({})

  // Events available for public LP deposit (lp_public=true, status='open').
  // Surfaces in the 'Eventos disponibles para LP' feed at the top of the
  // Capital LP tab so the user can see opportunities without leaving Portafolio.
  interface LpAvailable {
    id: string
    question: string
    category: string
    pool_total: number
    lp_capital: number
    bet_pool: number
    lp_return_pct: number
    fees_collected: number
    ends_at: string | null
  }
  const [lpAvailable, setLpAvailable] = useState<LpAvailable[]>([])
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
    event_ends_at: string | null
    event_voided_at: string | null
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
      supabase.from('events').select('id, question, status, ends_at, voided_at').in('id', eventIds),
      supabase.from('event_markets').select('event_id, fees_collected, spread_collected').in('event_id', eventIds),
    ])
    const evMap: Record<string, { question: string; status: string; ends_at: string | null; voided_at: string | null }> = {}
    if (evRes.data) for (const e of evRes.data as Array<{ id: string; question: string; status: string; ends_at?: string | null; voided_at?: string | null }>) {
      evMap[e.id] = {
        question: e.question,
        status: e.status,
        ends_at: e.ends_at ?? null,
        voided_at: e.voided_at ?? null,
      }
    }
    const feesMap: Record<string, number> = {}
    const spreadMap: Record<string, number> = {}
    // event_markets.spread_collected is not in the curated Database type
    // (it lives in a more recent migration); read it as Json-compatible.
    if (mktRes.data) {
      for (const m of mktRes.data as Array<{
        event_id: string
        fees_collected: number | null
        spread_collected?: number | null
      }>) {
        feesMap[m.event_id] = Number(m.fees_collected) || 0
        spreadMap[m.event_id] = Number(m.spread_collected) || 0
      }
    }

    setLpPositions(deposits.map(d => ({
      ...d,
      fees_at_deposit: d.fees_at_deposit || 0,
      spread_at_deposit: d.spread_at_deposit || 0,
      event_question:  evMap[d.event_id]?.question  || d.event_id.slice(0, 8),
      event_status:    evMap[d.event_id]?.status    || 'open',
      event_ends_at:   evMap[d.event_id]?.ends_at   ?? null,
      event_voided_at: evMap[d.event_id]?.voided_at ?? null,
      fees_collected:  feesMap[d.event_id]   || 0,
      spread_collected: spreadMap[d.event_id] || 0,
    })))

    // Fetch settle_event timestamps from admin_actions so the chart
    // has accurate return times for settled (non-voided) events.
    // Voided events already have voided_at on the events row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: actions } = await (supabase as any)
      .from('admin_actions')
      .select('target_id, created_at, action_type')
      .in('target_id', eventIds)
      .eq('action_type', 'settle_event')
    const returnTimes: Record<string, string> = {}
    if (actions) {
      for (const a of actions as Array<{ target_id: string; created_at: string }>) {
        // Keep the LATEST settle action per event (in case of re-settle).
        if (!returnTimes[a.target_id] || a.created_at > returnTimes[a.target_id]) {
          returnTimes[a.target_id] = a.created_at
        }
      }
    }
    setLpReturnTimes(returnTimes)

    // Fetch events open to public LP deposit. Cheap join-style: pull
    // the events first, then enrich with event_markets in one batch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: openEvents } = await (supabase as any)
      .from('events')
      .select('id, question, category, ends_at')
      .eq('lp_public', true)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20)
    if (openEvents && openEvents.length > 0) {
      const openIds = openEvents.map((e: { id: string }) => e.id)
      const { data: markets } = await supabase
        .from('event_markets')
        .select('event_id, pool_total, lp_capital, bet_pool, fees_collected, lp_return_pct')
        .in('event_id', openIds)
      const mktMap: Record<string, {
        pool_total: number; lp_capital: number; bet_pool: number;
        fees_collected: number; lp_return_pct: number
      }> = {}
      if (markets) {
        for (const m of markets as Array<{
          event_id: string;
          pool_total: number | null; lp_capital: number | null;
          bet_pool: number | null; fees_collected: number | null;
          lp_return_pct: number | null
        }>) {
          mktMap[m.event_id] = {
            pool_total:     Number(m.pool_total)     || 0,
            lp_capital:     Number(m.lp_capital)     || 0,
            bet_pool:       Number(m.bet_pool)       || 0,
            fees_collected: Number(m.fees_collected) || 0,
            lp_return_pct:  Number(m.lp_return_pct)  || 0.08,
          }
        }
      }
      setLpAvailable(openEvents.map((e: { id: string; question: string; category: string; ends_at: string | null }) => ({
        id: e.id,
        question: e.question,
        category: e.category,
        ends_at: e.ends_at,
        pool_total:     mktMap[e.id]?.pool_total     ?? 0,
        lp_capital:     mktMap[e.id]?.lp_capital     ?? 0,
        bet_pool:       mktMap[e.id]?.bet_pool       ?? 0,
        fees_collected: mktMap[e.id]?.fees_collected ?? 0,
        lp_return_pct:  mktMap[e.id]?.lp_return_pct  ?? 0.08,
      })))
    } else {
      setLpAvailable([])
    }

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
  // (Kalshi model — payouts come from pred.potentialCobro stored at purchase
  // time, with a 5% resolution skim. No need to query other-user side totals.)
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

      // Cap: in the LP-backstopped Kalshi model, the most you can ever
      // collect on a position is contracts × $1 minus the resolution
      // skim. Selling early should never project more than that. The
      // cap rarely fires (bid is always less than $1) but it's a safety
      // guard for late-stage markets where bids approach 1.0.
      const winCap = round2(pred.potentialCobro * (1 - RESOLUTION_SKIM))
      if (winCap > 0 && gross > winCap) gross = winCap

      const fee = round2(gross * SELL_FEE_RATE)
      let net = round2(gross - fee)
      if (winCap > 0 && net > winCap) net = winCap
      sell = { contracts: myContracts, bidPrice: currentBid, gross, fee, net }
    }

    return { entryAsk, currentAsk, currentBid, currentMid, sell }
  }

  // ── LP-backstopped Kalshi model ──────────────────────────────────
  // 1 contract = $1 if the position's side wins, else $0. The platform
  // skims 5% off winning payouts at settlement. Sponsor/LP capital
  // backstops shortfalls when bet_pool < total winning liability.
  //
  // getPositionPayout: per-position payout if THIS side wins =
  // potentialCobro (contracts × $1) minus 5% resolution skim. Matches
  // the Cobro estimado shown in the buy preview so /portafolio's
  // "Si gana" agrees with what the user was promised at purchase.
  function getPositionPayout(pred: UserPrediction): number {
    if (!pred.potentialCobro || pred.potentialCobro <= 0) return 0
    return round2(pred.potentialCobro * (1 - RESOLUTION_SKIM))
  }

  // Mark-to-market unrealized P&L: contracts × current_mid − invested.
  // Kalshi-style — what the position is worth right now if we marked
  // to the AMM mid price, not what it pays at settlement.
  function getUnrealizedPnl(pred: UserPrediction, lp: LivePrice | null): number {
    if (pred.status === 'won') {
      // Realized: stored payout less skim
      return getPositionPayout(pred) - pred.amount
    }
    if (pred.status === 'lost') return -pred.amount

    if (!lp) return 0
    const currentValue = pred.potentialCobro * lp.currentMid
    return currentValue - pred.amount
  }

  const active = predictions.filter((p) => p.status === 'active')
  const resolved = predictions.filter((p) => p.status !== 'active')
  const won = resolved.filter((p) => p.status === 'won')

  const totalInvested = active.reduce((s, p) => s + p.amount, 0)

  // ── Kalshi aggregation: per event, the better of "if YES wins" vs "if NO wins" ──
  // For each event, sum the user's payouts by side using stored
  // payout_if_win × (1 − skim). The "best case" picks whichever side
  // pays more; you can't win both. Current value is mark-to-market
  // (contracts × mid price).
  const uniqueEventIds = [...new Set(active.map(p => p.eventId))]
  let totalCurrentValue = 0
  let totalPotentialReturn = 0

  for (const eid of uniqueEventIds) {
    const eventPreds = active.filter(p => p.eventId === eid)

    // Aggregate payouts by side. For binary events sides are 'yes'/'no';
    // open events use composite sides like 'Guatemala::yes'. Group by
    // exact side string so multi-option markets aggregate correctly.
    const sidePayouts = new Map<string, number>()
    for (const p of eventPreds) {
      const cur = sidePayouts.get(p.side) ?? 0
      sidePayouts.set(p.side, cur + getPositionPayout(p))
    }
    // Best case: one side wins; take the highest payout among the user's sides
    totalPotentialReturn += Math.max(0, ...sidePayouts.values())

    // Mark-to-market current value: contracts × mid price for each position
    for (const p of eventPreds) {
      const lp = getLivePrice(p)
      if (lp) {
        const ck = `${p.eventId}::${p.side}`
        const c = contractsMap[ck] ?? p.potentialCobro
        totalCurrentValue += c * lp.currentMid
      }
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
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', lineHeight: 1.1 , fontVariantNumeric: 'tabular-nums'}}>Mi Portafolio</p>
          {profile && (
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{profile.name}</p>
          )}
        </div>
      </div>

      {/* ── Top-level tab: Mis Llamados / Capital LP ──
           Splits the page into two domains. Predictions live in their
           own tab with their own summary tiles + sub-tab + filters;
           LP capital lives in its own tab with the chart strip and
           its own sub-tab. Avoids the prior visual collision of two
           Activos/Resueltos toggles on the same screen. */}
      <div style={{ position: 'relative', display: 'flex', marginTop: '14px', marginBottom: '18px', borderBottom: '1px solid var(--b1n0-border)' }}>
        {(['predictions', 'lp'] as const).map((t) => {
          const isOn = topTab === t
          const labelText = t === 'predictions'
            ? `Mis Llamados (${predictions.length})`
            : `Capital LP (${lpPositions.length})`
          return (
            <button
              key={t}
              onClick={() => setTopTab(t)}
              style={{
                flex: 1,
                padding: '10px 4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: F,
                fontWeight: 700,
                fontSize: '13px',
                color: isOn ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                letterSpacing: 'var(--tracking-tight)',
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
            >
              {labelText}
            </button>
          )
        })}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -1,
            left: topTab === 'predictions' ? 0 : '50%',
            width: '50%',
            height: 2,
            background: 'var(--b1n0-si)',
            borderRadius: '2px 2px 0 0',
            transition: 'left var(--duration-base) var(--ease-out)',
          }}
        />
      </div>

      {/* ──────────────────── PREDICTIONS TAB ──────────────────── */}
      {topTab === 'predictions' && (
      <>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '20px 0 8px' }}>
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            En juego
          </p>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' , fontVariantNumeric: 'tabular-nums'}}>
            ${totalInvested.toFixed(0)}
          </p>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            {active.length} posicion{active.length !== 1 ? 'es' : ''}
          </p>
        </div>

        <div style={{ background: 'var(--b1n0-card)', border: `1px solid ${isPortfolioUp ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            P&L no realizado
          </p>
          <p style={{
            fontFamily: D, fontWeight: 800, fontSize: '22px',
            color: active.length === 0 ? 'var(--b1n0-muted)' : isPortfolioUp ? 'var(--b1n0-si)' : 'var(--b1n0-no)',
            letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums'}}>
            {active.length > 0 ? `${isPortfolioUp ? '+' : ''}Q${totalUnrealizedPnl.toFixed(2)}` : '—'}
          </p>
          {active.length > 0 && (
            <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: isPortfolioUp ? 'var(--b1n0-si)' : 'var(--b1n0-no)', marginTop: '2px' }}>
              {isPortfolioUp ? '+' : ''}{totalUnrealizedPct.toFixed(1)}% si tu lado gana
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Si gana
          </p>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-si)', letterSpacing: '-0.5px' , fontVariantNumeric: 'tabular-nums'}}>
            {active.length > 0 ? `Q${totalPotentialReturn.toFixed(0)}` : '—'}
          </p>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            {active.length > 0 && totalInvested > 0 ? `+${((totalPotentialReturn / totalInvested - 1) * 100).toFixed(0)}% retorno parimutuel` : active.length > 0 ? 'Retorno parimutuel' : 'Sin posiciones'}
          </p>
        </div>

        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Salida anticipada
          </p>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: totalSellValue >= totalInvested ? 'var(--b1n0-text-1)' : 'var(--b1n0-no)', letterSpacing: '-0.5px' , fontVariantNumeric: 'tabular-nums'}}>
            {active.length > 0 && totalSellValue > 0 ? `Q${totalSellValue.toFixed(2)}` : '—'}
          </p>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            {active.length > 0 && totalSellValue > 0 ? `Si vendés todo ahora` : 'Sin datos de mercado'}
          </p>
        </div>
      </div>

      {/* Sub-tab bar — slim segmented control with sliding teal underline,
           matching the top-level tab and the LP sub-tab. Replaces the
           prior heavy "pill on surface" treatment for visual consistency
           across the page. */}
      <div style={{ position: 'relative', display: 'flex', marginBottom: '14px', borderBottom: '1px solid var(--b1n0-border)' }}>
        {([
          ['active', `Activos (${active.length})`],
          ['resolved', `Resueltos (${resolved.length})`],
        ] as const).map(([t, label]) => {
          const isOn = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
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
              {label}
            </button>
          )
        })}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -1,
            left: tab === 'active' ? 0 : '50%',
            width: '50%',
            height: 2,
            background: 'var(--b1n0-si)',
            borderRadius: '2px 2px 0 0',
            transition: 'left var(--duration-base) var(--ease-out)',
          }}
        />
      </div>

      {/* Filters + sort */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '4px 10px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
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
                padding: '4px 10px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
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
                padding: '3px 8px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
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
            { label: 'Correctos', value: String(won.length), color: 'var(--b1n0-si)' },
            { label: 'Incorrectos', value: String(resolved.length - won.length), color: 'var(--b1n0-no)' },
            { label: 'Historial P&L', value: `${historicalPL >= 0 ? '+' : ''}Q${Math.abs(historicalPL).toFixed(2)}`, color: historicalPL >= 0 ? 'var(--b1n0-si)' : 'var(--b1n0-no)' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: s.color, letterSpacing: '-0.5px' , fontVariantNumeric: 'tabular-nums'}}>{s.value}</p>
              <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Position list */}
      {sorted.length === 0 ? (
        <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '48px 24px', textAlign: 'center' }}>
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
              style={{ padding: '11px 24px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-bg)' }}
            >
              Explorar eventos →
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sellError && (
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', textAlign: 'center', padding: '8px', background: 'var(--b1n0-no-bg)', borderRadius: 'var(--radius-lg)' }}>
              {sellError}
            </p>
          )}
          {sorted.map((pred) => (
            <PositionCard
              key={pred.id}
              pred={pred}
              livePrice={getLivePrice(pred)}
              potentialPayout={getPositionPayout(pred)}
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

      </>
      )}

      {/* ────────────────── CAPITAL LP TAB ────────────────── */}
      {topTab === 'lp' && (
        <div style={{ marginTop: '4px', marginBottom: '16px' }}>

          {/* ── Eventos disponibles para LP — horizontal scroll row ──
               Surfaces every event with lp_public=true and status='open'
               so the user can see deposit opportunities without leaving
               Portafolio. Cards show pool composition, offered return
               rate, and fees-so-far. CTA navigates to the event detail
               page (the user-deposit flow itself is future work). */}
          {lpAvailable.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
                <p style={{ fontFamily: D, fontWeight: 700, fontSize: '15px', color: 'var(--b1n0-text-1)' }}>
                  Eventos disponibles para LP
                </p>
                <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                  {lpAvailable.length} evento{lpAvailable.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="scroll-x" style={{ display: 'flex', gap: '10px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px', marginLeft: '-16px', marginRight: '-16px', paddingLeft: '16px', paddingRight: '16px' }}>
                {lpAvailable.map((ev) => {
                  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                  const returnPct = ev.lp_return_pct < 1 ? ev.lp_return_pct * 100 : ev.lp_return_pct
                  // Days until close (only if ends_at set)
                  let countdown = ''
                  if (ev.ends_at) {
                    const ms = new Date(ev.ends_at).getTime() - Date.now()
                    if (ms > 0) {
                      const days = Math.floor(ms / 86400000)
                      const hrs = Math.floor((ms % 86400000) / 3600000)
                      countdown = days > 0 ? `${days}d` : `${hrs}h`
                    }
                  }
                  return (
                    <button
                      key={ev.id}
                      onClick={() => navigate(`/eventos/${ev.id}`)}
                      style={{
                        flex: '0 0 260px',
                        background: 'var(--b1n0-card)',
                        border: '1px solid var(--b1n0-border)',
                        borderLeft: '3px solid #C4B5FD',
                        borderRadius: 'var(--radius-lg)',
                        padding: '14px 16px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        transition: 'border-color var(--duration-fast) var(--ease-out)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-text-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-border)')}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {categoryLabels[ev.category] || ev.category}
                        </span>
                        {countdown && (
                          <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
                            {countdown}
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontFamily: D,
                        fontWeight: 600,
                        fontSize: '13px',
                        color: 'var(--b1n0-text-1)',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: '36px',
                      }}>
                        {ev.question}
                      </p>
                      {/* Pool composition strip — proportional split between
                           LP capital (purple) and user bets (teal). */}
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ display: 'flex', height: 4, borderRadius: 'var(--radius-pill)', overflow: 'hidden', background: 'var(--b1n0-surface)' }}>
                          <div style={{ width: ev.pool_total > 0 ? `${(ev.lp_capital / ev.pool_total) * 100}%` : '50%', background: '#C4B5FD' }} />
                          <div style={{ width: ev.pool_total > 0 ? `${(ev.bet_pool / ev.pool_total) * 100}%` : '0%', background: 'var(--b1n0-si)' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontFamily: F, fontSize: '10px', color: '#C4B5FD', fontWeight: 600 }}>
                            LP ${fmt(ev.lp_capital)}
                          </span>
                          <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
                            Pool ${fmt(ev.pool_total)}
                          </span>
                        </div>
                      </div>
                      {/* Bottom row: offered return rate + fees-so-far */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--b1n0-border)' }}>
                        <div>
                          <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Retorno LP
                          </p>
                          <p style={{ fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: '13px', color: '#C4B5FD', fontVariantNumeric: 'tabular-nums' }}>
                            {returnPct.toFixed(0)}%
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Fees acumulados
                          </p>
                          <p style={{ fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: '13px', color: 'var(--b1n0-si)', fontVariantNumeric: 'tabular-nums' }}>
                            ${fmt(ev.fees_collected)}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {lpPositions.length === 0 ? (
            lpAvailable.length === 0 ? (
              <div style={{ padding: '64px 16px', textAlign: 'center' }}>
                <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
                  Todavía no has aportado capital LP, y no hay eventos abiertos para LP en este momento.
                </p>
              </div>
            ) : (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
                  Aportá capital LP a alguno de los eventos arriba y empezá a ganar fees.
                </p>
              </div>
            )
          ) : (
          <>

          {/* ── LP capital chart strip ──
               Inline SVG sparkline showing total active LP capital
               over time. Each deposit is a step-up at created_at,
               each return is a step-down at the corresponding
               admin_action timestamp (settle) or events.voided_at
               (void). For settled events without an admin_actions
               row (pre-audit-log resolutions), we fall back to the
               deposit timestamp + 1 day as a rough estimate so the
               chart still renders something coherent. */}
          {(() => {
            type Evt = { time: number; delta: number }
            const evts: Evt[] = []
            for (const lp of lpPositions) {
              evts.push({ time: new Date(lp.created_at).getTime(), delta: +lp.amount })
              if (lp.status !== 'active') {
                let returnTime: number | null = null
                if (lp.event_voided_at) {
                  returnTime = new Date(lp.event_voided_at).getTime()
                } else if (lpReturnTimes[lp.event_id]) {
                  returnTime = new Date(lpReturnTimes[lp.event_id]).getTime()
                }
                if (returnTime == null) {
                  // Pre-audit-log fallback: assume returned ~1 day after deposit
                  returnTime = new Date(lp.created_at).getTime() + 86400000
                }
                evts.push({ time: returnTime, delta: -lp.amount })
              }
            }
            if (evts.length === 0) return null
            evts.sort((a, b) => a.time - b.time)

            // Walk events to build the running-total series.
            type Pt = { t: number; v: number }
            const series: Pt[] = []
            let running = 0
            for (const e of evts) {
              series.push({ t: e.time, v: running })  // pre-event point (creates step)
              running += e.delta
              series.push({ t: e.time, v: running })  // post-event point
            }
            // Tail point at "now" so active capital extends to the right edge
            series.push({ t: Date.now(), v: running })

            const minT = series[0].t
            const maxT = series[series.length - 1].t
            const maxV = Math.max(...series.map(p => p.v), 1)
            const W = 320, H = 64, PAD_X = 4, PAD_Y = 6
            const xScale = (t: number) => PAD_X + ((t - minT) / Math.max(maxT - minT, 1)) * (W - 2 * PAD_X)
            const yScale = (v: number) => H - PAD_Y - (v / maxV) * (H - 2 * PAD_Y)
            const pathD = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(' ')
            const areaD = `${pathD} L ${xScale(maxT).toFixed(1)} ${(H - PAD_Y).toFixed(1)} L ${xScale(minT).toFixed(1)} ${(H - PAD_Y).toFixed(1)} Z`

            const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

            return (
              <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Capital LP en el tiempo
                  </p>
                  <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                    Pico ${fmt(maxV)} · Hoy ${fmt(running)}
                  </p>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
                  <defs>
                    <linearGradient id="lp-area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaD} fill="url(#lp-area-grad)" />
                  <path d={pathD} fill="none" stroke="#C4B5FD" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
            )
          })()}

          {/* ═══════════════ LP DASHBOARD ═══════════════ */}
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)', marginBottom: '12px' }}>
            Resumen
          </p>

          {/* Summary cards — math unchanged from prior version. */}
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
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Capital activo</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: '#C4B5FD', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalActiveCapital)}</p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{activeDeposits.length} evento{activeDeposits.length !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Ganancia estimada</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: totalProfit >= 0 ? 'var(--b1n0-si)' : 'var(--b1n0-no)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
                    {totalProfit >= 0 ? '+' : ''}${fmt(totalProfit)}
                  </p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>Fees ganados como LP</p>
                </div>
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Total depositado</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalDeposited)}</p>
                </div>
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
                  <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Cobrado</p>
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-si)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>${fmt(totalPaidOut)}</p>
                  <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{returnedDeposits.length} resuelto{returnedDeposits.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            )
          })()}

          {/* ── Sub-tab toggle: Activos / Resueltos ──
               Slim segmented control with sliding teal underline,
               matching the auth-modal tab pattern. Counts live
               in the label so the user knows what's hiding before
               they click. */}
          {(() => {
            const activeCount = lpPositions.filter(lp => lp.status === 'active').length
            const resolvedCount = lpPositions.filter(lp => lp.status !== 'active').length
            return (
              <div style={{ position: 'relative', display: 'flex', marginBottom: '14px', borderBottom: '1px solid var(--b1n0-border)' }}>
                {(['active', 'resolved'] as const).map((t) => {
                  const isOn = lpTab === t
                  const labelText = t === 'active'
                    ? `Activos (${activeCount})`
                    : `Resueltos (${resolvedCount})`
                  return (
                    <button
                      key={t}
                      onClick={() => setLpTab(t)}
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
                        transition: 'color var(--duration-fast) var(--ease-out)',
                      }}
                    >
                      {labelText}
                    </button>
                  )
                })}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: lpTab === 'active' ? 0 : '50%',
                    width: '50%',
                    height: 2,
                    background: 'var(--b1n0-si)',
                    borderRadius: '2px 2px 0 0',
                    transition: 'left var(--duration-base) var(--ease-out)',
                  }}
                />
              </div>
            )
          })()}

          {/* ── Filtered LP list ── */}
          {(() => {
            const filtered = lpPositions.filter(lp =>
              lpTab === 'active' ? lp.status === 'active' : lp.status !== 'active'
            )

            if (filtered.length === 0) {
              return (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>
                    {lpTab === 'active'
                      ? 'No tenés capital LP activo en este momento.'
                      : 'Todavía no hay LP resueltos.'}
                  </p>
                </div>
              )
            }

            const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtered.map((lp) => {
                  const totalMargins = lp.fees_collected + lp.spread_collected
                  const marginsAtDeposit = lp.fees_at_deposit + lp.spread_at_deposit
                  const deltaMargins = Math.max(totalMargins - marginsAtDeposit, 0)
                  const estimatedEarning = Math.round(lp.return_pct * deltaMargins * 100) / 100

                  // Outcome triage. event_status='voided' takes priority
                  // because the LP could have been refunded via the void
                  // path even before the lp_deposits.status flipped.
                  const isActive = lp.status === 'active'
                  const isVoided = lp.event_status === 'voided' || lp.event_voided_at != null
                  const isPartialLoss = lp.status === 'partial_loss'
                  // outcome label + accent stripe + small icon
                  const outcome: 'active' | 'voided' | 'settled' | 'partial_loss' =
                    isActive ? 'active'
                    : isPartialLoss ? 'partial_loss'
                    : isVoided ? 'voided'
                    : 'settled'

                  const accentByOutcome: Record<typeof outcome, string> = {
                    active: '#C4B5FD',
                    settled: 'var(--b1n0-si)',
                    voided: 'var(--b1n0-orange-500)',
                    partial_loss: 'var(--b1n0-no)',
                  }
                  const badgeBg: Record<typeof outcome, string> = {
                    active: 'rgba(196,181,253,0.15)',
                    settled: 'var(--b1n0-si-bg)',
                    voided: 'rgba(255,212,116,0.18)',
                    partial_loss: 'var(--b1n0-no-bg)',
                  }
                  const badgeFg = accentByOutcome[outcome]
                  const badgeIcon: Record<typeof outcome, string> = {
                    active: '●',
                    settled: '✓',
                    voided: '↺',
                    partial_loss: '✕',
                  }
                  const badgeLabel: Record<typeof outcome, string> = {
                    active: 'Activo',
                    settled: 'Cobrado',
                    voided: 'Anulado',
                    partial_loss: 'Pérdida parcial',
                  }

                  // Subtitle line: shows event lifecycle context.
                  // For active: shows close mode (manual or end date).
                  // For settled/voided: shows what happened in plain words.
                  let subtitle = ''
                  if (isActive) {
                    if (lp.event_ends_at) {
                      const ends = new Date(lp.event_ends_at)
                      const now = new Date()
                      const ms = ends.getTime() - now.getTime()
                      if (ms <= 0) {
                        subtitle = 'Esperando resolución'
                      } else {
                        const days = Math.floor(ms / 86400000)
                        const hours = Math.floor((ms % 86400000) / 3600000)
                        subtitle = days > 0
                          ? `Termina en ${days} día${days !== 1 ? 's' : ''}`
                          : `Termina en ${hours}h`
                      }
                    } else {
                      subtitle = 'Cierre manual'
                    }
                  } else if (outcome === 'voided') {
                    subtitle = 'Evento anulado — capital devuelto'
                  } else if (outcome === 'settled') {
                    const earned = (lp.payout || 0) - lp.amount
                    subtitle = earned > 0
                      ? `Cobraste $${fmt(earned)} en fees`
                      : 'Capital devuelto sin fees (sin volumen)'
                  } else {
                    subtitle = 'Recuperación parcial'
                  }

                  // Right-side primary metric per outcome.
                  const rightLabel = isActive ? 'Ganancia est.' : 'Cobrado'
                  const rightValue = isActive ? estimatedEarning : (lp.payout || 0)
                  const rightPrefix = isActive ? '+' : ''
                  const rightColor = isActive ? '#C4B5FD' : 'var(--b1n0-si)'

                  return (
                    <div
                      key={lp.id}
                      style={{
                        background: 'var(--b1n0-card)',
                        border: '1px solid var(--b1n0-border)',
                        borderLeft: `3px solid ${accentByOutcome[outcome]}`,
                        borderRadius: 'var(--radius-lg)',
                        padding: '14px 16px',
                      }}
                    >
                      {/* Top row: question + outcome badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                        <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lp.event_question}
                        </p>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontFamily: F,
                            fontSize: '10px',
                            fontWeight: 700,
                            color: badgeFg,
                            background: badgeBg[outcome],
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-pill)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ fontSize: '9px' }}>{badgeIcon[outcome]}</span>
                          {badgeLabel[outcome]}
                        </span>
                      </div>

                      {/* Subtitle: event lifecycle context */}
                      <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '12px' }}>
                        {subtitle}
                      </p>

                      {/* Stats row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px' }}>
                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                          <div>
                            <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Capital</p>
                            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
                              ${fmt(lp.amount)}
                            </p>
                          </div>
                          <div>
                            <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>% de fees</p>
                            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: '#C4B5FD', letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
                              {(lp.return_pct * 100).toFixed(0)}%
                            </p>
                          </div>
                          {isActive && (
                            <div>
                              <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fees post-depósito</p>
                              <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>
                                ${fmt(deltaMargins)}
                              </p>
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{rightLabel}</p>
                          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '15px', color: rightColor, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
                            {rightPrefix}${fmt(rightValue)}
                          </p>
                        </div>
                      </div>

                      <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--b1n0-border)' }}>
                        Depositado {new Date(lp.created_at).toLocaleString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            )
          })()}
          </>
          )}
        </div>
      )}
    </div>
  )
}

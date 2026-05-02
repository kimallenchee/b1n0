import { useState, useEffect } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ArrowCounterClockwise,
  ArrowsClockwise,
  ChartBar,
  Trophy,
  XCircle,
  ChatCircle,
  CaretDown,
  Bank,
  Receipt,
  Broom,
  Coins,
} from '@phosphor-icons/react'
import type { UserPrediction, Transaction } from '../types'
import { CommentFeed } from '../components/feed/CommentFeed'
import { DateRangePicker, withinDateRange } from '../components/DateRangePicker'
import type { DateRange } from '../components/DateRangePicker'
import { useVotes } from '../context/VoteContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../hooks/usePageMeta'

const F = 'var(--font-body)'
const D = 'var(--font-display)'
const N = 'var(--font-num)'

/* ─────────────────────────────────────────────────────────────────
   Local extension of Transaction so we can carry running balance.
   The DB column already exists (balance_after) — we just need a
   typed surface here.
   ───────────────────────────────────────────────────────────── */
type TxRow = Transaction & { balanceAfter?: number | null }

const categoryLabels: Record<string, string> = {
  deportes: 'Deportes', politica: 'Política', economia: 'Economía',
  geopolitica: 'Geopolítica', cultura: 'Cultura', tecnologia: 'Tecnología',
  finanzas: 'Finanzas', otro: 'Otro',
}

/* ─── Helpers ──────────────────────────────────────────────────── */

/** Pretty Spanish relative date for date-only strings ("YYYY-MM-DD"). */
function formatDateHeader(dateStr: string): string {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const yesterday = new Date(today.getTime() - 86400000).toISOString().split('T')[0]
  if (dateStr === todayStr) return 'Hoy'
  if (dateStr === yesterday) return 'Ayer'
  // Spanish abbreviated: "1 may 2026"
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return `${d} ${months[m - 1]} ${y === today.getFullYear() ? '' : y}`.trim()
}

/** "hace 3h", "hace 2 días". Falls back to date string for old entries. */
function formatRelativeTime(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hr = Math.round(min / 60)
  if (hr < 24) return `hace ${hr}h`
  const days = Math.round(hr / 24)
  if (days < 30) return `hace ${days} días`
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const dt = new Date(iso)
  return `${dt.getDate()} ${months[dt.getMonth()]}`
}

/** Shorten any 36-char UUID to first8…last4 so the label stays scannable. */
function truncateUuids(label: string): string {
  return label.replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8}([0-9a-f]{4})/gi, '$1…$2')
}

/* ─── VoteCard ─────────────────────────────────────────────────────
   Adapts shape based on status:
     - active   : stake + potential cobro + gain delta + live split bar
     - won      : stake + cobrado + net P/L
     - lost     : stake + which side won + net P/L
     - sold     : stake + recibido + net P/L
   ───────────────────────────────────────────────────────────────── */
function VoteCard({ p }: { p: UserPrediction }) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const isActive = p.status === 'active'
  const isWon = p.status === 'won'
  const isLost = p.status === 'lost'
  const isSold = p.status === 'sold'
  const commentCount = p.event.comments?.length ?? 0

  // P/L math
  const netPL = isWon
    ? p.potentialCobro - p.amount
    : isSold
      ? p.potentialCobro - p.amount
      : isLost
        ? -p.amount
        : p.potentialCobro - p.amount // active = potential gain
  const pctPL = p.amount > 0 ? (netPL / p.amount) * 100 : 0

  // Side rendering — handles open events (key::yes|no)
  const sideLabel = p.side.includes('::')
    ? `${p.side.split('::')[0]} — ${p.side.split('::')[1] === 'yes' ? 'SÍ' : 'NO'}`
    : p.side === 'yes'
      ? 'SÍ'
      : 'NO'
  const userPickedYes = p.side.endsWith('yes') || p.side === 'yes'

  // Color of left accent stripe
  const accent = isWon
    ? 'var(--b1n0-si)'
    : isSold
      ? '#C4B5FD'
      : isActive
        ? 'var(--b1n0-gold)'
        : 'var(--b1n0-no)'

  // Status pill
  const statusBg = isActive
    ? 'var(--status-enjuego-bg)'
    : isWon
      ? 'var(--status-ganado-bg)'
      : isSold
        ? 'rgba(196,181,253,0.15)'
        : 'var(--status-perdido-bg)'
  const statusFg = isActive
    ? 'var(--status-enjuego-text)'
    : isWon
      ? 'var(--status-ganado-text)'
      : isSold
        ? '#C4B5FD'
        : 'var(--status-perdido-text)'
  const statusLabel = isActive ? 'En juego' : isWon ? 'Ganado' : isSold ? 'Vendido' : 'Perdido'

  // Outcome text shown for resolved items
  const winningSide: 'yes' | 'no' | null = p.event.result ?? null
  const outcomeText = (() => {
    if (isWon) return 'Tuviste razón'
    if (isLost && winningSide) return `${winningSide === 'yes' ? 'SÍ' : 'NO'} ganó al cierre`
    if (isLost) return 'Esta vez no fue'
    if (isSold) return 'Vendiste antes del cierre'
    return ''
  })()

  // Right-side primary metric label/value
  const rightLabel = isWon ? 'Cobrado' : isSold ? 'Recibido' : isActive ? 'Potencial' : 'Tu participación'
  const rightValue = isWon || isSold || isActive ? p.potentialCobro : p.amount
  const rightColor = isWon ? 'var(--b1n0-si)' : isSold ? '#C4B5FD' : isActive ? 'var(--b1n0-gold)' : 'var(--b1n0-muted)'

  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}
    >
      {/* Top row: status pill · side */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span
          style={{
            fontFamily: F, fontSize: '10px', fontWeight: 700,
            color: statusFg, background: statusBg,
            borderRadius: 'var(--radius-md)', padding: '3px 8px',
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}
        >
          {statusLabel}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Tu llamado
          </span>
          <span
            style={{
              fontFamily: D, fontWeight: 800, fontSize: '12px', color: 'var(--b1n0-text-1)',
              background: userPickedYes ? 'rgba(74,222,128,0.14)' : 'rgba(255,212,116,0.16)',
              padding: '3px 8px', borderRadius: 'var(--radius-md)', letterSpacing: '0.3px',
            }}
          >
            {sideLabel}
          </span>
        </div>
      </div>

      {/* Question */}
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', lineHeight: 1.35, marginBottom: '8px' }}>
        {p.event.question}
      </p>

      {/* Meta row — category · time · outcome (resolved only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {p.event.category && (
          <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {categoryLabels[p.event.category] || p.event.category}
          </span>
        )}
        {(p.resolvedAt || p.createdAt) && (
          <>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--b1n0-border)' }} />
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
              {isActive
                ? `Entraste ${formatRelativeTime(p.createdAt)}`
                : `Resuelto ${formatRelativeTime(p.resolvedAt || p.createdAt)}`}
            </span>
          </>
        )}
        {!isActive && outcomeText && (
          <>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--b1n0-border)' }} />
            <span
              style={{
                fontFamily: F, fontSize: '11px', fontWeight: 600,
                color: isWon ? 'var(--b1n0-si)' : isSold ? '#C4B5FD' : 'var(--b1n0-muted)',
              }}
            >
              {outcomeText}
            </span>
          </>
        )}
      </div>

      {/* Stake / Result block */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          padding: '12px 14px',
          background: 'var(--b1n0-surface)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '10px',
        }}
      >
        <div>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Participación
          </p>
          <p style={{ fontFamily: N, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
            ${p.amount.toFixed(2)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            {rightLabel}
          </p>
          <p style={{ fontFamily: N, fontWeight: 700, fontSize: '16px', color: rightColor, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
            ${rightValue.toFixed(2)}
          </p>
          {/* P/L delta — only show when meaningful */}
          {(isWon || isSold || isActive || isLost) && (
            <p
              style={{
                fontFamily: N, fontSize: '11px', fontWeight: 600, marginTop: '2px',
                color: netPL > 0 ? 'var(--b1n0-si)' : netPL < 0 ? 'var(--b1n0-muted)' : 'var(--b1n0-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isActive ? 'Ganancia ' : ''}
              {netPL >= 0 ? '+' : '−'}${Math.abs(netPL).toFixed(2)}
              {Number.isFinite(pctPL) && p.amount > 0 && (
                <span style={{ color: 'var(--b1n0-muted)', fontWeight: 500 }}>
                  {' '}· {pctPL >= 0 ? '+' : '−'}{Math.abs(pctPL).toFixed(0)}%
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Mini split bar — only for active votes, shows live state */}
      {isActive && typeof p.event.yesPercent === 'number' && (
        <div style={{ marginBottom: '10px' }}>
          <div
            style={{
              display: 'flex',
              height: 4,
              borderRadius: 'var(--radius-pill)',
              overflow: 'hidden',
              background: 'var(--b1n0-surface)',
            }}
          >
            <div style={{ width: `${p.event.yesPercent}%`, background: 'var(--b1n0-si)' }} />
            <div style={{ width: `${100 - p.event.yesPercent}%`, background: 'var(--b1n0-gold)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
            <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>
              SÍ {Math.round(p.event.yesPercent)}%
            </span>
            <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>
              NO {Math.round(100 - p.event.yesPercent)}%
            </span>
          </div>
        </div>
      )}

      {/* Comment toggle */}
      <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '8px' }}>
        <button
          onClick={() => setCommentsOpen(!commentsOpen)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-muted)',
            padding: 0, display: 'flex', alignItems: 'center', gap: '6px',
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--b1n0-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--b1n0-muted)')}
        >
          <ChatCircle size={13} weight="regular" />
          {commentCount > 0 ? `${commentCount} comentarios` : 'Comentar'}
          <CaretDown
            size={9}
            weight="bold"
            style={{
              transform: commentsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform var(--duration-fast) var(--ease-out)',
            }}
          />
        </button>
        {commentsOpen && (
          <CommentFeed comments={p.event.comments ?? []} eventId={p.event.id} />
        )}
      </div>
    </div>
  )
}

/* ─── TxCard ───────────────────────────────────────────────────────
   Phosphor-iconned, color-tinted by type, with running balance.
   Includes admin/LP flows (lp_deposit, lp_return, fee_revenue, sweep,
   skim) since those rows DO land in this user's ledger when they're
   acting as an LP — without coverage here the destructure crashes.
   ───────────────────────────────────────────────────────────────── */
type TxType = Transaction['type'] | 'lp_deposit' | 'lp_return' | 'fee_revenue' | 'sweep' | 'skim'

const txMeta: Record<TxType, { label: string; tint: string; Icon: PhosphorIcon }> = {
  deposit:     { label: 'Depósito',    tint: 'var(--b1n0-si)',     Icon: ArrowDown },
  withdraw:    { label: 'Retiro',      tint: 'var(--b1n0-gold)',   Icon: ArrowUp },
  vote:        { label: 'Voto',        tint: 'var(--b1n0-muted)',  Icon: ChartBar },
  win:         { label: 'Cobro',       tint: 'var(--b1n0-si)',     Icon: Trophy },
  loss:        { label: 'Esta vez no', tint: 'var(--b1n0-muted)',  Icon: XCircle },
  sell:        { label: 'Venta',       tint: '#C4B5FD',            Icon: ArrowUpRight },
  refund:      { label: 'Reembolso',   tint: 'var(--b1n0-muted)',  Icon: ArrowCounterClockwise },
  // LP / treasury flows — only show up when the user has admin/LP role
  lp_deposit:  { label: 'Capital LP',  tint: '#6366f1',            Icon: Bank },
  lp_return:   { label: 'Retiro LP',   tint: '#6366f1',            Icon: ArrowsClockwise },
  fee_revenue: { label: 'Comisión',    tint: 'var(--b1n0-muted)',  Icon: Receipt },
  sweep:       { label: 'Barrido',     tint: 'var(--b1n0-muted)',  Icon: Broom },
  skim:        { label: 'Resolución',  tint: 'var(--b1n0-muted)',  Icon: Coins },
}

const FALLBACK_META = { label: 'Movimiento', tint: 'var(--b1n0-muted)', Icon: Receipt }

function TxCard({ tx }: { tx: TxRow }) {
  const { label, tint, Icon } = txMeta[tx.type as TxType] ?? FALLBACK_META
  const positive = tx.amount > 0
  const isMoneyMovement = tx.type === 'deposit' || tx.type === 'withdraw' || tx.type === 'win'

  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      {/* Icon disc — tinted background, tinted glyph */}
      <div
        style={{
          width: 34, height: 34, flexShrink: 0,
          borderRadius: '50%',
          background: `color-mix(in srgb, ${tint} 14%, transparent)`,
          color: tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon size={15} weight="regular" />
      </div>

      {/* Label + sub-label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)',
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px',
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={tx.label}
        >
          {truncateUuids(tx.label)}
        </p>
      </div>

      {/* Amount + balance after */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p
          style={{
            fontFamily: N, fontWeight: 700, fontSize: '14px',
            color: isMoneyMovement && positive ? 'var(--b1n0-si)' : 'var(--b1n0-text-1)',
            letterSpacing: '-0.3px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {positive && isMoneyMovement ? '+' : positive ? '' : '−'}${Math.abs(tx.amount).toFixed(2)}
        </p>
        {typeof tx.balanceAfter === 'number' && (
          <p
            style={{
              fontFamily: N, fontSize: '10px', color: 'var(--b1n0-muted)',
              marginTop: '2px', fontVariantNumeric: 'tabular-nums',
            }}
          >
            Saldo ${tx.balanceAfter.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  )
}

type VoteFilter = 'todos' | 'active' | 'won' | 'lost' | 'sold'

export function Historial() {
  usePageMeta({
    title: 'Historial · b1n0',
    description: 'Todos tus llamados resueltos en b1n0. Mirá tu trayectoria completa.',
  })
  const { session } = useAuth()
  const { predictions, refreshPredictions } = useVotes()

  useEffect(() => { refreshPredictions() }, [])

  const [tab, setTab] = useState<'votos' | 'movimientos'>('votos')
  const [votesRange, setVotesRange] = useState<DateRange>({ from: '', to: '' })
  const [txRange, setTxRange] = useState<DateRange>({ from: '', to: '' })
  const [voteFilter, setVoteFilter] = useState<VoteFilter>('todos')
  const [ledgerTx, setLedgerTx] = useState<TxRow[]>([])

  // Fetch from balance_ledger — now also captures running balance
  useEffect(() => {
    if (!session?.user?.id) return
    supabase
      .from('balance_ledger')
      .select('id, type, amount, balance_after, label, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!data) return
        setLedgerTx(data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          type: r.type as Transaction['type'],
          amount: Number(r.amount),
          label: r.label as string,
          date: (r.created_at as string).split('T')[0],
          balanceAfter: r.balance_after !== null && r.balance_after !== undefined ? Number(r.balance_after) : undefined,
        })))
      })
  }, [session?.user?.id, tab])

  const filteredVotes = predictions
    .filter((p) => withinDateRange(p.createdAt, votesRange))
    .filter((p) => voteFilter === 'todos' || p.status === voteFilter)

  const active = filteredVotes.filter((p) => p.status === 'active')
  const prior = filteredVotes.filter((p) => p.status !== 'active')

  const allTx = ledgerTx.filter((t) => withinDateRange(t.date, txRange))

  // Group transactions by date with daily net
  const txByDate: { date: string; net: number; items: TxRow[] }[] = []
  for (const tx of allTx) {
    const last = txByDate[txByDate.length - 1]
    if (last && last.date === tx.date) {
      last.items.push(tx)
      // Only count cash-impact movements towards the daily net
      if (tx.type === 'deposit' || tx.type === 'withdraw' || tx.type === 'win') last.net += tx.amount
    } else {
      txByDate.push({
        date: tx.date,
        items: [tx],
        net: tx.type === 'deposit' || tx.type === 'withdraw' || tx.type === 'win' ? tx.amount : 0,
      })
    }
  }

  // Aggregate stats for Mis Votos summary strip
  const totalStaked = filteredVotes.reduce((sum, p) => sum + p.amount, 0)
  const totalWon = filteredVotes.filter((p) => p.status === 'won').reduce((sum, p) => sum + p.potentialCobro, 0)
  const correctCount = filteredVotes.filter((p) => p.status === 'won').length
  const resolvedCount = filteredVotes.filter((p) => p.status !== 'active').length
  const accuracy = resolvedCount > 0 ? Math.round((correctCount / resolvedCount) * 100) : 0

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 24px' }}>
      <div style={{ padding: '20px 0 16px' }}>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
          Historial
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', background: 'var(--b1n0-card)', borderRadius: 'var(--radius-lg)', padding: '3px', marginBottom: '12px' }}>
        {(['votos', 'movimientos'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer',
              fontFamily: F, fontWeight: 600, fontSize: '13px',
              background: tab === t ? 'var(--b1n0-text-1)' : 'transparent',
              color: tab === t ? 'var(--b1n0-bg)' : 'var(--b1n0-muted)',
              transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            }}
          >
            {t === 'votos' ? 'Mis Votos' : 'Movimientos'}
          </button>
        ))}
      </div>

      {/* Summary strip — different shape per tab */}
      {tab === 'votos' && filteredVotes.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            marginBottom: '12px',
            padding: '12px 14px',
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <SummaryStat label="Entrada" value={`$${totalStaked.toFixed(0)}`} />
          <SummaryStat label="Cobrado" value={`$${totalWon.toFixed(0)}`} accent="var(--b1n0-si)" />
          <SummaryStat label="Acierto" value={resolvedCount > 0 ? `${accuracy}%` : '—'} />
        </div>
      )}

      {/* Date range + filter chips row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
        {tab === 'votos' ? (
          <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {([['todos', 'Todos'], ['active', 'Activos'], ['won', 'Ganados'], ['lost', 'Perdidos'], ['sold', 'Vendidos']] as [VoteFilter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setVoteFilter(f)}
                style={{
                  padding: '5px 11px', borderRadius: 'var(--radius-pill)',
                  border: voteFilter === f ? 'none' : '1px solid var(--b1n0-border)',
                  background: voteFilter === f ? 'var(--b1n0-text-1)' : 'var(--b1n0-card)',
                  color: voteFilter === f ? 'var(--b1n0-bg)' : 'var(--b1n0-muted)',
                  fontFamily: F, fontWeight: 600, fontSize: '11px',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : <div />}
        <div style={{ flexShrink: 0 }}>
          {tab === 'votos'
            ? <DateRangePicker value={votesRange} onChange={setVotesRange} />
            : <DateRangePicker value={txRange} onChange={setTxRange} />
          }
        </div>
      </div>

      {tab === 'votos' ? (
        <>
          {active.length > 0 && voteFilter !== 'won' && voteFilter !== 'lost' && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Activos · {active.length}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {active.map((p) => <VoteCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
          {prior.length > 0 && voteFilter !== 'active' && (
            <div>
              <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Anteriores · {prior.length}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {prior.map((p) => <VoteCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
          {active.length === 0 && prior.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '48px', padding: '0 24px' }}>
              <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '6px' }}>
                Todavía no tenés votos en este rango.
              </p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                Participá en el feed y tus votos aparecen acá.
              </p>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {txByDate.map(({ date, items, net }) => (
            <div key={date}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
                <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {formatDateHeader(date)}
                </p>
                {net !== 0 && (
                  <p
                    style={{
                      fontFamily: N, fontSize: '11px', fontWeight: 600,
                      color: net > 0 ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    Neto {net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(2)}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map((tx) => <TxCard key={tx.id} tx={tx} />)}
              </div>
            </div>
          ))}
          {allTx.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '48px', padding: '0 24px' }}>
              <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '6px' }}>
                Sin movimientos en este rango.
              </p>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                Tus depósitos, retiros y cobros aparecen acá.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── SummaryStat ──────────────────────────────────────────────────
   Mini stat for the votos summary strip. Three across.
   ───────────────────────────────────────────────────────────────── */
function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p
        style={{
          fontFamily: F, fontSize: '10px', fontWeight: 700,
          color: 'var(--b1n0-muted)', textTransform: 'uppercase',
          letterSpacing: '0.5px', marginBottom: '4px',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: N, fontWeight: 700, fontSize: '16px',
          color: accent ?? 'var(--b1n0-text-1)',
          letterSpacing: '-0.4px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  )
}

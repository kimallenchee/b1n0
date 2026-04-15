import { useState, useEffect } from 'react'
import type { UserPrediction, Transaction } from '../types'
import { CommentFeed } from '../components/feed/CommentFeed'
import { DateRangePicker, withinDateRange } from '../components/DateRangePicker'
import type { DateRange } from '../components/DateRangePicker'
import { useVotes } from '../context/VoteContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const typeLabel: Record<Transaction['type'], string> = {
  deposit: 'Depósito', withdraw: 'Retiro', vote: 'Voto', win: 'Cobro', loss: 'Perdido', sell: 'Venta', refund: 'Reembolso',
}
const typeIcon: Record<Transaction['type'], string> = {
  deposit: '↓', withdraw: '↑', vote: '•', win: '✓', loss: '✕', sell: '↗', refund: '↩',
}

function TxCard({ tx }: { tx: Transaction }) {
  const positive = tx.amount > 0
  return (
    <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderLeft: `3px solid ${positive ? 'var(--b1n0-surface)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '14px', padding: '13px 15px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: 34, height: 34, borderRadius: '9px', background: positive ? 'rgba(255,255,255,0.04)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontSize: '14px', color: 'var(--b1n0-text-2)', flexShrink: 0 }}>
        {typeIcon[tx.type]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', background: 'var(--b1n0-surface)', borderRadius: '5px', padding: '2px 6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
            {typeLabel[tx.type]}
          </span>
        </div>
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.label}</p>
        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '2px' }}>{tx.date}</p>
      </div>
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', flexShrink: 0, letterSpacing: '-0.3px' }}>
        {positive ? '+' : ''}Q{Math.abs(tx.amount).toFixed(2)}
      </p>
    </div>
  )
}

function VoteCard({ p }: { p: UserPrediction }) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const isActive = p.status === 'active'
  const isWon = p.status === 'won'
  const isSold = p.status === 'sold'
  const commentCount = p.event.comments?.length ?? 0

  return (
    <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderLeft: `3px solid ${isWon ? 'var(--b1n0-si)' : isSold ? '#C4B5FD' : isActive ? 'var(--b1n0-gold)' : 'var(--b1n0-no)'}`, borderRadius: '10px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: isActive ? 'var(--status-enjuego-text)' : isWon ? 'var(--status-ganado-text)' : isSold ? '#C4B5FD' : 'var(--status-perdido-text)', background: isActive ? 'var(--status-enjuego-bg)' : isWon ? 'var(--status-ganado-bg)' : isSold ? '#C4B5FD15' : 'var(--status-perdido-bg)', borderRadius: '5px', padding: '2px 7px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
          {isActive ? 'En juego' : isWon ? 'Ganado' : isSold ? 'Vendido' : 'Perdido'}
        </span>
        <span style={{ fontFamily: D, fontWeight: 800, fontSize: '13px', color: 'var(--b1n0-text-1)' }}>
          {p.side.includes('::')
            ? `${p.side.split('::')[0]} — ${p.side.split('::')[1] === 'yes' ? 'SÍ' : 'NO'}`
            : p.side === 'yes' ? 'SÍ' : 'NO'}
        </span>
      </div>
      <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', lineHeight: 1.35, marginBottom: '10px' }}>
        {p.event.question}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '2px' }}>Participación</p>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px' }}>Q{p.amount.toFixed(2)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginBottom: '2px' }}>
            {isWon ? 'Cobrado' : isSold ? 'Recibido' : isActive ? 'Potencial' : 'Fondos'}
          </p>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: isSold ? '#C4B5FD' : isWon ? '#4ade80' : isActive ? '#FFD474' : 'var(--b1n0-muted)', letterSpacing: '-0.3px' }}>
            {isWon ? `Q${p.potentialCobro.toFixed(2)}` : isSold ? `Q${p.potentialCobro.toFixed(2)}` : isActive ? `Q${p.potentialCobro.toFixed(2)}` : `-Q${p.amount.toFixed(2)}`}
          </p>
        </div>
      </div>

      {/* Comment toggle */}
      <div style={{ borderTop: '1px solid var(--b1n0-border)', paddingTop: '8px' }}>
        <button
          onClick={() => setCommentsOpen(!commentsOpen)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-muted)', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <span style={{ fontSize: '13px' }}>💬</span>
          {commentCount > 0 ? `${commentCount} comentarios` : 'Comentar'}
          <span style={{ fontSize: '10px' }}>{commentsOpen ? '▲' : '▼'}</span>
        </button>
        {commentsOpen && (
          <CommentFeed comments={p.event.comments ?? []} eventId={p.event.id} />
        )}
      </div>
    </div>
  )
}

type VoteFilter = 'todos' | 'active' | 'won' | 'lost' | 'sold'

export function Historial() {
  const { session } = useAuth()
  const { predictions, refreshPredictions } = useVotes()

  useEffect(() => { refreshPredictions() }, [])

  const [tab, setTab] = useState<'votos' | 'movimientos'>('votos')
  const [votesRange, setVotesRange] = useState<DateRange>({ from: '', to: '' })
  const [txRange, setTxRange] = useState<DateRange>({ from: '', to: '' })
  const [voteFilter, setVoteFilter] = useState<VoteFilter>('todos')
  const [ledgerTx, setLedgerTx] = useState<Transaction[]>([])

  // Fetch from balance_ledger
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
        })))
      })
  }, [session?.user?.id, tab])

  const filteredVotes = predictions
    .filter((p) => withinDateRange(p.createdAt, votesRange))
    .filter((p) => voteFilter === 'todos' || p.status === voteFilter)

  const active = filteredVotes.filter((p) => p.status === 'active')
  const prior = filteredVotes.filter((p) => p.status !== 'active')

  const allTx = ledgerTx
    .filter((t) => withinDateRange(t.date, txRange))

  // Group transactions by date
  const txByDate: { date: string; items: Transaction[] }[] = []
  for (const tx of allTx) {
    const last = txByDate[txByDate.length - 1]
    if (last && last.date === tx.date) {
      last.items.push(tx)
    } else {
      txByDate.push({ date: tx.date, items: [tx] })
    }
  }

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 24px' }}>
      <div style={{ padding: '20px 0 16px' }}>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
          Historial
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', background: 'var(--b1n0-card)', borderRadius: '12px', padding: '3px', marginBottom: '12px' }}>
        {(['votos', 'movimientos'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', background: tab === t ? 'var(--b1n0-text-1)' : 'transparent', color: tab === t ? 'var(--b1n0-bg)' : 'var(--b1n0-muted)' }}
          >
            {t === 'votos' ? 'Mis Votos' : 'Movimientos'}
          </button>
        ))}
      </div>

      {/* Date range + filter chips row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
        {tab === 'votos' ? (
          <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {([['todos', 'Todos'], ['active', 'Activos'], ['won', 'Ganados'], ['lost', 'Perdidos'], ['sold', 'Vendidos']] as [VoteFilter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setVoteFilter(f)}
                style={{ padding: '5px 11px', borderRadius: '20px', border: voteFilter === f ? 'none' : '1px solid var(--b1n0-border)', background: voteFilter === f ? 'var(--b1n0-text-1)' : 'var(--b1n0-card)', color: voteFilter === f ? 'var(--b1n0-bg)' : 'var(--b1n0-muted)', fontFamily: F, fontWeight: 600, fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
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
                Activos
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {active.map((p) => <VoteCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
          {prior.length > 0 && voteFilter !== 'active' && (
            <div>
              <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Anteriores
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {txByDate.map(({ date, items }) => (
            <div key={date}>
              <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                {date}
              </p>
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

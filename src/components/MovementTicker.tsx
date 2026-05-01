import { useEffect, useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'

/**
 * MovementTicker — horizontally scrolling stream of recent buys.
 *
 * Subscribes to `market_transactions` inserts via Supabase realtime.
 * Each new row pushes a "Joel called YES on Trump aranceles · $25 · 12s ago"
 * pill onto the right side of the ticker. Older pills slide left and
 * eventually fade off the leading edge.
 *
 * Renders as an absolute-positioned horizontal strip, designed to sit
 * just below a page header. ~36px tall.
 *
 * Why no virtualization: we cap the in-memory queue at 30 entries,
 * which means at most ~30 DOM nodes alive — well below any perf
 * threshold. Older entries fall off the back when the cap fills.
 */

interface Movement {
  id: string
  username: string
  side: string
  question: string
  amount: number
  createdAt: number
  ageMs: number
}

const MAX_MOVEMENTS = 30

interface MarketTxRow {
  id: string
  user_id: string
  event_id: string
  side?: string | null
  gross_amount: number
  tx_type: string
  success: boolean
  created_at: string
}

export function MovementTicker() {
  const [movements, setMovements] = useState<Movement[]>([])

  useEffect(() => {
    let cancelled = false

    // ── 1. Backfill: load the most recent 12 successful purchases so
    //    the ticker isn't empty on page load.
    const backfill = async () => {
      const { data: txs } = await supabase
        .from('market_transactions')
        .select('id, user_id, event_id, gross_amount, tx_type, success, created_at')
        .eq('tx_type', 'purchase')
        .eq('success', true)
        .order('created_at', { ascending: false })
        .limit(12)
      if (!txs || cancelled) return

      const userIds = Array.from(new Set(txs.map((t) => t.user_id)))
      const eventIds = Array.from(new Set(txs.map((t) => t.event_id)))

      const [{ data: profs }, { data: evts }, { data: positions }] = await Promise.all([
        supabase.from('profiles').select('id, name, username').in('id', userIds),
        supabase.from('events').select('id, question').in('id', eventIds),
        supabase.from('positions').select('event_id, user_id, side, created_at').in('event_id', eventIds),
      ])

      const profMap: Record<string, string> = {}
      for (const p of (profs ?? []) as { id: string; name: string | null; username: string | null }[]) {
        profMap[p.id] = p.username || p.name || 'Alguien'
      }
      const evMap: Record<string, string> = {}
      for (const e of (evts ?? []) as { id: string; question: string }[]) {
        evMap[e.id] = e.question
      }
      // best-effort side lookup: most recent matching position
      const sideMap: Record<string, string> = {}
      for (const p of (positions ?? []) as { event_id: string; user_id: string; side: string }[]) {
        sideMap[`${p.event_id}|${p.user_id}`] = p.side
      }

      const mapped: Movement[] = (txs as MarketTxRow[]).map((t) => ({
        id: t.id,
        username: profMap[t.user_id] ?? 'Alguien',
        side: sideMap[`${t.event_id}|${t.user_id}`] ?? 'yes',
        question: evMap[t.event_id] ?? 'evento',
        amount: Number(t.gross_amount) || 0,
        createdAt: new Date(t.created_at).getTime(),
        ageMs: Date.now() - new Date(t.created_at).getTime(),
      }))
      if (!cancelled) setMovements(mapped)
    }

    backfill()

    // ── 2. Realtime subscription: push new purchases onto the ticker.
    const channel = supabase
      .channel('public:movement-ticker')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'market_transactions', filter: 'tx_type=eq.purchase' },
        async (payload) => {
          const row = payload.new as MarketTxRow
          if (!row || row.success === false) return

          // Hydrate the row with username + question.
          const [{ data: prof }, { data: ev }] = await Promise.all([
            supabase.from('profiles').select('username, name').eq('id', row.user_id).maybeSingle(),
            supabase.from('events').select('question').eq('id', row.event_id).maybeSingle(),
          ])
          const username = (prof as { username?: string; name?: string } | null)?.username ?? (prof as { name?: string } | null)?.name ?? 'Alguien'
          const question = (ev as { question?: string } | null)?.question ?? 'evento'

          // Side isn't on market_transactions; pull from the matching position.
          const { data: pos } = await supabase
            .from('positions')
            .select('side')
            .eq('event_id', row.event_id)
            .eq('user_id', row.user_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const side = (pos as { side?: string } | null)?.side ?? 'yes'

          const m: Movement = {
            id: row.id,
            username,
            side,
            question,
            amount: Number(row.gross_amount) || 0,
            createdAt: new Date(row.created_at).getTime(),
            ageMs: 0,
          }

          setMovements((prev) => {
            // Dedup on id (realtime + backfill could overlap)
            const without = prev.filter((p) => p.id !== m.id)
            return [m, ...without].slice(0, MAX_MOVEMENTS)
          })
        }
      )
      .subscribe()

    // ── 3. Re-render every 6 seconds so the "12s ago" labels keep updating.
    const tick = setInterval(() => {
      setMovements((prev) =>
        prev.map((m) => ({ ...m, ageMs: Date.now() - m.createdAt }))
      )
    }, 6000)

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
      clearInterval(tick)
    }
  }, [])

  if (movements.length === 0) return null

  return (
    <div
      role="log"
      aria-label="Movimientos en vivo"
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: 'var(--space-3) var(--space-5)',
        borderTop: '1px solid var(--b1n0-border)',
        borderBottom: '1px solid var(--b1n0-border)',
        background: 'var(--b1n0-card)',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
      className="movement-ticker"
    >
      {movements.map((m) => (
        <MovementPill key={m.id} m={m} />
      ))}
      <style>{`
        .movement-ticker::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function MovementPill({ m }: { m: Movement }) {
  const isYes = m.side === 'yes' || m.side.endsWith('::yes')
  const accent = isYes ? 'var(--b1n0-si)' : 'var(--b1n0-no)'
  const sideLabel = isYes ? 'SÍ' : 'NO'
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-4)',
        background: 'var(--b1n0-surface)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-pill)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>
        @{m.username}
      </span>
      <ArrowRight size={10} weight="bold" color="var(--b1n0-muted)" />
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-2xs)',
          fontWeight: 700,
          color: accent,
          letterSpacing: 'var(--tracking-caps)',
        }}
      >
        {sideLabel}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--b1n0-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {m.question}
      </span>
      <span style={{ fontFamily: 'var(--font-num)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--b1n0-text-1)', fontVariantNumeric: 'tabular-nums' }}>
        ${m.amount.toFixed(0)}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)', color: 'var(--b1n0-muted)', fontVariantNumeric: 'tabular-nums' }}>
        · {timeAgo(m.ageMs)}
      </span>
    </div>
  )
}

/**
 * ActivityFeed — mixed-timestamp activity stream on public profile.
 *
 * Pulls two sources:
 *   - positions   → "Llamado" items (side + event link, optional $ amount)
 *   - comments    → "Comentó" items (text preview + event link)
 *
 * Mixed and sorted by created_at DESC, top 10 visible. Each item is
 * clickable → /eventos/:id, so profile stalking turns into event
 * discovery — the strategic win Kim wanted from this surface.
 *
 * Privacy gates (passed in from parent):
 *   - showLlamados        → hide the position items
 *   - showComments        → hide the comment items
 *   - showLlamadoAmount   → hide $ amount on llamado items (default OFF)
 *
 * If both showLlamados and showComments are false, parent should
 * skip rendering this component entirely. We still defend against
 * an empty stream below for safety.
 *
 * Why a separate component (not inlined in ProfilePublic):
 *   - Keeps ProfilePublic focused on identity + relationship UX
 *   - Easier to reuse later (e.g., a "your activity" panel in Perfil)
 *   - One place to tune cadence / item rendering
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const F_BODY    = 'var(--font-body)'
const F_DISPLAY = 'var(--font-display)'

interface ActivityFeedProps {
  userId: string
  showLlamados: boolean
  showComments: boolean
  showLlamadoAmount: boolean
}

type LlamadoItem = {
  kind: 'llamado'
  id: string
  event_id: string
  event_question: string
  side: 'yes' | 'no'
  gross_amount: number
  price_at_purchase: number
  created_at: string
  timestamp: number
}

type CommentItem = {
  kind: 'comment'
  id: string
  event_id: string
  event_question: string
  text: string
  created_at: string
  timestamp: number
}

type ActivityItem = LlamadoItem | CommentItem

export function ActivityFeed({
  userId,
  showLlamados,
  showComments,
  showLlamadoAmount,
}: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)

    ;(async () => {
      const queries: Promise<ActivityItem[]>[] = []

      // Llamados (positions) — only if user has opted in to surface them
      if (showLlamados) {
        queries.push(
          supabase
            .from('positions')
            .select('id, event_id, side, gross_amount, price_at_purchase, created_at, events(question)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10)
            .then(({ data }) => {
              if (!data) return []
              return (data as Array<{
                id: string
                event_id: string
                side: string
                gross_amount: number
                price_at_purchase: number
                created_at: string
                events: { question: string } | null
              }>).map((p): LlamadoItem => ({
                kind: 'llamado',
                id: p.id,
                event_id: p.event_id,
                event_question: p.events?.question ?? 'Evento',
                side: (p.side as 'yes' | 'no'),
                gross_amount: Number(p.gross_amount),
                price_at_purchase: Number(p.price_at_purchase),
                created_at: p.created_at,
                timestamp: new Date(p.created_at).getTime(),
              }))
            }),
        )
      }

      // Comments
      // Uses get_public_user_comments() RPC — a SECURITY DEFINER
      // function that:
      //   - Lets anon viewers read comments (the comments table RLS
      //     doesn't grant SELECT to anon).
      //   - Enforces the target user's privacy_prefs.show_activity_comments
      //     server-side (the owner always sees their own).
      //   - JOINs events so the event_question comes back in one
      //     roundtrip — no need to batch-fetch events client-side.
      if (showComments) {
        queries.push(
          supabase
            .rpc('get_public_user_comments', { p_user_id: userId })
            .then(({ data }) => {
              if (!data) return []
              return (data as Array<{
                id: string
                event_id: string
                event_question: string | null
                text: string
                created_at: string
              }>).map((c): CommentItem => ({
                kind: 'comment',
                id: c.id,
                event_id: c.event_id,
                event_question: c.event_question ?? 'Evento',
                text: c.text,
                created_at: c.created_at,
                timestamp: new Date(c.created_at).getTime(),
              }))
            }),
        )
      }

      const results = await Promise.all(queries)
      if (cancelled) return

      const merged = results.flat().sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
      setItems(merged)
    })()

    return () => { cancelled = true }
  }, [userId, showLlamados, showComments])

  // Both privacy toggles off → parent should skip rendering, but we
  // belt-and-suspenders that here too.
  if (!showLlamados && !showComments) return null

  return (
    <section style={{ marginTop: 'var(--space-7)', marginBottom: 'var(--space-7)' }}>
      <p
        style={{
          fontFamily: F_BODY,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--b1n0-muted)',
          margin: 0,
          marginBottom: 'var(--space-4)',
        }}
      >
        Actividad
      </p>

      {items === null ? (
        <p style={{ fontFamily: F_BODY, fontSize: 13, color: 'var(--b1n0-muted)' }}>
          Cargando…
        </p>
      ) : items.length === 0 ? (
        <p style={{ fontFamily: F_BODY, fontSize: 13, color: 'var(--b1n0-muted)' }}>
          Sin actividad reciente.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {items.map((item) =>
            item.kind === 'llamado' ? (
              <LlamadoCard key={`l-${item.id}`} item={item} showAmount={showLlamadoAmount} />
            ) : (
              <CommentCard key={`c-${item.id}`} item={item} />
            ),
          )}
        </div>
      )}
    </section>
  )
}

// ── Llamado activity item ────────────────────────────────────
function LlamadoCard({
  item,
  showAmount,
}: {
  item: LlamadoItem
  showAmount: boolean
}) {
  const sideColor = item.side === 'no' ? 'var(--b1n0-no)' : 'var(--b1n0-si)'
  const sideBg = item.side === 'no' ? 'var(--b1n0-no-bg, rgba(245,158,11,0.15))' : 'var(--b1n0-si-bg, rgba(20,184,166,0.15))'

  return (
    <Link
      to={`/eventos/${item.event_id}`}
      style={{
        display: 'block',
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 14px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-muted)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            background: sideBg,
            color: sideColor,
            fontFamily: F_BODY,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.6px',
          }}
        >
          {item.side === 'no' ? 'NO' : 'SÍ'}
        </span>
        <span
          style={{
            fontFamily: F_BODY,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--b1n0-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          Llamado · {formatRelative(item.timestamp)}
        </span>
      </div>
      <p
        style={{
          fontFamily: F_DISPLAY,
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--b1n0-text-1)',
          margin: 0,
          lineHeight: 1.4,
        }}
      >
        {item.event_question}
      </p>
      <p
        style={{
          fontFamily: F_BODY,
          fontSize: 12,
          color: 'var(--b1n0-muted)',
          margin: 0,
          marginTop: 4,
        }}
      >
        Entrada a {item.price_at_purchase.toFixed(2)}
        {showAmount && (
          <>
            {' · '}
            <span style={{ color: 'var(--b1n0-text-1)' }}>${item.gross_amount.toFixed(0)}</span>
          </>
        )}
      </p>
    </Link>
  )
}

// ── Comment activity item ────────────────────────────────────
function CommentCard({ item }: { item: CommentItem }) {
  const preview = item.text.length > 140 ? item.text.slice(0, 140).trim() + '…' : item.text

  return (
    <Link
      to={`/eventos/${item.event_id}`}
      style={{
        display: 'block',
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 14px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-muted)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-border)' }}
    >
      <p
        style={{
          fontFamily: F_BODY,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--b1n0-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          margin: 0,
          marginBottom: 6,
        }}
      >
        Comentó · {formatRelative(item.timestamp)}
      </p>
      <p
        style={{
          fontFamily: F_BODY,
          fontSize: 13,
          color: 'var(--b1n0-text-1)',
          margin: 0,
          lineHeight: 1.5,
          fontStyle: 'italic',
        }}
      >
        “{preview}”
      </p>
      <p
        style={{
          fontFamily: F_BODY,
          fontSize: 11,
          color: 'var(--b1n0-muted)',
          margin: 0,
          marginTop: 6,
        }}
      >
        en: {item.event_question}
      </p>
    </Link>
  )
}

// ── Relative time formatter (es-GT voseo) ─────────────────────
function formatRelative(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 60) return 'hace un momento'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `hace ${weeks}sem`
  const months = Math.floor(days / 30)
  return `hace ${months}m`
}

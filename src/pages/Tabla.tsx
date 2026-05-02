import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Users, UserPlus } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageMeta } from '../hooks/usePageMeta'
import { EmptyState } from '../components/EmptyState'

const F = 'var(--font-body)'
const D = 'var(--font-display)'
const NUM = 'var(--font-num)'

interface RankedUser {
  id: string
  name: string
  username: string
  avatarUrl?: string | null
  tier: number
  total_predictions: number
  correct_predictions: number
  accuracy_pct: number
  total_cobrado: number
  rank: number
}

function LeaderboardRow({ entry, isMe }: { entry: RankedUser; isMe: boolean }) {
  const isTop3 = entry.rank <= 3
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid var(--b1n0-border)',
        background: isMe ? 'var(--b1n0-surface)' : 'transparent',
        borderRadius: isMe ? 'var(--radius-md)' : 0,
        marginLeft: isMe ? 'calc(var(--space-3) * -1)' : 0,
        marginRight: isMe ? 'calc(var(--space-3) * -1)' : 0,
        paddingLeft: isMe ? 'var(--space-3)' : 0,
        paddingRight: isMe ? 'var(--space-3)' : 0,
      }}
    >
      <span
        style={{
          fontFamily: NUM,
          fontWeight: isTop3 ? 800 : 500,
          fontSize: isTop3 ? '18px' : '15px',
          color: isTop3 ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
          width: '32px',
          flexShrink: 0,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        #{entry.rank}
      </span>
      {entry.avatarUrl ? (
        <img
          src={entry.avatarUrl}
          alt=""
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: isTop3 ? '0 0 0 1.5px var(--b1n0-si)' : '0 0 0 1px var(--b1n0-border)' }}
        />
      ) : (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: isTop3 ? 'var(--b1n0-si-bg)' : 'var(--b1n0-surface)',
            border: '1px solid var(--b1n0-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: D,
            fontWeight: 700,
            fontSize: 'var(--text-xs)',
            color: isTop3 ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
            flexShrink: 0,
          }}
        >
          {(entry.name || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: F,
            fontWeight: 500,
            fontSize: 'var(--text-base)',
            color: 'var(--b1n0-text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isMe ? 'Tú' : entry.name}
        </p>
        <p style={{ fontFamily: F, fontSize: 'var(--text-xs)', color: 'var(--b1n0-muted)' }}>
          <span style={{ fontFamily: NUM, fontVariantNumeric: 'tabular-nums' }}>{entry.correct_predictions}</span>/<span style={{ fontFamily: NUM, fontVariantNumeric: 'tabular-nums' }}>{entry.total_predictions}</span> correctos · <span style={{ fontFamily: NUM, fontVariantNumeric: 'tabular-nums' }}>{entry.accuracy_pct}%</span>
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p
          style={{
            fontFamily: NUM,
            fontWeight: 700,
            fontSize: 'var(--text-base)',
            color: isTop3 ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
            letterSpacing: 'var(--tracking-tight)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ${entry.total_cobrado.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </p>
      </div>
    </div>
  )
}

/**
 * Podium — visual treatment for top 3 in the friends tab.
 *
 * Three columns. Center is 1st place (tallest), left is 2nd, right is 3rd.
 * The avatar sits inside a rounded square; rank label below; total_cobrado
 * below that. Uses tier coloring (gold / silver / bronze) keyed off rank.
 */
function FriendsPodium({ entries, currentUserId }: { entries: RankedUser[]; currentUserId?: string }) {
  if (entries.length < 3) return null
  const order = [entries[1], entries[0], entries[2]] // 2nd, 1st, 3rd left-to-right
  const heights = [88, 112, 76]
  const accents = ['#C0C0C0', '#FFD474', '#CD7F32']
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', justifyContent: 'center', padding: 'var(--space-7) 0 var(--space-5)' }}>
      {order.map((u, i) => {
        const isMe = u.id === currentUserId
        return (
          <div key={u.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 110 }}>
            {u.avatarUrl ? (
              <img src={u.avatarUrl} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', boxShadow: `0 0 0 2px ${accents[i]}` }} />
            ) : (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'var(--b1n0-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: D,
                  fontWeight: 800,
                  fontSize: 'var(--text-md)',
                  color: 'var(--b1n0-text-1)',
                  boxShadow: `0 0 0 2px ${accents[i]}`,
                }}
              >
                {(u.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <p style={{ fontFamily: F, fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--b1n0-text-1)', marginTop: 'var(--space-2)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {isMe ? 'Tú' : u.name.split(' ')[0]}
            </p>
            <p style={{ fontFamily: NUM, fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--b1n0-text-1)', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
              ${u.total_cobrado.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <div
              style={{
                marginTop: 'var(--space-3)',
                width: '100%',
                height: heights[i],
                background: `linear-gradient(180deg, ${accents[i]}33, transparent)`,
                borderTop: `2px solid ${accents[i]}`,
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 'var(--space-2)',
              }}
            >
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 'var(--text-md)', color: accents[i], fontVariantNumeric: 'tabular-nums' }}>
                {u.rank === 1 ? '1°' : u.rank === 2 ? '2°' : '3°'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Tabla() {
  const navigate = useNavigate()
  usePageMeta({
    title: 'Tabla · b1n0',
    description: 'Los que más saben este mes — la tabla de líderes de b1n0.',
  })
  const { session } = useAuth()
  const userId = session?.user?.id
  const [tab, setTab] = useState<'general' | 'friends'>('general')
  const [entries, setEntries] = useState<RankedUser[]>([])
  const [loading, setLoading] = useState(true)

  const loadLeaderboard = useCallback(async () => {
    setLoading(true)

    if (tab === 'general') {
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .order('total_predictions', { ascending: false })
        .limit(50)
      if (data) {
        setEntries((data as Record<string, unknown>[]).map((r, i) => ({
          id: r.id as string,
          name: (r.name as string) ?? '',
          username: (r.username as string) ?? '',
          avatarUrl: (r.avatar_url as string) ?? null,
          tier: Number(r.tier) || 1,
          total_predictions: Number(r.total_predictions) || 0,
          correct_predictions: Number(r.correct_predictions) || 0,
          accuracy_pct: Number(r.accuracy_pct) || 0,
          total_cobrado: Number(r.total_cobrado) || 0,
          rank: i + 1,
        })))
      }
    } else {
      if (!userId) {
        setEntries([]
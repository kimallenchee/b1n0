import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface RankedUser {
  id: string
  name: string
  username: string
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--b1n0-border)', background: isMe ? 'var(--b1n0-surface)' : 'transparent', borderRadius: isMe ? '8px' : 0, marginLeft: isMe ? '-8px' : 0, marginRight: isMe ? '-8px' : 0, paddingLeft: isMe ? '8px' : 0, paddingRight: isMe ? '8px' : 0 }}>
      <span style={{ fontFamily: D, fontWeight: isTop3 ? 800 : 500, fontSize: isTop3 ? '18px' : '15px', color: isTop3 ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)', width: '32px', flexShrink: 0, textAlign: 'center' }}>
        #{entry.rank}
      </span>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: isTop3 ? '#4ade80' : 'var(--b1n0-surface)', border: isTop3 ? 'none' : '1px solid var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 600, fontSize: '12px', color: isTop3 ? '#0d0d0d' : 'var(--b1n0-muted)', flexShrink: 0 }}>
        {entry.name.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: F, fontWeight: 500, fontSize: '14px', color: 'var(--b1n0-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isMe ? 'Tú' : entry.name}
        </p>
        <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
          {entry.correct_predictions}/{entry.total_predictions} correctos · {entry.accuracy_pct}%
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: isTop3 ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)', letterSpacing: '-0.5px' }}>
          Q{entry.total_cobrado.toLocaleString()}
        </p>
      </div>
    </div>
  )
}

export function Tabla() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [tab, setTab] = useState<'general' | 'friends'>('general')
  const [entries, setEntries] = useState<RankedUser[]>([])
  const [loading, setLoading] = useState(true)

  const loadLeaderboard = useCallback(async () => {
    setLoading(true)

    if (tab === 'general') {
      // Fetch all users from leaderboard view
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .order('total_predictions', { ascending: false })
        .limit(50)

      if (data) {
        setEntries((data as Record<string, unknown>[]).map((r, i) => ({
          id: r.id as string,
          name: r.name as string,
          username: (r.username as string) ?? '',
          tier: Number(r.tier) || 1,
          total_predictions: Number(r.total_predictions) || 0,
          correct_predictions: Number(r.correct_predictions) || 0,
          accuracy_pct: Number(r.accuracy_pct) || 0,
          total_cobrado: Number(r.total_cobrado) || 0,
          rank: i + 1,
        })))
      }
    } else {
      // Friends tab: get accepted friend IDs, then fetch their leaderboard rows
      if (!userId) {
        setEntries([])
        setLoading(false)
        return
      }

      const { data: friendships } = await supabase
        .from('friendships')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)

      const friendIds = new Set<string>()
      if (friendships) {
        for (const f of friendships as { sender_id: string; receiver_id: string }[]) {
          if (f.sender_id === userId) friendIds.add(f.receiver_id)
          else friendIds.add(f.sender_id)
        }
      }
      // Include self
      friendIds.add(userId)

      if (friendIds.size <= 1) {
        setEntries([])
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .in('id', [...friendIds])
        .order('total_predictions', { ascending: false })

      if (data) {
        setEntries((data as Record<string, unknown>[]).map((r, i) => ({
          id: r.id as string,
          name: r.name as string,
          username: (r.username as string) ?? '',
          tier: Number(r.tier) || 1,
          total_predictions: Number(r.total_predictions) || 0,
          correct_predictions: Number(r.correct_predictions) || 0,
          accuracy_pct: Number(r.accuracy_pct) || 0,
          total_cobrado: Number(r.total_cobrado) || 0,
          rank: i + 1,
        })))
      }
    }

    setLoading(false)
  }, [tab, userId])

  useEffect(() => { loadLeaderboard() }, [loadLeaderboard])

  // Find current user in entries
  const myEntry = entries.find((e) => e.id === userId)

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 16px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: '16px', background: 'var(--b1n0-surface)', borderRadius: '12px', padding: '4px' }}>
        {(['general', 'friends'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
              cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px',
              background: tab === t ? 'var(--b1n0-card)' : 'transparent',
              color: tab === t ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
            }}
          >
            {t === 'general' ? 'General' : 'Amigos'}
          </button>
        ))}
      </div>

      <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', fontStyle: 'italic', marginBottom: '16px' }}>
        Los que más saben este mes
      </p>

      {/* User's own position */}
      {myEntry && (
        <div style={{ background: 'var(--b1n0-surface)', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: D, fontWeight: 800, fontSize: '18px', color: 'var(--b1n0-muted)', width: '28px', flexShrink: 0 }}>
            #{myEntry.rank}
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: F, fontWeight: 600, fontSize: '14px', color: 'var(--b1n0-text-1)' }}>Tú</p>
            <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
              {myEntry.correct_predictions}/{myEntry.total_predictions} correctos · {myEntry.accuracy_pct}%
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: D, fontWeight: 700, fontSize: '15px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.5px' }}>
              Q{myEntry.total_cobrado.toLocaleString()}
            </p>
            <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>cobrado</p>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)' }}>Cargando...</p>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontFamily: F, fontSize: '15px', color: 'var(--b1n0-muted)', fontStyle: 'italic' }}>
            {tab === 'friends'
              ? 'Todavía no tenés amigos en b1n0. Agregá desde tu perfil.'
              : 'No hay participantes todavía.'}
          </p>
        </div>
      ) : (
        <div>
          {entries.map((entry) => (
            <LeaderboardRow key={entry.id} entry={entry} isMe={entry.id === userId} />
          ))}
        </div>
      )}
    </div>
  )
}

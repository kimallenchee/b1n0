import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Event } from '../../types'
import { SplitBar } from './SplitBar'
import { LiveDot } from './LiveDot'
import { EntryFlow } from './EntryFlow'
import { PurchaseCelebration } from './PurchaseCelebration'
import { CommentFeed } from './CommentFeed'
import { BottomSheet } from '../BottomSheet'
import { useVotes } from '../../context/VoteContext'
import { useAuth } from '../../context/AuthContext'
import { useNow } from '../../context/NowContext'
import { supabase } from '../../lib/supabase'

const COUNTRY_CODES: Record<string, string> = {
  GT: 'GT', SV: 'SV', HN: 'HN', NI: 'NI', CR: 'CR', PA: 'PA', BZ: 'BZ',
  MX: 'MX', US: 'US', CO: 'CO', AR: 'AR', BR: 'BR', CL: 'CL', PE: 'PE',
  GLOBAL: 'GL',
}

interface EventCardProps {
  event: Event
}

const categoryLabels: Record<string, string> = {
  deportes: 'DEP',
  politica: 'POL',
  economia: 'ECO',
  geopolitica: 'GEO',
  cultura: 'CUL',
  tecnologia: 'TEC',
  finanzas: 'FIN',
  otro: 'OTR',
}


const categoryColors: Record<string, { bg: string; text: string }> = {
  deportes:    { bg: 'var(--color-cat-deportes-bg)', text: 'var(--color-cat-deportes)' },
  politica:    { bg: 'var(--color-cat-politica-bg)', text: 'var(--color-cat-politica)' },
  economia:    { bg: 'var(--color-cat-economia-bg)', text: 'var(--color-cat-economia)' },
  geopolitica: { bg: 'var(--color-cat-geopolitica-bg)', text: 'var(--color-cat-geopolitica)' },
  cultura:     { bg: 'var(--color-cat-cultura-bg)', text: 'var(--color-cat-cultura)' },
  tecnologia:  { bg: 'var(--color-cat-tecnologia-bg)', text: 'var(--color-cat-tecnologia)' },
  finanzas:    { bg: 'var(--color-cat-finanzas-bg)', text: 'var(--color-cat-finanzas)' },
  otro:        { bg: 'var(--color-cat-otro-bg)', text: 'var(--color-cat-otro)' },
}

// Legacy flat color for borders etc.
const categoryColorFlat: Record<string, string> = {
  deportes: '#1E3A5F', politica: '#5F1E1E', economia: '#5F3A0E', geopolitica: '#2E1065',
  cultura: '#5F1039', tecnologia: '#0C3A5A', finanzas: '#064E3B', otro: '#3D3D3A',
}

const categoryPhotos: Record<string, string> = {
  deportes:    'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=500&h=500&q=80',
  politica:    'https://images.unsplash.com/photo-1529107386315-0b8b7e776a62?auto=format&fit=crop&w=500&h=500&q=80',
  economia:    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=500&h=500&q=80',
  geopolitica: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=500&h=500&q=80',
  cultura:     'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=500&h=500&q=80',
  tecnologia:  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=500&h=500&q=80',
  finanzas:    'https://images.unsplash.com/photo-1559526324-593bc073d938?auto=format&fit=crop&w=500&h=500&q=80',
  otro:        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=500&h=500&q=80',
}

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

function displaySide(s: string): string {
  if (s === 'yes') return 'SÍ'
  if (s === 'no') return 'NO'
  if (s.includes('::')) {
    const [label, dir] = s.split('::')
    return `${label} — ${dir === 'yes' ? 'SÍ' : 'NO'}`
  }
  return s
}

function getUrgency(endsAt: string | undefined, now: number): 'critical' | 'soon' | 'normal' {
  if (!endsAt) return 'normal'
  const diff = new Date(endsAt).getTime() - now
  if (diff <= 2 * 3600 * 1000) return 'critical'
  if (diff <= 24 * 3600 * 1000) return 'soon'
  return 'normal'
}

function formatCountdown(endsAt: string | undefined, now: number, fallback: string): string {
  if (!endsAt) return fallback
  const diff = new Date(endsAt).getTime() - now
  if (diff <= 0) return 'Cerrado'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h < 1) return `${m}m`
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function EventCard({ event }: EventCardProps) {
  const [sheet, setSheet] = useState<'vote' | 'comments' | null>(null)
  const [celeb, setCeleb] = useState<{ side: string; amount: number; cobro: number } | null>(null)
  const { hasVoted, getVote, castVote } = useVotes()
  const { session } = useAuth()
  const now = useNow()
  const navigate = useNavigate()

  const voted = hasVoted(event.id)
  const vote = getVote(event.id)
  const isResolved = event.status === 'resolved'

  // ── Top comments preview (3 most engaged) ──
  type PreviewComment = { id: string; username: string; avatarUrl?: string; text: string; likes: number; dislikes: number; replies_count: number; side?: string | null }
  const [topComments, setTopComments] = useState<PreviewComment[]>([])
  const [commentCount, setCommentCount] = useState(event.comments?.length ?? 0)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('comments')
        .select('id, user_id, username, avatar_url, text, likes, dislikes, side, parent_id')
        .eq('event_id', event.id)
      if (!data || data.length === 0) return
      const rows = data as { id: string; user_id?: string; username: string; avatar_url?: string; text: string; likes: number; dislikes: number; side: string | null; parent_id: string | null }[]

      // Fetch live profile data for all commenters
      const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[]
      const profMap: Record<string, { username: string; avatar_url: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
        if (profs) {
          for (const p of profs as { id: string; username: string; avatar_url: string | null }[]) {
            profMap[p.id] = { username: p.username, avatar_url: p.avatar_url }
          }
        }
      }

      // Count only top-level comments, overlay live profile data
      const topLevel = rows.filter(r => !r.parent_id).map(r => {
        const prof = r.user_id ? profMap[r.user_id] : null
        return { ...r, username: prof?.username || r.username, avatarUrl: prof?.avatar_url || r.avatar_url || undefined }
      })
      setCommentCount(topLevel.length)
      // Count replies per parent
      const replyCounts: Record<string, number> = {}
      for (const r of rows) {
        if (r.parent_id) replyCounts[r.parent_id] = (replyCounts[r.parent_id] || 0) + 1
      }
      // Score = likes + replies_count + dislikes (all engagement)
      const scored = topLevel.map(c => ({
        ...c,
        replies_count: replyCounts[c.id] || 0,
        score: (c.likes || 0) + (replyCounts[c.id] || 0) + (c.dislikes || 0),
      }))
      scored.sort((a, b) => b.score - a.score)
      setTopComments(scored.slice(0, 3))
    })()
  }, [event.id])
  const label = categoryLabels[event.category] || 'EVT'
  const u = getUrgency(event.endsAt, now)
  const catColor = categoryColors[event.category] || categoryColors.otro
  const color = categoryColorFlat[event.category] || '#3D3D3A'
  const photo = event.imageUrl || categoryPhotos[event.category]
  const isBinary = event.eventType !== 'open'

  // Live prices from pricing engine (binary) or option_markets (open)
  const [liveBinary, setLiveBinary] = useState<{ yes: number; no: number } | null>(null)
  const [liveOptPcts, setLiveOptPcts] = useState<Record<string, number>>({})
  const [livePoolSize, setLivePoolSize] = useState<number | null>(null)

  const fetchLivePrices = useCallback(async () => {
    if (isBinary) {
      const { data } = await supabase
        .from('event_markets')
        .select('yes_shares, no_shares, pool_total')
        .eq('event_id', event.id)
        .single()
      if (!data) return
      setLivePoolSize(Number(data.pool_total) || 0)
      const total = Number(data.yes_shares) + Number(data.no_shares)
      if (total === 0) return
      setLiveBinary({
        yes: Math.round(Number(data.yes_shares) / total * 100),
        no:  Math.round(Number(data.no_shares)  / total * 100),
      })
    } else {
      // Open events: get live pool from event_markets
      const { data: mktRow } = await supabase
        .from('event_markets')
        .select('pool_total')
        .eq('event_id', event.id)
        .maybeSingle()
      if (mktRow) setLivePoolSize(Number(mktRow.pool_total) || 0)

      // Open events: get live prices from option_markets (share-based)
      const { data } = await supabase
        .from('option_markets')
        .select('option_label, yes_shares, no_shares')
        .eq('event_id', event.id)
        .eq('status', 'open')
      if (!data || data.length === 0) return
      const pcts: Record<string, number> = {}
      for (const row of data as { option_label: string; yes_shares: number; no_shares: number }[]) {
        const total = Number(row.yes_shares) + Number(row.no_shares)
        pcts[row.option_label] = total > 0 ? Math.round(Number(row.yes_shares) / total * 100) : 50
      }
      setLiveOptPcts(pcts)
    }
  }, [event.id, isBinary])

  useEffect(() => { fetchLivePrices() }, [fetchLivePrices])

  const yesDisplayPct = liveBinary?.yes ?? event.yesPercent
  const noDisplayPct  = liveBinary?.no  ?? event.noPercent
  const displayPool   = livePoolSize ?? event.poolSize

  // All open positions for this user+event (binary only — positions table tracks each purchase)
  type UserPosition = { id: string; side: string; gross_amount: number; payout_if_win: number }
  const [userPositions, setUserPositions] = useState<UserPosition[]>([])

  const fetchUserPositions = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid || !isBinary) return
    const { data } = await supabase
      .from('positions')
      .select('id, side, gross_amount, payout_if_win')
      .eq('event_id', event.id)
      .eq('user_id', uid)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
    if (data) setUserPositions(data as UserPosition[])
  }, [event.id, isBinary, session?.user?.id])

  useEffect(() => { if (voted) fetchUserPositions() }, [voted, fetchUserPositions])

  const handleConfirm = async (side: string, amount: number, skipRpc?: boolean, cobro?: number) => {
    await castVote(event.id, side, amount, event, skipRpc)
    setSheet(null)
    setCeleb({ side, amount, cobro: cobro ?? 0 })
    await fetchLivePrices()
    await fetchUserPositions()
  }

  return (
    <>
      <div className="event-card" style={{ borderLeft: `3px solid ${color}`, overflow: 'hidden', background: 'var(--color-surface)' }}>
        {photo ? (
          /* ── Cinematic hero: full-bleed + gradient lower-third ── */
          <div style={{ margin: '-16px -16px 14px', aspectRatio: '5 / 2', position: 'relative', overflow: 'hidden', borderRadius: '9px 9px 0 0' }}>
            <img
              src={photo}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
            />
            {/* Category color tint + bottom gradient */}
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${color}22 0%, ${color}11 50%, transparent 100%)`, mixBlendMode: 'multiply' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.8) 100%)' }} />
            {/* Lower-third: category + live | sponsor */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cat-badge" style={{ background: catColor.bg, color: catColor.text }}>
                  {label}
                </span>
                {event.country && COUNTRY_CODES[event.country] && (
                  <span className="country-badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>{COUNTRY_CODES[event.country]}</span>
                )}
                {event.isLive && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span className="live-dot-broadcast" />
                    <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: '#4ade80', letterSpacing: '0.6px', textTransform: 'uppercase' }}>EN VIVO</span>
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                {event.sponsor?.name && (
                  <>
                    <p style={{ fontFamily: F, fontSize: '8px', color: 'rgba(255,255,255,0.6)', marginBottom: '2px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>Presentado por</p>
                    <span style={{ fontFamily: F, fontWeight: 600, fontSize: '11px', color: '#fff', lineHeight: 1 }}>{event.sponsor.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Fallback header when no image ── */
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="cat-badge" style={{ background: catColor.bg, color: catColor.text }}>
                {label}
              </span>
              {event.country && COUNTRY_CODES[event.country] && (
                <span className="country-badge">{COUNTRY_CODES[event.country]}</span>
              )}
              {event.isLive && <LiveDot />}
            </div>
            {event.sponsor?.name && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: F, fontSize: '9px', color: 'var(--b1n0-muted)', marginBottom: '1px', letterSpacing: '0.5px' }}>Presentado por</p>
                <span style={{ fontFamily: F, fontWeight: 500, fontSize: '12px', color: 'var(--b1n0-text-1)' }}>{event.sponsor.name}</span>
              </div>
            )}
          </div>
        )}

        {/* Question — clickable */}
        <h2
          onClick={() => navigate(`/eventos/${event.id}`)}
          style={{ fontFamily: F, fontWeight: 800, fontSize: '17px', color: 'var(--color-text)', lineHeight: 1.35, marginBottom: '2px', cursor: 'pointer', letterSpacing: '-0.3px' }}
        >
          {event.question}
        </h2>

        {event.eventType === 'open' ? (
          /* ── OPEN EVENT: options list + considerations ── */
          <div style={{ marginTop: '12px' }}>
            {event.options && event.options.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                {event.options.map((opt, i) => {
                  const parts = opt.split(':')
                  const pool = parts.length >= 3 ? parseFloat(parts[parts.length - 1]) || 0 : 0
                  const pct = parts.length >= 2 ? Math.round(parseFloat(parts[parts.length - (parts.length >= 3 ? 2 : 1)]) || 0) : 0
                  const optLabel = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(':') : parts.length === 2 ? parts[0] : opt
                  return (
                    <div key={i} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)', marginBottom: '2px' }}>{optLabel}</p>
                        {pool > 0 && <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>{event.currency}{pool.toLocaleString()}</span>}
                      </div>
                      <SplitBar yesPercent={liveOptPcts[optLabel] ?? pct} noPercent={100 - (liveOptPcts[optLabel] ?? pct)} compact />
                    </div>
                  )
                })}
              </div>
            )}
            {event.considerations && (
              <div style={{ padding: '8px 10px', background: 'var(--b1n0-surface)', borderRadius: '8px', borderLeft: `3px solid ${color}` }}>
                <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Contexto
                </p>
                <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-2)', lineHeight: 1.5 }}>
                  {event.considerations}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {event.country && COUNTRY_CODES[event.country] && (
                <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', background: 'var(--b1n0-surface)', borderRadius: '4px', padding: '2px 5px', letterSpacing: '0.5px' }}>{COUNTRY_CODES[event.country]}</span>
              )}
              {event.sponsor?.name && (
                <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
                  {event.sponsor.name}
                </span>
              )}
              {displayPool > 0 && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: '10px' }}>·</span>
                  <span style={{ fontFamily: F, fontWeight: 500, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{event.currency}{displayPool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pool</span>
                </>
              )}
              <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: '10px' }}>·</span>
              <span style={{ fontFamily: F, fontSize: '11px', color: u === 'critical' ? 'var(--b1n0-surface)' : 'var(--b1n0-text-2)', fontWeight: u === 'critical' ? 700 : 400, display: 'flex', alignItems: 'center', gap: '3px' }}>
                {u === 'critical' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--b1n0-text-1)', display: 'inline-block', animation: 'pulse 2s infinite', flexShrink: 0 }} />}
                {formatCountdown(event.endsAt, now, event.timeRemaining)}
              </span>
            </div>
            {isResolved ? (
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', background: 'var(--b1n0-surface)', borderRadius: '6px', padding: '3px 8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  Resuelto
                </span>
                {event.result && (
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', marginTop: '6px', letterSpacing: '-0.3px' }}>
                    {event.result === 'yes' ? 'SÍ ganó' : event.result === 'no' ? 'NO ganó' : `${event.result} ganó`}
                  </p>
                )}
              </div>
            ) : (
              <>
                {voted && vote && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '6px 0 10px' }}>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>✓ Tu posición:</span>
                    <span style={{ fontFamily: D, fontWeight: 700, fontSize: '12px', color: 'var(--b1n0-text-1)' }}>{displaySide(vote.side)}</span>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>· {event.currency}{vote.amount}</span>
                  </div>
                )}
                <button
                  onClick={() => setSheet('vote')}
                  className="btn-primary" style={{ width: '100%', padding: '13px', fontSize: '13px', letterSpacing: '0.6px', marginBottom: '8px' }}
                >
                  {voted ? 'AGREGAR POSICIÓN →' : 'HACER MI VOTO →'}
                </button>
              </>
            )}
          </div>
        ) : (
          /* ── BINARY EVENT: split bar + vote button ── */
          <>
            <SplitBar yesPercent={yesDisplayPct} noPercent={noDisplayPct} />

            {event.yesTrend && event.yesTrend !== 'stable' && (
              <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', marginTop: '3px' }}>
                SÍ {event.yesTrend === 'up' ? '↑ ganando' : '↓ perdiendo'} terreno
              </p>
            )}

            {event.considerations && (
              <div style={{ padding: '8px 10px', background: 'var(--b1n0-surface)', borderRadius: '8px', borderLeft: `3px solid ${color}`, marginTop: '10px' }}>
                <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Contexto
                </p>
                <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-2)', lineHeight: 1.5 }}>
                  {event.considerations}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {event.country && COUNTRY_CODES[event.country] && (
                <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', background: 'var(--b1n0-surface)', borderRadius: '4px', padding: '2px 5px', letterSpacing: '0.5px' }}>{COUNTRY_CODES[event.country]}</span>
              )}
              {event.sponsor?.name && (
                <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
                  {event.sponsor.name}
                </span>
              )}
              <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: '10px' }}>·</span>
              <span style={{ fontFamily: F, fontWeight: 500, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                {event.currency}{displayPool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pool
              </span>
              <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: '10px' }}>·</span>
              <span style={{ fontFamily: F, fontSize: '11px', color: u === 'critical' ? 'var(--b1n0-surface)' : 'var(--b1n0-text-2)', fontWeight: u === 'critical' ? 700 : 400, display: 'flex', alignItems: 'center', gap: '3px' }}>
                {u === 'critical' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--b1n0-text-1)', display: 'inline-block', animation: 'pulse 2s infinite', flexShrink: 0 }} />}
                {formatCountdown(event.endsAt, now, event.timeRemaining)}
              </span>
            </div>

            {isResolved ? (
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', background: 'var(--b1n0-surface)', borderRadius: '6px', padding: '3px 8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  Resuelto
                </span>
                {event.result && (
                  <p style={{ fontFamily: D, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-text-1)', marginTop: '6px', letterSpacing: '-0.3px' }}>
                    {event.result === 'yes' ? 'SÍ ganó' : event.result === 'no' ? 'NO ganó' : `${event.result} ganó`}
                  </p>
                )}
              </div>
            ) : (
              <>
                {userPositions.length > 0 ? (
                  <div style={{ marginBottom: '10px' }}>
                    {userPositions.map((pos) => (
                      <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
                        <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>✓ {pos.side === 'yes' ? 'SÍ' : 'NO'} · {event.currency}{Number(pos.gross_amount).toFixed(2)}</span>
                        <span style={{ fontFamily: D, fontWeight: 600, fontSize: '11px', color: '#4ade80' }}>→ {event.currency}{Number(pos.payout_if_win).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : voted && vote ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '6px 0 10px' }}>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>✓ Tu posición:</span>
                    <span style={{ fontFamily: D, fontWeight: 700, fontSize: '12px', color: 'var(--b1n0-text-1)' }}>{displaySide(vote.side)}</span>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>· {event.currency}{vote.amount}</span>
                  </div>
                ) : null}
                <button
                  onClick={() => setSheet('vote')}
                  className="btn-primary" style={{ width: '100%', padding: '13px', fontSize: '13px', letterSpacing: '0.6px', marginBottom: '8px' }}
                >
                  {voted ? 'AGREGAR POSICIÓN →' : 'HACER MI VOTO →'}
                </button>
              </>
            )}
          </>
        )}

        {!isResolved && (
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center' }}>
            Desde {event.currency}{event.minEntry} · Máx {event.currency}{event.maxEntry}
          </p>
        )}

        {/* Comment toggle + preview */}
        <div style={{ marginTop: '10px', borderTop: '1px solid var(--b1n0-border)', paddingTop: '10px' }}>
          <button
            onClick={() => setSheet('comments')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-muted)', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <span style={{ fontSize: '13px' }}>💬</span>
            {commentCount > 0 ? `${commentCount} comentarios` : 'Comentar'}
          </button>
          {topComments.length > 0 && (
            <div
              onClick={() => setSheet('comments')}
              style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', cursor: 'pointer' }}
            >
              {topComments.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: '1px' }} />
                  ) : (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2a2724', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 700, fontSize: '9px', color: '#fff', flexShrink: 0, marginTop: '1px' }}>
                      {c.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: F, fontWeight: 700, fontSize: '11px', color: 'var(--b1n0-text-1)' }}>@{c.username}</span>
                      {c.side && (
                        <span style={{ fontFamily: F, fontWeight: 700, fontSize: '9px', color: c.side === 'yes' ? 'var(--b1n0-surface)' : 'var(--b1n0-muted)', background: c.side === 'yes' ? 'rgba(255,255,255,0.06)' : 'transparent', borderRadius: '4px', padding: '1px 5px' }}>
                          {c.side === 'yes' ? 'SÍ' : 'NO'}
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.text}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      {(c.likes || 0) > 0 && <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>👍 {c.likes}</span>}
                      {c.replies_count > 0 && <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>{c.replies_count} respuesta{c.replies_count !== 1 ? 's' : ''}</span>}
                      {(c.dislikes || 0) > 0 && <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>👎 {c.dislikes}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vote sheet */}
      <BottomSheet open={sheet === 'vote'} onClose={() => setSheet(null)}>
        <div style={{ padding: '0 16px 40px' }}>
          <EntryFlow event={event} onClose={() => setSheet(null)} onConfirm={handleConfirm} />
        </div>
      </BottomSheet>

      {/* Comments sheet */}
      <BottomSheet open={sheet === 'comments'} onClose={() => setSheet(null)} title={event.question}>
        <div style={{ padding: '16px 16px 40px' }}>
          <CommentFeed comments={event.comments ?? []} eventId={event.id} />
        </div>
      </BottomSheet>

      {celeb && (
        <PurchaseCelebration
          side={celeb.side}
          amount={celeb.amount}
          cobro={celeb.cobro}
          currency={event.currency}
          onDone={() => setCeleb(null)}
        />
      )}
    </>
  )
}

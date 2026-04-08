import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvents } from '../context/EventsContext'
import { DateRangePicker, withinDateRange } from '../components/DateRangePicker'
import type { DateRange } from '../components/DateRangePicker'
import type { Event } from '../types'
import { useNow } from '../context/NowContext'
import { useVotes } from '../context/VoteContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { midPctToAsk } from '../lib/pricing'
import { WalletSheet } from '../components/wallet/WalletSheet'
import { SplitBar } from '../components/feed/SplitBar'
import { SkeletonFeed } from '../components/Skeleton'
import { ErrorState } from '../components/EmptyState'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

const COUNTRY_FLAGS: Record<string, string> = {
  GT: 'GT', SV: 'SV', HN: 'HN', US: 'US', MX: 'MX', GLOBAL: 'GL',
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
const catFlat: Record<string, string> = {
  deportes: '#1E3A5F', politica: '#5F1E1E', economia: '#5F3A0E', geopolitica: '#2E1065',
  cultura: '#5F1039', tecnologia: '#0C3A5A', finanzas: '#064E3B', otro: '#3D3D3A',
}

const categoryLabels: Record<string, string> = {
  deportes: 'Deportes', politica: 'Política', economia: 'Economía',
  geopolitica: 'Geopolítica', cultura: 'Cultura', tecnologia: 'Tecnología',
  finanzas: 'Finanzas', otro: 'Otro',
}

const categoryPhotos: Record<string, string> = {
  deportes:    'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=400&h=220&q=80',
  politica:    'https://images.unsplash.com/photo-1529107386315-0b8b7e776a62?auto=format&fit=crop&w=400&h=220&q=80',
  economia:    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=400&h=220&q=80',
  geopolitica: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=400&h=220&q=80',
  cultura:     'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&h=220&q=80',
  tecnologia:  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&h=220&q=80',
  finanzas:    'https://images.unsplash.com/photo-1559526324-593bc073d938?auto=format&fit=crop&w=400&h=220&q=80',
  otro:        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=400&h=220&q=80',
}

function formatCountdown(endsAt: string | undefined, now: number): string {
  if (!endsAt) return ''
  const diff = new Date(endsAt).getTime() - now
  if (diff <= 0) return 'Cerrado'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h < 1) return `${m}m`
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function parseOptionItems(options: string[] | undefined): { label: string; pct: number }[] {
  if (!options) return []
  return options.map((o) => {
    const parts = o.split(':')
    if (parts.length >= 3) {
      const pct = parseFloat(parts[parts.length - 2]) || 0
      const label = parts.slice(0, parts.length - 2).join(':')
      return { label, pct }
    }
    if (parts.length === 2) return { label: parts[0], pct: parseFloat(parts[1]) || 0 }
    return { label: o, pct: 0 }
  })
}

function compactNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

/* ── Social stats row ── */
interface EventStats { comments: number; positions: number; likes: number }

function StatsRow({ stats, size = 'sm' }: { stats: EventStats | undefined; size?: 'sm' | 'md' }) {
  if (!stats) return null
  const s = size === 'md' ? { font: '11px', gap: '10px', iconGap: '3px' } : { font: '10px', gap: '8px', iconGap: '2px' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }}>
      {stats.positions > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: s.iconGap, fontFamily: F, fontSize: s.font, color: 'var(--b1n0-muted)' }}>
          <span style={{ fontSize: size === 'md' ? '12px' : '10px' }}>📊</span> {compactNum(stats.positions)}
        </span>
      )}
      {stats.comments > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: s.iconGap, fontFamily: F, fontSize: s.font, color: 'var(--b1n0-muted)' }}>
          <span style={{ fontSize: size === 'md' ? '12px' : '10px' }}>💬</span> {compactNum(stats.comments)}
        </span>
      )}
      {stats.likes > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: s.iconGap, fontFamily: F, fontSize: s.font, color: 'var(--b1n0-muted)' }}>
          <span style={{ fontSize: size === 'md' ? '12px' : '10px' }}>👍</span> {compactNum(stats.likes)}
        </span>
      )}
    </div>
  )
}

/* ── Compact event card (Polymarket-style) ── */
function MiniCard({ event, now, stats, liveOptPcts, liveBinary }: { event: Event; now: number; stats?: EventStats; liveOptPcts?: Record<string, number>; liveBinary?: { yes: number; no: number } }) {
  const navigate = useNavigate()
  const color = categoryColors[event.category] || 'var(--b1n0-muted)'
  const photo = event.imageUrl || categoryPhotos[event.category]
  const isOpen = event.eventType === 'open'
  const isResolved = event.status === 'resolved' || event.status === 'closed'
  const countdown = formatCountdown(event.endsAt, now)
  const options = isOpen ? parseOptionItems(event.options) : []

  return (
    <div
      onClick={() => navigate(`/eventos/${event.id}`)}
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: '12px',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 0.15s, transform 0.15s',
        display: 'flex',
        flexDirection: 'column' as const,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(255,255,255,0.06)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Thumbnail */}
      {photo && (
        <div style={{ position: 'relative', aspectRatio: '5 / 2', overflow: 'hidden' }}>
          <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${catFlat[event.category] || '#3D3D3A'}22 0%, ${catFlat[event.category] || '#3D3D3A'}11 50%, transparent 100%)`, mixBlendMode: 'multiply' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.65) 100%)' }} />
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column' as const }}>
        {/* Category line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: '#5e5a54', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            {categoryLabels[event.category] || 'Otro'}
          </span>
          {event.country && COUNTRY_FLAGS[event.country] && (
            <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 600, color: '#5e5a54', letterSpacing: '0.5px' }}>
              {COUNTRY_FLAGS[event.country]}
            </span>
          )}
        </div>
        {/* Question */}
        <p style={{
          fontFamily: D, fontWeight: 500, fontSize: '13px', color: 'var(--b1n0-text-1)',
          lineHeight: 1.35, marginBottom: '8px', minHeight: '35px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {event.question}
        </p>

        {/* Outcome buttons */}
        {isOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {options.slice(0, 3).map((opt) => (
              <div key={opt.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>
                  {opt.label}
                </span>
                <span style={{
                  fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-si-dark)',
                  background: 'var(--b1n0-si-bg)', borderRadius: '4px', padding: '2px 8px',
                  flexShrink: 0,
                }}>
                  {midPctToAsk(liveOptPcts?.[opt.label] ?? opt.pct).toFixed(2)}
                </span>
              </div>
            ))}
            {options.length > 3 && (
              <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>+{options.length - 3} más</span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <div style={{
              flex: 1, textAlign: 'center', padding: '6px 0',
              background: isResolved && event.result === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-si-bg)',
              borderRadius: '6px',
            }}>
              <span style={{
                fontFamily: F, fontWeight: 700, fontSize: '13px',
                color: isResolved && event.result === 'yes' ? '#fff' : 'var(--b1n0-si-dark)',
              }}>
                SÍ {midPctToAsk(liveBinary?.yes ?? event.yesPercent).toFixed(2)}
              </span>
            </div>
            <div style={{
              flex: 1, textAlign: 'center', padding: '6px 0',
              background: isResolved && event.result === 'no' ? 'var(--b1n0-no)' : 'var(--b1n0-no-bg)',
              borderRadius: '6px',
            }}>
              <span style={{
                fontFamily: F, fontWeight: 700, fontSize: '13px',
                color: isResolved && event.result === 'no' ? '#fff' : 'var(--b1n0-no-dark)',
              }}>
                NO {midPctToAsk(liveBinary?.no ?? event.noPercent).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Footer: stats + pool — pinned to bottom */}
        <div style={{ marginTop: 'auto', paddingTop: '6px' }}>
          <StatsRow stats={stats} size="sm" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
              {event.poolSize > 0 ? `${event.currency}${event.poolSize.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pool` : ''}
            </span>
            <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
              {isResolved ? 'Resuelto' : countdown}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Category filter pills ── */
const ALL_CATEGORIES = ['todos', 'deportes', 'politica', 'economia', 'geopolitica', 'cultura', 'tecnologia', 'finanzas', 'otro'] as const

type SortBy = 'popular' | 'reciente' | 'resueltos'

export function Inicio() {
  const now = useNow()
  const navigate = useNavigate()
  const { events, resolvedEvents, loading: eventsLoading, error: eventsError, refetch } = useEvents()
  const { balance, predictions } = useVotes()
  const { session } = useAuth()
  const isLoggedIn = !!session
  const [sort, setSort] = useState<SortBy>('popular')
  const [category, setCategory] = useState<string>('todos')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [search, setSearch] = useState('')
  const [statsMap, setStatsMap] = useState<Record<string, EventStats>>({})
  const [walletOpen, setWalletOpen] = useState(false)
  // Live option prices: eventId → { optionLabel → yesPct (0-100) }
  const [liveOptMap, setLiveOptMap] = useState<Record<string, Record<string, number>>>({})
  // Live binary prices: eventId → { yes, no } (0-100)
  const [liveBinaryMap, setLiveBinaryMap] = useState<Record<string, { yes: number; no: number }>>({})

  // Batch-fetch social stats for all visible events
  const allEvents = [...events, ...resolvedEvents]
  const eventIds = allEvents.map((e) => e.id)

  const fetchStats = useCallback(async () => {
    if (eventIds.length === 0) { setStatsMap({}); return }

    const [commentsRes, positionsRes, optionMarketsRes, eventMarketsRes] = await Promise.all([
      supabase.from('comments').select('event_id, likes').in('event_id', eventIds),
      supabase.from('positions').select('event_id').in('event_id', eventIds),
      supabase.from('option_markets').select('event_id, option_label, yes_shares, no_shares').in('event_id', eventIds).eq('status', 'open'),
      supabase.from('event_markets').select('event_id, yes_shares, no_shares').in('event_id', eventIds),
    ])

    const map: Record<string, EventStats> = {}
    for (const id of eventIds) {
      map[id] = { comments: 0, positions: 0, likes: 0 }
    }

    if (commentsRes.data) {
      for (const row of commentsRes.data as { event_id: string; likes: number }[]) {
        if (!map[row.event_id]) map[row.event_id] = { comments: 0, positions: 0, likes: 0 }
        map[row.event_id].comments += 1
        map[row.event_id].likes += Number(row.likes) || 0
      }
    }

    if (positionsRes.data) {
      for (const row of positionsRes.data as { event_id: string }[]) {
        if (!map[row.event_id]) map[row.event_id] = { comments: 0, positions: 0, likes: 0 }
        map[row.event_id].positions += 1
      }
    }

    setStatsMap(map)

    // Build live option prices map
    const optMap: Record<string, Record<string, number>> = {}
    if (optionMarketsRes.data) {
      for (const row of optionMarketsRes.data as { event_id: string; option_label: string; yes_shares: number; no_shares: number }[]) {
        const total = Number(row.yes_shares) + Number(row.no_shares)
        if (!optMap[row.event_id]) optMap[row.event_id] = {}
        optMap[row.event_id][row.option_label] = total > 0 ? Math.round(Number(row.yes_shares) / total * 100) : 50
      }
    }
    setLiveOptMap(optMap)

    // Build live binary prices map
    const binMap: Record<string, { yes: number; no: number }> = {}
    if (eventMarketsRes.data) {
      for (const row of eventMarketsRes.data as { event_id: string; yes_shares: number; no_shares: number }[]) {
        const total = Number(row.yes_shares) + Number(row.no_shares)
        if (total > 0) {
          binMap[row.event_id] = {
            yes: Math.round(Number(row.yes_shares) / total * 100),
            no: Math.round(Number(row.no_shares) / total * 100),
          }
        }
      }
    }
    setLiveBinaryMap(binMap)
  }, [eventIds.join(',')])

  useEffect(() => { fetchStats() }, [fetchStats])

  const sourceEvents = sort === 'resueltos' ? resolvedEvents : events.filter((e) => e.status !== 'private')
  const filtered = [...sourceEvents]
    .filter((e) => category === 'todos' || e.category === category)
    .filter((e) => withinDateRange(e.createdAt, dateRange))
    .filter((e) => !search || e.question.toLowerCase().includes(search.toLowerCase()))
    .sort(sort === 'popular'
      ? (a, b) => b.poolSize - a.poolSize
      : (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  // User stats for banner
  const totalVotes = predictions.length
  const activeBets = predictions.filter((p) => p.status === 'active')
  const totalAtRisk = activeBets.reduce((s, p) => s + p.amount, 0)

  // Featured event = highest pool
  const featured = filtered[0]
  const rest = filtered.slice(1)
  const featuredStats = featured ? statsMap[featured.id] : undefined

  const activeLive = allEvents.filter(e => e.isLive)
  const totalLivePool = activeLive.reduce((s, e) => s + e.poolSize, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Stats banner — card grid (only show when logged in) */}
      {isLoggedIn && <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
          {([
            { label: 'Saldo', value: `Q${balance.toLocaleString()}`, accent: 'var(--color-teal-500)', click: () => setWalletOpen(true) },
            { label: 'En juego', value: totalAtRisk > 0 ? `Q${totalAtRisk.toLocaleString()}` : '—', accent: 'var(--color-orange-500)' },
            { label: 'Pool', value: `Q${totalLivePool.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, accent: 'var(--color-teal-700)' },
            { label: 'Activos', value: String(activeLive.length), accent: 'var(--color-si)' },
            { label: 'Votos', value: String(totalVotes), accent: 'var(--color-muted)' },
          ] as { label: string; value: string; accent: string; click?: () => void }[]).map((s) => (
            <button
              key={s.label}
              onClick={s.click}
              style={{
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: '10px', padding: '8px 6px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '3px', cursor: s.click ? 'pointer' : 'default',
                transition: 'box-shadow 0.15s',
              }}
            >
              <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 600, color: 'var(--color-muted)', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{s.label}</span>
              <span style={{ fontFamily: F, fontWeight: 800, fontSize: '14px', color: 'var(--color-text)', letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</span>
              <span style={{ width: '16px', height: '2px', borderRadius: '1px', background: s.accent, marginTop: '2px' }} />
            </button>
          ))}
        </div>
      </div>}

      {/* Search */}
      <div style={{ padding: '10px 16px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '9px 12px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar eventos..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: F, fontSize: '13px', color: 'var(--color-text)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '14px', color: 'var(--b1n0-muted)', padding: 0, lineHeight: 1, flexShrink: 0 }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category pills (horizontal scroll) */}
      <div className="scroll-x" style={{ padding: '6px 16px 4px', display: 'flex', gap: '6px', flexShrink: 0 }}>
        {ALL_CATEGORIES.map((c) => {
          const active = category === c
          const label = c === 'todos' ? 'Todos' : (categoryLabels[c] || c)
          const cc = categoryColors[c] || categoryColors.otro
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: '5px 12px', borderRadius: '18px', cursor: 'pointer',
                fontFamily: F, fontWeight: active ? 700 : 500, fontSize: '11px', whiteSpace: 'nowrap',
                border: active ? '1px solid transparent' : '1px solid var(--b1n0-border)',
                background: active ? (c === 'todos' ? 'var(--b1n0-si)' : cc.bg) : 'transparent',
                color: active ? (c === 'todos' ? '#0d0d0d' : cc.text) : 'var(--b1n0-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Sort tabs + date */}
      <div style={{ padding: '6px 16px 8px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {([['popular', 'Popular'], ['reciente', 'Reciente'], ['resueltos', 'Resueltos']] as [SortBy, string][]).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            style={{
              padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
              fontFamily: F, fontWeight: sort === s ? 700 : 500, fontSize: '11px',
              border: sort === s ? '1px solid var(--b1n0-si)' : '1px solid transparent',
              background: sort === s ? 'var(--b1n0-si-bg)' : 'transparent',
              color: sort === s ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Scrollable feed */}
      <div className="feed-scroll" style={{ flex: 1, padding: '0 16px 16px' }}>
        {eventsLoading ? (
          <SkeletonFeed />
        ) : eventsError ? (
          <ErrorState message={eventsError} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontFamily: F, fontSize: '15px', color: 'var(--b1n0-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
              {search ? 'Sin resultados para esta búsqueda.' : 'No hay eventos activos por ahora.'}
            </p>
          </div>
        ) : (
          <>
            {/* Featured card (first/biggest event, full width) */}
            {featured && (
              <div
                onClick={() => navigate(`/eventos/${featured.id}`)}
                style={{
                  background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)',
                  borderRadius: '14px', cursor: 'pointer', overflow: 'hidden', marginBottom: '12px',
                }}
              >
                {(featured.imageUrl || categoryPhotos[featured.category]) && (
                  <div style={{ position: 'relative', height: '200px', overflow: 'hidden' }}>
                    <img
                      src={featured.imageUrl || categoryPhotos[featured.category]}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                          {categoryLabels[featured.category] || 'Otro'}
                        </span>
                        {featured.country && COUNTRY_FLAGS[featured.country] && (
                          <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 600, color: 'var(--b1n0-muted)' }}>
                            {COUNTRY_FLAGS[featured.country]}
                          </span>
                        )}
                      </div>
                      <h2 style={{ fontFamily: D, fontWeight: 600, fontSize: '20px', color: '#fff', lineHeight: 1.3 }}>
                        {featured.question}
                      </h2>
                    </div>
                  </div>
                )}
                <div style={{ padding: '10px 14px 12px' }}>
                  {featured.eventType === 'open' ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                      {parseOptionItems(featured.options).slice(0, 4).map((opt) => (
                        <span key={opt.label} style={{
                          fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)',
                          background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '4px 10px',
                        }}>
                          {opt.label} <span style={{ color: 'var(--b1n0-muted)' }}>{midPctToAsk(liveOptMap[featured.id]?.[opt.label] ?? opt.pct).toFixed(2)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginBottom: '6px' }}>
                      <SplitBar
                        yesPercent={liveBinaryMap[featured.id]?.yes ?? featured.yesPercent}
                        noPercent={liveBinaryMap[featured.id]?.no ?? featured.noPercent}
                        onClickSi={() => navigate(`/eventos/${featured.id}`)}
                        onClickNo={() => navigate(`/eventos/${featured.id}`)}
                      />
                    </div>
                  )}

                  {/* Social stats + pool + time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <StatsRow stats={featuredStats} size="md" />
                      {featured.poolSize > 0 && (
                        <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                          {featured.currency}{featured.poolSize.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pool
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                      {formatCountdown(featured.endsAt, now)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Grid of compact cards — 2 col mobile, 3 col desktop */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
            }} className="card-grid">
              {rest.map((event) => (
                <MiniCard key={event.id} event={event} now={now} stats={statsMap[event.id]} liveOptPcts={liveOptMap[event.id]} liveBinary={liveBinaryMap[event.id]} />
              ))}
            </div>
          </>
        )}
      </div>
      <WalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  )
}

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Event as AppEvent } from '../types'
import { useEvents } from '../context/EventsContext'
import { SplitBar } from '../components/feed/SplitBar'
import { EntryFlow } from '../components/feed/EntryFlow'
import { PurchaseCelebration } from '../components/feed/PurchaseCelebration'
import { CommentFeed } from '../components/feed/CommentFeed'
import { BottomSheet } from '../components/BottomSheet'
import { LiveDot } from '../components/feed/LiveDot'
import { useVotes } from '../context/VoteContext'
import { useAuth } from '../context/AuthContext'
import { useAuthModal } from '../context/AuthModalContext'
import { supabase } from '../lib/supabase'
import { midPctToAsk } from '../lib/pricing'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'
const catFlat: Record<string, string> = {
  deportes: '#1E3A5F', politica: '#5F1E1E', economia: '#5F3A0E', geopolitica: '#2E1065',
  cultura: '#5F1039', tecnologia: '#0C3A5A', finanzas: '#064E3B', otro: '#3D3D3A',
}

const COUNTRY_FLAGS: Record<string, string> = {
  GT: 'GT', SV: 'SV', HN: 'HN', NI: 'NI', CR: 'CR', PA: 'PA', BZ: 'BZ',
  MX: 'MX', US: 'US', CO: 'CO', AR: 'AR', BR: 'BR', CL: 'CL', PE: 'PE',
  GLOBAL: 'GL',
}

const CHART_COLORS = ['var(--b1n0-si)', 'var(--b1n0-no)', '#FFD474', '#C4B5FD', '#F9A8D4', '#7DD3FC']

const categoryLabels: Record<string, string> = {
  deportes: 'Deportes', politica: 'Política', economia: 'Economía',
  geopolitica: 'Geopolítica', cultura: 'Cultura', tecnologia: 'Tecnología',
  finanzas: 'Finanzas', otro: 'Otro',
}

const categoryPhotos: Record<string, string> = {
  deportes:    'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=600&h=280&q=80',
  politica:    'https://images.unsplash.com/photo-1529107386315-0b8b7e776a62?auto=format&fit=crop&w=600&h=280&q=80',
  economia:    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=600&h=280&q=80',
  geopolitica: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&h=280&q=80',
  cultura:     'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&h=280&q=80',
  tecnologia:  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&h=280&q=80',
  finanzas:    'https://images.unsplash.com/photo-1559526324-593bc073d938?auto=format&fit=crop&w=600&h=280&q=80',
  otro:        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=600&h=280&q=80',
}

// ── Chart ────────────────────────────────────────────────────────────────────

type ChartPt = { t: number; vals: number[] }

function synthChartData(endPcts: number[], n = 42): ChartPt[] {
  const even = 100 / endPcts.length
  const pts: ChartPt[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const vals = endPcts.map((end, j) => {
      const base = even + (end - even) * Math.pow(t, 0.8)
      const noiseAmp = 11 * (1 - t * 0.75)
      const noise = Math.sin(i * 2.9 + j * 1.7) * noiseAmp * 0.7 + Math.cos(i * 1.3 + j * 2.4) * noiseAmp * 0.3
      return Math.max(1, Math.min(99, base + noise))
    })
    pts.push({ t, vals })
  }
  return pts
}

function buildRealChartData(
  positions: { side: string; price_at_purchase: number; created_at: string }[],
  initYes: number, currentYes: number, eventCreatedAt: string,
): ChartPt[] {
  if (!positions || positions.length === 0) return synthChartData([currentYes, 100 - currentYes])
  const sorted = [...positions].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const pts: ChartPt[] = []
  const start = new Date(eventCreatedAt).getTime()
  if (isNaN(start)) return synthChartData([currentYes, 100 - currentYes])
  const now = Date.now()
  const span = Math.max(now - start, 1)
  pts.push({ t: 0, vals: [initYes, 100 - initYes] })
  let lastYes = initYes
  for (const pos of sorted) {
    if (!pos.price_at_purchase || !pos.created_at) continue
    const yesPct = pos.side === 'yes'
      ? Math.round(pos.price_at_purchase * 100)
      : Math.round((1 - pos.price_at_purchase) * 100)
    lastYes = Math.max(1, Math.min(99, isNaN(yesPct) ? 50 : yesPct))
    const elapsed = new Date(pos.created_at).getTime() - start
    if (isNaN(elapsed)) continue
    const t = Math.max(0.01, Math.min(0.99, elapsed / span))
    pts.push({ t, vals: [lastYes, 100 - lastYes] })
  }
  pts.push({ t: 1, vals: [currentYes, 100 - currentYes] })
  return pts
}

const CW = 380, CH = 200, PL = 32, PR = 12, PT = 20, PB = 26
const PW = CW - PL - PR, PH = CH - PT - PB

function hoverTimeLabel(t: number, eventAgeMs: number): string {
  if (t <= 0) return 'Inicio'
  if (t >= 1) return 'Ahora'
  const elapsed = t * eventAgeMs
  const mins = Math.floor(elapsed / 60000)
  const hrs = Math.floor(elapsed / 3600000)
  const days = Math.floor(elapsed / 86400000)
  if (eventAgeMs < 3600000) return `${mins}m`
  if (eventAgeMs < 86400000) return `${hrs}h ${mins % 60}m`
  if (eventAgeMs < 7 * 86400000) return `${days}d ${hrs % 24}h`
  return `Día ${days}`
}

type TimeRange = '1H' | '6H' | '1D' | '1W' | 'ALL'

function ProbabilityChart({ labels, pcts, colors, realData, eventAgeMs, timeRange, onTimeRangeChange }: {
  labels: string[]; pcts: number[]; colors: string[]; realData?: ChartPt[]; eventAgeMs?: number;
  timeRange: TimeRange; onTimeRangeChange: (r: TimeRange) => void;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const synthData = useMemo(() => synthChartData(pcts), [pcts.join(',')])
  const allData = realData && realData.length >= 2 ? realData : synthData

  // Filter by time range
  const age = eventAgeMs ?? 30 * 86400000
  const rangeMs: Record<TimeRange, number> = { '1H': 3600000, '6H': 6 * 3600000, '1D': 86400000, '1W': 7 * 86400000, 'ALL': age }
  const cutoff = Math.max(0, 1 - (rangeMs[timeRange] / age))
  const data = timeRange === 'ALL' ? allData : allData.filter(p => p.t >= cutoff)
  if (data.length < 2 && allData.length >= 2) {
    // Not enough data in range, show all
    // data = allData (already handled by filter)
  }

  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Rescale t values to 0-1 within the filtered range
  const tMin = data.length > 0 ? data[0].t : 0
  const tMax = data.length > 0 ? data[data.length - 1].t : 1
  const tSpan = Math.max(tMax - tMin, 0.001)
  const toX = (t: number) => PL + ((t - tMin) / tSpan) * PW
  const toY = (v: number) => PT + PH * (1 - v / 100)
  const yGrid = [0, 25, 50, 75, 100]
  const polylines = labels.map((_, i) =>
    data.map((p: ChartPt) => `${toX(p.t).toFixed(1)},${toY(p.vals[i]).toFixed(1)}`).join(' ')
  )
  const last = data[data.length - 1]
  const hoverPt = hoverIdx !== null && hoverIdx < data.length ? data[hoverIdx] : null
  const hoverX = hoverPt ? toX(hoverPt.t) : null

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * CW
    const tNorm = Math.max(0, Math.min(1, (svgX - PL) / PW))
    const tVal = tMin + tNorm * tSpan
    let best = 0, bestDist = Infinity
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(data[i].t - tVal)
      if (d < bestDist) { bestDist = d; best = i }
    }
    setHoverIdx(best)
  }

  return (
    <div>
      {/* Time range selectors */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {(['1H', '6H', '1D', '1W', 'ALL'] as TimeRange[]).map(r => (
          <button
            key={r}
            onClick={() => onTimeRangeChange(r)}
            style={{
              padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              fontFamily: F, fontSize: '11px', fontWeight: timeRange === r ? 700 : 500,
              background: timeRange === r ? 'var(--b1n0-teal-50)' : 'transparent',
              color: timeRange === r ? 'var(--b1n0-teal-700)' : 'var(--b1n0-muted)',
              transition: 'all 0.15s',
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Y grid */}
        {yGrid.map(g => (
          <g key={g}>
            <line x1={PL} y1={toY(g)} x2={CW - PR} y2={toY(g)} stroke="var(--b1n0-border)" strokeWidth="0.5" />
            <text x={PL - 4} y={toY(g) + 4} textAnchor="end" fill="var(--b1n0-muted)" fontSize="9" fontFamily={F}>{(g / 100).toFixed(2)}</text>
          </g>
        ))}
        {/* X labels */}
        <text x={PL} y={CH - 5} textAnchor="start" fill="var(--b1n0-muted)" fontSize="9" fontFamily={F}>
          {timeRange === 'ALL' ? 'Inicio' : timeRange}
        </text>
        <text x={CW - PR} y={CH - 5} textAnchor="end" fill="var(--b1n0-muted)" fontSize="9" fontFamily={F}>Ahora</text>
        {/* Lines */}
        {polylines.map((line, i) => (
          <polyline key={i} points={line} fill="none" stroke={colors[i]}
            strokeWidth={i === 0 ? '2.5' : '2'} strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))}
        {/* End dots */}
        {!hoverPt && last && labels.map((_, i) => (
          <circle key={i} cx={toX(last.t)} cy={toY(last.vals[i])} r="4" fill={colors[i]} stroke="var(--b1n0-card)" strokeWidth="2" />
        ))}
        {/* Hover overlay */}
        {hoverPt && hoverX !== null && (
          <g>
            <line x1={hoverX} y1={PT} x2={hoverX} y2={PT + PH} stroke="var(--b1n0-muted)" strokeWidth="0.5" strokeDasharray="3,2" />
            <text x={Math.max(PL + 18, Math.min(CW - PR - 18, hoverX))} y={PT - 5} textAnchor="middle"
              fill="var(--b1n0-text-1)" fontSize="9" fontFamily={F} fontWeight="700">
              {hoverTimeLabel(hoverPt.t, eventAgeMs ?? 30 * 86400000)}
            </text>
            {labels.map((_, i) => {
              const y = toY(hoverPt.vals[i])
              const spread = labels.length > 1 ? (i - (labels.length - 1) / 2) * 16 : 0
              const bx = Math.max(PL + 16, Math.min(CW - PR - 16, hoverX + spread))
              const by = Math.max(PT + 12, Math.min(PT + PH - 5, y - 9))
              return (
                <g key={i}>
                  <circle cx={hoverX} cy={y} r="4" fill={colors[i]} stroke="var(--b1n0-card)" strokeWidth="2" />
                  <rect x={bx - 16} y={by - 10} width={32} height={15} rx={4} fill={colors[i]} opacity="0.92" />
                  <text x={bx} y={by + 1} textAnchor="middle" fill="#fff" fontSize="9" fontFamily={F} fontWeight="700">
                    {midPctToAsk(hoverPt.vals[i]).toFixed(2)}
                  </text>
                </g>
              )
            })}
          </g>
        )}
      </svg>
    </div>
  )
}

// ── Activity Feed Item ──────────────────────────────────────────────────────

type ActivityItem = { id: string; username: string; side: string; amount: number; created_at: string }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function displaySide(s: string): string {
  if (s === 'yes') return 'SÍ'
  if (s === 'no') return 'NO'
  if (s.includes('::')) {
    const [label, dir] = s.split('::')
    return `${label} ${dir === 'yes' ? 'SÍ' : 'NO'}`
  }
  return s
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getEvent, loading } = useEvents()
  const event = getEvent(id ?? '')

  if (!event) {
    // If still loading, show spinner; otherwise show 404
    if (loading) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: F, fontWeight: 600, fontSize: '14px', color: 'var(--b1n0-muted)' }}>Cargando evento...</p>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '20px', color: 'var(--b1n0-text-1)', marginBottom: '8px' }}>Evento no encontrado</p>
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', marginBottom: '20px' }}>Este evento no existe o ya no está disponible.</p>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'var(--b1n0-surface)', color: 'var(--b1n0-text-1)', fontFamily: F, fontWeight: 600, fontSize: '13px' }}
        >
          Volver al inicio
        </button>
      </div>
    )
  }

  return <EventDetailInner event={event} />
}

function EventDetailInner({ event }: { event: AppEvent }) {
  const navigate = useNavigate()
  const { refetch } = useEvents()
  const { hasVoted, getVote, castVote } = useVotes()
  const { session, profile } = useAuth()
  const { openAuth } = useAuthModal()
  const [voteOpen, setVoteOpen] = useState(false)
  const [voteInitSide, setVoteInitSide] = useState<string | undefined>(undefined)
  const [celeb, setCeleb] = useState<{ side: string; amount: number; cobro: number } | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL')

  // ── Desktop sidebar trading panel state ──
  const [panelTab, setPanelTab] = useState<'buy' | 'sell'>('buy')
  const [panelSide, setPanelSide] = useState<'yes' | 'no'>('yes')
  const [panelOption, setPanelOption] = useState<string | null>(null) // for open events: "El Salvador", "Honduras", etc.
  const [panelAmount, setPanelAmount] = useState('')
  const [panelPreview, setPanelPreview] = useState<{ fee: number; net: number; payout: number; feeRate: number; price: number; contracts: number } | null>(null)
  const [panelSubmitting, setPanelSubmitting] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [userBalance, setUserBalance] = useState(0)
  const [holdersTab, setHoldersTab] = useState<'yes' | 'no'>('yes')
  const [holdersOption, setHoldersOption] = useState<string | null>(null)
  const [topHolders, setTopHolders] = useState<{ username: string; amount: number; side: string }[]>([])

  // Fetch user balance — use profile from auth context, with direct fetch as fallback
  useEffect(() => {
    if (profile?.balance !== undefined) {
      setUserBalance(Number(profile.balance) || 0)
      return
    }
    if (!session?.user?.id) return
    supabase.from('profiles').select('balance').eq('id', session.user.id).single().then(({ data }) => {
      if (data) setUserBalance(Number((data as { balance: number }).balance) || 0)
    })
  }, [session?.user?.id, profile?.balance])

  // Fetch top holders
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('positions')
        .select('user_id, side, gross_amount')
        .eq('event_id', event.id)
        .eq('status', 'active')
        .order('gross_amount', { ascending: false })
        .limit(20)
      if (!data || data.length === 0) return
      const userIds = [...new Set(data.map((r: { user_id: string }) => r.user_id))]
      const { data: profiles } = await supabase.from('profiles').select('id, name, username').in('id', userIds)
      const nameMap: Record<string, string> = {}
      if (profiles) for (const p of profiles as { id: string; name: string; username: string }[]) nameMap[p.id] = p.username || p.name || 'Anon'
      const agg: Record<string, { username: string; amount: number; side: string }> = {}
      for (const r of data as { user_id: string; side: string; gross_amount: number }[]) {
        const key = `${r.user_id}_${r.side}`
        if (!agg[key]) agg[key] = { username: nameMap[r.user_id] || 'Anon', amount: 0, side: r.side }
        agg[key].amount += Number(r.gross_amount)
      }
      setTopHolders(Object.values(agg).sort((a, b) => b.amount - a.amount))
    })()
  }, [event.id])

  // Preview for sidebar panel
  const panelFullSide = panelOption ? `${panelOption}::${panelSide}` : panelSide
  useEffect(() => {
    const amt = parseFloat(panelAmount)
    if (!amt || amt <= 0 || panelTab === 'sell') { setPanelPreview(null); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('preview_purchase', {
        p_event_id: event.id, p_side: panelFullSide, p_gross: amt,
      })
      if (data && !data.error) {
        setPanelPreview({
          fee: Number(data.fee), net: Number(data.net),
          payout: Number(data.payout_if_win || data.est_payout),
          feeRate: Number(data.fee_rate || 0) * 100,
          price: Number(data.price),
          contracts: Number(data.contracts || data.payout_if_win || data.est_payout),
        })
      }
    }, 300)
    return () => clearTimeout(t)
  }, [panelAmount, panelFullSide, panelTab, event.id])

  // Sync tug-of-war bar click to panel side
  useEffect(() => {
    if (!voteInitSide) return
    setPanelTab('buy')
    if (voteInitSide === 'yes' || voteInitSide === 'no') {
      // Binary event
      setPanelSide(voteInitSide)
      setPanelOption(null)
    } else if (voteInitSide.includes('::')) {
      // Open event: "El Salvador::yes" → option="El Salvador", side="yes"
      const [label, dir] = voteInitSide.split('::')
      setPanelOption(label)
      setPanelSide(dir as 'yes' | 'no')
    }
  }, [voteInitSide])

  const openVoteSheet = (initSide?: string) => {
    if (!session) { openAuth(); return }
    setVoteInitSide(initSide)
    setVoteOpen(true)
  }

  const voted = hasVoted(event.id)
  const vote = getVote(event.id)
  const photo = event.imageUrl || categoryPhotos[event.category]
  const catLabel = categoryLabels[event.category] || 'Evento'
  const isBinary = event.eventType !== 'open'
  const isResolved = event.status === 'resolved'

  // ── Live prices ──
  const [liveBinary, setLiveBinary] = useState<{ yes: number; no: number } | null>(null)
  const [liveOptPcts, setLiveOptPcts] = useState<Record<string, number>>({})
  const [livePool, setLivePool] = useState<number | null>(null)

  const fetchLivePrices = useCallback(async () => {
    if (!event) return
    const { data: mktRow } = await supabase
      .from('event_markets')
      .select('yes_shares, no_shares, pool_total')
      .eq('event_id', event.id)
      .single()
    if (mktRow) {
      setLivePool(Number(mktRow.pool_total) || 0)
      if (isBinary) {
        const total = Number(mktRow.yes_shares) + Number(mktRow.no_shares)
        if (total > 0) setLiveBinary({ yes: Math.round(Number(mktRow.yes_shares) / total * 100), no: Math.round(Number(mktRow.no_shares) / total * 100) })
      }
    }
    if (!isBinary) {
      const { data } = await supabase.from('option_markets').select('option_label, yes_shares, no_shares').eq('event_id', event.id).eq('status', 'open')
      if (data) {
        const pcts: Record<string, number> = {}
        for (const row of data as { option_label: string; yes_shares: number; no_shares: number }[]) {
          const total = Number(row.yes_shares) + Number(row.no_shares)
          pcts[row.option_label] = total > 0 ? Math.round(Number(row.yes_shares) / total * 100) : 50
        }
        setLiveOptPcts(pcts)
      }
    }
  }, [event.id, isBinary])

  useEffect(() => { fetchLivePrices() }, [fetchLivePrices])

  const yesDisplayPct = liveBinary?.yes ?? event.yesPercent
  const noDisplayPct = liveBinary?.no ?? event.noPercent

  // ── User positions ──
  type UserPosition = { id: string; side: string; gross_amount: number; payout_if_win: number }
  const [userPositions, setUserPositions] = useState<UserPosition[]>([])

  const fetchUserPositions = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid || !isBinary || !event) return
    const { data } = await supabase.from('positions').select('id, side, gross_amount, payout_if_win').eq('event_id', event.id).eq('user_id', uid).eq('status', 'active').order('created_at', { ascending: true })
    if (data) setUserPositions(data as UserPosition[])
  }, [event.id, isBinary, session?.user?.id])

  useEffect(() => { if (voted) fetchUserPositions() }, [voted, fetchUserPositions])

  // ── Market stats (volume, participants) ──
  const [volume, setVolume] = useState(0)
  const [participants, setParticipants] = useState(0)

  useEffect(() => {
    if (!event) return
    ;(async () => {
      const [volRes, partRes] = await Promise.all([
        supabase.from('market_transactions').select('gross_amount').eq('event_id', event.id).eq('tx_type', 'purchase'),
        supabase.from('positions').select('user_id').eq('event_id', event.id),
      ])
      if (volRes.data) setVolume(volRes.data.reduce((s: number, r: { gross_amount: number }) => s + Number(r.gross_amount), 0))
      if (partRes.data) setParticipants(new Set(partRes.data.map((r: { user_id: string }) => r.user_id)).size)
    })()
  }, [event.id])

  // ── Activity feed ──
  const [activity, setActivity] = useState<ActivityItem[]>([])

  useEffect(() => {
    if (!event) return
    ;(async () => {
      const { data } = await supabase
        .from('market_transactions')
        .select('id, user_id, gross_amount, created_at')
        .eq('event_id', event.id)
        .eq('tx_type', 'purchase')
        .order('created_at', { ascending: false })
        .limit(10)
      if (!data || data.length === 0) return
      const { data: posData } = await supabase.from('positions').select('id, side, user_id').eq('event_id', event.id)
      const sideMap: Record<string, string> = {}
      if (posData) for (const p of posData as { id: string; side: string; user_id: string }[]) sideMap[p.user_id] = p.side
      const userIds = [...new Set(data.map((r: { user_id: string }) => r.user_id))]
      const { data: profiles } = await supabase.from('profiles').select('id, name, username').in('id', userIds)
      const nameMap: Record<string, string> = {}
      if (profiles) for (const p of profiles as { id: string; name: string; username: string }[]) nameMap[p.id] = p.username || p.name || 'Anon'
      setActivity(data.map((r: { id: string; user_id: string; gross_amount: number; created_at: string }) => ({
        id: r.id,
        username: nameMap[r.user_id] || 'Anon',
        side: sideMap[r.user_id] || 'yes',
        amount: Number(r.gross_amount),
        created_at: r.created_at,
      })))
    })()
  }, [event.id])

  const handleConfirm = async (side: string, amount: number, skipRpc?: boolean, cobro?: number) => {
    await castVote(event.id, side, amount, event, skipRpc)
    setVoteOpen(false)
    setCeleb({ side, amount, cobro: cobro ?? 0 })
    await fetchLivePrices()
    await fetchUserPositions()
    await fetchChartPositions()
    refetch()
  }

  const handlePanelBuy = async () => {
    if (!session) { openAuth(); return }
    const amt = parseFloat(panelAmount)
    if (!amt || amt <= 0 || !session?.user?.id) return
    setPanelSubmitting(true)

    let data: Record<string, unknown> | null = null
    let rpcErr: { message: string } | null = null

    if (isBinary) {
      // Binary: use execute_purchase
      const res = await supabase.rpc('execute_purchase', {
        p_event_id: event.id, p_user_id: session.user.id, p_side: panelSide, p_gross: amt,
      })
      data = res.data; rpcErr = res.error
    } else if (panelOption) {
      // Open event: use execute_option_purchase
      const res = await supabase.rpc('execute_option_purchase', {
        p_event_id: event.id, p_user_id: session.user.id,
        p_option_label: panelOption, p_side: panelSide, p_gross: amt,
      })
      data = res.data; rpcErr = res.error
    } else {
      setPanelSubmitting(false)
      return
    }

    if (rpcErr || !data || (data as { error?: string }).error) {
      const errMsg = rpcErr?.message || (data as { error?: string })?.error || 'Error desconocido'
      setPanelError(errMsg)
      setPanelSubmitting(false)
      return
    }
    setPanelError(null)
    // Update UI
    setCeleb({ side: panelFullSide, amount: amt, cobro: panelPreview?.payout ?? 0 })
    await fetchLivePrices()
    await fetchUserPositions()
    await fetchChartPositions()
    refetch()
    setPanelAmount('')
    setPanelPreview(null)
    setPanelSubmitting(false)
    if (session?.user?.id) {
      const { data } = await supabase.from('profiles').select('balance').eq('id', session.user.id).single()
      if (data) setUserBalance(Number((data as { balance: number }).balance) || 0)
    }
  }

  // ── Chart data ──
  type ChartPosition = { side: string; price_at_purchase: number; created_at: string }
  const [chartPositions, setChartPositions] = useState<ChartPosition[]>([])

  const fetchChartPositions = useCallback(async () => {
    if (!event) return
    const { data } = await supabase.from('positions').select('side, price_at_purchase, created_at').eq('event_id', event.id).order('created_at', { ascending: true })
    if (data) setChartPositions(data as ChartPosition[])
  }, [event.id])

  useEffect(() => { fetchChartPositions() }, [fetchChartPositions])

  const realChartData = useMemo(() => {
    if (!event || !isBinary || chartPositions.length === 0) return undefined
    return buildRealChartData(chartPositions, event.yesPercent, yesDisplayPct, event.createdAt ?? new Date().toISOString())
  }, [isBinary, chartPositions, event.yesPercent, yesDisplayPct])

  // Parse open event options
  const parsedOptions = !isBinary && event.options
    ? event.options.map(opt => {
        const parts = opt.split(':')
        const pool = parts.length >= 3 ? parseFloat(parts[parts.length - 1]) || 0 : 0
        const pct = parts.length >= 2 ? Math.round(parseFloat(parts[parts.length - (parts.length >= 3 ? 2 : 1)]) || 0) : 0
        const label = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(':') : parts.length === 2 ? parts[0] : opt
        return { label, pct, pool }
      })
    : []

  const chartLabels = isBinary ? ['SÍ', 'NO'] : parsedOptions.map(o => o.label)
  const chartPcts = isBinary ? [yesDisplayPct, noDisplayPct] : parsedOptions.map(o => liveOptPcts[o.label] ?? o.pct)
  const chartColors = isBinary ? ['var(--b1n0-si)', 'var(--b1n0-no)'] : parsedOptions.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])

  const closingDate = event.endsAt
    ? new Date(event.endsAt).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  // ── Desktop detection ──
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768)
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--b1n0-border)', flexShrink: 0, background: 'var(--b1n0-card)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-text-1)" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5m7-7l-7 7 7 7"/></svg>
        </button>
        <span className="cat-badge" style={{ background: `var(--badge-${event.category}-bg, var(--b1n0-surface))`, color: `var(--badge-${event.category}-text, var(--b1n0-text-2))` }}>
          {catLabel}
        </span>
        {event.country && COUNTRY_FLAGS[event.country] && (
          <span className="country-badge">{COUNTRY_FLAGS[event.country]}</span>
        )}
        {event.isLive && <LiveDot />}
        {event.status === 'private' && (
          <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: '#C4B5FD', background: '#2E1065', borderRadius: '4px', padding: '2px 6px' }}>Ronda Privada</span>
        )}
        {event.sponsor?.name && (
          <span style={{ marginLeft: 'auto', fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>
            {event.sponsor.name}
          </span>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="feed-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: isDesktop ? 'flex' : 'block', gap: '20px', maxWidth: '1100px', margin: '0 auto', padding: isDesktop ? '20px 24px 40px' : '0' }}>

          {/* ── Main column ── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Hero image — compact */}
            <div style={{ aspectRatio: '21 / 9', position: 'relative', overflow: 'hidden', borderRadius: isDesktop ? '14px' : 0, marginBottom: '16px' }}>
              <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${catFlat[event.category] || '#3D3D3A'}22 0%, ${catFlat[event.category] || '#3D3D3A'}11 50%, transparent 100%)`, mixBlendMode: 'multiply' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.8) 100%)' }} />
              <div style={{ position: 'absolute', bottom: '14px', left: '16px', right: '16px' }}>
                <h1 style={{ fontFamily: F, fontWeight: 800, fontSize: isDesktop ? '22px' : '20px', color: '#fff', lineHeight: 1.25, letterSpacing: '-0.3px' }}>
                  {event.question}
                </h1>
              </div>
            </div>

            <div style={{ padding: isDesktop ? '0' : '0 16px' }}>

              {/* ── Tug-of-war bar (binary) or Options (open) — prominent ── */}
              {isBinary && !isResolved && (
                <div style={{ marginBottom: '16px' }}>
                  <SplitBar
                    yesPercent={yesDisplayPct}
                    noPercent={noDisplayPct}
                    onClickSi={() => openVoteSheet('yes')}
                    onClickNo={() => openVoteSheet('no')}
                  />
                </div>
              )}

              {/* Options list — only show in main content on mobile, desktop shows in sidebar */}
              {!isBinary && !isResolved && !isDesktop && (
                <div style={{ background: 'var(--b1n0-card)', borderRadius: '14px', padding: '16px', marginBottom: '16px', border: '1px solid var(--b1n0-border)' }}>
                  {parsedOptions.map((opt, i) => (
                    <div key={i} style={{ marginBottom: i < parsedOptions.length - 1 ? '16px' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '2px', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                          <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{opt.label}</span>
                        </div>
                        {opt.pool > 0 && <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{event.currency}{opt.pool.toLocaleString()}</span>}
                      </div>
                      <SplitBar yesPercent={liveOptPcts[opt.label] ?? opt.pct} noPercent={100 - (liveOptPcts[opt.label] ?? opt.pct)}
                        onClickSi={() => openVoteSheet(`${opt.label}::yes`)} onClickNo={() => openVoteSheet(`${opt.label}::no`)} />
                    </div>
                  ))}
                </div>
              )}

              {isResolved && (
                <div style={{ textAlign: 'center', padding: '16px', marginBottom: '16px', background: 'var(--b1n0-card)', borderRadius: '14px', border: '1px solid var(--b1n0-border)' }}>
                  <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', background: 'var(--b1n0-surface)', borderRadius: '6px', padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Resuelto
                  </span>
                  {event.result && (
                    <p style={{ fontFamily: F, fontWeight: 800, fontSize: '20px', color: 'var(--b1n0-text-1)', marginTop: '10px' }}>
                      {event.result === 'yes' ? 'SÍ ganó' : event.result === 'no' ? 'NO ganó' : `${event.result} ganó`}
                    </p>
                  )}
                </div>
              )}

              {/* ── Chart card — tall ── */}
              <div style={{ background: 'var(--b1n0-card)', borderRadius: '14px', padding: '16px', marginBottom: '16px', border: '1px solid var(--b1n0-border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
                  {chartLabels.map((lbl, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '3px', background: chartColors[i], flexShrink: 0 }} />
                      <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>{lbl}</span>
                      <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 500, color: 'var(--b1n0-muted)' }}>{midPctToAsk(chartPcts[i]).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <ProbabilityChart
                  labels={chartLabels} pcts={chartPcts} colors={chartColors}
                  realData={realChartData} eventAgeMs={event.createdAt ? Date.now() - new Date(event.createdAt).getTime() : undefined}
                  timeRange={timeRange} onTimeRangeChange={setTimeRange}
                />
              </div>

              {/* ── Stats row ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {[
                  { label: 'Pool', value: `${event.currency}${(livePool ?? event.poolSize).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                  { label: 'Volumen', value: `${event.currency}${volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                  { label: 'Participantes', value: String(participants) },
                  { label: 'Cierra', value: closingDate || 'Manual' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '10px', padding: '10px 12px' }}>
                    <p style={{ fontFamily: F, fontSize: '9px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{s.label}</p>
                    <p style={{ fontFamily: F, fontWeight: 800, fontSize: '14px', color: 'var(--b1n0-text-1)', letterSpacing: '-0.3px' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Contexto ── */}
              {event.considerations && (
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '14px 16px', marginBottom: '16px' }}>
                  <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Contexto</p>
                  <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-2)', lineHeight: 1.6 }}>{event.considerations}</p>
                </div>
              )}

              {/* ── Activity feed ── */}
              {activity.length > 0 && (
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '14px 16px', marginBottom: '16px' }}>
                  <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Actividad reciente</p>
                  {activity.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: a.side === 'yes' || a.side.endsWith('::yes') ? 'var(--b1n0-si-bg)' : 'var(--b1n0-no-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: F, fontSize: '9px', fontWeight: 700, color: a.side === 'yes' || a.side.endsWith('::yes') ? 'var(--b1n0-si-dark)' : 'var(--b1n0-no-dark)' }}>
                          {a.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{a.username}</span>
                        <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}> compró </span>
                        <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: a.side === 'yes' || a.side.endsWith('::yes') ? 'var(--b1n0-si)' : 'var(--b1n0-no)' }}>
                          {displaySide(a.side)}
                        </span>
                      </div>
                      <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)', flexShrink: 0 }}>
                        {event.currency}{a.amount.toFixed(0)}
                      </span>
                      <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)', flexShrink: 0, minWidth: '24px', textAlign: 'right' }}>
                        {timeAgo(a.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Active positions ── */}
              {isBinary && userPositions.length > 0 && (
                <div style={{ background: 'var(--b1n0-card)', border: '2px solid var(--b1n0-teal-500)', borderRadius: '14px', padding: '14px 16px', marginBottom: '16px' }}>
                  <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: 'var(--b1n0-teal-700)', marginBottom: '8px' }}>
                    {userPositions.length === 1 ? 'Tu posición activa' : `Tus ${userPositions.length} posiciones`}
                  </p>
                  {userPositions.map((pos, i) => (
                    <div key={pos.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--b1n0-surface)', borderRadius: '8px', marginBottom: i < userPositions.length - 1 ? '4px' : 0 }}>
                      <div>
                        <span style={{ fontFamily: F, fontWeight: 600, fontSize: '13px', color: pos.side === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-no)' }}>
                          {pos.side === 'yes' ? 'SÍ' : 'NO'}
                        </span>
                        <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginLeft: '8px' }}>
                          {event.currency}{Number(pos.gross_amount).toFixed(2)}
                        </span>
                      </div>
                      <span style={{ fontFamily: F, fontWeight: 700, fontSize: '13px', color: 'var(--b1n0-teal-500)' }}>
                        → {event.currency}{Number(pos.payout_if_win).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Mobile CTA ── */}
              {!isResolved && !isDesktop && (
                <button onClick={() => openVoteSheet()} className="btn-primary" style={{ width: '100%', padding: '15px', fontSize: '14px', letterSpacing: '0.5px', marginBottom: '20px' }}>
                  {voted ? 'AGREGAR POSICIÓN →' : 'HACER MI LLAMADO →'}
                </button>
              )}

              {/* ── Comments ── */}
              <div style={{ background: 'var(--b1n0-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--b1n0-border)', marginBottom: '24px' }}>
                <CommentFeed comments={event.comments ?? []} eventId={event.id} />
              </div>
            </div>
          </div>

          {/* ── Desktop sidebar: Opinion.trade-style ── */}
          {isDesktop && (
            <div style={{ width: '320px', flexShrink: 0, position: 'sticky', top: '20px', alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* ── Trading Panel ── */}
              {!isResolved && (
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '16px' }}>

                  {/* Buy / Sell tabs */}
                  <div style={{ display: 'flex', gap: '0', marginBottom: '14px', borderBottom: '2px solid var(--b1n0-border)' }}>
                    {(['buy', 'sell'] as const).map(tab => (
                      <button key={tab} onClick={() => setPanelTab(tab)} style={{
                        flex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: F, fontSize: '13px', fontWeight: 700, letterSpacing: '0.3px',
                        color: panelTab === tab ? (tab === 'buy' ? 'var(--b1n0-teal-500)' : 'var(--b1n0-no)') : 'var(--b1n0-muted)',
                        borderBottom: panelTab === tab ? `2px solid ${tab === 'buy' ? 'var(--b1n0-teal-500)' : 'var(--b1n0-no)'}` : '2px solid transparent',
                        marginBottom: '-2px', transition: 'all 0.15s ease',
                      }}>
                        {tab === 'buy' ? 'Comprar' : 'Vender'}
                      </button>
                    ))}
                  </div>

                  {panelTab === 'buy' ? (
                    <>
                      {/* Option label for open events */}
                      {!isBinary && panelOption && (
                        <div style={{
                          background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '8px 12px',
                          marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>
                            {panelOption}
                          </span>
                          <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>
                            {midPctToAsk(liveOptPcts[panelOption] ?? 50).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {!isBinary && !panelOption && (
                        <div style={{
                          background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '10px 12px',
                          marginBottom: '10px', textAlign: 'center',
                        }}>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                            Seleccioná una opción a la izquierda
                          </span>
                        </div>
                      )}

                      {/* YES / NO pills */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        {(() => {
                          // Get correct prices: binary uses yesDisplayPct/noDisplayPct, open uses option-specific
                          const yesPct = !isBinary && panelOption ? (liveOptPcts[panelOption] ?? 50) : yesDisplayPct
                          const noPct = !isBinary && panelOption ? (100 - (liveOptPcts[panelOption] ?? 50)) : noDisplayPct
                          return (
                            <>
                              <button onClick={() => setPanelSide('yes')} style={{
                                flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                fontFamily: F, fontSize: '14px', fontWeight: 700, transition: 'all 0.15s ease',
                                background: panelSide === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-si-bg)',
                                color: panelSide === 'yes' ? '#fff' : 'var(--b1n0-si)',
                              }}>
                                SÍ {midPctToAsk(yesPct).toFixed(2)}
                              </button>
                              <button onClick={() => setPanelSide('no')} style={{
                                flex: 1, padding: '10px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                fontFamily: F, fontSize: '14px', fontWeight: 700, transition: 'all 0.15s ease',
                                background: panelSide === 'no' ? 'var(--b1n0-no)' : 'var(--b1n0-no-bg)',
                                color: panelSide === 'no' ? '#fff' : 'var(--b1n0-no)',
                              }}>
                                NO {midPctToAsk(noPct).toFixed(2)}
                              </button>
                            </>
                          )
                        })()}
                      </div>

                      {/* Amount input */}
                      {(() => {
                        const minE = event.minEntry || 1
                        const maxE = event.maxEntry || 100000
                        const amt = parseFloat(panelAmount) || 0
                        const outOfRange = amt > 0 && (amt < minE || amt > maxE)
                        const maxAllowed = Math.min(maxE, userBalance > 0 ? userBalance : maxE)
                        return (
                          <>
                            <div style={{ marginBottom: '4px' }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '10px 12px',
                                border: `1px solid ${outOfRange ? 'var(--b1n0-no)' : 'var(--b1n0-border)'}`,
                              }}>
                                <span style={{ fontFamily: F, fontSize: '16px', fontWeight: 700, color: 'var(--b1n0-muted)' }}>Q</span>
                                <input
                                  type="number" min={minE} max={maxE} step="any" placeholder="0"
                                  value={panelAmount}
                                  onChange={e => setPanelAmount(e.target.value)}
                                  style={{
                                    flex: 1, background: 'none', border: 'none', outline: 'none',
                                    fontFamily: F, fontSize: '20px', fontWeight: 700, color: 'var(--b1n0-text-1)',
                                    width: '100%',
                                  }}
                                />
                              </div>
                            </div>
                            <p style={{ fontFamily: F, fontSize: '10px', color: outOfRange ? 'var(--b1n0-no)' : 'var(--b1n0-muted)', marginBottom: '10px' }}>
                              {outOfRange
                                ? `Monto debe ser entre Q${minE} y Q${maxE.toLocaleString()}`
                                : `Desde Q${minE} · Máx Q${maxE.toLocaleString()}`
                              }
                            </p>

                            {/* Preset amounts */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                              {[10, 50, 100].filter(v => v >= minE && v <= maxE).map(v => (
                                <button key={v} onClick={() => setPanelAmount(String(v))} style={{
                                  flex: 1, padding: '7px 0', borderRadius: '8px', border: '1px solid var(--b1n0-border)',
                                  background: panelAmount === String(v) ? 'var(--b1n0-text-1)' : 'var(--b1n0-card)',
                                  color: panelAmount === String(v) ? 'var(--b1n0-card)' : 'var(--b1n0-text-1)',
                                  fontFamily: F, fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                }}>
                                  {v}
                                </button>
                              ))}
                              <button onClick={() => setPanelAmount(String(maxAllowed))} style={{
                                flex: 1, padding: '7px 0', borderRadius: '8px', border: '1px solid var(--b1n0-border)',
                                background: 'var(--b1n0-card)', color: 'var(--b1n0-text-1)',
                                fontFamily: F, fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                              }}>
                                Max
                              </button>
                            </div>
                          </>
                        )
                      })()}

                      {/* Balance */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Saldo</span>
                        <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>
                          {event.currency}{userBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Divider */}
                      <div style={{ borderTop: '1px solid var(--b1n0-border)', margin: '0 0 8px' }} />

                      {/* Full breakdown */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Tu entrada</span>
                          <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>
                            {event.currency}{panelAmount || '0'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                            Comisión ({panelPreview ? `${panelPreview.feeRate.toFixed(1)}%` : '—'})
                          </span>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
                            {panelPreview ? `−${event.currency}${panelPreview.fee.toFixed(2)}` : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Neto al pool</span>
                          <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>
                            {panelPreview ? `${event.currency}${panelPreview.net.toFixed(2)}` : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Precio</span>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-1)' }}>
                            {panelPreview ? panelPreview.price.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Contratos</span>
                          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-1)' }}>
                            {panelPreview ? panelPreview.contracts.toFixed(2) : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{ borderTop: '1px solid var(--b1n0-border)', margin: '0 0 8px' }} />

                      {/* Cobro estimado */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <span style={{ fontFamily: F, fontSize: '13px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>Cobro estimado</span>
                        <span style={{ fontFamily: F, fontSize: '15px', fontWeight: 800, color: panelPreview ? 'var(--b1n0-si)' : 'var(--b1n0-muted)' }}>
                          {panelPreview ? `~${event.currency}${panelPreview.payout.toFixed(2)}` : '—'}
                          {panelPreview && parseFloat(panelAmount) > 0 && (
                            <span style={{ fontSize: '11px', fontWeight: 600, marginLeft: '4px' }}>
                              (+{((panelPreview.payout / parseFloat(panelAmount) - 1) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Pool ratio warning — works for both binary and open events */}
                      {(() => {
                        const amt = parseFloat(panelAmount) || 0
                        const poolSize = livePool ?? event.poolSize
                        const returnPct = panelPreview ? ((panelPreview.payout / amt - 1) * 100) : 0
                        // Show warning if: negative return, or bet > 50% of pool, or pool is empty/tiny
                        const showWarning = amt > 0 && panelPreview && (
                          returnPct < 0 ||
                          (poolSize > 0 && amt > poolSize * 0.5) ||
                          poolSize <= 0
                        )
                        if (!showWarning) return null
                        const ratio = poolSize > 0 ? (amt / poolSize).toFixed(0) : '∞'
                        return (
                            <div style={{
                              background: returnPct < 0 ? 'var(--b1n0-no-bg)' : 'var(--b1n0-orange-50)',
                              border: `1px solid ${returnPct < 0 ? 'var(--b1n0-no)' : 'var(--b1n0-orange-300)'}`,
                              borderRadius: '8px', padding: '8px 10px', marginBottom: '10px',
                            }}>
                              <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: returnPct < 0 ? 'var(--b1n0-no-dark)' : 'var(--b1n0-orange-700)', lineHeight: 1.4 }}>
                                {returnPct < 0
                                  ? `⚠️ Tu entrada es ${ratio}× el pool actual. Retorno estimado: ${returnPct.toFixed(0)}%. Perdés dinero aunque ganés.`
                                  : poolSize <= 0
                                    ? `⚠️ Pool vacío. Serás el primer participante — tu retorno depende de que otros entren después.`
                                    : `⚠️ Tu entrada es ${ratio}× el pool. Retorno bajo (+${returnPct.toFixed(0)}%). Considerá un monto menor.`
                                }
                              </p>
                            </div>
                          )
                      })()}

                      {/* Buy button */}
                      <button
                        onClick={handlePanelBuy}
                        disabled={panelSubmitting || !panelPreview || parseFloat(panelAmount) <= 0 || parseFloat(panelAmount) < (event.minEntry || 1) || parseFloat(panelAmount) > (event.maxEntry || 100000)}
                        style={{
                          width: '100%', padding: '13px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                          fontFamily: F, fontSize: '14px', fontWeight: 700, letterSpacing: '0.3px',
                          background: panelSide === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-no)',
                          color: '#fff', transition: 'opacity 0.15s',
                          opacity: (panelSubmitting || !panelPreview || parseFloat(panelAmount) <= 0) ? 0.5 : 1,
                        }}
                      >
                        {panelSubmitting ? 'Procesando...' : `Comprar ${panelOption ? panelOption + ' ' : ''}${panelSide === 'yes' ? 'SÍ' : 'NO'} — ${event.currency}${panelAmount || '0'}`}
                      </button>

                      {/* Commission now shown in breakdown above */}

                      {/* Error message */}
                      {panelError && (
                        <div style={{ marginTop: '8px', padding: '8px 10px', background: 'var(--b1n0-no-bg)', border: '1px solid var(--b1n0-no)', borderRadius: '8px' }}>
                          <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-no-dark)' }}>
                            {panelError}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Sell tab — show user's positions with sell buttons */
                    <div>
                      {userPositions.length === 0 ? (
                        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', textAlign: 'center', padding: '20px 0' }}>
                          No tenés posiciones para vender
                        </p>
                      ) : (
                        userPositions.map(pos => (
                          <div key={pos.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 0', borderBottom: '1px solid var(--b1n0-border)',
                          }}>
                            <div>
                              <span style={{
                                fontFamily: F, fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px',
                                background: pos.side === 'yes' ? 'var(--b1n0-si-bg)' : 'var(--b1n0-no-bg)',
                                color: pos.side === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-no)',
                              }}>
                                {pos.side === 'yes' ? 'SÍ' : 'NO'}
                              </span>
                              <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginLeft: '8px' }}>
                                {event.currency}{Number(pos.gross_amount).toFixed(2)}
                              </span>
                            </div>
                            <button
                              onClick={() => navigate(`/portafolio`)}
                              style={{
                                padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                background: 'var(--b1n0-no-bg)', color: 'var(--b1n0-no)', fontFamily: F, fontSize: '11px', fontWeight: 700,
                              }}
                            >
                              Vender
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Options list (open events, desktop only) ── */}
              {!isBinary && !isResolved && parsedOptions.length > 0 && (
                <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', padding: '14px' }}>
                  <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
                    Opciones
                  </p>
                  {parsedOptions.map((opt, i) => {
                    const isSelected = panelOption === opt.label
                    return (
                      <div key={i} style={{
                        marginBottom: i < parsedOptions.length - 1 ? '8px' : 0,
                        borderRadius: '10px', padding: '6px 8px',
                        border: isSelected ? '2px solid var(--b1n0-teal-500)' : '1px solid transparent',
                        background: isSelected ? 'var(--b1n0-surface)' : 'transparent',
                        transition: 'all 0.15s ease',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '2px', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                            <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{opt.label}</span>
                          </div>
                        </div>
                        <SplitBar
                          yesPercent={liveOptPcts[opt.label] ?? opt.pct}
                          noPercent={100 - (liveOptPcts[opt.label] ?? opt.pct)}
                          compact
                          onClickSi={() => { setPanelOption(opt.label); setPanelSide('yes'); setPanelTab('buy'); setPanelError(null) }}
                          onClickNo={() => { setPanelOption(opt.label); setPanelSide('no'); setPanelTab('buy'); setPanelError(null) }}
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Top Holders ── */}
              <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '14px', overflow: 'hidden' }}>
                {/* Header with pool total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
                  <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>Top Holders</p>
                  <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-teal-500)' }}>
                    {event.currency}{(livePool ?? event.poolSize).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Option selector for open events */}
                {!isBinary && parsedOptions.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', padding: '0 16px 8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setHoldersOption(null)}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', border: '1px solid',
                        borderColor: holdersOption === null ? 'var(--b1n0-si)' : 'var(--b1n0-border)',
                        background: holdersOption === null ? 'var(--b1n0-si-bg)' : 'transparent',
                        color: holdersOption === null ? 'var(--b1n0-si)' : 'var(--b1n0-muted)',
                        fontFamily: F, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Todas
                    </button>
                    {parsedOptions.map((opt, i) => (
                      <button
                        key={opt.label}
                        onClick={() => setHoldersOption(opt.label)}
                        style={{
                          padding: '4px 10px', borderRadius: '6px', border: '1px solid',
                          borderColor: holdersOption === opt.label ? CHART_COLORS[i % CHART_COLORS.length] : 'var(--b1n0-border)',
                          background: holdersOption === opt.label ? CHART_COLORS[i % CHART_COLORS.length] + '15' : 'transparent',
                          color: holdersOption === opt.label ? CHART_COLORS[i % CHART_COLORS.length] : 'var(--b1n0-muted)',
                          fontFamily: F, fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* YES / NO toggle */}
                <div style={{ display: 'flex', margin: '0 16px 12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--b1n0-border)' }}>
                  {(['yes', 'no'] as const).map(side => (
                    <button key={side} onClick={() => setHoldersTab(side)} style={{
                      flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer',
                      fontFamily: F, fontSize: '12px', fontWeight: 700,
                      background: holdersTab === side ? (side === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-no)') : 'var(--b1n0-card)',
                      color: holdersTab === side ? '#fff' : 'var(--b1n0-muted)',
                      transition: 'all 0.15s ease',
                    }}>
                      {side === 'yes' ? 'SÍ' : 'NO'}
                    </button>
                  ))}
                </div>

                {/* Holders list */}
                <div style={{ padding: '0 16px 14px' }}>
                  {(() => {
                    const sideFilter = holdersTab === 'yes'
                      ? (h: typeof topHolders[0]) => h.side === 'yes' || h.side.endsWith('::yes')
                      : (h: typeof topHolders[0]) => h.side === 'no' || h.side.endsWith('::no')
                    const optFilter = holdersOption
                      ? (h: typeof topHolders[0]) => h.side.startsWith(holdersOption + '::')
                      : () => true
                    const filtered = topHolders.filter(h => sideFilter(h) && optFilter(h))
                    return filtered.length === 0 ? (
                    <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                      Sin posiciones en {holdersOption ? holdersOption + ' ' : ''}{holdersTab === 'yes' ? 'SÍ' : 'NO'}
                    </p>
                  ) : (
                    filtered
                      .slice(0, 10)
                      .map((h, i) => (
                        <div key={`${h.username}-${i}`} style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0',
                          borderBottom: '1px solid var(--b1n0-border)',
                        }}>
                          <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 700, color: holdersTab === 'yes' ? 'var(--b1n0-si)' : 'var(--b1n0-no)', width: '18px' }}>
                            {i + 1}
                          </span>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                            background: holdersTab === 'yes' ? 'var(--b1n0-si-bg)' : 'var(--b1n0-no-bg)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontFamily: F, fontSize: '10px', fontWeight: 700, color: holdersTab === 'yes' ? 'var(--b1n0-si-dark)' : 'var(--b1n0-no-dark)' }}>
                              {h.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 500, color: 'var(--b1n0-text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.username}
                          </span>
                          <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 700, color: 'var(--b1n0-text-1)', flexShrink: 0 }}>
                            {event.currency}{h.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))
                  )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile bottom sheet ── */}
      {!isDesktop && (
        <BottomSheet open={voteOpen} onClose={() => { setVoteOpen(false); setVoteInitSide(undefined) }}>
          <div style={{ padding: '0 16px 40px' }}>
            <EntryFlow
              event={event}
              onClose={() => { setVoteOpen(false); setVoteInitSide(undefined) }}
              onConfirm={handleConfirm}
              initialSide={voteInitSide}
            />
          </div>
        </BottomSheet>
      )}

      {celeb && (
        <PurchaseCelebration
          side={celeb.side}
          amount={celeb.amount}
          cobro={celeb.cobro}
          currency={event.currency}
          onDone={() => setCeleb(null)}
        />
      )}
    </div>
  )
}

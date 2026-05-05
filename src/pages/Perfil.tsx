import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Camera,
  Bell,
  User as UserIcon,
  PaintBrush,        // capital B in 2.x
  Lifebuoy,          // alt name for LifeRing
  ChartBar as VoteIcon,
  Trophy,
  Target as TargetIcon,
  ArrowRight,
  ShieldCheck,
  Users as UsersIcon,
  ShareNetwork,
  TrendUp,           // alt name for ChartLineUp
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { mockUser } from '../data/mockEvents'
import { useAuth } from '../context/AuthContext'
import { useVotes } from '../context/VoteContext'
import { supabase } from '../lib/supabase'
import { KYCSheet } from '../components/wallet/KYCSheet'
import { WalletSheet } from '../components/wallet/WalletSheet'
import { useTheme, type ThemeMode } from '../context/ThemeContext'
import { usePageMeta } from '../hooks/usePageMeta'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

const tierNames: Record<number, string> = { 1: 'Nivel 1', 2: 'Nivel 2', 3: 'Nivel 3' }

interface FriendRow {
  id: string          // friendship id
  friendId: string    // the other user's profile id
  name: string
  username: string
  status: 'pending' | 'accepted' | 'rejected'
  isSender: boolean   // did current user send this request?
}

interface SearchResult {
  id: string
  name: string
  username: string
}

function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
      <div style={{ flex: 1, paddingRight: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)', marginBottom: description ? '2px' : '0' }}>{label}</p>
        {description && <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>{description}</p>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{ width: 44, height: 26, borderRadius: '13px', background: value ? 'var(--color-teal-500)' : 'var(--color-border)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
      >
        <div style={{ position: 'absolute', top: '3px', left: value ? '21px' : '3px', width: 20, height: 20, borderRadius: '50%', background: 'var(--b1n0-card)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(255,255,255,0.1)' }} />
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
      <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>{label}</span>
      <span style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)' }}>{value}</span>
    </div>
  )
}

function LinkRow({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <button
      onClick={onPress}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--b1n0-border)', cursor: 'pointer', textAlign: 'left' }}
    >
      <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>{label}</span>
      <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)' }}>›</span>
    </button>
  )
}

export function Perfil() {
  usePageMeta({
    title: 'Perfil · b1n0',
    description: 'Tu cuenta, saldo, KYC, amigos. Gestioná tu perfil en b1n0.',
  })
  const navigate = useNavigate()
  const { session, profile, refreshProfile } = useAuth()
  const { predictions, refreshPredictions } = useVotes()
  const userId = session?.user?.id

  useEffect(() => { refreshProfile(); refreshPredictions() }, [])

  // Compute stats from positions
  const totalVotes = predictions.length
  const won = predictions.filter((p) => p.status === 'won')
  const correctVotes = won.length
  const totalCobrado = won.reduce((s, p) => s + p.potentialCobro, 0)
  const accuracy = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0

  const user = profile
    ? { ...mockUser, name: profile.name, tier: profile.tier, balance: profile.balance, totalPredictions: totalVotes, correctPredictions: correctVotes, totalCobrado }
    : mockUser

  const [walletOpen, setWalletOpen] = useState(false)
  const [kycOpen, setKycOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('b1n0-theme')
    if (saved) return saved === 'dark'
    return document.documentElement.classList.contains('dark')
  })

  useEffect(() => {
    const html = document.documentElement
    if (darkMode) {
      html.classList.add('dark')
      html.setAttribute('data-theme', 'dark')
      localStorage.setItem('b1n0-theme', 'dark')
    } else {
      html.classList.remove('dark')
      html.setAttribute('data-theme', 'light')
      localStorage.setItem('b1n0-theme', 'light')
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', darkMode ? '#121210' : 'var(--b1n0-surface)')
  }, [darkMode])
  const [cuentaOpen, setCuentaOpen] = useState(false)
  const [aparienciaOpen, setAparienciaOpen] = useState(false)
  const [soporteOpen, setSoporteOpen] = useState(false)
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    evento_resuelto: true,
    resultado: true,
    posicion_vendida: true,
    evento_por_cerrar: true,
    nuevo_evento: true,
    solicitud_amistad: true,
    amistad_aceptada: true,
    respuesta_comentario: true,
    mencion: true,
    deposito_confirmado: true,
    retiro_procesado: true,
    saldo_bajo: false,
    nivel_subio: true,
  })

  // Load saved prefs from DB
  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('notification_prefs').eq('id', userId).single().then(({ data }) => {
      if (data?.notification_prefs) setNotifPrefs(prev => ({ ...prev, ...(data.notification_prefs as Record<string, boolean>) }))
    })
  }, [userId])

  const toggleNotif = (key: string) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(updated)
    if (userId) supabase.from('profiles').update({ notification_prefs: updated }).eq('id', userId)
  }

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setAvatarUploading(true)
    setAvatarUploadError(null)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${userId}/avatar.${ext}`
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setAvatarUploadError('Error al subir la imagen. Intentá de nuevo.'); setAvatarUploading(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
    await refreshProfile()
    setAvatarUploading(false)
  }

  // ── Friends state ──────────────────────────────────────────────
  const [friendInput, setFriendInput] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [friends, setFriends] = useState<FriendRow[]>([])
  const [friendsTab, setFriendsTab] = useState<'amigos' | 'solicitudes'>('amigos')
  const [friendActionLoading, setFriendActionLoading] = useState<string | null>(null)

  // Load friendships
  const loadFriendships = useCallback(async () => {
    if (!userId) return

    const { data } = await supabase
      .from('friendships')
      .select('id, sender_id, receiver_id, status')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .neq('status', 'rejected')

    if (!data) return

    // Fetch all profile IDs we need
    const profileIds = new Set<string>()
    for (const row of data as { id: string; sender_id: string; receiver_id: string; status: string }[]) {
      if (row.sender_id === userId) profileIds.add(row.receiver_id)
      else profileIds.add(row.sender_id)
    }

    if (profileIds.size === 0) { setFriends([]); return }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, username')
      .in('id', [...profileIds])

    const profileMap: Record<string, { name: string; username: string }> = {}
    if (profiles) {
      for (const p of profiles as { id: string; name: string; username: string }[]) {
        profileMap[p.id] = { name: p.name, username: p.username ?? '' }
      }
    }

    const rows: FriendRow[] = []
    for (const row of data as { id: string; sender_id: string; receiver_id: string; status: string }[]) {
      const isSender = row.sender_id === userId
      const friendId = isSender ? row.receiver_id : row.sender_id
      const prof = profileMap[friendId]
      if (!prof) continue
      rows.push({
        id: row.id,
        friendId,
        name: prof.name,
        username: prof.username,
        status: row.status as 'pending' | 'accepted',
        isSender,
      })
    }

    setFriends(rows)
  }, [userId])

  useEffect(() => { loadFriendships() }, [loadFriendships])

  // Search users by username
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim() || !userId) { setSearchResults([]); return }
    setSearching(true)

    const { data } = await supabase
      .from('profiles')
      .select('id, name, username')
      .ilike('username', `%${query.trim()}%`)
      .neq('id', userId)
      .eq('is_admin', false)
      .limit(8)

    if (data) {
      setSearchResults((data as SearchResult[]).filter((r) => r.username))
    }
    setSearching(false)
  }, [userId])

  useEffect(() => {
    const t = setTimeout(() => searchUsers(friendInput), 300)
    return () => clearTimeout(t)
  }, [friendInput, searchUsers])

  const sendFriendRequest = async (targetId: string) => {
    if (!userId) return
    setFriendActionLoading(targetId)
    await supabase.from('friendships').insert({ sender_id: userId, receiver_id: targetId, status: 'pending' })
    await loadFriendships()
    setFriendInput('')
    setSearchResults([])
    setFriendActionLoading(null)
  }

  const acceptRequest = async (friendshipId: string) => {
    setFriendActionLoading(friendshipId)
    await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId)
    await loadFriendships()
    setFriendActionLoading(null)
  }

  const rejectOrRemove = async (friendshipId: string) => {
    setFriendActionLoading(friendshipId)
    await supabase.from('friendships').delete().eq('id', friendshipId)
    await loadFriendships()
    setFriendActionLoading(null)
  }

  const acceptedFriends = friends.filter((f) => f.status === 'accepted')
  const pendingReceived = friends.filter((f) => f.status === 'pending' && !f.isSender)
  const pendingSent = friends.filter((f) => f.status === 'pending' && f.isSender)

  // Check if a search result is already a friend or has a pending request
  const getFriendshipFor = (targetId: string) => friends.find((f) => f.friendId === targetId)

  return (
    <div className="feed-scroll" style={{ height: '100%', padding: '8px 16px 24px' }}>
      {/* Hero — gradient banner + avatar overlap + name with tier badge.
          The banner's a soft horizontal teal→amber gradient at very low
          alpha so it tints the section without dominating. Avatar bottom
          overlaps the banner so it visually anchors the seam. */}
      <div style={{ position: 'relative', marginBottom: 'var(--space-7)' }}>
        {/* Gradient banner — fixed 96px tall */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 'calc(var(--space-5) * -1)',
            right: 'calc(var(--space-5) * -1)',
            height: 96,
            background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.16) 0%, rgba(255, 212, 116, 0.10) 50%, rgba(99, 102, 241, 0.10) 100%)',
            borderBottom: '1px solid var(--b1n0-border)',
          }}
        />
        {/* Tier badge — pinned to top-right of the banner so the name
            below sits visually centered without competing for space. */}
        <div style={{ position: 'absolute', top: 'var(--space-3)', right: 0, zIndex: 1 }}>
          <TierBadge tier={user.tier ?? 1} />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 'var(--space-7)',
            position: 'relative',
          }}
        >
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: 'var(--b1n0-si)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: D,
              fontWeight: 800,
              fontSize: '32px',
              color: 'var(--b1n0-bg)',
              marginBottom: 'var(--space-4)',
              position: 'relative',
              cursor: 'pointer',
              overflow: 'hidden',
              opacity: avatarUploading ? 0.5 : 1,
              transition: 'opacity 0.2s',
              boxShadow: '0 0 0 4px var(--color-bg), 0 8px 24px rgba(0, 0, 0, 0.18)',
            }}
          >
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '26px', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={12} weight="fill" color="white" />
            </div>
          </div>
          <p style={{ fontFamily: F, fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--b1n0-muted)', marginBottom: '2px' }}>
            {profile?.username ? `@${profile.username}` : ''}
          </p>
          <p style={{ fontFamily: D, fontWeight: 800, fontSize: 'var(--text-xl)', color: 'var(--b1n0-text-1)', letterSpacing: 'var(--tracking-tight)' }}>{user.name}</p>
          {avatarUploadError && (
            <p style={{ fontFamily: F, fontSize: 'var(--text-xs)', color: 'var(--b1n0-no)', marginTop: 'var(--space-2)' }}>{avatarUploadError}</p>
          )}
        </div>
      </div>

      {/* Quick stats — Phosphor icon top-left, animated number top-right
          aligned-baseline, label below in muted caps. Bottom hairline
          accent stays as the visual hierarchy cue. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <StatCard
          icon={<VoteIcon size={14} weight="regular" />}
          label="Votos"
          value={user.totalPredictions}
          accent="var(--b1n0-muted)"
        />
        <StatCard
          icon={<Trophy size={14} weight="regular" />}
          label="Correctos"
          value={user.correctPredictions}
          accent="var(--b1n0-si)"
        />
        <StatCard
          icon={<TargetIcon size={14} weight="regular" />}
          label="Acierto"
          value={accuracy}
          suffix="%"
          accent={accuracy >= 60 ? 'var(--b1n0-si)' : accuracy >= 40 ? 'var(--b1n0-orange-500)' : 'var(--b1n0-no)'}
        />
      </div>

      {/* ── Saldo / Wallet ──
          Wallet-card treatment: subtle gradient strip at the top, Syne
          hero font on the balance, cobrado total floats to the right of
          the balance line instead of stacked below. */}
      <div style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
        <p style={{ fontFamily: F, fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--b1n0-muted)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', marginBottom: 'var(--space-3)' }}>
          Saldo
        </p>
        {/* Whole saldo card is the wallet trigger. Tap anywhere on it
             — number, label, cobrado row — and the WalletSheet opens
             with its Depositar / Retirar tabs. Matches the affordance
             of the Saldo tile on Inicio so the wallet entry point
             feels consistent platform-wide. Rendered as a <button>
             for keyboard + screen-reader accessibility, styled to
             read as a card. Hover state brightens the border so the
             interactivity is discoverable without screaming. */}
        <button
          type="button"
          onClick={() => setWalletOpen(true)}
          aria-label="Abrir billetera"
          style={{
            position: 'relative',
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6) var(--space-6)',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-text-2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-border)' }}
        >
          {/* Decorative gradient strip — top edge */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, var(--b1n0-si) 0%, var(--b1n0-gold) 50%, var(--b1n0-si) 100%)',
            }}
          />

          {/* Top-right chevron — quietly signals 'this opens something'
               without needing a screaming CTA button. */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 'var(--space-4)',
              right: 'var(--space-5)',
              fontFamily: F,
              fontSize: 'var(--text-md)',
              fontWeight: 600,
              color: 'var(--b1n0-muted)',
              lineHeight: 1,
            }}
          >
            ›
          </span>

          {/* Disponible — hero number + label */}
          <div>
            <AnimatedNumber
              value={profile?.balance ?? 0}
              prefix="$"
              decimals={2}
              duration={650}
              style={{
                display: 'block',
                fontFamily: 'var(--font-hero)',
                fontWeight: 800,
                fontSize: 'var(--text-2xl)',
                color: 'var(--b1n0-text-1)',
                letterSpacing: 'var(--tracking-tight)',
                lineHeight: 1,
              }}
            />
            <p style={{ fontFamily: F, fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', marginTop: 'var(--space-2)' }}>
              Disponible
            </p>
          </div>

          {/* Cobrado row — slim hairline-separated below the hero */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--b1n0-border)' }}>
            <span style={{ fontFamily: F, fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)' }}>
              Cobrado
            </span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--b1n0-text-1)', fontVariantNumeric: 'tabular-nums', letterSpacing: 'var(--tracking-tight)' }}>
              ${user.totalCobrado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </button>

        {/* Tier progress CTA — only when not at max */}
        {(user.tier ?? 1) < 3 && (
          <TierProgressCard
            currentTier={user.tier ?? 1}
            onUpgrade={() => setKycOpen(true)}
          />
        )}
      </div>

      <WalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} />

      {/* Portfolio CTA — now with content preview: active position count
          and total exposure. Shows up immediately whether the user has
          any positions, so the card always feels alive. */}
      <PortfolioCard
        activeCount={predictions.filter((p) => p.status === 'active').length}
        totalCount={predictions.length}
        wonCount={user.correctPredictions}
        onClick={() => navigate('/portafolio')}
      />

      {/* ── Friends section ── */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Amigos ({acceptedFriends.length})
          </p>
          {pendingReceived.length > 0 && (
            <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#fff', background: 'var(--b1n0-no)', borderRadius: 'var(--radius-lg)', padding: '2px 8px' }}>
              {pendingReceived.length} nueva{pendingReceived.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={friendInput}
              onChange={(e) => setFriendInput(e.target.value)}
              placeholder="Buscar por usuario..."
              style={{ flex: 1, background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '9px 14px', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', outline: 'none' }}
            />
          </div>

          {/* Search dropdown */}
          {friendInput.trim() && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--b1n0-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-lg)', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflow: 'auto', boxShadow: '0 4px 12px var(--b1n0-border)' }}>
              {searching ? (
                <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', padding: '12px 14px' }}>Buscando...</p>
              ) : searchResults.length === 0 ? (
                <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', padding: '12px 14px' }}>No se encontraron usuarios.</p>
              ) : (
                searchResults.map((r) => {
                  const existing = getFriendshipFor(r.id)
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid var(--b1n0-border)' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 600, fontSize: '11px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>
                        {r.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: F, fontWeight: 500, fontSize: '13px', color: 'var(--b1n0-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>@{r.username}</p>
                      </div>
                      {existing ? (
                        <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>
                          {existing.status === 'accepted' ? 'Amigo' : 'Pendiente'}
                        </span>
                      ) : (
                        <button
                          onClick={() => sendFriendRequest(r.id)}
                          disabled={friendActionLoading === r.id}
                          style={{ padding: '6px 14px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-bg)', flexShrink: 0, opacity: friendActionLoading === r.id ? 0.5 : 1 }}
                        >
                          +
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Friends tabs — slim segmented with sliding teal underline.
            Same pattern as the AuthModal so the visual language is
            consistent across the app. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            marginBottom: 'var(--space-4)',
            borderBottom: '1px solid var(--b1n0-border)',
          }}
        >
          {(['amigos', 'solicitudes'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFriendsTab(t)}
              style={{
                flex: 1,
                padding: 'var(--space-3) var(--space-2)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: F,
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                color: friendsTab === t ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
                letterSpacing: 'var(--tracking-tight)',
                position: 'relative',
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
            >
              {t === 'amigos' ? 'Amigos' : 'Solicitudes'}
              {t === 'solicitudes' && pendingReceived.length > 0 && (
                <span
                  style={{
                    marginLeft: 'var(--space-2)',
                    fontFamily: 'var(--font-num)',
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 700,
                    color: 'var(--b1n0-bg)',
                    background: 'var(--b1n0-no)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-pill)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {pendingReceived.length}
                </span>
              )}
            </button>
          ))}
          {/* Sliding indicator */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              bottom: -1,
              left: friendsTab === 'amigos' ? 0 : '50%',
              width: '50%',
              height: 2,
              background: 'var(--b1n0-si)',
              borderRadius: '2px 2px 0 0',
              transition: 'left var(--duration-base) var(--ease-out)',
            }}
          />
        </div>

        {friendsTab === 'amigos' ? (
          /* Accepted friends */
          acceptedFriends.length === 0 ? (
            <FriendsEmpty userId={userId} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {acceptedFriends.map((f) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>
                    {f.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: F, fontWeight: 500, fontSize: '14px', color: 'var(--b1n0-text-1)' }}>{f.name}</span>
                    {f.username && <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>@{f.username}</p>}
                  </div>
                  <button
                    onClick={() => rejectOrRemove(f.id)}
                    disabled={friendActionLoading === f.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', padding: '4px 6px', opacity: friendActionLoading === f.id ? 0.5 : 1 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Solicitudes tab */
          <div>
            {/* Incoming requests */}
            {pendingReceived.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Recibidas</p>
                {pendingReceived.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>
                      {f.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: F, fontWeight: 500, fontSize: '13px', color: 'var(--b1n0-text-1)' }}>{f.name}</span>
                      {f.username && <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>@{f.username}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => acceptRequest(f.id)}
                        disabled={friendActionLoading === f.id}
                        style={{ padding: '6px 12px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-bg)', opacity: friendActionLoading === f.id ? 0.5 : 1 }}
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={() => rejectOrRemove(f.id)}
                        disabled={friendActionLoading === f.id}
                        style={{ padding: '6px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)', opacity: friendActionLoading === f.id ? 0.5 : 1 }}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sent requests (pending) */}
            {pendingSent.length > 0 && (
              <div>
                <p style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Enviadas</p>
                {pendingSent.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--b1n0-border)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)', flexShrink: 0 }}>
                      {f.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: F, fontWeight: 500, fontSize: '13px', color: 'var(--b1n0-text-1)' }}>{f.name}</span>
                      {f.username && <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>@{f.username}</p>}
                    </div>
                    <button
                      onClick={() => rejectOrRemove(f.id)}
                      disabled={friendActionLoading === f.id}
                      style={{ padding: '6px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)', opacity: friendActionLoading === f.id ? 0.5 : 1 }}
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {pendingReceived.length === 0 && pendingSent.length === 0 && (
              <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                No tenés solicitudes pendientes.
              </p>
            )}
          </div>
        )}
      </div>


      {/* ── Configuración ── */}
      <div style={{ marginTop: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
          Configuración
        </p>

        {/* All config in one card */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '4px 18px', marginBottom: '14px' }}>
          {/* Notificaciones — collapsible */}
          <SettingsRow
            icon={<Bell size={16} weight="regular" />}
            label="Notificaciones"
            iconBg="rgba(74, 222, 128, 0.14)"
            iconColor="var(--b1n0-si)"
            open={notifOpen}
            onToggle={() => setNotifOpen((o) => !o)}
          />
          {notifOpen && (
            <div style={{ padding: '8px 0 4px' }}>
              <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Predicciones</p>
              <ToggleRow label="Evento resuelto" description="Un evento en el que participaste tiene resultado" value={notifPrefs.evento_resuelto} onChange={() => toggleNotif('evento_resuelto')} />
              <ToggleRow label="Ganaste / No fue" description="Tu posición ganó o perdió (con monto)" value={notifPrefs.resultado} onChange={() => toggleNotif('resultado')} />
              <ToggleRow label="Posición vendida" description="Confirmación cuando se ejecuta tu venta" value={notifPrefs.posicion_vendida} onChange={() => toggleNotif('posicion_vendida')} />
              <ToggleRow label="Evento por cerrar" description="Un evento en el que votaste cierra pronto" value={notifPrefs.evento_por_cerrar} onChange={() => toggleNotif('evento_por_cerrar')} />
              <ToggleRow label="Nuevo evento" description="Nuevo evento en categorías que te interesan" value={notifPrefs.nuevo_evento} onChange={() => toggleNotif('nuevo_evento')} />

              <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '12px', marginBottom: '4px' }}>Social</p>
              <ToggleRow label="Solicitud de amistad" description="Alguien te envió una solicitud" value={notifPrefs.solicitud_amistad} onChange={() => toggleNotif('solicitud_amistad')} />
              <ToggleRow label="Amistad aceptada" description="Aceptaron tu solicitud de amistad" value={notifPrefs.amistad_aceptada} onChange={() => toggleNotif('amistad_aceptada')} />
              <ToggleRow label="Respuesta a comentario" description="Alguien respondió a tu comentario" value={notifPrefs.respuesta_comentario} onChange={() => toggleNotif('respuesta_comentario')} />
              <ToggleRow label="Mención" description="Alguien te mencionó en un comentario" value={notifPrefs.mencion} onChange={() => toggleNotif('mencion')} />

              <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '12px', marginBottom: '4px' }}>Wallet</p>
              <ToggleRow label="Depósito confirmado" description="Tus fondos fueron acreditados" value={notifPrefs.deposito_confirmado} onChange={() => toggleNotif('deposito_confirmado')} />
              <ToggleRow label="Retiro procesado" description="Tu retiro fue completado" value={notifPrefs.retiro_procesado} onChange={() => toggleNotif('retiro_procesado')} />
              <ToggleRow label="Saldo bajo" description="Tu saldo está por debajo del mínimo" value={notifPrefs.saldo_bajo} onChange={() => toggleNotif('saldo_bajo')} />

              <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '12px', marginBottom: '4px' }}>Cuenta</p>
            </div>
          )}

          {/* Cuenta — collapsible */}
          <SettingsRow
            icon={<UserIcon size={16} weight="regular" />}
            label="Cuenta"
            iconBg="rgba(99, 102, 241, 0.14)"
            iconColor="#6366f1"
            open={cuentaOpen}
            onToggle={() => setCuentaOpen((o) => !o)}
          />
          {cuentaOpen && (
            <>
              <InfoRow label="Usuario" value={profile?.username ? `@${profile.username}` : '@usuario'} />
              <InfoRow label="Nombre" value={profile ? `${profile.firstName} ${profile.lastName}`.trim() || profile.name : '—'} />
              <InfoRow label="Correo" value={profile?.id ? '••••@••••' : '—'} />
              <InfoRow label="Teléfono" value={profile?.phone || '—'} />
              <InfoRow label="Fecha de nacimiento" value={profile?.dob ? new Date(profile.dob).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
              <InfoRow label="Dirección" value={profile?.city && profile?.country ? `${profile.city}, ${profile.country}` : '—'} />
            </>
          )}

          {/* Apariencia — collapsible */}
          <SettingsRow
            icon={<PaintBrush size={16} weight="regular" />}
            label="Apariencia"
            iconBg="rgba(255, 212, 116, 0.18)"
            iconColor="var(--b1n0-orange-700, #C45A0A)"
            open={aparienciaOpen}
            onToggle={() => setAparienciaOpen((o) => !o)}
          />
          {aparienciaOpen && (
            <div style={{ padding: '12px 0 14px' }}>
              <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
                Elegí el tema de la app. "Sistema" sigue la preferencia de tu dispositivo.
              </p>
              <div style={{ display: 'flex', gap: '6px', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-lg)', padding: '4px' }}>
                {([
                  { value: 'dark', label: 'Oscuro' },
                  { value: 'light', label: 'Claro' },
                  { value: 'system', label: 'Sistema' },
                ] as { value: ThemeMode; label: string }[]).map(opt => {
                  const active = themeMode === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setThemeMode(opt.value)}
                      style={{
                        flex: 1,
                        padding: '9px 10px',
                        borderRadius: 'var(--radius-lg)',
                        border: 'none',
                        background: active ? 'var(--b1n0-si)' : 'transparent',
                        color: active ? 'var(--b1n0-on-accent)' : 'var(--b1n0-text-2)',
                        fontFamily: F,
                        fontWeight: active ? 700 : 500,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Soporte — collapsible */}
          <SettingsRow
            icon={<Lifebuoy size={16} weight="regular" />}
            label="Soporte"
            iconBg="rgba(248, 113, 113, 0.14)"
            iconColor="var(--b1n0-no)"
            open={soporteOpen}
            onToggle={() => setSoporteOpen((o) => !o)}
            noBottomBorder
          />
          {soporteOpen && (
            <>
              <LinkRow label="Centro de ayuda" />
              <LinkRow label="Reportar un problema" />
              <LinkRow label="Términos y condiciones" />
            </>
          )}

        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
          <a href="/terminos" style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textDecoration: 'underline' }}>Términos</a>
          <a href="/privacidad" style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textDecoration: 'underline' }}>Privacidad</a>
        </div>
        <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', textAlign: 'center', marginTop: '8px', marginBottom: '16px' }}>
          b1n0 v0.1.0 · Hecho en Guatemala
        </p>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────
   Helper components
   Kept in this file rather than spun out because they're tightly
   coupled to Perfil's specific data shape and aren't used elsewhere.
   ─────────────────────────────────────────────────────────────────── */

/**
 * TierBadge — small pill that sits next to the user's name showing
 * their current verification tier. Color-keyed: gray → teal → gold
 * for tiers 1 → 2 → 3.
 */
function TierBadge({ tier }: { tier: number }) {
  const meta =
    tier >= 3
      ? { color: 'var(--b1n0-gold)', bg: 'rgba(255, 212, 116, 0.15)', label: 'N3' }
      : tier === 2
        ? { color: 'var(--b1n0-si)', bg: 'var(--b1n0-si-bg)', label: 'N2' }
        : { color: 'var(--b1n0-muted)', bg: 'var(--b1n0-surface)', label: 'N1' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontFamily: 'var(--font-num)',
        fontWeight: 700,
        fontSize: 'var(--text-2xs)',
        color: meta.color,
        background: meta.bg,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        letterSpacing: 'var(--tracking-caps)',
      }}
    >
      <ShieldCheck size={10} weight="fill" />
      {meta.label}
    </span>
  )
}

/**
 * StatCard — quick-stat box with a Phosphor icon, animated number,
 * label, and a colored accent hairline at the bottom.
 */
function StatCard({
  icon,
  label,
  value,
  suffix,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  suffix?: string
  accent: string
}) {
  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4) var(--space-3) var(--space-5)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)', color: accent, marginBottom: 'var(--space-2)' }}>
        {icon}
      </div>
      <AnimatedNumber
        value={value}
        decimals={0}
        suffix={suffix}
        duration={650}
        style={{
          display: 'block',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 'var(--text-xl)',
          color: 'var(--b1n0-text-1)',
          letterSpacing: 'var(--tracking-tight)',
          lineHeight: 1,
        }}
      />
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-2xs)',
          fontWeight: 700,
          color: 'var(--b1n0-muted)',
          marginTop: 'var(--space-2)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-caps)',
        }}
      >
        {label}
      </p>
      <span
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 28,
          height: 3,
          borderRadius: '2px 2px 0 0',
          background: accent,
        }}
      />
    </div>
  )
}

/**
 * PortfolioCard — Mi Portafolio CTA with content preview. Shows the
 * count of active positions, total positions, and a tiny SplitBar
 * representing the user's overall won/lost ratio. If the user has no
 * predictions yet, shows a friendly "haz tu primer llamado" prompt
 * instead of empty stats.
 */
function PortfolioCard({
  activeCount,
  totalCount,
  onClick,
}: {
  activeCount: number
  totalCount: number
  wonCount?: number  // kept for backward-compat with the call site
  onClick: () => void
}) {
  const hasAny = totalCount > 0
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderLeft: '3px solid var(--b1n0-si)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5) var(--space-6)',
        marginBottom: 'var(--space-5)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        transition: 'border-color var(--duration-base) var(--ease-out)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-card-hover-border)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--b1n0-border)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background: 'var(--b1n0-si-bg)',
              color: 'var(--b1n0-si)',
            }}
          >
            <TrendUp size={18} weight="fill" />
          </span>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--b1n0-text-1)', letterSpacing: 'var(--tracking-tight)' }}>
              Mi Portafolio
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--b1n0-muted)' }}>
              {hasAny
                ? `${activeCount} activa${activeCount !== 1 ? 's' : ''} · ${totalCount} en total`
                : 'Posiciones, rendimiento e historial'}
            </p>
          </div>
        </div>
        <ArrowRight size={16} weight="bold" color="var(--b1n0-si)" />
      </div>
    </button>
  )
}

/**
 * FriendsEmpty — illustration + invite CTA for the "no friends yet" state.
 * Replaces the bare "Todavía no tenés amigos" italic line. The Share
 * button copies the user's referral link to the clipboard.
 */
function FriendsEmpty({ userId }: { userId?: string }) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = userId
    ? `https://www.b1n0.com/?invite=${userId.slice(0, 8)}`
    : 'https://www.b1n0.com'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: 'var(--space-7) var(--space-3) var(--space-3)',
        gap: 'var(--space-3)',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--b1n0-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--b1n0-muted)',
        }}
      >
        <UsersIcon size={26} weight="regular" />
      </div>
      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--b1n0-text-1)' }}>
        Sin amigos en b1n0 todavía
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--b1n0-muted)', maxWidth: 280, lineHeight: 1.5 }}>
        Invitá a tus amigos. Es más divertido cuando alguien más también está poniendo su opinión.
      </p>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(inviteUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          } catch {
            /* clipboard may be denied — silently no-op */
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-5)',
          background: 'var(--b1n0-text-1)',
          color: 'var(--b1n0-bg)',
          border: 'none',
          borderRadius: 'var(--radius-pill)',
          fontFamily: 'var(--font-body)',
          fontWeight: 600,
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          marginTop: 'var(--space-2)',
        }}
      >
        <ShareNetwork size={14} weight="bold" />
        {copied ? '¡Copiado!' : 'Copiar invitación'}
      </button>
    </div>
  )
}

/**
 * TierProgressCard — only renders when the user is below tier 3. Shows
 * a slim progress strip with their position relative to max tier and
 * a CTA to upgrade via KYC.
 */
function TierProgressCard({
  currentTier,
  onUpgrade,
}: {
  currentTier: number
  onUpgrade: () => void
}) {
  const nextTier = Math.min(currentTier + 1, 3)
  const progressPct = ((currentTier - 1) / 2) * 100  // 0 → 50 → 100
  const limits: Record<number, number> = { 1: 50, 2: 250, 3: 1000 }
  return (
    <div
      style={{
        marginTop: 'var(--space-3)',
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5) var(--space-6)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--b1n0-text-1)', letterSpacing: 'var(--tracking-tight)' }}>
            Subí a Nivel {nextTier}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--b1n0-muted)', marginTop: '2px' }}>
            Llamá hasta <span style={{ fontFamily: 'var(--font-num)', color: 'var(--b1n0-text-1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${limits[nextTier]}</span> por evento
          </p>
        </div>
        <button
          onClick={onUpgrade}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--b1n0-si)',
            color: 'var(--b1n0-on-accent)',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Verificar
        </button>
      </div>
      {/* Progress strip — three steps (1, 2, 3), filled to currentTier */}
      <div style={{ position: 'relative', height: 6, background: 'var(--b1n0-surface)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, var(--b1n0-muted) 0%, var(--b1n0-si) 50%, var(--b1n0-gold) 100%)',
            transition: 'width 1s var(--ease-out)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
        {[1, 2, 3].map((t) => (
          <span
            key={t}
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 700,
              color: t <= currentTier ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 'var(--tracking-caps)',
            }}
          >
            N{t}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * SettingsRow — collapsible header for the Configuración card. Each
 * row gets a colored Phosphor icon in a tinted square, the label, and
 * a chevron that rotates when the section is open.
 */
function SettingsRow({
  icon,
  label,
  iconBg,
  iconColor,
  open,
  onToggle,
  noBottomBorder,
}: {
  icon: React.ReactNode
  label: string
  iconBg: string
  iconColor: string
  open: boolean
  onToggle: () => void
  noBottomBorder?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-4) 0',
        background: 'none',
        border: 'none',
        borderBottom: noBottomBorder ? 'none' : '1px solid var(--b1n0-border)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
          background: iconBg,
          color: iconColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>
        {label}
      </span>
      <span
        aria-hidden
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-md)',
          color: 'var(--b1n0-muted)',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform var(--duration-base) var(--ease-out)',
        }}
      >
        ›
      </span>
    </button>
  )
}

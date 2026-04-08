import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { mockUser } from '../data/mockEvents'
import { useAuth } from '../context/AuthContext'
import { useVotes } from '../context/VoteContext'
import { supabase } from '../lib/supabase'
import { KYCSheet } from '../components/wallet/KYCSheet'
import { DepositSheet } from '../components/wallet/DepositSheet'
import { RetiroSheet } from '../components/wallet/RetiroSheet'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

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
  const navigate = useNavigate()
  const { session, profile, refreshProfile, signOut } = useAuth()
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

  const [depositOpen, setDepositOpen] = useState(false)
  const [retiroOpen, setRetiroOpen] = useState(false)
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
  const [soporteOpen, setSoporteOpen] = useState(false)
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
      {/* Avatar + name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0 20px' }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-teal-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 800, fontSize: '30px', color: '#fff', marginBottom: '12px', position: 'relative', cursor: 'pointer', overflow: 'hidden', opacity: avatarUploading ? 0.5 : 1, transition: 'opacity 0.2s', border: '3px solid var(--color-surface)', boxShadow: '0 2px 12px var(--b1n0-border)' }}
        >
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            user.name.charAt(0)
          )}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '24px', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
          </div>
        </div>
        <p style={{ fontFamily: F, fontWeight: 500, fontSize: '13px', color: 'var(--color-muted)', marginBottom: '2px' }}>
          {profile?.username ? `@${profile.username}` : ''}
        </p>
        <p style={{ fontFamily: F, fontWeight: 800, fontSize: '22px', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>{user.name}</p>
        {avatarUploadError && (
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-no)', marginTop: '6px' }}>{avatarUploadError}</p>
        )}
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        {[
          { label: 'Votos', value: String(user.totalPredictions), accent: 'var(--color-muted)' },
          { label: 'Correctos', value: String(user.correctPredictions), accent: 'var(--color-si)' },
          { label: 'Acierto', value: `${accuracy}%`, accent: accuracy >= 60 ? 'var(--color-si)' : accuracy >= 40 ? 'var(--color-orange-500)' : 'var(--color-no)' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 10px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: '22px', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>{stat.value}</p>
            <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
            <span style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '24px', height: '3px', borderRadius: '2px 2px 0 0', background: stat.accent }} />
          </div>
        ))}
      </div>

      {/* Portfolio CTA */}
      <button
        onClick={() => navigate('/portafolio')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'var(--b1n0-si-bg)', border: '1px solid var(--b1n0-border)',
          borderRadius: '10px', padding: '16px 18px', marginBottom: '16px',
          cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
        }}
      >
        <div>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-si)', marginBottom: '3px' }}>
            Mi Portafolio
          </p>
          <p style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>
            Posiciones, rendimiento e historial completo
          </p>
        </div>
        <span style={{ fontFamily: F, fontWeight: 700, fontSize: '20px', color: 'var(--b1n0-si)', lineHeight: 1, flexShrink: 0 }}>→</span>
      </button>

      {/* ── Friends section ── */}
      <div style={{ background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '16px', padding: '18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <p style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Amigos ({acceptedFriends.length})
          </p>
          {pendingReceived.length > 0 && (
            <span style={{ fontFamily: F, fontSize: '11px', fontWeight: 600, color: '#fff', background: '#f87171', borderRadius: '10px', padding: '2px 8px' }}>
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
              style={{ flex: 1, background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)', borderRadius: '10px', padding: '9px 14px', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', outline: 'none' }}
            />
          </div>

          {/* Search dropdown */}
          {friendInput.trim() && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--b1n0-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflow: 'auto', boxShadow: '0 4px 12px var(--b1n0-border)' }}>
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
                          style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '13px', color: '#fff', flexShrink: 0, opacity: friendActionLoading === r.id ? 0.5 : 1 }}
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

        {/* Friends tabs: Amigos / Solicitudes */}
        <div style={{ display: 'flex', marginBottom: '12px', background: 'var(--b1n0-surface)', borderRadius: '10px', padding: '3px' }}>
          {(['amigos', 'solicitudes'] as const).map((t) => (
            <button key={t} onClick={() => setFriendsTab(t)} style={{
              flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px',
              background: friendsTab === t ? 'var(--b1n0-surface)' : 'transparent',
              color: friendsTab === t ? '#fff' : 'var(--b1n0-muted)',
              position: 'relative',
            }}>
              {t === 'amigos' ? 'Amigos' : 'Solicitudes'}
              {t === 'solicitudes' && pendingReceived.length > 0 && (
                <span style={{ position: 'absolute', top: '4px', right: '8px', width: 6, height: 6, borderRadius: '50%', background: '#f87171' }} />
              )}
            </button>
          ))}
        </div>

        {friendsTab === 'amigos' ? (
          /* Accepted friends */
          acceptedFriends.length === 0 ? (
            <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              Todavía no tenés amigos en b1n0.
            </p>
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
                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: '#fff', opacity: friendActionLoading === f.id ? 0.5 : 1 }}
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={() => rejectOrRemove(f.id)}
                        disabled={friendActionLoading === f.id}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)', opacity: friendActionLoading === f.id ? 0.5 : 1 }}
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
                      style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '12px', color: 'var(--b1n0-muted)', opacity: friendActionLoading === f.id ? 0.5 : 1 }}
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


      {/* ── Saldo / Wallet ── */}
      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
          Saldo
        </p>
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '20px 18px' }}>
          <p style={{ fontFamily: F, fontWeight: 800, fontSize: '36px', color: 'var(--color-text)', letterSpacing: '-1.5px', marginBottom: '6px', lineHeight: 1 }}>
            Q{(profile?.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--color-muted)', marginBottom: '16px' }}>
            Cobrado total: Q{user.totalCobrado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setDepositOpen(true)}
              className="btn-primary"
              style={{ flex: 1, padding: '12px', fontSize: '13px' }}
            >
              Depositar
            </button>
            <button
              onClick={() => setRetiroOpen(true)}
              className="btn-secondary"
              style={{ flex: 1, padding: '12px', fontSize: '13px' }}
            >
              Retirar
            </button>
          </div>
        </div>
      </div>

      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
      <RetiroSheet open={retiroOpen} onClose={() => setRetiroOpen(false)} />

      {/* ── Configuración ── */}
      <div style={{ marginTop: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '10px', fontWeight: 600, color: 'var(--b1n0-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
          Configuración
        </p>

        {/* All config in one card */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '4px 18px', marginBottom: '14px' }}>
          {/* Notificaciones — collapsible */}
          <button
            onClick={() => setNotifOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--b1n0-border)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>Notificaciones</span>
            <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)', transform: notifOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
          </button>
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
          <button
            onClick={() => setCuentaOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--b1n0-border)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>Cuenta</span>
            <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)', transform: cuentaOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
          </button>
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

          {/* Soporte — collapsible */}
          <button
            onClick={() => setSoporteOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 500, color: 'var(--b1n0-text-1)' }}>Soporte</span>
            <span style={{ fontFamily: F, fontSize: '16px', color: 'var(--b1n0-muted)', transform: soporteOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
          </button>
          {soporteOpen && (
            <>
              <LinkRow label="Centro de ayuda" />
              <LinkRow label="Reportar un problema" />
              <LinkRow label="Términos y condiciones" />
            </>
          )}

          {/* Sign out */}
          <button
            onClick={async () => {
              await signOut()
              navigate('/inicio')
            }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', marginTop: '8px', background: 'var(--b1n0-surface)', border: '1px solid var(--b1n0-border)',
              borderRadius: '10px', cursor: 'pointer', transition: 'border-color 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--b1n0-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span style={{ fontFamily: F, fontSize: '14px', fontWeight: 600, color: 'var(--b1n0-text-2)' }}>Cerrar sesión</span>
          </button>
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

/**
 * ProfilePublic — the public page for any b1n0 user, reachable at
 * /u/:username.
 *
 * Respects the target user's privacy_prefs:
 *   - show_tier              → tier badge
 *   - show_total_cobrado     → total cobrado stat
 *   - show_accuracy_rate     → acierto % stat
 *   - show_total_predictions → total llamados stat
 *   - show_full_name         → real name (off → only @username shows)
 *   - show_join_date         → "Miembro desde …" line
 *   - show_avatar            → avatar image (off → default initial)
 *
 * Missing keys default to true (public). This is set in the migration's
 * default + treated as the default throughout this component.
 *
 * Relationship CTA at top-right:
 *   - not logged in        → 'Iniciá sesión para conectar'
 *   - viewing own profile  → 'Editar mi perfil' → /perfil
 *   - not friends          → 'Agregar amigo'
 *   - request sent         → 'Solicitud enviada' (disabled)
 *   - request received     → 'Aceptar' + 'Rechazar'
 *   - friends              → 'Amigos' (popover or just label; remove
 *                            stays in /perfil for safety)
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../hooks/usePageMeta'
import { Footer } from '../components/layout/Footer'
import { EmptyState } from '../components/EmptyState'
import { ActivityFeed } from '../components/ActivityFeed'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

interface PublicProfile {
  id: string
  name: string
  username: string
  tier: 1 | 2 | 3
  avatar_url: string | null
  created_at: string
  privacy_prefs: Record<string, boolean>
  // Stats are computed LIVE from the positions table on mount, not
  // read from profiles.total_predictions / correct_predictions —
  // those counter columns aren't kept in sync by any trigger, so
  // they're stale. positions is the source of truth.
  totalPredictions: number
  correctPredictions: number
  totalCobrado: number
}

type Relationship =
  | 'self'
  | 'guest'           // not logged in
  | 'none'            // logged in, no friendship row
  | 'pending_sent'    // I sent, they haven't responded
  | 'pending_received'
  | 'friends'

const TIER_LABELS: Record<number, string> = { 1: 'N1', 2: 'N2', 3: 'N3' }
const TIER_COLORS: Record<number, string> = {
  1: 'var(--b1n0-muted)',
  2: 'var(--b1n0-si)',
  3: 'var(--b1n0-indigo)',
}

export function ProfilePublic() {
  const { username: rawUsername } = useParams<{ username: string }>()
  const username = (rawUsername ?? '').replace(/^@/, '').toLowerCase()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [relationship, setRelationship] = useState<Relationship>('none')
  const [friendshipId, setFriendshipId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  usePageMeta({
    title: profile ? `@${profile.username} · b1n0` : 'Perfil · b1n0',
    description: profile
      ? `Perfil público de @${profile.username} en b1n0. ${profile.totalPredictions} llamados.`
      : 'Perfil de usuario en b1n0.',
  })

  // Load the target user's public profile.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setProfile(null)
    ;(async () => {
      // 1. Fetch the profile row (basic identity + privacy)
      const { data: row } = await supabase
        .from('profiles')
        .select('id, name, username, tier, avatar_url, created_at, privacy_prefs')
        .ilike('username', username)
        .maybeSingle()

      if (cancelled) return
      if (!row) { setProfile(null); setLoading(false); return }

      // 2. Compute live stats from positions. Counters on profiles
      //    aren't trigger-maintained, so reading them here would show
      //    stale zeros.
      const { data: posRows } = await supabase
        .from('positions')
        .select('status, payout_if_win')
        .eq('user_id', row.id)

      const positions = (posRows ?? []) as Array<{ status: string; payout_if_win: number | null }>
      // Resolution-skim factor lives in pricing config; for the public
      // profile we use the same approximation as Perfil (gross of skim
      // is fine for headline stats — the skim shows up in Historial /
      // Mi Portafolio with full fidelity).
      const totalPredictions = positions.length
      const won = positions.filter((p) => p.status === 'won')
      const correctPredictions = won.length
      const totalCobrado = won.reduce(
        (sum, p) => sum + (Number(p.payout_if_win) || 0),
        0,
      )

      setProfile({
        ...(row as Omit<PublicProfile, 'totalPredictions' | 'correctPredictions' | 'totalCobrado'>),
        totalPredictions,
        correctPredictions,
        totalCobrado,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [username])

  // Determine relationship between viewer and target.
  useEffect(() => {
    if (!profile) return
    const me = session?.user?.id
    if (!me) { setRelationship('guest'); return }
    if (me === profile.id) { setRelationship('self'); return }

    ;(async () => {
      const { data } = await supabase
        .from('friendships')
        .select('id, sender_id, receiver_id, status')
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${me})`,
        )
        .neq('status', 'rejected')
        .maybeSingle()

      if (!data) { setRelationship('none'); setFriendshipId(null); return }
      setFriendshipId(data.id as string)
      if (data.status === 'accepted') { setRelationship('friends'); return }
      // pending
      if (data.sender_id === me) setRelationship('pending_sent')
      else setRelationship('pending_received')
    })()
  }, [profile, session])

  async function sendRequest() {
    if (!session?.user?.id || !profile) return
    setActionLoading(true)
    const { data } = await supabase
      .from('friendships')
      .insert({ sender_id: session.user.id, receiver_id: profile.id, status: 'pending' })
      .select('id').single()
    if (data) {
      setFriendshipId(data.id as string)
      setRelationship('pending_sent')
    }
    setActionLoading(false)
  }

  async function acceptRequest() {
    if (!friendshipId) return
    setActionLoading(true)
    await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId)
    setRelationship('friends')
    setActionLoading(false)
  }

  async function rejectRequest() {
    if (!friendshipId) return
    setActionLoading(true)
    await supabase.from('friendships').delete().eq('id', friendshipId)
    setFriendshipId(null)
    setRelationship('none')
    setActionLoading(false)
  }

  // ── Loading / not-found states ────────────────────────────
  if (loading) {
    return (
      <div className="feed-scroll" style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
        <p style={{ fontFamily: F, color: 'var(--b1n0-muted)' }}>Cargando perfil…</p>
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="feed-scroll" style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
        <EmptyState
          title="Usuario no encontrado"
          subtitle={`No existe un usuario con el username @${username}.`}
          action={{ label: 'Volver a inicio', onClick: () => navigate('/inicio') }}
        />
        <Footer />
      </div>
    )
  }

  // ── Resolve privacy ────────────────────────────────────────
  // Missing keys default to true (public).
  const pp = profile.privacy_prefs ?? {}
  const isOwner = relationship === 'self'
  const showTier = isOwner || (pp.show_tier ?? true)
  const showTotalCobrado = isOwner || (pp.show_total_cobrado ?? true)
  const showAccuracy = isOwner || (pp.show_accuracy_rate ?? true)
  const showTotalPredictions = isOwner || (pp.show_total_predictions ?? true)
  const showFullName = isOwner || (pp.show_full_name ?? true)
  const showJoinDate = isOwner || (pp.show_join_date ?? true)
  const showAvatar = isOwner || (pp.show_avatar ?? true)
  // Activity-feed gates. Both default to ON; the "show amount on llamado"
  // toggle defaults to OFF — users opt in to flex their stake size.
  const showActivityLlamados = isOwner || (pp.show_activity_llamados ?? true)
  const showActivityComments = isOwner || (pp.show_activity_comments ?? true)
  const showActivityLlamadoAmount = isOwner || (pp.show_activity_llamado_amount ?? false)

  const accuracy =
    profile.totalPredictions > 0
      ? Math.round((profile.correctPredictions / profile.totalPredictions) * 100)
      : 0

  return (
    <div className="feed-scroll" style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
      {/* ── Hero: avatar + name + tier + CTA ──────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'var(--b1n0-surface)',
            border: '1px solid var(--b1n0-border)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {showAvatar && profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span
              style={{
                fontFamily: D,
                fontSize: 32,
                fontWeight: 800,
                color: 'var(--b1n0-muted)',
                letterSpacing: '-0.5px',
              }}
            >
              {(profile.username || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        {/* Name + handle + tier */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {showFullName && (
            <p
              style={{
                fontFamily: D,
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--b1n0-text-1)',
                margin: 0,
                letterSpacing: '-0.5px',
              }}
            >
              {profile.name}
            </p>
          )}
          <p
            style={{
              fontFamily: F,
              fontSize: 14,
              color: 'var(--b1n0-muted)',
              margin: 0,
              marginTop: showFullName ? 2 : 0,
            }}
          >
            @{profile.username}
          </p>
          {showTier && (
            <span
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '3px 10px',
                background: 'var(--b1n0-card)',
                border: `1px solid ${TIER_COLORS[profile.tier]}`,
                borderRadius: 'var(--radius-pill)',
                fontFamily: F,
                fontSize: 11,
                fontWeight: 700,
                color: TIER_COLORS[profile.tier],
                letterSpacing: '0.5px',
              }}
            >
              {TIER_LABELS[profile.tier]}
            </span>
          )}
        </div>

        {/* Relationship CTA */}
        <RelationshipCta
          relationship={relationship}
          actionLoading={actionLoading}
          onSendRequest={sendRequest}
          onAcceptRequest={acceptRequest}
          onRejectRequest={rejectRequest}
          onGoToOwnProfile={() => navigate('/perfil')}
          onGoToLogin={() => navigate('/auth')}
        />
      </div>

      {/* ── Stats row ─────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {showTotalPredictions && (
          <StatCard label="Llamados" value={profile.totalPredictions.toString()} />
        )}
        {showAccuracy && (
          <StatCard label="Acierto" value={profile.totalPredictions > 0 ? `${accuracy}%` : '—'} />
        )}
        {showTotalCobrado && (
          <StatCard
            label="Total cobrado"
            value={`$${profile.totalCobrado.toFixed(0)}`}
            accent
          />
        )}
      </div>

      {showJoinDate && (
        <p
          style={{
            fontFamily: F,
            fontSize: 12,
            color: 'var(--b1n0-muted)',
            margin: 0,
            marginBottom: 24,
          }}
        >
          Miembro desde{' '}
          {new Date(profile.created_at).toLocaleDateString('es-GT', {
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}

      {/* Activity feed — only render if at least one stream is visible.
          Inside the component, each item links back to its event so
          profile views convert into event traffic. */}
      {(showActivityLlamados || showActivityComments) && (
        <ActivityFeed
          userId={profile.id}
          showLlamados={showActivityLlamados}
          showComments={showActivityComments}
          showLlamadoAmount={showActivityLlamadoAmount}
        />
      )}

      <Footer />
    </div>
  )
}

// ── Stat card (small numeric cell) ─────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}
    >
      <p
        style={{
          fontFamily: F,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          color: 'var(--b1n0-muted)',
          margin: 0,
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: D,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.5px',
          color: accent ? 'var(--b1n0-si)' : 'var(--b1n0-text-1)',
          margin: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  )
}

// ── Relationship CTA dispatcher ───────────────────────────
function RelationshipCta({
  relationship,
  actionLoading,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onGoToOwnProfile,
  onGoToLogin,
}: {
  relationship: Relationship
  actionLoading: boolean
  onSendRequest: () => void
  onAcceptRequest: () => void
  onRejectRequest: () => void
  onGoToOwnProfile: () => void
  onGoToLogin: () => void
}) {
  const baseBtn: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 'var(--radius-pill)',
    fontFamily: F,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
  }

  if (relationship === 'self') {
    return (
      <button onClick={onGoToOwnProfile} style={{ ...baseBtn, background: 'var(--b1n0-card)', color: 'var(--b1n0-text-1)', border: '1px solid var(--b1n0-border)' }}>
        Editar mi perfil
      </button>
    )
  }
  if (relationship === 'guest') {
    return (
      <button onClick={onGoToLogin} style={{ ...baseBtn, background: 'var(--b1n0-si)', color: 'var(--b1n0-on-accent)' }}>
        Iniciá sesión
      </button>
    )
  }
  if (relationship === 'none') {
    return (
      <button onClick={onSendRequest} disabled={actionLoading} style={{ ...baseBtn, background: 'var(--b1n0-si)', color: 'var(--b1n0-on-accent)', opacity: actionLoading ? 0.5 : 1 }}>
        Agregar amigo
      </button>
    )
  }
  if (relationship === 'pending_sent') {
    return (
      <button disabled style={{ ...baseBtn, background: 'var(--b1n0-card)', color: 'var(--b1n0-muted)', border: '1px solid var(--b1n0-border)', cursor: 'default' }}>
        Solicitud enviada
      </button>
    )
  }
  if (relationship === 'pending_received') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onAcceptRequest} disabled={actionLoading} style={{ ...baseBtn, background: 'var(--b1n0-si)', color: 'var(--b1n0-on-accent)', opacity: actionLoading ? 0.5 : 1 }}>
          Aceptar
        </button>
        <button onClick={onRejectRequest} disabled={actionLoading} style={{ ...baseBtn, background: 'transparent', color: 'var(--b1n0-muted)', border: '1px solid var(--b1n0-border)', opacity: actionLoading ? 0.5 : 1 }}>
          Rechazar
        </button>
      </div>
    )
  }
  // friends
  return (
    <span style={{ ...baseBtn, background: 'var(--b1n0-si-bg, rgba(20,184,166,0.15))', color: 'var(--b1n0-si)', cursor: 'default' }}>
      Amigos
    </span>
  )
}

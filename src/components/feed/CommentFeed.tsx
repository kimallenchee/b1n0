import { useEffect, useRef, useState } from 'react'
import type { Comment } from '../../types'
import { useComments } from '../../hooks/useComments'
import { useAuth } from '../../context/AuthContext'

interface CommentFeedProps {
  comments: Comment[]
  eventId: string
}

const F = '"DM Sans", sans-serif'

const tierColors: Record<number, string> = { 1: 'var(--b1n0-disabled-bg)', 2: 'var(--b1n0-disabled-bg)', 3: 'var(--b1n0-surface)' }
const avatarBg = ['var(--b1n0-surface)', '#2a2724', 'var(--b1n0-muted)', '#2a2724', '#2a2724', 'var(--b1n0-muted)']

function getAvatarColor(username: string): string {
  if (username === 'Tú') return 'var(--b1n0-surface)'
  let h = 0
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h)
  return avatarBg[Math.abs(h) % avatarBg.length]
}

function applyVote(c: Comment, dir: 'up' | 'down', prev: 'up' | 'down' | null): Comment {
  const off = prev === dir
  return {
    ...c,
    likes:    dir === 'up'   ? (off ? Math.max(0, (c.likes    ?? 0) - 1) : (c.likes    ?? 0) + 1) : (prev === 'up'   ? Math.max(0, (c.likes    ?? 0) - 1) : (c.likes    ?? 0)),
    dislikes: dir === 'down' ? (off ? Math.max(0, (c.dislikes ?? 0) - 1) : (c.dislikes ?? 0) + 1) : (prev === 'down' ? Math.max(0, (c.dislikes ?? 0) - 1) : (c.dislikes ?? 0)),
  }
}

const PREVIEW = 4

export function CommentFeed({ comments: initialComments, eventId }: CommentFeedProps) {
  const { profile } = useAuth()
  const { comments: dbComments, loading, addComment, addReply, editComment, deleteComment, persistVote } = useComments(eventId)
  const myAvatarUrl = profile?.avatarUrl ?? undefined
  const myUserId = profile?.id

  const [sort, setSort]             = useState<'reciente' | 'popular'>('reciente')
  const [showAll, setShowAll]       = useState(false)
  const [list, setList]             = useState<Comment[]>(initialComments)
  const [votes, setVotes]           = useState<Record<string, 'up' | 'down' | null>>({})
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [draft, setDraft]           = useState('')
  const [sending, setSending]       = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editDraft, setEditDraft]   = useState('')
  const [menuOpen, setMenuOpen]     = useState<string | null>(null)

  const synced = useRef(false)
  useEffect(() => {
    if (!loading && !synced.current) {
      synced.current = true
      setList(dbComments)
    }
  }, [loading, dbComments])

  const sorted = sort === 'popular'
    ? [...list].sort((a, b) => ((b.likes ?? 0) - (b.dislikes ?? 0)) - ((a.likes ?? 0) - (a.dislikes ?? 0)))
    : list

  const visible = showAll ? sorted : sorted.slice(0, PREVIEW)
  const hidden  = sorted.length - PREVIEW

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    const saved = await addComment(text, null)
    if (saved) {
      setList(cs => [saved, ...cs])
    } else {
      // fallback: optimistic local-only comment
      setList(cs => [{ id: `c-${Date.now()}`, username: 'Tú', avatarUrl: myAvatarUrl, text, timeAgo: 'ahora', tier: 1, likes: 0, dislikes: 0, replies: [] }, ...cs])
    }
    setDraft('')
    setShowAll(false)
    setSending(false)
  }

  const handleVote = (id: string, dir: 'up' | 'down', parentId?: string) => {
    const prev = votes[id] ?? null
    const next: 'up' | 'down' | null = prev === dir ? null : dir
    setVotes(v => ({ ...v, [id]: next }))
    let updatedLikes = 0, updatedDislikes = 0
    setList(cs => cs.map(c => {
      if (!parentId && c.id === id) {
        const u = applyVote(c, dir, prev)
        updatedLikes = u.likes ?? 0
        updatedDislikes = u.dislikes ?? 0
        return u
      }
      if (parentId && c.id === parentId) {
        return {
          ...c,
          replies: (c.replies ?? []).map(r => {
            if (r.id !== id) return r
            const u = applyVote(r, dir, prev)
            updatedLikes = u.likes ?? 0
            updatedDislikes = u.dislikes ?? 0
            return u
          }),
        }
      }
      return c
    }))
    persistVote(id, updatedLikes, updatedDislikes)
  }

  const handleReply = async (parentId: string) => {
    const text = replyDraft.trim()
    if (!text || sending) return
    setSending(true)
    const saved = await addReply(parentId, text)
    setList(cs => cs.map(c => c.id !== parentId ? c : {
      ...c,
      replies: [...(c.replies ?? []), saved ?? { id: `r-${Date.now()}`, username: 'Tú', text, timeAgo: 'ahora', tier: 1, likes: 0, dislikes: 0 }],
    }))
    setReplyDraft('')
    setReplyingTo(null)
    setSending(false)
  }

  const handleEdit = async (commentId: string, parentId?: string) => {
    const text = editDraft.trim()
    if (!text || sending) return
    setSending(true)
    const ok = await editComment(commentId, text)
    if (ok) {
      const updateText = (c: Comment): Comment =>
        c.id === commentId ? { ...c, text } : { ...c, replies: (c.replies ?? []).map(updateText) }
      setList(cs => cs.map(updateText))
    }
    setEditingId(null)
    setEditDraft('')
    setSending(false)
  }

  const handleDelete = async (commentId: string, parentId?: string) => {
    setSending(true)
    const ok = await deleteComment(commentId)
    if (ok) {
      if (parentId) {
        setList(cs => cs.map(c => c.id !== parentId ? c : { ...c, replies: (c.replies ?? []).filter(r => r.id !== commentId) }))
      } else {
        setList(cs => cs.filter(c => c.id !== commentId))
      }
    }
    setMenuOpen(null)
    setSending(false)
  }

  const startEdit = (c: Comment) => {
    setEditingId(c.id)
    setEditDraft(c.text)
    setMenuOpen(null)
  }

  // ── helpers ────────────────────────────────────────────────

  const mkAvatar = (username: string, size: number, avatarUrl?: string) => (
    avatarUrl ? (
      <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    ) : (
      <div style={{ width: size, height: size, borderRadius: '50%', background: getAvatarColor(username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 700, fontSize: Math.round(size * 0.38), color: 'var(--b1n0-text-1)', flexShrink: 0 }}>
        {username.charAt(0).toUpperCase()}
      </div>
    )
  )

  const isOwn = (c: Comment) => c.userId === myUserId || c.username === 'Tú'

  const mkBubble = (c: Comment, small = false, parentId?: string) => {
    if (editingId === c.id) {
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
          <input
            type="text" value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(c.id, parentId) }
              if (e.key === 'Escape') { setEditingId(null); setEditDraft('') }
            }}
            autoFocus
            style={{ flex: 1, background: 'var(--b1n0-surface)', border: '1.5px solid var(--b1n0-disabled-bg)', borderRadius: small ? '14px' : '16px', padding: small ? '7px 12px' : '9px 14px', fontFamily: F, fontSize: small ? '12px' : '13px', color: 'var(--b1n0-text-1)', outline: 'none' }}
          />
          <button onClick={() => handleEdit(c.id, parentId)} disabled={sending || !editDraft.trim()} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'var(--b1n0-text-1)', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '11px', color: 'var(--b1n0-bg)', opacity: (sending || !editDraft.trim()) ? 0.4 : 1 }}>
            Guardar
          </button>
          <button onClick={() => { setEditingId(null); setEditDraft('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: '6px 4px' }}>
            Cancelar
          </button>
        </div>
      )
    }

    return (
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <div style={{ background: 'var(--b1n0-surface)', borderRadius: '0 12px 12px 12px', padding: small ? '8px 12px' : '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: F, fontWeight: 700, fontSize: small ? '11px' : '12px', color: 'var(--b1n0-text-1)' }}>
              {c.username === 'Tú' ? 'Tú' : `@${c.username}`}
            </span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: tierColors[c.tier], display: 'inline-block', flexShrink: 0 }} />
            {c.side && (
              <span style={{ padding: '1px 6px', borderRadius: '8px', fontFamily: F, fontWeight: 700, fontSize: '10px', background: c.side === 'yes' ? 'var(--b1n0-disabled-bg)' : 'var(--b1n0-border)', color: c.side === 'yes' ? 'var(--b1n0-surface)' : 'var(--b1n0-muted)' }}>
                {c.side === 'yes' ? 'SÍ' : 'NO'}
              </span>
            )}
            {/* Three-dot menu for own comments */}
            {isOwn(c) && (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === c.id ? null : c.id) }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '14px', color: 'var(--b1n0-muted)', lineHeight: 1 }}
              >
                ···
              </button>
            )}
          </div>
          <p style={{ fontFamily: F, fontSize: small ? '12px' : '13px', color: 'var(--b1n0-text-1)', lineHeight: 1.5 }}>{c.text}</p>
        </div>
        {/* Dropdown menu */}
        {menuOpen === c.id && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 20,
            background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', borderRadius: '10px',
            boxShadow: '0 4px 12px var(--b1n0-border)', overflow: 'hidden', minWidth: '120px',
          }}>
            <button
              onClick={() => startEdit(c)}
              style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--b1n0-border)', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 500, color: 'var(--b1n0-text-1)', textAlign: 'left' }}
            >
              Editar
            </button>
            <button
              onClick={() => handleDelete(c.id, parentId)}
              style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '13px', fontWeight: 500, color: 'var(--b1n0-no)', textAlign: 'left' }}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    )
  }

  const mkVotebar = (c: Comment, parentId?: string) => {
    const myVote = votes[c.id]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '5px', paddingLeft: '2px' }}>
        <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>{c.timeAgo}</span>
        <button onClick={() => handleVote(c.id, 'up', parentId)} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px', color: myVote === 'up' ? 'var(--b1n0-surface)' : 'var(--b1n0-text-2)' }}>
          👍{(c.likes ?? 0) > 0 && <span style={{ fontFamily: F, fontSize: '11px', fontWeight: myVote === 'up' ? 700 : 400 }}>{c.likes}</span>}
        </button>
        <button onClick={() => handleVote(c.id, 'down', parentId)} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px', color: myVote === 'down' ? 'var(--b1n0-no)' : 'var(--b1n0-text-2)' }}>
          👎{(c.dislikes ?? 0) > 0 && <span style={{ fontFamily: F, fontSize: '11px', fontWeight: myVote === 'down' ? 700 : 400 }}>{c.dislikes}</span>}
        </button>
        {!parentId && (
          <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyDraft('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '11px', fontWeight: 600, color: replyingTo === c.id ? 'var(--b1n0-surface)' : 'var(--b1n0-text-2)', padding: 0 }}>
            Responder
          </button>
        )}
      </div>
    )
  }

  // ── render ─────────────────────────────────────────────────

  return (
    <div onClick={(e) => { e.stopPropagation(); if (menuOpen) setMenuOpen(null) }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>
          Comentarios <span style={{ fontWeight: 400, color: 'var(--b1n0-muted)' }}>({list.length})</span>
        </p>
        <div style={{ display: 'flex', background: 'var(--b1n0-surface)', borderRadius: '8px', padding: '2px' }}>
          {(['reciente', 'popular'] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: '11px', background: sort === s ? 'var(--b1n0-surface)' : 'transparent', color: sort === s ? 'var(--b1n0-text-1)' : 'var(--b1n0-muted)', transition: 'background 0.15s' }}>
              {s === 'reciente' ? 'Reciente' : 'Popular'}
            </button>
          ))}
        </div>
      </div>

      {/* Compose */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '20px' }}>
        {mkAvatar('Tú', 34, myAvatarUrl)}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Di lo que pensás..."
              style={{ flex: 1, background: 'var(--b1n0-surface)', border: '1.5px solid var(--b1n0-border)', borderRadius: '22px', padding: '10px 16px', fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-1)', outline: 'none' }}
            />
            {draft.trim() && (
              <button onClick={handleSend} disabled={sending} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--b1n0-text-1)', cursor: sending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 700, fontSize: '14px', color: 'var(--b1n0-bg)', flexShrink: 0, opacity: sending ? 0.5 : 1 }}>↑</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: '1px', background: 'var(--b1n0-surface)', marginBottom: '16px' }} />

      {/* Loading / empty state */}
      {loading && (
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', textAlign: 'center', padding: '20px 0' }}>
          Cargando comentarios…
        </p>
      )}
      {!loading && list.length === 0 && (
        <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-muted)', textAlign: 'center', padding: '20px 0' }}>
          Sé el primero en comentar.
        </p>
      )}

      {/* Comment list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {visible.map((c) => (
          <div key={c.id}>

            {/* Top-level comment */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              {mkAvatar(c.username, 34, c.avatarUrl)}
              <div style={{ flex: 1, minWidth: 0 }}>
                {mkBubble(c)}
                {mkVotebar(c)}
              </div>
            </div>

            {/* Replies */}
            {(c.replies ?? []).length > 0 && (
              <div style={{ marginTop: '12px', paddingLeft: '44px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(c.replies ?? []).map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    {mkAvatar(r.username, 26, r.avatarUrl)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {mkBubble(r, true, c.id)}
                      {mkVotebar(r, c.id)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply input */}
            {replyingTo === c.id && (
              <div style={{ marginTop: '10px', paddingLeft: '44px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {mkAvatar('Tú', 26, myAvatarUrl)}
                <input
                  type="text" value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(c.id) } }}
                  placeholder={`Responder a ${c.username}…`}
                  autoFocus
                  style={{ flex: 1, background: 'var(--b1n0-surface)', border: '1.5px solid var(--b1n0-border)', borderRadius: '18px', padding: '8px 14px', fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-1)', outline: 'none' }}
                />
                {replyDraft.trim() && (
                  <button onClick={() => handleReply(c.id)} disabled={sending} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--b1n0-text-1)', cursor: sending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 700, fontSize: '12px', color: 'var(--b1n0-bg)', flexShrink: 0, opacity: sending ? 0.5 : 1 }}>↑</button>
                )}
              </div>
            )}

          </div>
        ))}
      </div>

      {!showAll && hidden > 0 && (
        <button onClick={() => setShowAll(true)} style={{ marginTop: '14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-muted)', padding: 0 }}>
          Ver {hidden} comentario{hidden !== 1 ? 's' : ''} más
        </button>
      )}
    </div>
  )
}

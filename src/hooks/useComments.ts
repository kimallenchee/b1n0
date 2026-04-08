import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Comment } from '../types'

function timeAgoLabel(created: string): string {
  const diff = Date.now() - new Date(created).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days > 0) return `hace ${days}d`
  if (hrs > 0) return `hace ${hrs}h`
  if (mins > 1) return `hace ${mins}m`
  return 'ahora'
}

function rowToComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    username: row.username as string,
    avatarUrl: (row.avatar_url as string) ?? undefined,
    text: row.text as string,
    side: (row.side as 'yes' | 'no') ?? undefined,
    tier: ((row.tier as number) ?? 1) as 1 | 2 | 3,
    likes: (row.likes as number) ?? 0,
    dislikes: (row.dislikes as number) ?? 0,
    timeAgo: timeAgoLabel(row.created_at as string),
    replies: [],
  }
}

export function useComments(eventId: string) {
  const { profile } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    const rows = data as Record<string, unknown>[]

    // Fetch current profile data (username + avatar) for all commenters
    const userIds = [...new Set(rows.map(r => r.user_id as string).filter(Boolean))]
    const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds)
      if (profiles) {
        for (const p of profiles as { id: string; username: string; avatar_url: string | null }[]) {
          profileMap[p.id] = { username: p.username, avatar_url: p.avatar_url }
        }
      }
    }

    // Override stale denormalized username/avatar with live profile data
    const all = rows.map(row => {
      const uid = row.user_id as string
      const prof = uid ? profileMap[uid] : null
      const c = rowToComment(row)
      if (prof) {
        if (prof.username) c.username = prof.username
        if (prof.avatar_url) c.avatarUrl = prof.avatar_url
      }
      return c
    })

    const map = new Map<string, Comment>()
    all.forEach(c => map.set(c.id, { ...c }))

    const roots: Comment[] = []
    rows.forEach((row, i) => {
      const parentId = row.parent_id as string | null
      if (parentId) {
        const parent = map.get(parentId)
        if (parent) parent.replies = [...(parent.replies ?? []), all[i]]
      } else {
        roots.push(map.get(all[i].id)!)
      }
    })

    setComments(roots.reverse())
    setLoading(false)
  }, [eventId])

  useEffect(() => { load() }, [load])

  const addComment = useCallback(async (text: string, side: 'yes' | 'no' | null): Promise<Comment | null> => {
    if (!profile) return null
    const displayName = profile.username || profile.name
    const { data, error } = await supabase
      .from('comments')
      .insert({
        event_id: eventId,
        user_id: profile.id,
        username: displayName,
        avatar_url: profile.avatarUrl ?? null,
        text,
        side: side ?? null,
        tier: profile.tier,
      })
      .select()
      .single()
    if (error || !data) return null
    return rowToComment(data as Record<string, unknown>)
  }, [eventId, profile])

  const addReply = useCallback(async (parentId: string, text: string): Promise<Comment | null> => {
    if (!profile) return null
    const displayName = profile.username || profile.name
    const { data, error } = await supabase
      .from('comments')
      .insert({
        event_id: eventId,
        parent_id: parentId,
        user_id: profile.id,
        username: displayName,
        avatar_url: profile.avatarUrl ?? null,
        text,
        tier: profile.tier,
      })
      .select()
      .single()
    if (error || !data) return null
    return rowToComment(data as Record<string, unknown>)
  }, [eventId, profile])

  const editComment = useCallback(async (commentId: string, newText: string): Promise<boolean> => {
    const { error } = await supabase
      .from('comments')
      .update({ text: newText })
      .eq('id', commentId)
    return !error
  }, [])

  const deleteComment = useCallback(async (commentId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
    return !error
  }, [])

  const persistVote = useCallback(async (commentId: string, likes: number, dislikes: number) => {
    await supabase.from('comments').update({ likes, dislikes }).eq('id', commentId)
  }, [])

  return { comments, loading, addComment, addReply, editComment, deleteComment, persistVote }
}

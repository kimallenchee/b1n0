import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read: boolean
  createdAt: string
}

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismissOne: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  refresh: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    body: (row.body as string) ?? '',
    data: (row.data as Record<string, unknown>) ?? {},
    read: row.read as boolean,
    createdAt: row.created_at as string,
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [notifications, setNotifications] = useState<Notification[]>([])

  const load = useCallback(async () => {
    if (!userId) { setNotifications([]); return }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNotifications((data as Record<string, unknown>[]).map(rowToNotification))
  }, [userId])

  useEffect(() => { load() }, [load])

  // Realtime: new notifications appear live
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifs-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = rowToNotification(payload.new as Record<string, unknown>)
          setNotifications(prev => [n, ...prev])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    if (userId) {
      await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    }
  }, [userId])

  const dismissOne = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id)
  }, [])

  const clearAll = useCallback(async () => {
    setNotifications([])
    if (userId) {
      await supabase.from('notifications').delete().eq('user_id', userId)
    }
  }, [userId])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, dismissOne, clearAll, refresh: load }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications outside NotificationProvider')
  return ctx
}

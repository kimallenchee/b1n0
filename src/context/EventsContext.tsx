import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Event } from '../types'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { withRetry } from '../lib/retry'

interface EventsContextValue {
  events: Event[]
  resolvedEvents: Event[]
  loading: boolean
  error: string | null
  getEvent: (id: string) => Event | undefined
  refetch: () => void
}

const EventsContext = createContext<EventsContextValue>({
  events: [],
  resolvedEvents: [],
  loading: true,
  error: null,
  getEvent: () => undefined,
  refetch: () => {},
})

function rowToEvent(row: Record<string, unknown>): Event {
  // event_markets is joined as an array; grab first element for live pool_total
  const mkt = Array.isArray(row.event_markets) && row.event_markets.length > 0
    ? (row.event_markets[0] as Record<string, unknown>)
    : null
  const livePool = mkt ? Number(mkt.pool_total ?? 0) : 0

  return {
    id: row.id as string,
    question: row.question as string,
    category: row.category as Event['category'],
    subtype: row.subtype as Event['subtype'] | undefined,
    sponsor: { name: (row.sponsor_name as string) ?? '' },
    eventType: ((row.event_type as string) ?? 'binary') as 'binary' | 'open',
    yesPercent: row.yes_percent as number,
    noPercent: row.no_percent as number,
    options: row.options as string[] | undefined,
    considerations: row.considerations as string | undefined,
    poolSize: livePool > 0 ? livePool : (row.pool_size as number),
    currency: (row.currency as string) as 'Q' | '$',
    timeRemaining: row.time_remaining as string,
    isLive: row.is_live as boolean,
    minEntry: row.min_entry as number,
    maxEntry: row.max_entry as number,
    tierRequired: row.tier_required as 1 | 2 | 3,
    status: row.status as Event['status'],
    result: row.result as Event['result'] | undefined,
    endsAt: row.ends_at as string | undefined,
    createdAt: row.created_at as string | undefined,
    imageUrl: row.image_url as string | undefined,
    country: row.country as string | undefined,
  }
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [resolvedEvents, setResolvedEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function fetchEvents() {
      const [openResult, resolvedResult] = await Promise.all([
        withRetry(() =>
          supabase
            .from('events')
            .select('*, event_markets(pool_total)')
            .in('status', ['open', 'private'])
            .order('created_at', { ascending: false })
        ),
        withRetry(() =>
          supabase
            .from('events')
            .select('*, event_markets(pool_total)')
            .in('status', ['resolved', 'closed'])
            .order('created_at', { ascending: false })
            .limit(50)
        ),
      ])

      if (cancelled) return

      if (openResult.error) {
        setError('No se pudieron cargar los eventos. Intentá de nuevo.')
        setEvents([])
      } else {
        setEvents((openResult.data as Record<string, unknown>[]).map(rowToEvent))
      }

      if (resolvedResult.error) {
        // Non-critical — resolved events failing shouldn't block the app
        setResolvedEvents([])
      } else {
        setResolvedEvents((resolvedResult.data as Record<string, unknown>[]).map(rowToEvent))
      }

      setLoading(false)
    }

    fetchEvents()
    return () => { cancelled = true }
  }, [tick])

  const getEvent = useCallback((id: string) => {
    return events.find((e) => e.id === id) || resolvedEvents.find((e) => e.id === id)
  }, [events, resolvedEvents])

  function refetch() {
    setTick((t) => t + 1)
  }

  return (
    <EventsContext.Provider value={{ events, resolvedEvents, loading, error, getEvent, refetch }}>
      {children}
    </EventsContext.Provider>
  )
}

export function useEvents() {
  return useContext(EventsContext)
}

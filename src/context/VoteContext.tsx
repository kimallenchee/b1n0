import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { mockUser, mockPredictions } from '../data/mockEvents'
import type { Event, UserPrediction } from '../types'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

function calcCobro(amount: number, sidePercent: number): number {
  if (sidePercent === 0) return 0
  const net = amount * 0.975 // after 2.5% fee
  return Math.round((net / (sidePercent / 100)) * 100) / 100
}

function compositeLabel(s: string): string {
  return s.includes('::') ? s.split('::')[0] : s
}
function compositeDir(s: string): 'yes' | 'no' {
  return s.includes('::') ? (s.split('::')[1] as 'yes' | 'no') : 'yes'
}

interface Vote {
  side: string
  amount: number
  potentialCobro: number
}

interface VoteContextValue {
  balance: number
  votes: Record<string, Vote>
  predictions: UserPrediction[]
  hasVoted: (eventId: string) => boolean
  getVote: (eventId: string) => Vote | null
  castVote: (eventId: string, side: string, amount: number, event: Event, skipRpc?: boolean) => Promise<string | null>
  refreshPredictions: () => Promise<void>
}

const VoteContext = createContext<VoteContextValue | null>(null)

function buildEventFromRow(e: Record<string, unknown>): Event {
  return {
    id: e.id as string,
    question: e.question as string,
    category: e.category as Event['category'],
    subtype: e.subtype as Event['subtype'] | undefined,
    sponsor: { name: e.sponsor_name as string },
    eventType: ((e.event_type as string) ?? 'binary') as 'binary' | 'open',
    options: e.options as string[] | undefined,
    yesPercent: Number(e.yes_percent) || 0,
    noPercent: Number(e.no_percent) || 0,
    poolSize: Number(e.pool_size) || 0,
    currency: (e.currency as string) as 'Q' | '$',
    timeRemaining: e.time_remaining as string,
    isLive: e.is_live as boolean,
    minEntry: Number(e.min_entry) || 0,
    maxEntry: Number(e.max_entry) || 0,
    tierRequired: (Number(e.tier_required) || 1) as 1 | 2 | 3,
    status: e.status as Event['status'],
    result: e.result as Event['result'] | undefined,
    endsAt: e.ends_at as string | undefined,
    createdAt: (e.created_at as string)?.split('T')[0],
    country: e.country as string | undefined,
  }
}

function rowToPrediction(row: Record<string, unknown>, eventMap: Record<string, Event>): UserPrediction | null {
  const eventId = row.event_id as string
  const event = eventMap[eventId]
  if (!event) return null
  return {
    id: row.id as string,
    eventId,
    event,
    side: row.side as string,
    amount: Number(row.amount) || 0,
    potentialCobro: Number(row.potential_cobro) || 0,
    status: row.status as 'active' | 'won' | 'lost',
    createdAt: (row.created_at as string)?.split('T')[0],
    resolvedAt: row.resolved_at as string | undefined,
  }
}

function positionToPrediction(row: Record<string, unknown>, eventMap: Record<string, Event>): UserPrediction | null {
  const eventId = row.event_id as string
  const event = eventMap[eventId]
  if (!event) return null
  return {
    id: row.id as string,
    eventId,
    event,
    side: row.side as string,
    amount: Number(row.gross_amount) || 0,
    potentialCobro: Number(row.payout_if_win) || 0,
    status: row.status as 'active' | 'won' | 'lost' | 'sold',
    createdAt: (row.created_at as string)?.split('T')[0],
  }
}

export function VoteProvider({ children }: { children: ReactNode }) {
  const { session, profile, refreshProfile } = useAuth()

  const [balance, setBalance] = useState(mockUser.balance)
  const [votes, setVotes] = useState<Record<string, Vote>>({})
  const [dbPredictions, setDbPredictions] = useState<UserPrediction[]>([])

  // Keep a stable ref so the realtime callback can call refresh without stale closure
  const sessionUserIdRef = useRef<string | null>(null)
  useEffect(() => { sessionUserIdRef.current = session?.user?.id ?? null }, [session?.user?.id])

  // Sync balance from profile
  useEffect(() => {
    if (profile) setBalance(profile.balance)
    else setBalance(mockUser.balance)
  }, [profile?.balance])

  // ── Load & refresh predictions from DB ──────────────────────────────────────

  const loadPredictions = useCallback(async (userId: string) => {
    // Fetch positions and predictions WITHOUT embedded joins
    // (neither table may have FK to events, which makes PostgREST error)
    const { data: posData } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const { data: predData } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    // Debug log removed — use error tracking service instead

    // Collect all unique event IDs from both tables
    const allEventIds = new Set<string>()
    if (posData) {
      for (const row of posData as Record<string, unknown>[]) {
        if (row.event_id) allEventIds.add(row.event_id as string)
      }
    }
    if (predData) {
      for (const row of predData as Record<string, unknown>[]) {
        if (row.event_id) allEventIds.add(row.event_id as string)
      }
    }

    // Fetch all referenced events in one batch
    const eventMap: Record<string, Event> = {}
    const allPreds: UserPrediction[] = []
    const eventIds = [...allEventIds]
    if (eventIds.length > 0) {
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
      if (eventsData) {
        for (const e of eventsData as Record<string, unknown>[]) {
          eventMap[e.id as string] = buildEventFromRow(e)
        }
      }
    }

    // Build predictions list from positions (individual trades)
    if (posData) {
      for (const r of posData as Record<string, unknown>[]) {
        const p = positionToPrediction(r, eventMap)
        if (p) allPreds.push(p)
      }
    }

    // Add predictions — skip if same ID already in from positions
    // Also skip prediction rows for events that already have positions
    // (positions = individual trades, predictions = aggregate — don't double-show)
    const posEventSides = new Set(
      allPreds.map((p) => `${p.eventId}:${p.side}`)
    )
    if (predData) {
      for (const r of predData as Record<string, unknown>[]) {
        const eid = (r as Record<string, unknown>).event_id as string
        const side = (r as Record<string, unknown>).side as string
        // Skip prediction aggregates for binary events already shown via positions
        if (posEventSides.has(`${eid}:${side}`)) continue
        const p = rowToPrediction(r, eventMap)
        if (p) allPreds.push(p)
      }
    }

    // Debug log removed — use error tracking service instead

    setDbPredictions(allPreds)

    // Rebuild votes map — aggregate by event (for hasVoted check)
    const votesMap: Record<string, Vote> = {}
    for (const p of allPreds) {
      if (votesMap[p.eventId]) {
        votesMap[p.eventId].amount += p.amount
        votesMap[p.eventId].potentialCobro += p.potentialCobro
      } else {
        votesMap[p.eventId] = { side: p.side, amount: p.amount, potentialCobro: p.potentialCobro }
      }
    }
    setVotes(votesMap)
  }, [])

  const refreshPredictions = useCallback(async () => {
    const uid = sessionUserIdRef.current
    if (uid) await loadPredictions(uid)
  }, [loadPredictions])

  // ── Initial load + realtime subscription ───────────────────────────────────

  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) {
      setDbPredictions([])
      setVotes({})
      return
    }

    // Initial fetch
    loadPredictions(uid)

    // Realtime: listen for position updates (won/lost after event resolution)
    const channel = supabase
      .channel(`positions-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'positions', filter: `user_id=eq.${uid}` },
        (payload) => {
          const updated = payload.new as { id: string; status: string }
          setDbPredictions((prev) =>
            prev.map((p) =>
              p.id === updated.id
                ? { ...p, status: updated.status as 'active' | 'won' | 'lost' }
                : p
            )
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'positions', filter: `user_id=eq.${uid}` },
        () => { loadPredictions(uid) }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'predictions', filter: `user_id=eq.${uid}` },
        () => { loadPredictions(uid) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, loadPredictions])

  // ── castVote ────────────────────────────────────────────────────────────────

  async function castVote(eventId: string, side: string, amount: number, event: Event, skipRpc = false): Promise<string | null> {
    let sidePercent: number
    if (event.eventType === 'open' && event.options) {
      const label = compositeLabel(side)
      const dir   = compositeDir(side)
      const match = event.options.find((o) => {
        const parts = o.split(':')
        const optLabel = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(':') : parts.length === 2 ? parts[0] : o
        return optLabel === label
      })
      if (match) {
        const parts = match.split(':')
        const pct = parts.length >= 3 ? parseFloat(parts[parts.length - 2]) || 0 : parts.length === 2 ? parseFloat(parts[1]) || 0 : 0
        sidePercent = dir === 'yes' ? pct : 100 - pct
      } else {
        sidePercent = 0
      }
    } else {
      sidePercent = side === 'yes' ? event.yesPercent : event.noPercent
    }
    const potentialCobro = calcCobro(amount, sidePercent)

    // Optimistic local update (shown immediately in UI)
    const prevVote = votes[eventId]
    const isSameSide = prevVote?.side === side

    // For open events with a different side, accumulate rather than replace
    if (prevVote && !isSameSide) {
      setVotes((prev) => ({
        ...prev,
        [eventId]: { side: prevVote.side, amount: prevVote.amount + amount, potentialCobro: prevVote.potentialCobro + potentialCobro },
      }))
    } else {
      setVotes((prev) => ({ ...prev, [eventId]: { side, amount, potentialCobro } }))
    }

    // Add optimistic prediction to dbPredictions so it shows immediately in MisVotos
    if (event.eventType === 'open' && !isSameSide) {
      const today = new Date().toISOString().split('T')[0]
      const tempPred: UserPrediction = {
        id: `temp-${eventId}-${side}-${Date.now()}`,
        eventId, event, side, amount, potentialCobro, status: 'active', createdAt: today,
      }
      setDbPredictions((prev) => [tempPred, ...prev])
    }

    // When skipRpc=true, execute_purchase already deducted balance atomically.
    // Don't adjust optimistically — refreshProfile() will sync the correct value.
    if (!skipRpc) {
      // Only add back previous amount if updating the SAME side (replacing)
      const addBack = isSameSide ? (prevVote?.amount ?? 0) : 0
      setBalance((prev) => Math.max(0, prev - amount + addBack))
    }

    if (session?.user?.id) {
      if (!skipRpc) {
        const { data: rpcData, error } = await supabase.rpc('cast_vote', {
          p_event_id: eventId,
          p_side: side,
          p_amount: amount,
          p_potential_cobro: potentialCobro,
        })
        if (error) {
          // TODO: Send to Sentry when integrated
          // Rollback optimistic update
          if (prevVote) {
            setVotes((prev) => ({ ...prev, [eventId]: prevVote }))
            // Only subtract back what we incorrectly didn't add
            const addBack = isSameSide ? (prevVote?.amount ?? 0) : 0
            setBalance((prev) => prev + amount - addBack)
          } else {
            setVotes((prev) => { const next = { ...prev }; delete next[eventId]; return next })
            setBalance((prev) => prev + amount)
          }
          // Remove optimistic prediction if we added one
          if (event.eventType === 'open' && !isSameSide) {
            setDbPredictions((prev) => prev.filter((p) => !(p.id.startsWith('temp-') && p.eventId === eventId && p.side === side)))
          }
          return error.message || 'Error al procesar tu voto. Intentá de nuevo.'
        }
      }

      // Sync DB state (removes duplicates, gets real IDs)
      await loadPredictions(session.user.id)
      await refreshProfile()
    } else {
      // Unauthenticated: keep mock optimistic prediction
      const today = new Date().toISOString().split('T')[0]
      const tempPred: UserPrediction = {
        id: `s-${eventId}-${Date.now()}`,
        eventId,
        event,
        side,
        amount,
        potentialCobro,
        status: 'active',
        createdAt: today,
      }
      setDbPredictions((prev) => [tempPred, ...prev.filter((p) => !(p.eventId === eventId && p.side === side))])
    }
    return null
  }

  const predictions = session
    ? dbPredictions
    : [...dbPredictions, ...mockPredictions]

  return (
    <VoteContext.Provider
      value={{
        balance,
        votes,
        predictions,
        hasVoted: (id) => id in votes,
        getVote: (id) => votes[id] ?? null,
        castVote,
        refreshPredictions,
      }}
    >
      {children}
    </VoteContext.Provider>
  )
}

export function useVotes() {
  const ctx = useContext(VoteContext)
  if (!ctx) throw new Error('useVotes outside VoteProvider')
  return ctx
}

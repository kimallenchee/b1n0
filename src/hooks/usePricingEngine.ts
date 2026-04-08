/**
 * usePricingEngine
 *
 * Bridges the pure pricing module (src/lib/pricing.ts) with Supabase RPCs.
 *
 * - preview*  → pure TypeScript (instant, no network, used for UI)
 * - execute*  → Supabase RPC (atomic, authoritative, uses NUMERIC in DB)
 */

import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  previewPurchase,
  getCurrentPrices,
  getPoolStatus,
  type MarketState,
  type PurchasePreview,
  type Prices,
  type PoolStatus,
} from '../lib/pricing'

// ── Types returned by Supabase RPCs ─────────────────────────

export interface ExecutePurchaseResult {
  positionId: string
  contracts: number
  priceAtPurchase: number
  payoutIfWin: number
  feePaid: number
  grossAmount: number
  yesPrice: number
  noPrice: number
  poolRemaining: number
}

export interface SettlementResult {
  result: 'yes' | 'no'
  payouts: Array<{
    userId: string
    positionId: string
    payout: number
    outcome: 'won' | 'lost'
  }>
}

// ── Hook ────────────────────────────────────────────────────

export function usePricingEngine(market: MarketState | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  // Readable synchronously inside async callbacks (state updates are deferred)
  const lastErrorRef = useRef<string | null>(null)

  // ── Pure UI helpers (no network) ──────────────────────────

  const prices: Prices | null         = market ? getCurrentPrices(market) : null
  const midPrices: Prices | null      = prices
  const poolStatus: PoolStatus | null = market ? getPoolStatus(market) : null

  function preview(side: 'yes' | 'no', grossAmount: number): PurchasePreview | null {
    if (!market) return null
    return previewPurchase(market, side, grossAmount)
  }

  // ── Supabase: preview_purchase RPC (authoritative, read-only) ─

  const previewPurchaseRpc = useCallback(async (
    eventId: string,
    side: 'yes' | 'no',
    grossAmount: number,
  ): Promise<PurchasePreview | null> => {
    const { data, error: rpcErr } = await supabase.rpc('preview_purchase', {
      p_event_id: eventId,
      p_side:     side,
      p_gross:    grossAmount,
    })

    if (rpcErr || !data) return null
    if (!data.valid) return null

    return {
      grossAmount,
      fee:            data.fee         as number,
      feeRate:        (data.fee_rate as number) ?? 0,
      net:            data.net         as number,
      price:          data.price       as number,
      midPrice:       (data.mid_price as number) ?? 0,
      spreadRate:     (data.spread_rate as number) ?? 0,
      spreadCaptured: 0,
      contracts:      data.contracts   as number,
      payoutIfWin:    data.payout_if_win as number,
      yesLiaAfter:    0,
      noLiaAfter:     0,
      poolAfter: {
        committed: data.pool_committed as number,
        remaining: data.pool_remaining as number,
        pctUsed:   data.pool_total > 0 ? (data.pool_committed / data.pool_total) : 0,
      },
      valid:  true,
    }
  }, [])

  // ── Supabase: execute_purchase ────────────────────────────

  const executePurchase = useCallback(async (
    eventId: string,
    userId: string,
    side: 'yes' | 'no',
    grossAmount: number,
  ): Promise<ExecutePurchaseResult | null> => {
    setLoading(true)
    lastErrorRef.current = null
    setError(null)

    const { data, error: rpcErr } = await supabase.rpc('execute_purchase', {
      p_event_id: eventId,
      p_user_id:  userId,
      p_side:     side,
      p_gross:    grossAmount,
    })

    setLoading(false)

    if (rpcErr || !data) {
      const msg = rpcErr?.message ?? 'Unknown error'
      lastErrorRef.current = msg
      setError(msg)
      return null
    }

    if (data.error) {
      const msg = data.error as string
      lastErrorRef.current = msg
      setError(msg)
      return null
    }

    return {
      positionId:      data.position_id      as string,
      contracts:       data.contracts        as number,
      priceAtPurchase: data.price_at_purchase as number,
      payoutIfWin:     data.payout_if_win    as number,
      feePaid:         data.fee_paid         as number,
      grossAmount:     data.gross_amount     as number,
      yesPrice:        data.yes_price_new    as number,
      noPrice:         data.no_price_new     as number,
      poolRemaining:   data.pool_remaining   as number,
    }
  }, [])

  // ── Supabase: settle_event (admin only) ───────────────────

  const settleEvent = useCallback(async (
    eventId: string,
    result: 'yes' | 'no',
  ): Promise<SettlementResult | null> => {
    setLoading(true)
    setError(null)

    const { data, error: rpcErr } = await supabase.rpc('settle_event', {
      p_event_id: eventId,
      p_result:   result,
    })

    setLoading(false)

    if (rpcErr || !data) {
      setError(rpcErr?.message ?? 'Unknown error')
      return null
    }

    if (data.error) {
      setError(data.error as string)
      return null
    }

    return data as SettlementResult
  }, [])

  // ── Supabase: fetch market state for an event ─────────────

  const fetchMarket = useCallback(async (
    eventId: string,
  ): Promise<MarketState | null> => {
    const { data, error: fetchErr } = await supabase
      .from('event_markets')
      .select('*')
      .eq('event_id', eventId)
      .single()

    if (fetchErr || !data) return null

    return {
      eventId:            data.event_id            as string,
      poolTotal:          data.pool_total          as number,
      poolCommitted:      data.pool_committed      as number,
      maxYesLiability:    data.max_yes_liability   as number,
      maxNoLiability:     data.max_no_liability    as number,
      yesShares:          data.yes_shares          as number,
      noShares:           data.no_shares           as number,
      spreadEnabled:      (data.spread_enabled as boolean) ?? true,
      status:             data.status              as MarketState['status'],
      result:             data.result              as 'yes' | 'no' | undefined,
    }
  }, [])

  // ── Option markets (open/multi-outcome events) ──────────────

  interface OptionMarketState {
    optionLabel: string
    yesShares: number
    noShares: number
    poolTotal: number
    poolCommitted: number
    spreadEnabled: boolean
    status: string
  }

  const fetchOptionMarkets = useCallback(async (
    eventId: string,
  ): Promise<OptionMarketState[]> => {
    const { data, error: fetchErr } = await supabase
      .from('option_markets')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'open')

    if (fetchErr || !data) return []

    return (data as Record<string, unknown>[]).map((row) => ({
      optionLabel:   row.option_label    as string,
      yesShares:     Number(row.yes_shares) || 500,
      noShares:      Number(row.no_shares) || 500,
      poolTotal:     Number(row.pool_total) || 0,
      poolCommitted: Number(row.pool_committed) || 0,
      spreadEnabled: (row.spread_enabled as boolean) ?? true,
      status:        row.status as string,
    }))
  }, [])

  const previewOptionPurchase = useCallback(async (
    eventId: string,
    optionLabel: string,
    side: 'yes' | 'no',
    grossAmount: number,
  ): Promise<PurchasePreview | null> => {
    const { data, error: rpcErr } = await supabase.rpc('preview_option_purchase', {
      p_event_id:     eventId,
      p_option_label: optionLabel,
      p_side:         side,
      p_gross:        grossAmount,
    })

    if (rpcErr || !data) return null
    if (!data.valid) {
      return {
        grossAmount,
        fee: 0, net: 0, price: 0, midPrice: 0, spreadRate: 0, spreadCaptured: 0,
        contracts: 0, payoutIfWin: 0,
        yesLiaAfter: 0, noLiaAfter: 0,
        poolAfter: { committed: 0, remaining: 0, pctUsed: 0 },
        valid: false,
        reason: data.reason as string,
      }
    }

    return {
      grossAmount,
      fee:            Number(data.fee) || 0,
      feeRate:        Number(data.fee_rate) || 0,
      net:            Number(data.net) || 0,
      price:          Number(data.price) || 0,
      midPrice:       Number(data.mid_price) || 0,
      spreadRate:     Number(data.spread_rate) || 0,
      spreadCaptured: 0,
      contracts:      Number(data.contracts) || 0,
      payoutIfWin:    Number(data.payout_if_win) || 0,
      yesLiaAfter:    0,
      noLiaAfter:     0,
      poolAfter: {
        committed: Number(data.pool_committed) || 0,
        remaining: Number(data.pool_remaining) || 0,
        pctUsed:   Number(data.pool_total) > 0 ? (Number(data.pool_committed) / Number(data.pool_total)) : 0,
      },
      valid: true,
    }
  }, [])

  const executeOptionPurchase = useCallback(async (
    eventId: string,
    userId: string,
    optionLabel: string,
    side: 'yes' | 'no',
    grossAmount: number,
  ): Promise<ExecutePurchaseResult | null> => {
    setLoading(true)
    lastErrorRef.current = null
    setError(null)

    const { data, error: rpcErr } = await supabase.rpc('execute_option_purchase', {
      p_event_id:     eventId,
      p_user_id:      userId,
      p_option_label: optionLabel,
      p_side:         side,
      p_gross:        grossAmount,
    })

    setLoading(false)

    if (rpcErr || !data) {
      const msg = rpcErr?.message ?? 'Unknown error'
      lastErrorRef.current = msg
      setError(msg)
      return null
    }

    if (data.error) {
      const msg = data.error as string
      lastErrorRef.current = msg
      setError(msg)
      return null
    }

    return {
      positionId:      data.position_id      as string,
      contracts:       Number(data.contracts) || 0,
      priceAtPurchase: Number(data.price_at_purchase) || 0,
      payoutIfWin:     Number(data.payout_if_win) || 0,
      feePaid:         Number(data.fee_paid) || 0,
      grossAmount:     Number(data.gross_amount) || 0,
      yesPrice:        Number(data.yes_price_new) || 0,
      noPrice:         Number(data.no_price_new) || 0,
      poolRemaining:   Number(data.pool_remaining) || 0,
    }
  }, [])

  return {
    // pure helpers
    prices,
    midPrices,
    poolStatus,
    preview,
    // async actions
    previewPurchaseRpc,
    executePurchase,
    settleEvent,
    fetchMarket,
    // option market actions
    fetchOptionMarkets,
    previewOptionPurchase,
    executeOptionPurchase,
    // state
    lastErrorRef,
    loading,
    error,
  }
}

/**
 * b1n0 Pricing Engine v2 — pure module, no side effects, fully unit-testable.
 *
 * Math summary:
 *   mid_yes    = yes_shares / (yes_shares + no_shares)
 *   mid_no     = no_shares  / (yes_shares + no_shares)
 *   skew       = |mid - 0.50| / 0.50              (0 = balanced, 1 = extreme)
 *   spread     = 4% + 4% × skew                   (4% at 50/50, 8% at extremes)
 *   ask_price  = mid + spread/2                    (buyer pays above mid)
 *   fee        = round(gross × 0.025, 2)
 *   net        = gross - fee
 *   contracts  = round(net / ask_price, 4)         ← also = payoutIfWin
 *   liability cap: max(max_yes_liability, max_no_liability) ≤ pool_total
 *
 * All money amounts use round2 (2 d.p.). Shares/contracts use round4 (4 d.p.).
 * Prices (mid, ask, bid, spread) use round6 (6 d.p.) to match Postgres NUMERIC(10,6).
 * The Postgres layer uses NUMERIC(12,2) for amounts and NUMERIC(14,4) for shares.
 */

export let FEE_RATE    = 0.025   // legacy — buy fee now dynamic, this is fallback
export let FEE_FLOOR   = 0.01   // min buy fee
export let FEE_CEILING = 0.05   // max buy fee
export let SELL_FEE_RATE = 0.02 // flat sell fee
export let DEPTH_THRESHOLD = 50000
export let MIN_PRICE   = 0.01
export let MAX_PRICE   = 0.99
export let SPREAD_LOW  = 0.01   // default, overridden by platform_config
export let SPREAD_HIGH = 0.02   // default, overridden by platform_config

/** Call once on app init to sync with platform_config */
export function setPricingRates(rates: {
  spreadLow?: number; spreadHigh?: number; feeRate?: number;
  feeFloor?: number; feeCeiling?: number; sellFeeRate?: number;
  depthThreshold?: number;
}) {
  if (rates.spreadLow !== undefined) SPREAD_LOW = rates.spreadLow
  if (rates.spreadHigh !== undefined) SPREAD_HIGH = rates.spreadHigh
  if (rates.feeRate !== undefined) FEE_RATE = rates.feeRate
  if (rates.feeFloor !== undefined) FEE_FLOOR = rates.feeFloor
  if (rates.feeCeiling !== undefined) FEE_CEILING = rates.feeCeiling
  if (rates.sellFeeRate !== undefined) SELL_FEE_RATE = rates.sellFeeRate
  if (rates.depthThreshold !== undefined) DEPTH_THRESHOLD = rates.depthThreshold
}

/** Calculate dynamic buy fee based on skew + pool depth */
export function getDynamicFeeRate(midPrice: number, poolTotal: number): number {
  const skew = Math.abs(midPrice - 0.50) / 0.50
  const depthFactor = Math.min(poolTotal / Math.max(DEPTH_THRESHOLD, 1), 1.0)
  const fee = FEE_CEILING - (FEE_CEILING - FEE_FLOOR) * skew * depthFactor
  return Math.max(Math.min(fee, FEE_CEILING), FEE_FLOOR)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

/** 6 d.p. — matches Postgres NUMERIC(10,6) for intermediate price calcs. */
export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

// ─── Market state snapshot ───────────────────────────────────────────────────

export interface MarketState {
  eventId: string
  poolTotal: number          // Q — funded by sponsor
  poolCommitted: number      // Q — max(yes_lia, no_lia) — true exposure
  maxYesLiability: number    // Q — sum of payout_if_win for all YES positions
  maxNoLiability: number     // Q — sum of payout_if_win for all NO positions
  yesShares: number          // synthetic liquidity units
  noShares: number
  spreadEnabled: boolean     // dynamic spread (4–8%) active?
  status: 'open' | 'settled' | 'voided'
  result?: 'yes' | 'no'
}

export interface Prices {
  yes: number
  no: number
}

// ─── 1. get_current_prices ───────────────────────────────────────────────────

/** Raw mid-market prices (no spread). */
export function getCurrentPrices(market: MarketState): Prices {
  const total = market.yesShares + market.noShares
  if (total === 0) return { yes: 0.5, no: 0.5 }
  const yes = round6(market.yesShares / total)
  const no  = round6(market.noShares  / total)
  return { yes, no }
}

// ─── 1b. get_ask_price (mid + dynamic spread) ───────────────────────────────

export interface AskPriceResult {
  midPrice: number
  askPrice: number
  spreadRate: number
}

/** Apply dynamic spread: 4% at 50/50 → 8% at extremes. */
export function getAskPrice(midPrice: number, spreadEnabled: boolean): AskPriceResult {
  if (!spreadEnabled) {
    return { midPrice, askPrice: midPrice, spreadRate: 0 }
  }
  const skew       = Math.abs(midPrice - 0.50) / 0.50
  const spreadRate = SPREAD_LOW + (SPREAD_HIGH - SPREAD_LOW) * skew
  const halfSpread = round6(spreadRate / 2)
  const askPrice   = Math.min(Math.max(midPrice + halfSpread, 0.02), MAX_PRICE)
  return { midPrice, askPrice: round6(askPrice), spreadRate: round6(spreadRate) }
}

/**
 * Convert a mid-price percentage (0–100) to display ask price (0–1 decimal).
 * Used across UI to show what the user will actually pay.
 */
export function midPctToAsk(midPct: number): number {
  const mid = midPct / 100
  const { askPrice } = getAskPrice(mid, true)
  return askPrice
}

// ─── 1c. get_bid_price (mid - dynamic spread) ───────────────────────────────

export interface BidPriceResult {
  midPrice: number
  bidPrice: number
  spreadRate: number
}

/** Bid price = mid - half_spread. What a seller receives per contract. */
export function getBidPrice(midPrice: number, spreadEnabled: boolean): BidPriceResult {
  if (!spreadEnabled) {
    return { midPrice, bidPrice: midPrice, spreadRate: 0 }
  }
  const skew       = Math.abs(midPrice - 0.50) / 0.50
  const spreadRate = SPREAD_LOW + (SPREAD_HIGH - SPREAD_LOW) * skew
  const halfSpread = round6(spreadRate / 2)
  const bidPrice   = Math.max(midPrice - halfSpread, MIN_PRICE)
  return { midPrice, bidPrice: round6(bidPrice), spreadRate: round6(spreadRate) }
}

/**
 * Convert a mid-price percentage (0–100) to bid price (0–1 decimal).
 * Used in sell flow to show what the user would receive per contract.
 */
export function midPctToBid(midPct: number): number {
  const mid = midPct / 100
  const { bidPrice } = getBidPrice(mid, true)
  return bidPrice
}

// ─── 2. preview_purchase ─────────────────────────────────────────────────────

export interface PurchasePreview {
  grossAmount: number
  fee: number
  feeRate?: number        // dynamic fee rate (0-1), e.g. 0.05 = 5%
  net: number
  price: number          // ask price (with spread)
  midPrice: number       // raw mid price
  spreadRate: number     // spread % applied (0 if disabled)
  spreadCaptured: number // Q saved by spread (reduced liability)
  contracts: number      // = payoutIfWin
  payoutIfWin: number
  yesLiaAfter: number
  noLiaAfter: number
  poolAfter: {
    committed: number    // max(yesLiaAfter, noLiaAfter)
    remaining: number
    pctUsed: number
  }
  valid: boolean
  reason?: string
}

export function previewPurchase(
  market: MarketState,
  side: 'yes' | 'no',
  grossAmount: number,
): PurchasePreview {
  const mid   = getCurrentPrices(market)
  const midPrice = side === 'yes' ? mid.yes : mid.no
  const { askPrice: price, spreadRate } = getAskPrice(midPrice, market.spreadEnabled)

  // Dynamic fee: ceiling - (ceiling - floor) × skew × depth_factor
  const skew = Math.abs(midPrice - 0.5) / 0.5
  const depthFactor = FEE_CEILING > 0 && DEPTH_THRESHOLD > 0
    ? Math.min(market.poolTotal / DEPTH_THRESHOLD, 1.0)
    : 0
  const dynamicFeeRate = Math.max(Math.min(
    FEE_CEILING - (FEE_CEILING - FEE_FLOOR) * skew * depthFactor,
    FEE_CEILING), FEE_FLOOR)
  const feeRate = dynamicFeeRate > 0 ? dynamicFeeRate : FEE_RATE
  const fee         = round2(grossAmount * feeRate)
  const net         = round2(grossAmount - fee)
  const contracts   = round4(net / price)
  const payoutIfWin = round2(contracts)   // 1 contract = Q1 payout

  // Spread captured = contracts at mid - contracts at ask (in Q)
  const contractsAtMid = midPrice > 0 ? round4(net / midPrice) : contracts
  const spreadCaptured = round2(Math.max(contractsAtMid - contracts, 0))

  const yesLiaAfter = side === 'yes'
    ? round2(market.maxYesLiability + payoutIfWin)
    : market.maxYesLiability
  const noLiaAfter  = side === 'no'
    ? round2(market.maxNoLiability + payoutIfWin)
    : market.maxNoLiability

  const committedAfter = Math.max(yesLiaAfter, noLiaAfter)
  const remaining      = round2(market.poolTotal - committedAfter)
  const pctUsed        = market.poolTotal > 0
    ? round4(committedAfter / market.poolTotal)
    : 0

  let valid = true
  let reason: string | undefined

  if (grossAmount <= 0) {
    valid = false; reason = 'Amount must be positive'
  } else if (price <= 0 || price > 1) {
    valid = false; reason = 'Invalid price'
  } else if (committedAfter > market.poolTotal) {
    valid = false; reason = 'Pool cap reached — mercado lleno'
  } else if (market.status !== 'open') {
    valid = false; reason = `Market is ${market.status}`
  }

  return {
    grossAmount,
    fee,
    feeRate,
    net,
    price,
    midPrice,
    spreadRate,
    spreadCaptured,
    contracts,
    payoutIfWin,
    yesLiaAfter,
    noLiaAfter,
    poolAfter: { committed: committedAfter, remaining, pctUsed },
    valid,
    reason,
  }
}

// ─── 3. execute_purchase (pure state transform) ──────────────────────────────

export interface Position {
  id: string            // generated by caller (e.g. crypto UUID)
  eventId: string
  userId: string
  side: 'yes' | 'no'
  contracts: number
  priceAtPurchase: number
  payoutIfWin: number
  feePaid: number
  grossAmount: number
  status: 'active' | 'won' | 'lost' | 'voided'
  createdAt: string
}

export interface ExecuteResult {
  position: Position | null
  marketAfter: MarketState | null
  error?: string
}

export function executePurchase(
  market: MarketState,
  userId: string,
  side: 'yes' | 'no',
  grossAmount: number,
  positionId: string,
): ExecuteResult {
  const preview = previewPurchase(market, side, grossAmount)

  if (!preview.valid) {
    return { position: null, marketAfter: null, error: preview.reason }
  }

  const position: Position = {
    id: positionId,
    eventId: market.eventId,
    userId,
    side,
    contracts: preview.contracts,
    priceAtPurchase: preview.price,
    payoutIfWin: preview.payoutIfWin,
    feePaid: preview.fee,
    grossAmount,
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  const marketAfter: MarketState = {
    ...market,
    maxYesLiability: preview.yesLiaAfter,
    maxNoLiability:  preview.noLiaAfter,
    poolCommitted:   Math.max(preview.yesLiaAfter, preview.noLiaAfter),
    yesShares: side === 'yes'
      ? round4(market.yesShares + preview.contracts)
      : market.yesShares,
    noShares: side === 'no'
      ? round4(market.noShares + preview.contracts)
      : market.noShares,
  }

  return { position, marketAfter, error: undefined }
}

// ─── 4. settle_event ─────────────────────────────────────────────────────────

export interface SettlementEntry {
  userId: string
  positionId: string
  payout: number
  outcome: 'won' | 'lost'
}

export function settleEvent(
  result: 'yes' | 'no',
  positions: Position[],
): SettlementEntry[] {
  return positions
    .filter((p) => p.status === 'active')
    .map((p) => ({
      userId: p.userId,
      positionId: p.id,
      payout: p.side === result ? p.payoutIfWin : 0,
      outcome: p.side === result ? 'won' : 'lost',
    }))
}

// ─── 5. get_pool_status ───────────────────────────────────────────────────────

export interface PoolStatus {
  total: number
  committed: number      // max(yes_lia, no_lia)
  remaining: number
  pctUsed: number
}

export function getPoolStatus(market: MarketState): PoolStatus {
  const committed = Math.max(market.maxYesLiability, market.maxNoLiability)
  const remaining = round2(market.poolTotal - committed)
  const pctUsed   = market.poolTotal > 0
    ? round4(committed / market.poolTotal)
    : 0
  return { total: market.poolTotal, committed, remaining, pctUsed }
}

// ─── 6. initialize_market helper ─────────────────────────────────────────────

/** Creates a fresh MarketState for a new event. */
export function initializeMarket(
  eventId: string,
  poolTotal: number,
  initialYesPercent = 50,
  syntheticShares = 1000,
  spreadEnabled = true,
): MarketState {
  const yesShares = round4((initialYesPercent / 100) * syntheticShares)
  const noShares  = round4(syntheticShares - yesShares)
  return {
    eventId,
    poolTotal,
    poolCommitted: 0,
    maxYesLiability: 0,
    maxNoLiability: 0,
    yesShares,
    noShares,
    spreadEnabled,
    status: 'open',
  }
}

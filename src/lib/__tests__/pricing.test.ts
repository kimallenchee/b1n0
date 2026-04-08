/**
 * b1n0 Pricing Engine — comprehensive test suite.
 *
 * Covers: rounding, mid-market prices, dynamic spread, dynamic fees,
 * ask/bid prices, purchase previews, execution, settlement, pool status,
 * market initialization, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  round2,
  round4,
  getCurrentPrices,
  getAskPrice,
  getBidPrice,
  midPctToAsk,
  midPctToBid,
  getDynamicFeeRate,
  previewPurchase,
  executePurchase,
  settleEvent,
  getPoolStatus,
  initializeMarket,
  setPricingRates,
  type MarketState,
  type Position,
  FEE_FLOOR,
  FEE_CEILING,
} from '../pricing'

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Creates a standard 65/35 open market for testing */
function makeMarket(overrides: Partial<MarketState> = {}): MarketState {
  return {
    eventId: 'test-event-1',
    poolTotal: 50_000,
    poolCommitted: 0,
    maxYesLiability: 0,
    maxNoLiability: 0,
    yesShares: 650,
    noShares: 350,
    spreadEnabled: true,
    status: 'open',
    ...overrides,
  }
}

/** Creates a balanced 50/50 market */
function makeBalancedMarket(overrides: Partial<MarketState> = {}): MarketState {
  return makeMarket({ yesShares: 500, noShares: 500, ...overrides })
}

/** Creates a position for settlement testing */
function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    eventId: 'test-event-1',
    userId: 'user-1',
    side: 'yes',
    contracts: 100,
    priceAtPurchase: 0.65,
    payoutIfWin: 100,
    feePaid: 2.5,
    grossAmount: 67.5,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Reset pricing rates before each test ────────────────────────────────────

beforeEach(() => {
  setPricingRates({
    spreadLow: 0.01,
    spreadHigh: 0.02,
    feeRate: 0.025,
    feeFloor: 0.01,
    feeCeiling: 0.05,
    sellFeeRate: 0.02,
    depthThreshold: 50_000,
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ROUNDING
// ═══════════════════════════════════════════════════════════════════════════════

describe('round2 (money amounts)', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.006)).toBe(1.01)
    expect(round2(1.026)).toBe(1.03)
    expect(round2(97.5)).toBe(97.5)
    expect(round2(146.5346)).toBe(146.53)
  })

  it('handles zero and negative values', () => {
    expect(round2(0)).toBe(0)
    expect(round2(-1.235)).toBe(-1.24) // Note: JS rounding behavior
  })

  it('preserves integers', () => {
    expect(round2(100)).toBe(100)
    expect(round2(1)).toBe(1)
  })
})

describe('round4 (contracts/shares)', () => {
  it('rounds to 4 decimal places', () => {
    expect(round4(1.00005)).toBe(1.0001)
    expect(round4(146.53461)).toBe(146.5346)
    expect(round4(0.65)).toBe(0.65)
  })

  it('handles zero', () => {
    expect(round4(0)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MID-MARKET PRICES
// ═══════════════════════════════════════════════════════════════════════════════

describe('getCurrentPrices', () => {
  it('returns correct mid prices for 65/35 split', () => {
    const market = makeMarket()
    const prices = getCurrentPrices(market)
    expect(prices.yes).toBe(0.65)
    expect(prices.no).toBe(0.35)
  })

  it('returns 50/50 for balanced market', () => {
    const market = makeBalancedMarket()
    const prices = getCurrentPrices(market)
    expect(prices.yes).toBe(0.5)
    expect(prices.no).toBe(0.5)
  })

  it('returns 50/50 when both shares are zero', () => {
    const market = makeMarket({ yesShares: 0, noShares: 0 })
    const prices = getCurrentPrices(market)
    expect(prices.yes).toBe(0.5)
    expect(prices.no).toBe(0.5)
  })

  it('handles extreme 95/5 split', () => {
    const market = makeMarket({ yesShares: 950, noShares: 50 })
    const prices = getCurrentPrices(market)
    expect(prices.yes).toBe(0.95)
    expect(prices.no).toBe(0.05)
  })

  it('prices always sum to approximately 1', () => {
    const splits = [
      { yes: 100, no: 900 },
      { yes: 500, no: 500 },
      { yes: 750, no: 250 },
      { yes: 990, no: 10 },
    ]
    for (const s of splits) {
      const market = makeMarket({ yesShares: s.yes, noShares: s.no })
      const prices = getCurrentPrices(market)
      expect(prices.yes + prices.no).toBeCloseTo(1, 3)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC SPREAD
// ═══════════════════════════════════════════════════════════════════════════════

describe('getAskPrice', () => {
  it('returns mid price when spread is disabled', () => {
    const result = getAskPrice(0.65, false)
    expect(result.askPrice).toBe(0.65)
    expect(result.spreadRate).toBe(0)
  })

  it('applies minimum spread at 50/50', () => {
    const result = getAskPrice(0.5, true)
    // skew = 0, spreadRate = SPREAD_LOW = 0.01
    expect(result.spreadRate).toBe(0.01)
    expect(result.askPrice).toBe(0.505)
  })

  it('applies higher spread at 65% mid', () => {
    const result = getAskPrice(0.65, true)
    // skew = 0.30, spreadRate = 0.01 + 0.01 * 0.30 = 0.013
    expect(result.spreadRate).toBe(0.013)
    expect(result.askPrice).toBeCloseTo(0.6565, 4)
  })

  it('applies maximum spread at extreme (95%)', () => {
    const result = getAskPrice(0.95, true)
    // skew = 0.90, spreadRate = 0.01 + 0.01 * 0.90 = 0.019
    expect(result.spreadRate).toBe(0.019)
    expect(result.askPrice).toBeCloseTo(0.9595, 3)
  })

  it('clamps ask price to MAX_PRICE (0.99)', () => {
    const result = getAskPrice(0.99, true)
    expect(result.askPrice).toBeLessThanOrEqual(0.99)
  })

  it('ensures ask price >= 0.02', () => {
    const result = getAskPrice(0.01, true)
    expect(result.askPrice).toBeGreaterThanOrEqual(0.02)
  })
})

describe('getBidPrice', () => {
  it('returns mid price when spread is disabled', () => {
    const result = getBidPrice(0.65, false)
    expect(result.bidPrice).toBe(0.65)
    expect(result.spreadRate).toBe(0)
  })

  it('bid is below mid when spread is enabled', () => {
    const result = getBidPrice(0.65, true)
    expect(result.bidPrice).toBeLessThan(0.65)
  })

  it('bid clamps to MIN_PRICE (0.01)', () => {
    const result = getBidPrice(0.01, true)
    expect(result.bidPrice).toBeGreaterThanOrEqual(0.01)
  })

  it('ask - bid = spread for any mid price', () => {
    const mids = [0.3, 0.5, 0.65, 0.8, 0.95]
    for (const mid of mids) {
      const ask = getAskPrice(mid, true)
      const bid = getBidPrice(mid, true)
      const spread = round4(ask.askPrice - bid.bidPrice)
      expect(spread).toBeCloseTo(ask.spreadRate, 3)
    }
  })
})

describe('midPctToAsk / midPctToBid', () => {
  it('converts percentage to ask price', () => {
    const ask = midPctToAsk(65)
    expect(ask).toBeCloseTo(0.6565, 3)
  })

  it('converts percentage to bid price', () => {
    const bid = midPctToBid(65)
    expect(bid).toBeLessThan(0.65)
  })

  it('50% maps to slightly above/below 0.50', () => {
    expect(midPctToAsk(50)).toBeGreaterThan(0.50)
    expect(midPctToBid(50)).toBeLessThan(0.50)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC FEE
// ═══════════════════════════════════════════════════════════════════════════════

describe('getDynamicFeeRate', () => {
  it('returns ceiling at 50/50 with deep pool', () => {
    // skew = 0, depthFactor = 1.0 → fee = CEILING - 0 = 5%
    const rate = getDynamicFeeRate(0.5, 50_000)
    expect(rate).toBe(0.05)
  })

  it('returns lower fee at high skew with deep pool', () => {
    // skew = 0.9, depth = 1.0 → fee = 0.05 - 0.04 * 0.9 * 1.0 = 0.014
    const rate = getDynamicFeeRate(0.95, 50_000)
    expect(rate).toBeCloseTo(0.014, 3)
  })

  it('returns higher fee at high skew with shallow pool', () => {
    // skew = 0.9, depth = 0.2 → fee = 0.05 - 0.04 * 0.9 * 0.2 = 0.0428
    const rate = getDynamicFeeRate(0.95, 10_000)
    expect(rate).toBeCloseTo(0.0428, 3)
  })

  it('never goes below FEE_FLOOR', () => {
    const rate = getDynamicFeeRate(0.99, 100_000)
    expect(rate).toBeGreaterThanOrEqual(0.01)
  })

  it('never exceeds FEE_CEILING', () => {
    const rate = getDynamicFeeRate(0.5, 1)
    expect(rate).toBeLessThanOrEqual(0.05)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE PREVIEW
// ═══════════════════════════════════════════════════════════════════════════════

describe('previewPurchase', () => {
  it('produces valid preview for Q100 YES on 65/35 market', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'yes', 100)

    expect(preview.valid).toBe(true)
    expect(preview.grossAmount).toBe(100)
    expect(preview.fee).toBeGreaterThan(0)
    expect(preview.fee).toBeLessThan(100)
    expect(preview.net).toBe(round2(100 - preview.fee))
    expect(preview.price).toBeGreaterThan(0.65) // ask > mid due to spread
    expect(preview.contracts).toBeGreaterThan(0)
    expect(preview.payoutIfWin).toBe(round2(preview.contracts))
  })

  it('produces valid preview for NO side', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'no', 100)

    expect(preview.valid).toBe(true)
    expect(preview.price).toBeGreaterThan(0.35) // ask > mid
    // NO side has lower mid, so more contracts per Q
    expect(preview.contracts).toBeGreaterThan(0)
  })

  it('YES gets fewer contracts than NO on 65/35 market (same amount)', () => {
    const market = makeMarket()
    const previewYes = previewPurchase(market, 'yes', 100)
    const previewNo = previewPurchase(market, 'no', 100)

    // YES is more expensive → fewer contracts
    expect(previewYes.contracts).toBeLessThan(previewNo.contracts)
  })

  it('correctly tracks liability on YES side', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'yes', 100)

    expect(preview.yesLiaAfter).toBe(round2(market.maxYesLiability + preview.payoutIfWin))
    expect(preview.noLiaAfter).toBe(market.maxNoLiability)
  })

  it('correctly tracks liability on NO side', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'no', 100)

    expect(preview.noLiaAfter).toBe(round2(market.maxNoLiability + preview.payoutIfWin))
    expect(preview.yesLiaAfter).toBe(market.maxYesLiability)
  })

  it('rejects zero amount', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'yes', 0)
    expect(preview.valid).toBe(false)
    expect(preview.reason).toContain('positive')
  })

  it('rejects negative amount', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'yes', -50)
    expect(preview.valid).toBe(false)
  })

  it('rejects when pool cap would be exceeded', () => {
    const market = makeMarket({ poolTotal: 100, maxYesLiability: 95 })
    // This Q100 would push liability way over the Q100 pool
    const preview = previewPurchase(market, 'yes', 100)
    expect(preview.valid).toBe(false)
    expect(preview.reason).toContain('Pool cap')
  })

  it('rejects when market is not open', () => {
    const market = makeMarket({ status: 'settled' })
    const preview = previewPurchase(market, 'yes', 100)
    expect(preview.valid).toBe(false)
    expect(preview.reason).toContain('settled')
  })

  it('rejects voided market', () => {
    const market = makeMarket({ status: 'voided' })
    const preview = previewPurchase(market, 'yes', 100)
    expect(preview.valid).toBe(false)
  })

  it('spread captured is >= 0', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'yes', 100)
    expect(preview.spreadCaptured).toBeGreaterThanOrEqual(0)
  })

  it('pool after shows correct committed and remaining', () => {
    const market = makeMarket({ poolTotal: 10_000 })
    const preview = previewPurchase(market, 'yes', 100)
    expect(preview.poolAfter.committed).toBe(Math.max(preview.yesLiaAfter, preview.noLiaAfter))
    expect(preview.poolAfter.remaining).toBe(round2(10_000 - preview.poolAfter.committed))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE PURCHASE
// ═══════════════════════════════════════════════════════════════════════════════

describe('executePurchase', () => {
  it('creates a position and updates market state', () => {
    const market = makeMarket()
    const result = executePurchase(market, 'user-1', 'yes', 100, 'pos-abc')

    expect(result.error).toBeUndefined()
    expect(result.position).not.toBeNull()
    expect(result.marketAfter).not.toBeNull()

    const pos = result.position!
    expect(pos.id).toBe('pos-abc')
    expect(pos.eventId).toBe('test-event-1')
    expect(pos.userId).toBe('user-1')
    expect(pos.side).toBe('yes')
    expect(pos.status).toBe('active')
    expect(pos.contracts).toBeGreaterThan(0)
    expect(pos.grossAmount).toBe(100)
    expect(pos.feePaid).toBeGreaterThan(0)
  })

  it('increases yesShares after YES purchase', () => {
    const market = makeMarket()
    const result = executePurchase(market, 'user-1', 'yes', 100, 'pos-1')
    expect(result.marketAfter!.yesShares).toBeGreaterThan(market.yesShares)
    expect(result.marketAfter!.noShares).toBe(market.noShares)
  })

  it('increases noShares after NO purchase', () => {
    const market = makeMarket()
    const result = executePurchase(market, 'user-1', 'no', 100, 'pos-1')
    expect(result.marketAfter!.noShares).toBeGreaterThan(market.noShares)
    expect(result.marketAfter!.yesShares).toBe(market.yesShares)
  })

  it('updates pool committed correctly', () => {
    const market = makeMarket()
    const result = executePurchase(market, 'user-1', 'yes', 100, 'pos-1')
    const after = result.marketAfter!
    expect(after.poolCommitted).toBe(Math.max(after.maxYesLiability, after.maxNoLiability))
  })

  it('returns error for invalid purchase', () => {
    const market = makeMarket({ status: 'settled' })
    const result = executePurchase(market, 'user-1', 'yes', 100, 'pos-1')
    expect(result.error).toBeDefined()
    expect(result.position).toBeNull()
    expect(result.marketAfter).toBeNull()
  })

  it('returns error when pool is full', () => {
    const market = makeMarket({ poolTotal: 50, maxYesLiability: 48 })
    const result = executePurchase(market, 'user-1', 'yes', 1000, 'pos-1')
    expect(result.error).toContain('Pool cap')
  })

  it('preserves market event ID and status after purchase', () => {
    const market = makeMarket()
    const result = executePurchase(market, 'user-1', 'yes', 100, 'pos-1')
    expect(result.marketAfter!.eventId).toBe(market.eventId)
    expect(result.marketAfter!.status).toBe('open')
    expect(result.marketAfter!.poolTotal).toBe(market.poolTotal)
  })

  it('sequential purchases accumulate liability correctly', () => {
    let market = makeMarket()

    const r1 = executePurchase(market, 'user-1', 'yes', 100, 'pos-1')
    expect(r1.error).toBeUndefined()
    market = r1.marketAfter!

    const r2 = executePurchase(market, 'user-2', 'yes', 200, 'pos-2')
    expect(r2.error).toBeUndefined()
    market = r2.marketAfter!

    // Total liability should be sum of both payouts
    expect(market.maxYesLiability).toBe(
      round2(r1.position!.payoutIfWin + r2.position!.payoutIfWin)
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SETTLEMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('settleEvent', () => {
  it('pays YES winners and zeros NO losers', () => {
    const positions = [
      makePosition({ id: 'p1', side: 'yes', payoutIfWin: 150 }),
      makePosition({ id: 'p2', side: 'no', payoutIfWin: 200, userId: 'user-2' }),
    ]

    const settlements = settleEvent('yes', positions)
    expect(settlements).toHaveLength(2)

    const winner = settlements.find(s => s.positionId === 'p1')!
    const loser = settlements.find(s => s.positionId === 'p2')!

    expect(winner.payout).toBe(150)
    expect(winner.outcome).toBe('won')
    expect(loser.payout).toBe(0)
    expect(loser.outcome).toBe('lost')
  })

  it('pays NO winners and zeros YES losers', () => {
    const positions = [
      makePosition({ id: 'p1', side: 'yes', payoutIfWin: 150 }),
      makePosition({ id: 'p2', side: 'no', payoutIfWin: 200, userId: 'user-2' }),
    ]

    const settlements = settleEvent('no', positions)
    const winner = settlements.find(s => s.positionId === 'p2')!
    const loser = settlements.find(s => s.positionId === 'p1')!

    expect(winner.payout).toBe(200)
    expect(winner.outcome).toBe('won')
    expect(loser.payout).toBe(0)
    expect(loser.outcome).toBe('lost')
  })

  it('ignores non-active positions', () => {
    const positions = [
      makePosition({ id: 'p1', side: 'yes', status: 'active' }),
      makePosition({ id: 'p2', side: 'yes', status: 'won' }),
      makePosition({ id: 'p3', side: 'yes', status: 'lost' }),
      makePosition({ id: 'p4', side: 'yes', status: 'voided' }),
    ]

    const settlements = settleEvent('yes', positions)
    expect(settlements).toHaveLength(1)
    expect(settlements[0].positionId).toBe('p1')
  })

  it('handles empty positions array', () => {
    const settlements = settleEvent('yes', [])
    expect(settlements).toHaveLength(0)
  })

  it('all same-side positions win together', () => {
    const positions = [
      makePosition({ id: 'p1', side: 'yes', payoutIfWin: 100 }),
      makePosition({ id: 'p2', side: 'yes', payoutIfWin: 200, userId: 'user-2' }),
      makePosition({ id: 'p3', side: 'yes', payoutIfWin: 50, userId: 'user-3' }),
    ]

    const settlements = settleEvent('yes', positions)
    const totalPayout = settlements.reduce((sum, s) => sum + s.payout, 0)
    expect(totalPayout).toBe(350) // 100 + 200 + 50
    expect(settlements.every(s => s.outcome === 'won')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// POOL STATUS
// ═══════════════════════════════════════════════════════════════════════════════

describe('getPoolStatus', () => {
  it('returns full pool for fresh market', () => {
    const market = makeMarket()
    const status = getPoolStatus(market)
    expect(status.total).toBe(50_000)
    expect(status.committed).toBe(0)
    expect(status.remaining).toBe(50_000)
    expect(status.pctUsed).toBe(0)
  })

  it('reflects liability correctly', () => {
    const market = makeMarket({ maxYesLiability: 10_000, maxNoLiability: 5_000 })
    const status = getPoolStatus(market)
    expect(status.committed).toBe(10_000)
    expect(status.remaining).toBe(40_000)
    expect(status.pctUsed).toBe(0.2)
  })

  it('handles zero pool total', () => {
    const market = makeMarket({ poolTotal: 0 })
    const status = getPoolStatus(market)
    expect(status.pctUsed).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('initializeMarket', () => {
  it('creates 50/50 market by default', () => {
    const market = initializeMarket('evt-1', 10_000)
    expect(market.yesShares).toBe(500)
    expect(market.noShares).toBe(500)
    expect(market.poolTotal).toBe(10_000)
    expect(market.poolCommitted).toBe(0)
    expect(market.status).toBe('open')
    expect(market.spreadEnabled).toBe(true)
  })

  it('creates market with custom initial percent', () => {
    const market = initializeMarket('evt-2', 20_000, 70)
    expect(market.yesShares).toBe(700)
    expect(market.noShares).toBe(300)
  })

  it('creates market with custom synthetic shares', () => {
    const market = initializeMarket('evt-3', 5_000, 50, 2000)
    expect(market.yesShares).toBe(1000)
    expect(market.noShares).toBe(1000)
  })

  it('can disable spread', () => {
    const market = initializeMarket('evt-4', 5_000, 50, 1000, false)
    expect(market.spreadEnabled).toBe(false)
  })

  it('shares sum to syntheticShares', () => {
    const market = initializeMarket('evt-5', 5_000, 63, 1000)
    expect(market.yesShares + market.noShares).toBeCloseTo(1000, 2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SET PRICING RATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('setPricingRates', () => {
  it('updates spread rates and they affect calculations', () => {
    setPricingRates({ spreadLow: 0.04, spreadHigh: 0.08 })
    const result = getAskPrice(0.5, true)
    // spreadRate = 0.04 + 0 = 0.04, ask = 0.5 + 0.02 = 0.52
    expect(result.spreadRate).toBe(0.04)
    expect(result.askPrice).toBe(0.52)
  })

  it('only updates provided rates', () => {
    setPricingRates({ spreadLow: 0.01, spreadHigh: 0.02 }) // reset
    const before = getDynamicFeeRate(0.5, 50_000)
    setPricingRates({ spreadLow: 0.05 }) // only change spread
    const after = getDynamicFeeRate(0.5, 50_000)
    // Fee should be unchanged since we only changed spread
    expect(before).toBe(after)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES & INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('very small purchase (Q1) on large pool works', () => {
    const market = makeMarket()
    const preview = previewPurchase(market, 'yes', 1)
    expect(preview.valid).toBe(true)
    expect(preview.contracts).toBeGreaterThan(0)
  })

  it('large purchase near pool cap is rejected', () => {
    const market = makeMarket({ poolTotal: 1_000 })
    const preview = previewPurchase(market, 'yes', 5_000)
    // 5000 Q at ~65% price → ~7500 contracts → exceeds Q1000 pool
    expect(preview.valid).toBe(false)
  })

  it('purchase at extreme 99/1 split works', () => {
    const market = makeMarket({ yesShares: 990, noShares: 10 })
    const preview = previewPurchase(market, 'no', 50)
    expect(preview.valid).toBe(true)
    // NO side is cheap, should get lots of contracts
    expect(preview.contracts).toBeGreaterThan(50)
  })

  it('full round trip: init → purchase → settle', () => {
    // Initialize
    const market = initializeMarket('evt-round-trip', 10_000, 60)
    const prices = getCurrentPrices(market)
    expect(prices.yes).toBeCloseTo(0.6, 1)

    // Purchase
    const result = executePurchase(market, 'user-1', 'yes', 100, 'pos-rt-1')
    expect(result.error).toBeUndefined()
    const pos = result.position!

    // Settle as YES wins
    const settlements = settleEvent('yes', [pos])
    expect(settlements).toHaveLength(1)
    expect(settlements[0].outcome).toBe('won')
    expect(settlements[0].payout).toBe(pos.payoutIfWin)
    expect(settlements[0].payout).toBeGreaterThan(100) // profit because price < 1
  })

  it('full round trip: loser gets nothing', () => {
    const market = initializeMarket('evt-loss', 10_000, 60)
    const result = executePurchase(market, 'user-1', 'yes', 100, 'pos-loss')
    const pos = result.position!

    const settlements = settleEvent('no', [pos]) // YES loses
    expect(settlements[0].outcome).toBe('lost')
    expect(settlements[0].payout).toBe(0)
  })
})

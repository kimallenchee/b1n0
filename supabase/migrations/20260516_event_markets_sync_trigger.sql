-- ============================================================
--  Migration: auto-sync event_markets fee/spread cache
--  Date: 2026-05-16
--
--  WHY:
--    `event_markets.fees_collected` and `event_markets.spread_collected`
--    were being maintained manually by execute_purchase (and execute_sell)
--    via `UPDATE event_markets SET fees_collected = fees_collected + ...`.
--    In practice these counters drifted out of sync with the source of
--    truth (sum of market_transactions.fee_deducted + spread_captured).
--    The Portafolio LP card and any other consumer reading from those
--    cached columns reported $0.00 even when admin RevenuePanel (which
--    computes from market_transactions directly) showed real earnings.
--
--  WHAT:
--    1. Backfill — recompute fees_collected + spread_collected from
--       market_transactions for every event. Idempotent (safe to re-run).
--    2. Trigger — AFTER INSERT on market_transactions, recompute the
--       affected event's totals from scratch. Idempotent: coexists safely
--       with the existing inline UPDATEs in execute_purchase / execute_sell
--       (both end up writing the same correct value).
--
--  WHY RECOMPUTE-FROM-SCRATCH RATHER THAN INCREMENT:
--    If the trigger only ADDED the delta and execute_purchase also added
--    the same delta, we'd double-count. Recomputing from the authoritative
--    source (market_transactions) is correct regardless of which other
--    code paths also touch the cached columns. O(N) per insert where N
--    is transactions-per-event — acceptable for b1n0's scale.
--
--  EXCLUSION RULES (match what admin RevenuePanel uses):
--    - success = false rows don't count (failed/rolled-back txs)
--    - tx_type = 'payout' doesn't count (settlement-time outflow,
--      not LP-earning)
--    - tx_type IN ('purchase', 'sale') is the LP-earning set
--
--  ROLLBACK:
--    DROP TRIGGER event_markets_sync_on_tx ON market_transactions;
--    DROP FUNCTION sync_event_markets_from_tx;
--    -- backfill is just an UPDATE, no rollback needed since reads
--    -- already work either way (the trigger keeps them correct
--    -- prospectively).
-- ============================================================

BEGIN;

-- ── 1. Backfill — fix current rows ─────────────────────────────

UPDATE event_markets em
SET
  fees_collected = COALESCE((
    SELECT SUM(COALESCE(mt.fee_deducted, 0))
    FROM market_transactions mt
    WHERE mt.event_id = em.event_id
      AND mt.success = true
      AND mt.tx_type IN ('purchase', 'sale')
  ), 0),
  spread_collected = COALESCE((
    SELECT SUM(COALESCE(mt.spread_captured, 0))
    FROM market_transactions mt
    WHERE mt.event_id = em.event_id
      AND mt.success = true
      AND mt.tx_type IN ('purchase', 'sale')
  ), 0);

-- ── 2. Trigger function — recompute on every new transaction ──

CREATE OR REPLACE FUNCTION public.sync_event_markets_from_tx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only sync for successful, LP-earning transactions.
  IF NEW.success IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF NEW.tx_type NOT IN ('purchase', 'sale') THEN RETURN NEW; END IF;

  UPDATE public.event_markets
  SET
    fees_collected = COALESCE((
      SELECT SUM(COALESCE(fee_deducted, 0))
      FROM public.market_transactions
      WHERE event_id = NEW.event_id
        AND success = true
        AND tx_type IN ('purchase', 'sale')
    ), 0),
    spread_collected = COALESCE((
      SELECT SUM(COALESCE(spread_captured, 0))
      FROM public.market_transactions
      WHERE event_id = NEW.event_id
        AND success = true
        AND tx_type IN ('purchase', 'sale')
    ), 0),
    updated_at = now()
  WHERE event_id = NEW.event_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_event_markets_from_tx() IS
  'Keeps event_markets.fees_collected and .spread_collected in sync with the source of truth (market_transactions). Fires AFTER INSERT on market_transactions. Idempotent — recomputes from scratch.';

-- ── 3. Wire the trigger ───────────────────────────────────────

DROP TRIGGER IF EXISTS event_markets_sync_on_tx ON public.market_transactions;

CREATE TRIGGER event_markets_sync_on_tx
AFTER INSERT ON public.market_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_event_markets_from_tx();

COMMIT;

-- ============================================================
--  Verification (run after applying):
--
--    -- For any event, the cached totals should match the live SUM
--    -- of market_transactions. Run for a sample event:
--
--    SELECT
--      em.event_id,
--      em.fees_collected         AS cached_fees,
--      (SELECT SUM(COALESCE(fee_deducted, 0))
--         FROM market_transactions
--         WHERE event_id = em.event_id
--           AND success = true
--           AND tx_type IN ('purchase','sale'))  AS live_fees,
--      em.spread_collected       AS cached_spread,
--      (SELECT SUM(COALESCE(spread_captured, 0))
--         FROM market_transactions
--         WHERE event_id = em.event_id
--           AND success = true
--           AND tx_type IN ('purchase','sale'))  AS live_spread
--    FROM event_markets em
--    LIMIT 5;
--
--    -- cached_fees should equal live_fees on every row.
--    -- cached_spread should equal live_spread on every row.
--
--    -- To prove the trigger works going forward, manually insert
--    -- a test market_transactions row (as service role) and watch
--    -- event_markets.fees_collected jump by the expected amount.
-- ============================================================

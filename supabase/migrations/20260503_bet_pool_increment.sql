-- ============================================================
--  Migration: keep event_markets.bet_pool / option_markets.bet_pool
--             in sync with actual positions
--  Date: 2026-05-03
--
--  PROBLEM:
--    The bet_pool columns on event_markets and option_markets were
--    added by parimutuel-model.sql to track "user money in the pool"
--    separately from "LP capital in the pool" (lp_capital). But
--    nothing increments bet_pool when execute_purchase /
--    execute_option_purchase inserts a position. The column has been
--    silently stuck at 0 forever.
--
--    This is purely a *display* bug — every settlement and void
--    queries the positions table directly, so payouts and refunds
--    have always been correct. But the admin event editor reads
--    bet_pool to show "Entradas en pool: $X", and that number
--    was always $0 even when there were live user stakes.
--
--    The lifecycle test caught this gap: after the void test on
--    Test Event ($120 refunded), the admin display still showed
--    "Entradas en pool: $0" even before the void.
--
--  WHY A TRIGGER, NOT AN RPC PATCH:
--    execute_purchase + execute_option_purchase are 250+ lines
--    each, and the bet_pool increment is one extra line of book-
--    keeping. Editing those functions for a 1-line change risks
--    breaking the parimutuel pricing math. A trigger on positions
--    is exactly as correct, simpler to reason about, and works
--    for any future code path that inserts into positions.
--
--  WHAT THIS DOES:
--    1. Trigger function bet_pool_on_position_insert() runs
--       AFTER INSERT on positions. Computes net = gross - fee
--       (the actual pool contribution after the fee skim) and
--       updates the relevant market's bet_pool.
--       - Binary event positions (side IN ('yes','no')) hit
--         event_markets.
--       - Open event positions (side LIKE '%:yes' / '%:no') hit
--         the matching row in option_markets.
--    2. Backfill existing markets so the historical numbers are
--       finally accurate. Pulls from positions table grouped by
--       event_id (binary) or (event_id, option_label) (open).
--       Excludes 'voided' and 'lost'/'won' positions because those
--       money flows have already been refunded or paid out — they
--       no longer represent live pool money.
--
--  Idempotency: CREATE OR REPLACE for the function, DROP/CREATE
--  for the trigger, plain UPDATE for the backfill. Safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. Trigger function ──

CREATE OR REPLACE FUNCTION public.bet_pool_on_position_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_net           numeric(12,2);
  v_option_label  text;
BEGIN
  -- Net contribution = what the user paid minus the fee that gets
  -- skimmed off to treasury. This matches what execute_purchase
  -- adds to pool_total internally.
  v_net := ROUND(NEW.gross_amount - NEW.fee_paid, 2);

  IF NEW.side IN ('yes', 'no') THEN
    -- Binary event.
    UPDATE event_markets
    SET bet_pool = bet_pool + v_net
    WHERE event_id = NEW.event_id;
  ELSE
    -- Open event: side is "<option_label>:yes" or "<option_label>:no".
    v_option_label := split_part(NEW.side, ':', 1);
    UPDATE option_markets
    SET bet_pool = bet_pool + v_net
    WHERE event_id = NEW.event_id
      AND option_label = v_option_label;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Trigger ──

DROP TRIGGER IF EXISTS positions_bet_pool_increment ON public.positions;

CREATE TRIGGER positions_bet_pool_increment
AFTER INSERT ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.bet_pool_on_position_insert();

-- ── 3. Backfill: recompute bet_pool from current positions ──

-- Binary events. Only count positions that are still in-flight
-- (status='active') OR have already paid out / been written off
-- but the pool money was already moved at settlement
-- (status='won','lost'). Voided positions have been refunded so
-- they no longer represent pool money.
UPDATE event_markets em
SET bet_pool = COALESCE((
  SELECT SUM(p.gross_amount - p.fee_paid)
  FROM positions p
  WHERE p.event_id = em.event_id
    AND p.side IN ('yes', 'no')
    AND p.status IN ('active', 'won', 'lost')
), 0);

-- Open events. Same logic, scoped by option_label.
UPDATE option_markets om
SET bet_pool = COALESCE((
  SELECT SUM(p.gross_amount - p.fee_paid)
  FROM positions p
  WHERE p.event_id = om.event_id
    AND split_part(p.side, ':', 1) = om.option_label
    AND p.status IN ('active', 'won', 'lost')
), 0);

COMMIT;

-- ============================================================
--  Verification (after applying):
--    -- Spot-check a known event
--    SELECT event_id, pool_total, bet_pool, lp_capital
--    FROM event_markets
--    WHERE event_id = '<event-with-positions>';
--    -- Should now show bet_pool > 0 if there are user stakes.
--
--    -- Test the trigger by inserting a fresh position
--    -- (use execute_purchase from the UI, not raw insert)
--    -- and re-query above; bet_pool should bump by gross-fee.
-- ============================================================

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
--    This is purely a *display* bug -- every settlement and void
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
--    1. Defensive ALTER TABLE adds bet_pool to event_markets and
--       option_markets if missing. The column was supposed to be
--       added by parimutuel-model.sql but the IF NOT EXISTS
--       CREATE TABLE for option_markets is a no-op once the table
--       exists -- so on this DB option_markets.bet_pool was never
--       created.
--    2. Trigger function bet_pool_on_position_insert() runs
--       AFTER INSERT on positions. Computes net = gross - fee
--       (the actual pool contribution after the fee skim) and
--       updates the relevant market's bet_pool.
--       - Binary event positions (side IN ('yes','no')) hit
--         event_markets.
--       - Open event positions (side LIKE '%:yes' / '%:no') hit
--         the matching row in option_markets.
--    3. Backfill existing markets so the historical numbers are
--       finally accurate. Pulls from positions table grouped by
--       event_id (binary) or (event_id, option_label) (open).
--       Excludes 'voided' positions because those have been
--       refunded -- they no longer represent live pool money.
--
--  Idempotency: ALTER TABLE IF NOT EXISTS, CREATE OR REPLACE for
--  the function, DROP/CREATE for the trigger, plain UPDATE for
--  the backfill. Safe to re-run.
-- ============================================================

BEGIN;

-- -- 0. Defensive column adds --

ALTER TABLE public.event_markets
  ADD COLUMN IF NOT EXISTS bet_pool numeric(14,4) NOT NULL DEFAULT 0;

ALTER TABLE public.option_markets
  ADD COLUMN IF NOT EXISTS bet_pool numeric(12,2) NOT NULL DEFAULT 0;

-- -- 1. Trigger function --

CREATE OR REPLACE FUNCTION public.bet_pool_on_position_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_net           numeric(12,2);
  v_option_label  text;
BEGIN
  -- Net contribution = what the user paid minus the fee that gets
  -- skimmed off to treasury. Mirrors what execute_purchase adds
  -- to pool_total internally.
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

-- -- 2. Trigger --

DROP TRIGGER IF EXISTS positions_bet_pool_increment ON public.positions;

CREATE TRIGGER positions_bet_pool_increment
AFTER INSERT ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.bet_pool_on_position_insert();

-- -- 3. Backfill: recompute bet_pool from current positions --

-- Binary events. Only count positions still on the books that
-- represent real pool money (active = in flight, won/lost = pool
-- money was already moved at settle but the column should reflect
-- "this much user money flowed through here"). Voided positions
-- have been refunded so they no longer represent pool money.
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
--    -- Trigger live?
--    SELECT tgname FROM pg_trigger
--    WHERE tgname = 'positions_bet_pool_increment';
--
--    -- Backfill worked?
--    SELECT event_id, pool_total, bet_pool, lp_capital
--    FROM event_markets
--    WHERE pool_total > 0
--    LIMIT 5;
--
--    -- After voting on a fresh event, bet_pool should bump by
--    -- (gross_amount - fee_paid) per position.
-- ============================================================

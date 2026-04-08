-- ============================================================
--  Migration: execute_sell — AMM sell-back for positions
--
--  User sells contracts back to the pool at bid price.
--  Inverse of execute_purchase:
--    bid = mid - half_spread
--    proceeds = contracts × bid × (1 - fee)
--    shares removed from pool, liabilities reduced.
-- ============================================================

-- Update balance_ledger type check to include 'sell'
ALTER TABLE public.balance_ledger
  DROP CONSTRAINT IF EXISTS balance_ledger_type_check;

ALTER TABLE public.balance_ledger
  ADD CONSTRAINT balance_ledger_type_check
  CHECK (type IN ('deposit','withdraw','vote','win','loss','refund','sell','lp_deposit','lp_return'));


-- ── execute_sell RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.execute_sell(
  p_position_id UUID,
  p_user_id     UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pos          RECORD;
  v_market       event_markets%ROWTYPE;
  v_total_shares NUMERIC(14,4);
  v_mid          NUMERIC(10,6);
  v_skew         NUMERIC(10,6);
  v_spread_rate  NUMERIC(10,6);
  v_half_spread  NUMERIC(10,6);
  v_bid          NUMERIC(10,6);
  v_sell_fee_rate    NUMERIC(10,6);
  v_spread_low       NUMERIC(6,4) := 0.01;
  v_spread_high      NUMERIC(6,4) := 0.02;
  v_gross            NUMERIC(12,2);
  v_gross_at_mid     NUMERIC(12,2);
  v_spread_captured  NUMERIC(12,2);
  v_fee              NUMERIC(12,2);
  v_proceeds         NUMERIC(12,2);
  v_new_balance      NUMERIC(12,2);
  v_event_q          TEXT;
BEGIN
  -- Load spread + sell fee from platform_config
  SELECT COALESCE(value, 1) / 100 INTO v_spread_low
  FROM platform_config WHERE key = 'spread_low_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_spread_high
  FROM platform_config WHERE key = 'spread_high_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_sell_fee_rate
  FROM platform_config WHERE key = 'sell_fee_pct';

  -- 1. Lock and fetch the position
  SELECT * INTO v_pos
  FROM positions
  WHERE id = p_position_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Posición no encontrada');
  END IF;

  IF v_pos.status IS NOT NULL AND v_pos.status <> 'active' THEN
    RETURN jsonb_build_object('error', 'Posición ya cerrada');
  END IF;

  -- 2. Lock and fetch the market
  SELECT * INTO v_market
  FROM event_markets
  WHERE event_id = v_pos.event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mercado no encontrado');
  END IF;

  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado');
  END IF;

  -- 3. Calculate bid price (uses SAME spread config as buy side)
  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF v_total_shares <= 0 THEN
    RETURN jsonb_build_object('error', 'Mercado sin liquidez');
  END IF;

  IF v_pos.side = 'yes' THEN
    v_mid := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid := ROUND(v_market.no_shares / v_total_shares, 6);
  END IF;

  -- Dynamic spread from platform_config (same formula as buy)
  v_skew := ABS(v_mid - 0.50) / 0.50;
  v_spread_rate := v_spread_low + (v_spread_high - v_spread_low) * v_skew;
  v_half_spread := ROUND(v_spread_rate / 2, 6);
  v_bid := GREATEST(v_mid - v_half_spread, 0.01);

  -- 4. Calculate proceeds
  v_gross := ROUND(v_pos.contracts * v_bid, 2);
  v_gross_at_mid := ROUND(v_pos.contracts * v_mid, 2);
  v_spread_captured := GREATEST(v_gross_at_mid - v_gross, 0);

  -- Flat sell fee from platform_config (market makers + sponsors exempt)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('market_maker', 'sponsor')) THEN
    v_fee := 0;
  ELSE
    v_fee := ROUND(v_gross * v_sell_fee_rate, 2);
  END IF;
  v_proceeds := v_gross - v_fee;

  -- 5. Credit user balance
  UPDATE profiles
  SET balance = balance + v_proceeds
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- 6. Mark position as sold
  UPDATE positions
  SET status = 'sold'
  WHERE id = p_position_id;

  -- 7. Remove shares from market + DEDUCT from pool
  --    The pool shrinks because we're paying the seller from it.
  --    The fee stays in the pool (platform revenue).
  UPDATE event_markets SET
    yes_shares = CASE WHEN v_pos.side = 'yes'
                      THEN GREATEST(yes_shares - v_pos.contracts, 0)
                      ELSE yes_shares END,
    no_shares  = CASE WHEN v_pos.side = 'no'
                      THEN GREATEST(no_shares - v_pos.contracts, 0)
                      ELSE no_shares  END,
    pool_total      = GREATEST(pool_total - v_proceeds, 0),  -- pool shrinks by what seller receives
    bet_pool        = GREATEST(bet_pool - v_gross, 0),        -- track bet money leaving
    fees_collected  = fees_collected + v_fee,                  -- sell fee counts as revenue
    updated_at      = now()
  WHERE event_id = v_pos.event_id;

  -- Sync events.pool_size
  UPDATE events SET pool_size = GREATEST(ROUND(pool_size - v_proceeds), 0)
  WHERE id = v_pos.event_id;

  -- 8. Record market transaction
  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, spread_captured, tx_type)
  VALUES
    (p_position_id, v_pos.event_id, p_user_id, v_gross, v_fee, -v_proceeds, v_spread_captured, 'sale');

  -- 9. Ledger entry
  SELECT question INTO v_event_q FROM events WHERE id = v_pos.event_id;

  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'sell', v_proceeds, v_new_balance,
          'Venta: ' || COALESCE(v_event_q, v_pos.event_id), p_position_id::text);

  RETURN jsonb_build_object(
    'ok',              true,
    'position_id',     p_position_id,
    'contracts',       v_pos.contracts,
    'mid_price',       v_mid,
    'bid_price',       v_bid,
    'spread_rate',     v_spread_rate,
    'sell_fee_rate',   v_sell_fee_rate,
    'spread_captured', v_spread_captured,
    'gross',           v_gross,
    'fee',             v_fee,
    'proceeds',        v_proceeds,
    'balance',         v_new_balance
  );
END;
$$;


-- Add 'sold' to positions status if not already there
-- (positions may not have a check constraint, but let's be safe)
DO $$
BEGIN
  ALTER TABLE public.positions
    DROP CONSTRAINT IF EXISTS positions_status_check;
  ALTER TABLE public.positions
    ADD CONSTRAINT positions_status_check
    CHECK (status IN ('active','won','lost','voided','sold'));
EXCEPTION
  WHEN others THEN NULL;
END;
$$;


NOTIFY pgrst, 'reload schema';

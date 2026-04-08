-- ============================================================
--  Private Allocation Window (Ronda Privada)
--  Run this in Supabase SQL Editor
--
--  Changes:
--    1. execute_purchase: allow purchases when event_markets.status = 'private'
--       but only for tier 3 users (verified LPs)
--    2. event_markets: ensure 'private' is a valid status value
-- ============================================================

-- ── 1. Patch execute_purchase: allow 'private' status with tier gate ──

CREATE OR REPLACE FUNCTION public.execute_purchase(
  p_event_id text,
  p_user_id  uuid,
  p_side     text,
  p_gross    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_market           event_markets%rowtype;
  v_balance          numeric(12,2);
  v_new_balance      numeric(12,2);
  v_total_shares     numeric(14,4);
  v_mid_price        numeric(10,6);
  v_skew             numeric(10,6);
  v_spread_rate      numeric(10,6);
  v_half_spread      numeric(10,6);
  v_ask_price        numeric(10,6);
  v_fee              numeric(12,2);
  v_net              numeric(12,2);
  v_contracts        numeric(14,4);
  v_contracts_at_mid numeric(14,4);
  v_payout           numeric(12,2);
  v_spread_captured  numeric(12,2);
  v_new_yes_lia      numeric(12,2);
  v_new_no_lia       numeric(12,2);
  v_max_lia          numeric(12,2);
  v_position_id      uuid;
  v_event_q          text;
  v_user_tier        integer;
BEGIN
  -- Lock event market row
  SELECT * INTO v_market
  FROM event_markets
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mercado no encontrado');
  END IF;

  -- Allow both 'open' and 'private' status
  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado: ' || v_market.status);
  END IF;

  -- Private market: only tier 3 users can participate
  IF v_market.status = 'private' THEN
    SELECT tier_required INTO v_user_tier
    FROM profiles WHERE id = p_user_id;

    -- Check user's actual KYC tier meets tier 3
    IF v_user_tier IS NULL OR v_user_tier < 3 THEN
      RETURN jsonb_build_object('error', 'Ronda privada — solo usuarios Nivel 3');
    END IF;
  END IF;

  IF p_side NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('error', 'Lado inválido: ' || p_side);
  END IF;

  -- Lock user balance row
  SELECT balance INTO v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  IF v_balance < p_gross THEN
    RETURN jsonb_build_object('error', 'Saldo insuficiente');
  END IF;

  -- ── Mid-price ──
  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF p_side = 'yes' THEN
    v_mid_price := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid_price := ROUND(v_market.no_shares  / v_total_shares, 6);
  END IF;

  -- ── Dynamic spread (4% at 50/50 → 8% at extremes) ──
  IF v_market.spread_enabled THEN
    v_skew        := ABS(v_mid_price - 0.50) / 0.50;
    v_spread_rate := 0.04 + 0.04 * v_skew;
    v_half_spread := ROUND(v_spread_rate / 2, 6);
    v_ask_price   := LEAST(v_mid_price + v_half_spread, 0.99);
    v_ask_price   := GREATEST(v_ask_price, 0.02);
  ELSE
    v_ask_price      := v_mid_price;
    v_spread_rate    := 0;
  END IF;

  -- ── Fee + net ──
  v_fee       := ROUND(p_gross * 0.025, 2);
  v_net       := p_gross - v_fee;

  v_contracts := ROUND(v_net / v_ask_price, 4);
  v_payout    := ROUND(v_contracts, 2);

  v_contracts_at_mid := ROUND(v_net / v_mid_price, 4);
  v_spread_captured := ROUND(v_contracts_at_mid - v_contracts, 2);
  IF v_spread_captured < 0 THEN
    v_spread_captured := 0;
  END IF;

  -- ── Pool liability check ──
  IF p_side = 'yes' THEN
    v_new_yes_lia := v_market.max_yes_liability + v_payout;
    v_new_no_lia  := v_market.max_no_liability;
  ELSE
    v_new_yes_lia := v_market.max_yes_liability;
    v_new_no_lia  := v_market.max_no_liability + v_payout;
  END IF;

  v_max_lia := GREATEST(v_new_yes_lia, v_new_no_lia);

  IF v_max_lia > v_market.pool_total THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado — pool lleno');
  END IF;

  -- ── Atomic execution ────────────────────

  -- Deduct gross amount from user balance
  UPDATE profiles
  SET balance = balance - p_gross
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Create position record
  INSERT INTO positions
    (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES
    (p_event_id, p_user_id, p_side, v_contracts, v_ask_price, v_contracts, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  -- Log transaction
  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type, spread_captured)
  VALUES
    (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net, 'purchase', v_spread_captured);

  -- Mint shares + update liabilities
  UPDATE event_markets SET
    yes_shares        = CASE WHEN p_side = 'yes'
                             THEN ROUND(yes_shares + v_contracts, 4)
                             ELSE yes_shares END,
    no_shares         = CASE WHEN p_side = 'no'
                             THEN ROUND(no_shares  + v_contracts, 4)
                             ELSE no_shares  END,
    max_yes_liability = v_new_yes_lia,
    max_no_liability  = v_new_no_lia,
    pool_committed    = v_max_lia,
    updated_at        = now()
  WHERE event_id = p_event_id;

  -- Upsert predictions row
  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (p_user_id, p_event_id, p_side, p_gross, v_payout)
  ON CONFLICT (user_id, event_id, side) DO UPDATE
    SET side            = EXCLUDED.side,
        amount          = predictions.amount + EXCLUDED.amount,
        potential_cobro = predictions.potential_cobro + EXCLUDED.potential_cobro,
        status          = 'active',
        resolved_at     = NULL;

  -- ── Ledger entry for the vote ──
  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;

  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'vote', -p_gross, v_new_balance,
          COALESCE(v_event_q, p_event_id), v_position_id::text);

  -- Return position details + new prices + spread info
  RETURN jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'price_at_purchase', v_ask_price,
    'payout_if_win',     v_payout,
    'fee_paid',          v_fee,
    'gross_amount',      p_gross,
    'spread_captured',   v_spread_captured,
    'spread_rate',       v_spread_rate,
    'mid_price',         v_mid_price,
    'ask_price',         v_ask_price,
    'yes_price_new',     ROUND(
      (v_market.yes_shares + CASE WHEN p_side = 'yes' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'no_price_new',      ROUND(
      (v_market.no_shares  + CASE WHEN p_side = 'no'  THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'pool_remaining',    v_market.pool_total - v_max_lia
  );
END;
$$;


NOTIFY pgrst, 'reload schema';

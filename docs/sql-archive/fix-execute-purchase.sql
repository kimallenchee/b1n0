-- ============================================================
--  FIX: Restore parimutuel execute_purchase + rate limits
--
--  Problem: 20260407_rate_limits_in_rpcs.sql overwrote the correct
--  parimutuel execute_purchase with a CPMM version that:
--    1. Uses ON CONFLICT (user_id, event_id) — constraint is now
--       (user_id, event_id, side), so INSERT fails
--    2. Uses v_payout = contracts (CPMM) instead of parimutuel formula
--    3. Doesn't grow pool_total with purchases
--
--  This fix merges parimutuel model + rate limit checks + security.
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_purchase(
  p_event_id text,
  p_user_id  uuid,
  p_side     text,
  p_gross    numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_uid         uuid := auth.uid();
  v_market           event_markets%rowtype;
  v_event            events%rowtype;
  v_profile          profiles%rowtype;
  v_balance          numeric(12,2);
  v_new_balance      numeric(12,2);
  v_total_shares     numeric(14,4);
  v_mid_price        numeric(10,6);
  v_skew             numeric(10,6);
  v_spread_rate      numeric(10,6);
  v_half_spread      numeric(10,6);
  v_ask_price        numeric(10,6);
  v_fee_rate         numeric(10,6);
  v_fee              numeric(12,2);
  v_net              numeric(12,2);
  v_contracts        numeric(14,4);
  v_contracts_at_mid numeric(14,4);
  v_spread_captured  numeric(12,2);
  v_new_pool         numeric(14,4);
  v_winning_shares   numeric(14,4);
  v_est_payout       numeric(12,2);
  v_position_id      uuid;
  v_event_q          text;
  v_tier_cap         numeric(12,2);
  v_user_role        text;
  -- Config values
  v_spread_low       numeric(6,4) := 0.01;
  v_spread_high      numeric(6,4) := 0.02;
  v_fee_floor        numeric(6,4) := 0.01;
  v_fee_ceiling      numeric(6,4) := 0.05;
  v_depth_threshold  numeric(14,2) := 50000;
  v_depth_factor     numeric(10,6);
BEGIN
  -- ▸ AUTH
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;
  IF v_auth_uid <> p_user_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- ▸ RATE LIMIT: 10 purchases per minute
  IF NOT check_rate_limit(v_auth_uid, 'purchase', 10, interval '1 minute') THEN
    RETURN jsonb_build_object('error', 'Demasiadas operaciones. Esperá un momento.');
  END IF;
  PERFORM record_rate_limit(v_auth_uid, 'purchase');

  -- ▸ AMOUNT sanity
  IF p_gross IS NULL OR p_gross < 1 THEN
    RETURN jsonb_build_object('error', 'Monto mínimo: Q1');
  END IF;
  IF p_gross > 100000 THEN
    RETURN jsonb_build_object('error', 'Monto excede límite del sistema');
  END IF;
  IF p_side NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('error', 'Lado inválido: ' || p_side);
  END IF;

  -- ▸ EVENT
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evento no encontrado');
  END IF;
  IF v_event.status <> 'open' THEN
    RETURN jsonb_build_object('error', 'Evento cerrado');
  END IF;
  IF v_event.ends_at IS NOT NULL AND v_event.ends_at < now() THEN
    RETURN jsonb_build_object('error', 'Evento expirado');
  END IF;
  IF p_gross < COALESCE(v_event.min_entry, 1) THEN
    RETURN jsonb_build_object('error', 'Mínimo para este evento: Q' || v_event.min_entry);
  END IF;
  IF p_gross > COALESCE(v_event.max_entry, 500) THEN
    RETURN jsonb_build_object('error', 'Máximo para este evento: Q' || v_event.max_entry);
  END IF;

  -- ▸ PROFILE + TIER
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;
  IF v_profile.tier < COALESCE(v_event.tier_required, 1) THEN
    RETURN jsonb_build_object('error', 'Verificá tu cuenta para participar en este evento');
  END IF;

  v_tier_cap := CASE v_profile.tier WHEN 1 THEN 500 WHEN 2 THEN 2000 WHEN 3 THEN 10000 ELSE 500 END;
  IF p_gross > v_tier_cap THEN
    RETURN jsonb_build_object('error', 'Límite para Nivel ' || v_profile.tier || ': Q' || v_tier_cap);
  END IF;

  v_balance := v_profile.balance;
  IF v_balance < p_gross THEN
    RETURN jsonb_build_object('error', 'Saldo insuficiente');
  END IF;

  v_user_role := COALESCE(v_profile.role, 'user');

  -- ▸ MARKET
  SELECT * INTO v_market FROM event_markets WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mercado no encontrado');
  END IF;
  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado: ' || v_market.status);
  END IF;

  -- ▸ LOAD PLATFORM CONFIG
  SELECT COALESCE(value, 1) / 100 INTO v_spread_low FROM platform_config WHERE key = 'spread_low_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_spread_high FROM platform_config WHERE key = 'spread_high_pct';
  SELECT COALESCE(value, 1) / 100 INTO v_fee_floor FROM platform_config WHERE key = 'fee_floor_pct';
  SELECT COALESCE(value, 5) / 100 INTO v_fee_ceiling FROM platform_config WHERE key = 'fee_ceiling_pct';
  SELECT COALESCE(value, 50000) INTO v_depth_threshold FROM platform_config WHERE key = 'depth_threshold';

  -- ▸ PRICING
  v_total_shares := v_market.yes_shares + v_market.no_shares;
  IF v_total_shares <= 0 THEN
    RETURN jsonb_build_object('error', 'Mercado sin liquidez');
  END IF;

  IF p_side = 'yes' THEN
    v_mid_price := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid_price := ROUND(v_market.no_shares / v_total_shares, 6);
  END IF;

  -- Dynamic spread
  v_skew := ABS(v_mid_price - 0.50) / 0.50;
  IF v_market.spread_enabled THEN
    v_spread_rate := v_spread_low + (v_spread_high - v_spread_low) * v_skew;
    v_half_spread := ROUND(v_spread_rate / 2, 6);
    v_ask_price   := LEAST(GREATEST(v_mid_price + v_half_spread, 0.02), 0.99);
  ELSE
    v_ask_price   := v_mid_price;
    v_spread_rate := 0;
  END IF;

  -- Dynamic fee (INVERSE: high at 50/50, low at extremes)
  v_depth_factor := LEAST(v_market.pool_total / GREATEST(v_depth_threshold, 1), 1.0);
  v_fee_rate := v_fee_ceiling - (v_fee_ceiling - v_fee_floor) * v_skew * v_depth_factor;
  v_fee_rate := GREATEST(LEAST(v_fee_rate, v_fee_ceiling), v_fee_floor);

  -- Market makers and sponsors are fee-exempt
  IF v_user_role IN ('market_maker', 'sponsor') THEN
    v_fee_rate := 0;
  END IF;

  v_fee := ROUND(p_gross * v_fee_rate, 2);
  v_net := p_gross - v_fee;
  v_contracts := ROUND(v_net / v_ask_price, 4);
  v_contracts_at_mid := ROUND(v_net / v_mid_price, 4);
  v_spread_captured := GREATEST(ROUND(v_contracts_at_mid - v_contracts, 2), 0);

  -- ▸ PARIMUTUEL PAYOUT ESTIMATE
  -- Pool grows with each purchase. Payout = (my_shares / winning_shares) × new_pool
  v_new_pool := v_market.pool_total + v_net;
  IF p_side = 'yes' THEN
    v_winning_shares := v_market.yes_shares + v_contracts;
  ELSE
    v_winning_shares := v_market.no_shares + v_contracts;
  END IF;
  v_est_payout := ROUND((v_contracts / v_winning_shares) * v_new_pool, 2);

  -- ▸ EXECUTE (no liability cap in parimutuel — pool always grows)

  -- Deduct balance
  v_new_balance := v_balance - p_gross;
  UPDATE profiles SET balance = v_new_balance WHERE id = p_user_id;

  -- Create position
  INSERT INTO positions (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES (p_event_id, p_user_id, p_side, v_contracts, v_ask_price, v_est_payout, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  -- Log transaction
  INSERT INTO market_transactions (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, spread_captured, tx_type)
  VALUES (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net, v_spread_captured, 'purchase');

  -- Mint shares + grow pool (PARIMUTUEL: net goes into pool_total)
  UPDATE event_markets SET
    yes_shares     = CASE WHEN p_side = 'yes' THEN ROUND(yes_shares + v_contracts, 4) ELSE yes_shares END,
    no_shares      = CASE WHEN p_side = 'no'  THEN ROUND(no_shares + v_contracts, 4) ELSE no_shares END,
    pool_total     = pool_total + v_net,            -- ← KEY: pool grows
    bet_pool       = bet_pool + v_net,              -- track bet money separately
    fees_collected = fees_collected + v_fee,         -- track fees
    pool_committed = pool_committed + v_net,         -- repurposed: total bet volume net
    updated_at     = now()
  WHERE event_id = p_event_id;

  -- Sync events.pool_size so frontend reads live value
  UPDATE events SET pool_size = ROUND(pool_size + v_net) WHERE id = p_event_id;

  -- Upsert predictions (additive for incremental positioning)
  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (p_user_id, p_event_id, p_side, p_gross, v_est_payout)
  ON CONFLICT (user_id, event_id, side) DO UPDATE
    SET side            = EXCLUDED.side,
        amount          = predictions.amount + EXCLUDED.amount,
        potential_cobro = predictions.potential_cobro + EXCLUDED.potential_cobro,
        status          = 'active',
        resolved_at     = NULL;

  -- Ledger entry
  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'vote', -p_gross, v_new_balance,
          COALESCE(v_event_q, p_event_id), v_position_id::text);

  -- Return position details + new prices + pool info
  RETURN jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'price_at_purchase', v_ask_price,
    'payout_if_win',     v_est_payout,
    'fee_paid',          v_fee,
    'gross_amount',      p_gross,
    'spread_captured',   v_spread_captured,
    'spread_rate',       v_spread_rate,
    'mid_price',         v_mid_price,
    'ask_price',         v_ask_price,
    'fee_rate',          v_fee_rate,
    'depth_factor',      v_depth_factor,
    'yes_price_new',     ROUND(
      (v_market.yes_shares + CASE WHEN p_side = 'yes' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'no_price_new',      ROUND(
      (v_market.no_shares + CASE WHEN p_side = 'no' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'pool_total',        v_new_pool,
    'pool_remaining',    v_new_pool,
    'est_payout',        v_est_payout
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

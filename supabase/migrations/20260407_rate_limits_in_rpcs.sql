-- ============================================================
--  Migration: Wire rate limiting into critical RPCs
--  Date: 2026-04-07
--
--  Adds rate limit checks to:
--    - execute_purchase: 10 per minute
--    - execute_sell: 10 per minute
--    - deposit_balance: 5 per minute
--    - withdraw_balance: 3 per minute
--
--  Uses the check_rate_limit + record_rate_limit helpers
--  from 20260407_security_hardening.sql
-- ============================================================

-- Wrap execute_purchase with rate limit
-- (We add the check at the very top, before any locks)

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
  v_auth_uid     uuid := auth.uid();
  v_market       event_markets%rowtype;
  v_event        events%rowtype;
  v_profile      profiles%rowtype;
  v_balance      numeric(12,2);
  v_new_balance  numeric(12,2);
  v_total_shares numeric(14,4);
  v_mid          numeric(10,6);
  v_skew         numeric(10,6);
  v_spread_rate  numeric(10,6);
  v_half_spread  numeric(10,6);
  v_ask          numeric(10,6);
  v_tx_fee_rate  numeric(10,6);
  v_fee          numeric(12,2);
  v_net          numeric(12,2);
  v_contracts    numeric(14,4);
  v_contracts_at_mid numeric(14,4);
  v_spread_captured  numeric(12,2);
  v_payout       numeric(12,2);
  v_new_yes_lia  numeric(12,2);
  v_new_no_lia   numeric(12,2);
  v_max_lia      numeric(12,2);
  v_position_id  uuid;
  v_event_q      text;
  v_tier_cap     numeric(12,2);
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

  -- ▸ MARKET
  SELECT * INTO v_market FROM event_markets WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mercado no encontrado');
  END IF;
  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado: ' || v_market.status);
  END IF;

  -- ▸ PRICING
  SELECT COALESCE(
    (SELECT value / 100 FROM platform_config WHERE key = 'tx_fee_pct'), 0.025
  ) INTO v_tx_fee_rate;

  v_total_shares := v_market.yes_shares + v_market.no_shares;
  IF p_side = 'yes' THEN v_mid := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE v_mid := ROUND(v_market.no_shares / v_total_shares, 6); END IF;

  v_skew        := ABS(v_mid - 0.50) / 0.50;
  v_spread_rate := 0.04 + 0.04 * v_skew;
  v_half_spread := ROUND(v_spread_rate / 2, 6);
  v_ask         := LEAST(GREATEST(v_mid + v_half_spread, 0.02), 0.99);

  v_fee              := ROUND(p_gross * v_tx_fee_rate, 2);
  v_net              := p_gross - v_fee;
  v_contracts        := ROUND(v_net / v_ask, 4);
  v_contracts_at_mid := ROUND(v_net / v_mid, 4);
  v_spread_captured  := GREATEST(ROUND(v_contracts_at_mid - v_contracts, 2), 0);
  v_payout           := ROUND(v_contracts, 2);

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

  -- ▸ EXECUTE
  v_new_balance := v_balance - p_gross;
  UPDATE profiles SET balance = v_new_balance WHERE id = p_user_id;

  INSERT INTO positions (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES (p_event_id, p_user_id, p_side, v_contracts, v_ask, v_contracts, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  INSERT INTO market_transactions (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, spread_captured, tx_type)
  VALUES (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net, v_spread_captured, 'purchase');

  UPDATE event_markets SET
    yes_shares = CASE WHEN p_side = 'yes' THEN ROUND(yes_shares + v_contracts, 4) ELSE yes_shares END,
    no_shares  = CASE WHEN p_side = 'no'  THEN ROUND(no_shares + v_contracts, 4)  ELSE no_shares END,
    max_yes_liability = v_new_yes_lia, max_no_liability = v_new_no_lia,
    pool_committed = v_max_lia, updated_at = now()
  WHERE event_id = p_event_id;

  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (p_user_id, p_event_id, p_side, p_gross, v_payout)
  ON CONFLICT (user_id, event_id) DO UPDATE SET
    side = EXCLUDED.side, amount = EXCLUDED.amount, potential_cobro = EXCLUDED.potential_cobro,
    status = 'active', resolved_at = NULL;

  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'vote', -p_gross, v_new_balance, COALESCE(v_event_q, p_event_id), v_position_id::text);

  RETURN jsonb_build_object(
    'position_id', v_position_id, 'contracts', v_contracts,
    'mid_price', v_mid, 'ask_price', v_ask,
    'spread_rate', v_spread_rate, 'spread_captured', v_spread_captured,
    'price_at_purchase', v_ask, 'payout_if_win', v_payout,
    'fee_paid', v_fee, 'gross_amount', p_gross, 'tx_fee_rate', v_tx_fee_rate,
    'yes_price_new', ROUND(
      (v_market.yes_shares + CASE WHEN p_side = 'yes' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'no_price_new', ROUND(
      (v_market.no_shares + CASE WHEN p_side = 'no' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'pool_remaining', v_market.pool_total - v_max_lia
  );
END;
$$;


-- ── execute_sell with rate limit ────────────────────────────────

CREATE OR REPLACE FUNCTION public.execute_sell(
  p_position_id UUID,
  p_user_id     UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_uid     uuid := auth.uid();
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
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;
  IF v_auth_uid <> p_user_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- ▸ RATE LIMIT: 10 sells per minute
  IF NOT check_rate_limit(v_auth_uid, 'sell', 10, interval '1 minute') THEN
    RETURN jsonb_build_object('error', 'Demasiadas operaciones. Esperá un momento.');
  END IF;
  PERFORM record_rate_limit(v_auth_uid, 'sell');

  SELECT COALESCE(value, 1) / 100 INTO v_spread_low FROM platform_config WHERE key = 'spread_low_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_spread_high FROM platform_config WHERE key = 'spread_high_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_sell_fee_rate FROM platform_config WHERE key = 'sell_fee_pct';

  SELECT * INTO v_pos FROM positions WHERE id = p_position_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Posición no encontrada'); END IF;
  IF v_pos.status IS NOT NULL AND v_pos.status <> 'active' THEN RETURN jsonb_build_object('error', 'Posición ya cerrada'); END IF;

  SELECT * INTO v_market FROM event_markets WHERE event_id = v_pos.event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Mercado no encontrado'); END IF;
  IF v_market.status NOT IN ('open', 'private') THEN RETURN jsonb_build_object('error', 'Mercado cerrado'); END IF;

  v_total_shares := v_market.yes_shares + v_market.no_shares;
  IF v_total_shares <= 0 THEN RETURN jsonb_build_object('error', 'Mercado sin liquidez'); END IF;

  IF v_pos.side = 'yes' THEN v_mid := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE v_mid := ROUND(v_market.no_shares / v_total_shares, 6); END IF;

  v_skew := ABS(v_mid - 0.50) / 0.50;
  v_spread_rate := v_spread_low + (v_spread_high - v_spread_low) * v_skew;
  v_half_spread := ROUND(v_spread_rate / 2, 6);
  v_bid := GREATEST(v_mid - v_half_spread, 0.01);

  v_gross := ROUND(v_pos.contracts * v_bid, 2);
  v_gross_at_mid := ROUND(v_pos.contracts * v_mid, 2);
  v_spread_captured := GREATEST(v_gross_at_mid - v_gross, 0);

  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('market_maker', 'sponsor')) THEN v_fee := 0;
  ELSE v_fee := ROUND(v_gross * v_sell_fee_rate, 2); END IF;
  v_proceeds := v_gross - v_fee;

  UPDATE profiles SET balance = balance + v_proceeds WHERE id = p_user_id RETURNING balance INTO v_new_balance;
  UPDATE positions SET status = 'sold' WHERE id = p_position_id;

  UPDATE event_markets SET
    yes_shares = CASE WHEN v_pos.side = 'yes' THEN GREATEST(yes_shares - v_pos.contracts, 0) ELSE yes_shares END,
    no_shares  = CASE WHEN v_pos.side = 'no'  THEN GREATEST(no_shares - v_pos.contracts, 0) ELSE no_shares END,
    pool_total = GREATEST(pool_total - v_proceeds, 0), bet_pool = GREATEST(bet_pool - v_gross, 0),
    fees_collected = fees_collected + v_fee, updated_at = now()
  WHERE event_id = v_pos.event_id;

  UPDATE events SET pool_size = GREATEST(ROUND(pool_size - v_proceeds), 0) WHERE id = v_pos.event_id;

  INSERT INTO market_transactions (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, spread_captured, tx_type)
  VALUES (p_position_id, v_pos.event_id, p_user_id, v_gross, v_fee, -v_proceeds, v_spread_captured, 'sale');

  SELECT question INTO v_event_q FROM events WHERE id = v_pos.event_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'sell', v_proceeds, v_new_balance, 'Venta: ' || COALESCE(v_event_q, v_pos.event_id), p_position_id::text);

  RETURN jsonb_build_object(
    'ok', true, 'position_id', p_position_id, 'contracts', v_pos.contracts,
    'mid_price', v_mid, 'bid_price', v_bid, 'spread_rate', v_spread_rate,
    'sell_fee_rate', v_sell_fee_rate, 'spread_captured', v_spread_captured,
    'gross', v_gross, 'fee', v_fee, 'proceeds', v_proceeds, 'balance', v_new_balance
  );
END;
$$;


-- ── deposit_balance with rate limit ─────────────────────────────

CREATE OR REPLACE FUNCTION public.deposit_balance(
  p_amount  NUMERIC,
  p_label   TEXT DEFAULT 'Depósito'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_cur_balance  NUMERIC(12,2);
  v_new_balance  NUMERIC(12,2);
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'No autenticado'); END IF;

  -- ▸ RATE LIMIT: 5 deposits per minute
  IF NOT check_rate_limit(v_user_id, 'deposit', 5, interval '1 minute') THEN
    RETURN jsonb_build_object('error', 'Demasiados depósitos. Esperá un momento.');
  END IF;
  PERFORM record_rate_limit(v_user_id, 'deposit');

  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('error', 'Monto inválido'); END IF;
  IF p_amount > 50000 THEN RETURN jsonb_build_object('error', 'Máximo Q50,000 por depósito'); END IF;

  SELECT balance INTO v_cur_balance FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_cur_balance + p_amount > 100000 THEN
    RETURN jsonb_build_object('error', 'Saldo máximo permitido: Q100,000');
  END IF;

  v_new_balance := v_cur_balance + p_amount;
  UPDATE profiles SET balance = v_new_balance WHERE id = v_user_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label)
  VALUES (v_user_id, 'deposit', p_amount, v_new_balance, p_label);

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;


-- ── withdraw_balance with rate limit ────────────────────────────

CREATE OR REPLACE FUNCTION public.withdraw_balance(
  p_amount  NUMERIC,
  p_method  TEXT DEFAULT 'transferencia'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_balance      NUMERIC(12,2);
  v_new_balance  NUMERIC(12,2);
  v_label        TEXT;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'No autenticado'); END IF;

  -- ▸ RATE LIMIT: 3 withdrawals per minute
  IF NOT check_rate_limit(v_user_id, 'withdraw', 3, interval '1 minute') THEN
    RETURN jsonb_build_object('error', 'Demasiados retiros. Esperá un momento.');
  END IF;
  PERFORM record_rate_limit(v_user_id, 'withdraw');

  IF p_amount IS NULL OR p_amount < 50 THEN RETURN jsonb_build_object('error', 'Mínimo Q50 por retiro'); END IF;
  IF p_amount > 25000 THEN RETURN jsonb_build_object('error', 'Máximo Q25,000 por retiro'); END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_balance < p_amount THEN RETURN jsonb_build_object('error', 'Saldo insuficiente'); END IF;

  v_new_balance := v_balance - p_amount;
  v_label := 'Retiro vía ' || COALESCE(p_method, 'transferencia');

  UPDATE profiles SET balance = v_new_balance WHERE id = v_user_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label)
  VALUES (v_user_id, 'withdraw', -p_amount, v_new_balance, v_label);

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;


NOTIFY pgrst, 'reload schema';

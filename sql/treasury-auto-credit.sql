-- ============================================================
--  Treasury Auto-Credit + Sweep Reconciliation
--
--  Problem: Transaction fees (and spread captured) are tracked in
--  event_markets.fees_collected but never credited to the treasury
--  account. The 4 existing treasury ledger entries were manual.
--
--  This migration:
--    1. Adds 'fee_revenue' type to balance_ledger CHECK constraint
--    2. Patches execute_purchase to auto-credit treasury per trade
--    3. Patches execute_sell to auto-credit treasury per trade
--    4. Creates sweep_to_treasury() RPC for admin reconciliation
-- ============================================================

-- ── 0a. Add spread_collected column to event_markets ─────────
--  Tracks total spread captured across all trades for an event.
--  Needed so settle_predictions can compute LP margin on fee+spread.

ALTER TABLE public.event_markets
  ADD COLUMN IF NOT EXISTS spread_collected numeric(14,4) NOT NULL DEFAULT 0;

-- ── 0b. Extend balance_ledger type constraint ────────────────

ALTER TABLE public.balance_ledger
  DROP CONSTRAINT IF EXISTS balance_ledger_type_check;

ALTER TABLE public.balance_ledger
  ADD CONSTRAINT balance_ledger_type_check
  CHECK (type IN (
    'deposit','withdraw','vote','win','loss','refund',
    'sell','lp_deposit','lp_return',
    'fee_revenue','sweep'   -- NEW: per-trade auto-credit + batch sweep
  ));


-- ── 1. execute_purchase — with treasury auto-credit ──────────

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
  -- Treasury auto-credit
  v_treasury_id      uuid := '00000000-0000-0000-0000-000000000001';
  v_lp_share_pct     numeric(10,6) := 0;
  v_lp_commission    numeric(12,2) := 0;
  v_treasury_credit  numeric(12,2) := 0;
  v_treasury_bal     numeric(12,2);
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
  v_new_pool := v_market.pool_total + v_net;
  IF p_side = 'yes' THEN
    v_winning_shares := v_market.yes_shares + v_contracts;
  ELSE
    v_winning_shares := v_market.no_shares + v_contracts;
  END IF;
  v_est_payout := ROUND((v_contracts / v_winning_shares) * v_new_pool, 2);

  -- ▸ EXECUTE

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
    pool_total     = pool_total + v_net,
    bet_pool       = bet_pool + v_net,
    fees_collected    = fees_collected + v_fee,
    spread_collected  = spread_collected + v_spread_captured,
    pool_committed    = pool_committed + v_net,
    updated_at        = now()
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

  -- Ledger entry for user
  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'vote', -p_gross, v_new_balance,
          COALESCE(v_event_q, p_event_id), v_position_id::text);

  -- ▸ TREASURY AUTO-CREDIT ──────────────────────────────────
  -- Revenue = fee + spread_captured - LP commission
  -- LP commission = SUM(return_pct) of active LPs for this event × (fee + spread)
  IF v_fee + v_spread_captured > 0 THEN
    SELECT COALESCE(SUM(return_pct), 0) INTO v_lp_share_pct
    FROM lp_deposits
    WHERE event_id = p_event_id AND status = 'active';

    v_lp_commission := ROUND(v_lp_share_pct * (v_fee + v_spread_captured), 2);
    v_treasury_credit := ROUND(v_fee + v_spread_captured - v_lp_commission, 2);

    IF v_treasury_credit > 0 THEN
      UPDATE profiles
      SET balance = balance + v_treasury_credit
      WHERE id = v_treasury_id
      RETURNING balance INTO v_treasury_bal;

      INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_treasury_id, 'fee_revenue', v_treasury_credit,
              COALESCE(v_treasury_bal, v_treasury_credit),
              'Fee+spread compra: ' || COALESCE(v_event_q, p_event_id),
              v_position_id::text);
    END IF;
  END IF;

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
    'lp_commission',     v_lp_commission,
    'treasury_credit',   v_treasury_credit,
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


-- ── 2. execute_sell — with treasury auto-credit ──────────────

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
  -- Treasury auto-credit
  v_treasury_id      uuid := '00000000-0000-0000-0000-000000000001';
  v_lp_share_pct     numeric(10,6) := 0;
  v_lp_commission    numeric(12,2) := 0;
  v_treasury_credit  numeric(12,2) := 0;
  v_treasury_bal     numeric(12,2);
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

  -- Pool accounting for sell:
  --   pool_total shrinks by proceeds (what seller receives)
  --   bet_pool shrinks by gross (full position value at bid)
  --   The sell fee (gross - proceeds) stays in the pool → extract it to treasury
  UPDATE event_markets SET
    yes_shares = CASE WHEN v_pos.side = 'yes' THEN GREATEST(yes_shares - v_pos.contracts, 0) ELSE yes_shares END,
    no_shares  = CASE WHEN v_pos.side = 'no'  THEN GREATEST(no_shares - v_pos.contracts, 0) ELSE no_shares END,
    pool_total = GREATEST(pool_total - v_gross, 0),  -- ← CHANGED: shrink by gross, not proceeds (fee extracted separately to treasury)
    bet_pool = GREATEST(bet_pool - v_gross, 0),
    fees_collected = fees_collected + v_fee,
    spread_collected = spread_collected + v_spread_captured,
    updated_at = now()
  WHERE event_id = v_pos.event_id;

  UPDATE events SET pool_size = GREATEST(ROUND(pool_size - v_gross), 0) WHERE id = v_pos.event_id;

  INSERT INTO market_transactions (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, spread_captured, tx_type)
  VALUES (p_position_id, v_pos.event_id, p_user_id, v_gross, v_fee, -v_proceeds, v_spread_captured, 'sale');

  SELECT question INTO v_event_q FROM events WHERE id = v_pos.event_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'sell', v_proceeds, v_new_balance, 'Venta: ' || COALESCE(v_event_q, v_pos.event_id), p_position_id::text);

  -- ▸ TREASURY AUTO-CREDIT ──────────────────────────────────
  -- For sells: fee was deducted from seller, spread_captured stays in pool implicitly.
  -- We credit treasury with fee (extracted from pool above) + spread_captured minus LP commission.
  IF v_fee + v_spread_captured > 0 THEN
    SELECT COALESCE(SUM(return_pct), 0) INTO v_lp_share_pct
    FROM lp_deposits
    WHERE event_id = v_pos.event_id AND status = 'active';

    v_lp_commission := ROUND(v_lp_share_pct * (v_fee + v_spread_captured), 2);
    v_treasury_credit := ROUND(v_fee + v_spread_captured - v_lp_commission, 2);

    IF v_treasury_credit > 0 THEN
      UPDATE profiles
      SET balance = balance + v_treasury_credit
      WHERE id = v_treasury_id
      RETURNING balance INTO v_treasury_bal;

      INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_treasury_id, 'fee_revenue', v_treasury_credit,
              COALESCE(v_treasury_bal, v_treasury_credit),
              'Fee+spread venta: ' || COALESCE(v_event_q, v_pos.event_id),
              p_position_id::text);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'position_id', p_position_id, 'contracts', v_pos.contracts,
    'mid_price', v_mid, 'bid_price', v_bid, 'spread_rate', v_spread_rate,
    'sell_fee_rate', v_sell_fee_rate, 'spread_captured', v_spread_captured,
    'gross', v_gross, 'fee', v_fee, 'proceeds', v_proceeds, 'balance', v_new_balance,
    'lp_commission', v_lp_commission, 'treasury_credit', v_treasury_credit
  );
END;
$$;


-- ── 3. sweep_to_treasury — admin reconciliation RPC ──────────
--
--  Scans all market_transactions that have NOT already been
--  credited to treasury (by checking for matching reference_id
--  in treasury ledger). Computes fee + spread - LP commission
--  for each, then credits treasury in one batch.

CREATE OR REPLACE FUNCTION public.sweep_to_treasury()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_uid       uuid := auth.uid();
  v_treasury_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_is_admin       boolean;
  v_tx             RECORD;
  v_lp_share_pct   numeric(10,6);
  v_lp_commission  numeric(12,2);
  v_tx_revenue     numeric(12,2);
  v_total_swept    numeric(12,2) := 0;
  v_tx_count       int := 0;
  v_treasury_bal   numeric(12,2);
  v_running_bal    numeric(12,2);
  v_event_q        text;
BEGIN
  -- Admin-only
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_auth_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('error', 'Solo administradores');
  END IF;

  -- Read current treasury balance for running total
  SELECT balance INTO v_running_bal FROM profiles WHERE id = v_treasury_id;
  v_running_bal := COALESCE(v_running_bal, 0);

  -- Find all market_transactions whose position_id is NOT already
  -- referenced in a treasury fee_revenue or sweep ledger entry
  FOR v_tx IN
    SELECT
      mt.position_id,
      mt.event_id,
      mt.fee_deducted,
      mt.spread_captured,
      mt.tx_type
    FROM market_transactions mt
    WHERE (mt.fee_deducted > 0 OR mt.spread_captured > 0)
    AND NOT EXISTS (
      SELECT 1
      FROM balance_ledger bl
      WHERE bl.user_id = v_treasury_id
        AND bl.type IN ('fee_revenue', 'sweep')
        AND bl.reference_id = mt.position_id::text
    )
    ORDER BY mt.created_at
  LOOP
    -- Compute LP commission for this event
    SELECT COALESCE(SUM(return_pct), 0) INTO v_lp_share_pct
    FROM lp_deposits
    WHERE event_id = v_tx.event_id AND status = 'active';

    v_lp_commission := ROUND(v_lp_share_pct * (v_tx.fee_deducted + v_tx.spread_captured), 2);
    v_tx_revenue := ROUND(v_tx.fee_deducted + v_tx.spread_captured - v_lp_commission, 2);

    IF v_tx_revenue > 0 THEN
      v_total_swept := v_total_swept + v_tx_revenue;
      v_running_bal := v_running_bal + v_tx_revenue;
      v_tx_count := v_tx_count + 1;

      -- Individual ledger entry with correct running balance
      SELECT question INTO v_event_q FROM events WHERE id = v_tx.event_id;

      INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_treasury_id, 'sweep', v_tx_revenue, v_running_bal,
              'Sweep ' || v_tx.tx_type || ': ' || COALESCE(v_event_q, v_tx.event_id),
              v_tx.position_id::text);
    END IF;
  END LOOP;

  -- Credit treasury balance in one shot
  IF v_total_swept > 0 THEN
    UPDATE profiles
    SET balance = balance + v_total_swept
    WHERE id = v_treasury_id
    RETURNING balance INTO v_treasury_bal;
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'swept_total',  v_total_swept,
    'tx_count',     v_tx_count,
    'treasury_bal', v_treasury_bal
  );
END;
$$;


-- ── 4. settle_predictions — aligned LP margin formula ─────────
--
--  Changes from previous version:
--    1. LP margin now uses fees_collected + spread_collected (not just fees)
--       This aligns with RevenuePanel and the auto-credit formula.
--    2. LP margin is debited from treasury (since fees were never in the pool).
--    3. Added v_lp_total_margin tracking for the return object.

CREATE OR REPLACE FUNCTION public.settle_predictions(
  p_event_id text,
  p_result   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count            integer := 0;
  v_row              record;
  v_lp_row           record;
  v_new_balance      numeric(12,2);
  v_event_q          text;
  v_market           event_markets%rowtype;
  v_total_pool       numeric(14,4);
  v_lp_total_owed    numeric(12,2) := 0;
  v_lp_actual_paid   numeric(12,2) := 0;
  v_lp_total_margin  numeric(12,2) := 0;
  v_pool_after_lp    numeric(14,4);
  v_winning_shares   numeric(14,4) := 0;
  v_user_payout      numeric(12,2);
  v_net_margins      numeric(12,2) := 0;
  v_lp_margin_share  numeric(12,2);
  v_lp_payout        numeric(12,2);
  v_lp_shortfall_pct numeric(10,6);
  -- Treasury debit for LP margin
  v_treasury_id      uuid := '00000000-0000-0000-0000-000000000001';
  v_treasury_bal     numeric(12,2);
BEGIN
  -- Admin only
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get market state
  SELECT * INTO v_market
  FROM event_markets
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  v_total_pool := v_market.pool_total;

  SELECT question INTO v_event_q FROM public.events WHERE id = p_event_id;

  -- ── Step 1: Calculate total winning shares ──
  SELECT COALESCE(SUM(contracts), 0) INTO v_winning_shares
  FROM public.positions
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND (side = p_result OR side = (p_result || '::yes'));

  -- ── Step 2: Pay LP capital + share of net margins ──
  -- LPs get: capital back + (return_pct × net margins)
  -- Net margins = fees_collected + spread_collected (ALIGNED with RevenuePanel)
  -- LP margin is paid from treasury, not from pool (fees were never in pool)

  v_net_margins := COALESCE(v_market.fees_collected, 0) + COALESCE(v_market.spread_collected, 0);

  -- Calculate total LP capital to return
  SELECT COALESCE(SUM(amount), 0)
  INTO v_lp_total_owed
  FROM lp_deposits
  WHERE event_id = p_event_id AND status = 'active';

  -- LP payout = capital + (their return_pct × total net margins)
  -- Check if pool can cover LP capital return
  IF v_lp_total_owed <= v_total_pool THEN
    v_pool_after_lp := v_total_pool - v_lp_total_owed;
    v_lp_shortfall_pct := 0;
  ELSE
    v_lp_shortfall_pct := 1 - (v_total_pool / v_lp_total_owed);
    v_pool_after_lp := 0;
  END IF;

  -- Pay each LP: capital back (from pool) + margin share (from treasury)
  FOR v_lp_row IN
    SELECT id, user_id, amount, return_pct, COALESCE(fees_at_deposit, 0) AS fees_at_deposit
    FROM lp_deposits
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    -- Capital return (pro-rata if shortfall)
    v_lp_payout := ROUND(v_lp_row.amount * (1 - v_lp_shortfall_pct), 2);
    -- Margin share: LP's return_pct × (total fee+spread - snapshot at deposit time)
    -- Note: fees_at_deposit was snapshot of fees_collected only;
    -- for spread we assume LP earns on all spread since deposit (conservative approximation)
    v_lp_margin_share := ROUND(v_lp_row.return_pct * GREATEST(v_net_margins - v_lp_row.fees_at_deposit, 0), 2);
    v_lp_payout := v_lp_payout + v_lp_margin_share;
    v_lp_actual_paid := v_lp_actual_paid + v_lp_payout;
    v_lp_total_margin := v_lp_total_margin + v_lp_margin_share;

    -- Credit LP balance
    UPDATE profiles
    SET balance = balance + v_lp_payout
    WHERE id = v_lp_row.user_id
    RETURNING balance INTO v_new_balance;

    -- Update LP deposit record
    UPDATE lp_deposits
    SET status = CASE WHEN v_lp_shortfall_pct > 0 THEN 'partial_loss' ELSE 'returned' END,
        payout = v_lp_payout
    WHERE id = v_lp_row.id;

    -- Ledger entry
    INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
    VALUES (v_lp_row.user_id, 'lp_return', v_lp_payout, v_new_balance,
            'Retorno LP: ' || COALESCE(v_event_q, p_event_id), v_lp_row.id::text);
  END LOOP;

  -- ── Step 2b: Debit treasury for LP margin paid ──
  -- The LP margin was withheld from auto-credit per trade,
  -- and now the LP is collecting it. Debit treasury.
  IF v_lp_total_margin > 0 THEN
    UPDATE profiles
    SET balance = balance - v_lp_total_margin
    WHERE id = v_treasury_id
    RETURNING balance INTO v_treasury_bal;

    INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
    VALUES (v_treasury_id, 'withdraw', -v_lp_total_margin, v_treasury_bal,
            'Comisión LP pagada: ' || COALESCE(v_event_q, p_event_id), p_event_id);
  END IF;

  -- ── Step 3: Split remaining pool among winners proportionally ──
  IF v_winning_shares > 0 AND v_pool_after_lp > 0 THEN
    FOR v_row IN
      SELECT p.id AS pred_id, p.user_id, p.side,
             SUM(pos.contracts) AS user_shares
      FROM predictions p
      JOIN positions pos ON pos.event_id = p.event_id
                        AND pos.user_id = p.user_id
                        AND pos.side = p.side
                        AND (pos.status IS NULL OR pos.status = 'active')
      WHERE p.event_id = p_event_id
        AND p.status = 'active'
        AND (p.side = p_result OR p.side = (p_result || '::yes'))
      GROUP BY p.id, p.user_id, p.side
    LOOP
      -- Proportional payout: (your shares / total winning shares) × remaining pool
      v_user_payout := ROUND((v_row.user_shares / v_winning_shares) * v_pool_after_lp, 2);

      -- Mark prediction as won
      UPDATE predictions
      SET status = 'won', resolved_at = now(), potential_cobro = v_user_payout
      WHERE id = v_row.pred_id;

      -- Credit user balance
      UPDATE profiles
      SET balance             = balance + v_user_payout,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + v_user_payout
      WHERE id = v_row.user_id
      RETURNING balance INTO v_new_balance;

      -- Ledger entry
      INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_row.user_id, 'win', v_user_payout, v_new_balance,
              '¡Lo sabías! ' || COALESCE(v_event_q, p_event_id), v_row.pred_id::text);

      v_count := v_count + 1;
    END LOOP;
  END IF;

  -- ── Step 4: Mark losers ──
  UPDATE predictions
  SET status = 'lost', resolved_at = now()
  WHERE event_id = p_event_id
    AND status = 'active'
    AND side <> p_result
    AND side <> (p_result || '::yes');

  -- Ledger entries for losers
  FOR v_row IN
    SELECT id, user_id FROM predictions
    WHERE event_id = p_event_id AND status = 'lost' AND resolved_at >= now() - interval '5 seconds'
  LOOP
    SELECT balance INTO v_new_balance FROM profiles WHERE id = v_row.user_id;
    INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
    VALUES (v_row.user_id, 'loss', 0, v_new_balance,
            'Esta vez no: ' || COALESCE(v_event_q, p_event_id), v_row.id::text);
    v_count := v_count + 1;
  END LOOP;

  -- ── Step 5: Mark positions won/lost ──
  UPDATE positions SET status = 'won'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND (side = p_result OR side = (p_result || '::yes'));

  UPDATE positions SET status = 'lost'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND side <> p_result
    AND side <> (p_result || '::yes');

  -- ── Step 6: Mark event resolved ──
  UPDATE events SET status = 'resolved', result = p_result
  WHERE id = p_event_id;

  UPDATE event_markets SET status = 'settled', result = p_result
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'predictions_processed', v_count,
    'total_pool',            v_total_pool,
    'net_margins',           v_net_margins,
    'lp_capital_returned',   v_lp_total_owed,
    'lp_margin_earned',      v_lp_total_margin,
    'lp_actual_paid',        v_lp_actual_paid,
    'pool_to_winners',       v_pool_after_lp,
    'winning_shares',        v_winning_shares,
    'lp_shortfall_pct',      ROUND(v_lp_shortfall_pct * 100, 2),
    'treasury_debited',      v_lp_total_margin
  );
END;
$$;


NOTIFY pgrst, 'reload schema';

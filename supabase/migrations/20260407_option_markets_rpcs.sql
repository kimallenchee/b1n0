-- ============================================================
--  Migration: Option Market RPCs — version-controlled + hardened
--  Date: 2026-04-07
--
--  These RPCs existed in the Supabase dashboard but were NOT
--  in the migration chain. This migration captures them with:
--    - auth.uid() enforcement on execute_option_purchase
--    - Rate limiting on execute_option_purchase
--    - Tier + entry limit checks
--    - Admin check on initialize_option_markets
--
--  If the functions already exist in your Supabase instance,
--  CREATE OR REPLACE will update them in place.
-- ============================================================


-- ── 1. option_markets table (if not exists) ─────────────────────

CREATE TABLE IF NOT EXISTS public.option_markets (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       TEXT          NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  option_label   TEXT          NOT NULL,
  yes_shares     NUMERIC(14,4) NOT NULL DEFAULT 1000,
  no_shares      NUMERIC(14,4) NOT NULL DEFAULT 1000,
  pool_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  pool_committed NUMERIC(12,2) NOT NULL DEFAULT 0,
  bet_pool       NUMERIC(12,2) NOT NULL DEFAULT 0,
  fees_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_yes_liability NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_no_liability  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT          NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'voided', 'private')),
  result         TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (event_id, option_label)
);

ALTER TABLE public.option_markets ENABLE ROW LEVEL SECURITY;

-- Anyone can read option markets (prices are public)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'option_markets' AND policyname = 'option_markets_public_read'
  ) THEN
    CREATE POLICY "option_markets_public_read"
      ON public.option_markets FOR SELECT USING (true);
  END IF;
END $$;


-- ── 2. initialize_option_markets — admin only ───────────────────

DROP FUNCTION IF EXISTS public.initialize_option_markets(TEXT);

CREATE OR REPLACE FUNCTION public.initialize_option_markets(
  p_event_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event    events%ROWTYPE;
  v_options  TEXT[];
  v_label    TEXT;
  v_sponsor  NUMERIC(12,2);
  v_margin   NUMERIC(6,4) := 0.15;
  v_share    NUMERIC(12,2);
  v_count    INTEGER := 0;
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('error', 'No autorizado — solo admin');
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evento no encontrado');
  END IF;

  -- Get options from event (stored as comma-separated in options column or sides)
  -- Attempt to parse from event options field
  IF v_event.options IS NOT NULL AND v_event.options <> '' THEN
    v_options := string_to_array(v_event.options, ',');
  ELSE
    RETURN jsonb_build_object('error', 'Evento no tiene opciones definidas');
  END IF;

  -- Read sponsor margin from config
  SELECT COALESCE(value, 15) / 100 INTO v_margin
  FROM platform_config WHERE key = 'sponsor_margin_pct';

  v_sponsor := COALESCE(v_event.sponsor_amount, 0);

  FOREACH v_label IN ARRAY v_options LOOP
    v_label := TRIM(v_label);
    IF v_label = '' THEN CONTINUE; END IF;

    v_share := CASE
      WHEN array_length(v_options, 1) > 0
      THEN ROUND(v_sponsor * (1 - v_margin) / array_length(v_options, 1), 2)
      ELSE 0
    END;

    INSERT INTO option_markets (event_id, option_label, pool_total, yes_shares, no_shares)
    VALUES (p_event_id, v_label, v_share, 1000, 1000)
    ON CONFLICT (event_id, option_label) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'options_created', v_count);
END;
$$;


-- ── 3. preview_option_purchase — read-only ──────────────────────

DROP FUNCTION IF EXISTS public.preview_option_purchase(TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.preview_option_purchase(
  p_event_id     TEXT,
  p_option_label TEXT,
  p_side         TEXT,
  p_gross        NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_market       option_markets%ROWTYPE;
  v_total_shares NUMERIC(14,4);
  v_mid          NUMERIC(10,6);
  v_skew         NUMERIC(10,6);
  v_spread_rate  NUMERIC(10,6);
  v_half_spread  NUMERIC(10,6);
  v_ask          NUMERIC(10,6);
  v_tx_fee_rate  NUMERIC(10,6);
  v_fee          NUMERIC(12,2);
  v_net          NUMERIC(12,2);
  v_contracts    NUMERIC(14,4);
  v_payout       NUMERIC(12,2);
  v_new_yes_lia  NUMERIC(12,2);
  v_new_no_lia   NUMERIC(12,2);
  v_max_lia      NUMERIC(12,2);
BEGIN
  SELECT * INTO v_market
  FROM option_markets
  WHERE event_id = p_event_id AND option_label = p_option_label;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado de opción no encontrado');
  END IF;

  IF v_market.status <> 'open' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado cerrado');
  END IF;

  IF p_side NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Lado inválido');
  END IF;

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

  v_fee      := ROUND(p_gross * v_tx_fee_rate, 2);
  v_net      := p_gross - v_fee;
  v_contracts := ROUND(v_net / v_ask, 4);
  v_payout   := ROUND(v_contracts, 2);

  IF p_side = 'yes' THEN
    v_new_yes_lia := v_market.max_yes_liability + v_payout;
    v_new_no_lia  := v_market.max_no_liability;
  ELSE
    v_new_yes_lia := v_market.max_yes_liability;
    v_new_no_lia  := v_market.max_no_liability + v_payout;
  END IF;
  v_max_lia := GREATEST(v_new_yes_lia, v_new_no_lia);

  RETURN jsonb_build_object(
    'valid',         v_max_lia <= v_market.pool_total,
    'reason',        CASE WHEN v_max_lia > v_market.pool_total THEN 'Pool lleno' ELSE null END,
    'price',         v_ask,
    'mid_price',     v_mid,
    'spread_rate',   v_spread_rate,
    'fee',           v_fee,
    'net',           v_net,
    'contracts',     v_contracts,
    'payout_if_win', v_payout,
    'pool_remaining', v_market.pool_total - v_max_lia,
    'pool_committed', v_max_lia,
    'pool_total',    v_market.pool_total
  );
END;
$$;


-- ── 4. execute_option_purchase — HARDENED ────────────────────────
--
--  Security:
--    ✓ auth.uid() must match p_user_id
--    ✓ Rate limited (10/min)
--    ✓ Tier + entry limit checks
--    ✓ Event status + expiration check

DROP FUNCTION IF EXISTS public.execute_option_purchase(TEXT, UUID, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.execute_option_purchase(
  p_event_id     TEXT,
  p_user_id      UUID,
  p_option_label TEXT,
  p_side         TEXT,
  p_gross        NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_uid     UUID := auth.uid();
  v_market       option_markets%ROWTYPE;
  v_event        events%ROWTYPE;
  v_profile      profiles%ROWTYPE;
  v_balance      NUMERIC(12,2);
  v_new_balance  NUMERIC(12,2);
  v_total_shares NUMERIC(14,4);
  v_mid          NUMERIC(10,6);
  v_skew         NUMERIC(10,6);
  v_spread_rate  NUMERIC(10,6);
  v_half_spread  NUMERIC(10,6);
  v_ask          NUMERIC(10,6);
  v_tx_fee_rate  NUMERIC(10,6);
  v_fee          NUMERIC(12,2);
  v_net          NUMERIC(12,2);
  v_contracts    NUMERIC(14,4);
  v_contracts_at_mid NUMERIC(14,4);
  v_spread_captured  NUMERIC(12,2);
  v_payout       NUMERIC(12,2);
  v_new_yes_lia  NUMERIC(12,2);
  v_new_no_lia   NUMERIC(12,2);
  v_max_lia      NUMERIC(12,2);
  v_position_id  UUID;
  v_event_q      TEXT;
  v_tier_cap     NUMERIC(12,2);
BEGIN
  -- ▸ AUTH
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;
  IF v_auth_uid <> p_user_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- ▸ RATE LIMIT
  IF NOT check_rate_limit(v_auth_uid, 'purchase', 10, interval '1 minute') THEN
    RETURN jsonb_build_object('error', 'Demasiadas operaciones. Esperá un momento.');
  END IF;
  PERFORM record_rate_limit(v_auth_uid, 'purchase');

  -- ▸ BASIC VALIDATION
  IF p_gross IS NULL OR p_gross < 1 THEN
    RETURN jsonb_build_object('error', 'Monto mínimo: Q1');
  END IF;
  IF p_gross > 100000 THEN
    RETURN jsonb_build_object('error', 'Monto excede límite del sistema');
  END IF;
  IF p_side NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('error', 'Lado inválido');
  END IF;

  -- ▸ EVENT
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Evento no encontrado'); END IF;
  IF v_event.status <> 'open' THEN RETURN jsonb_build_object('error', 'Evento cerrado'); END IF;
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
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Usuario no encontrado'); END IF;
  IF v_profile.tier < COALESCE(v_event.tier_required, 1) THEN
    RETURN jsonb_build_object('error', 'Verificá tu cuenta para participar en este evento');
  END IF;

  v_tier_cap := CASE v_profile.tier WHEN 1 THEN 500 WHEN 2 THEN 2000 WHEN 3 THEN 10000 ELSE 500 END;
  IF p_gross > v_tier_cap THEN
    RETURN jsonb_build_object('error', 'Límite para Nivel ' || v_profile.tier || ': Q' || v_tier_cap);
  END IF;

  v_balance := v_profile.balance;
  IF v_balance < p_gross THEN RETURN jsonb_build_object('error', 'Saldo insuficiente'); END IF;

  -- ▸ OPTION MARKET
  SELECT * INTO v_market
  FROM option_markets
  WHERE event_id = p_event_id AND option_label = p_option_label
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Mercado de opción no encontrado'); END IF;
  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado');
  END IF;

  -- ▸ PRICING (same AMM as binary)
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

  UPDATE option_markets SET
    yes_shares = CASE WHEN p_side = 'yes' THEN ROUND(yes_shares + v_contracts, 4) ELSE yes_shares END,
    no_shares  = CASE WHEN p_side = 'no'  THEN ROUND(no_shares + v_contracts, 4)  ELSE no_shares END,
    max_yes_liability = v_new_yes_lia, max_no_liability = v_new_no_lia,
    pool_committed = v_max_lia, updated_at = now()
  WHERE event_id = p_event_id AND option_label = p_option_label;

  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (p_user_id, p_event_id, p_option_label || ':' || p_side, p_gross, v_payout)
  ON CONFLICT (user_id, event_id) DO UPDATE SET
    side = EXCLUDED.side, amount = predictions.amount + EXCLUDED.amount,
    potential_cobro = predictions.potential_cobro + EXCLUDED.potential_cobro,
    status = 'active', resolved_at = NULL;

  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'vote', -p_gross, v_new_balance,
          COALESCE(v_event_q, p_event_id) || ' — ' || p_option_label, v_position_id::text);

  RETURN jsonb_build_object(
    'position_id', v_position_id, 'contracts', v_contracts,
    'mid_price', v_mid, 'ask_price', v_ask,
    'spread_rate', v_spread_rate, 'spread_captured', v_spread_captured,
    'price_at_purchase', v_ask, 'payout_if_win', v_payout,
    'fee_paid', v_fee, 'gross_amount', p_gross, 'tx_fee_rate', v_tx_fee_rate,
    'pool_remaining', v_market.pool_total - v_max_lia,
    'pool_committed', v_max_lia, 'pool_total', v_market.pool_total
  );
END;
$$;


NOTIFY pgrst, 'reload schema';

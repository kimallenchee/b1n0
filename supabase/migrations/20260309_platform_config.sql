-- ============================================================
--  Migration: platform_config — configurable platform rates
--
--  Stores all platform-level rates in a single key/value table.
--  Admin-only writes via update_platform_config() RPC.
--  All SQL functions read from this table instead of hardcoding.
--
--  Keys:
--    sponsor_margin_pct   platform cut from sponsor invoice (default 15)
--    tx_fee_pct           fee per purchase/resale (default 2.5)
--    spread_low_pct       AMM bid/ask spread floor (default 4)
--    spread_high_pct      AMM bid/ask spread ceiling (default 8)
-- ============================================================

-- ── 1. platform_config table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_config (
  key        TEXT          PRIMARY KEY,
  value      NUMERIC(10,4) NOT NULL,
  label      TEXT,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- RLS: anyone can read, only admin can write (via the RPC below)
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_config_read"   ON public.platform_config;
DROP POLICY IF EXISTS "platform_config_write"  ON public.platform_config;

CREATE POLICY "platform_config_read"
  ON public.platform_config FOR SELECT USING (true);

CREATE POLICY "platform_config_write"
  ON public.platform_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ── 2. Seed default values ───────────────────────────────────

INSERT INTO public.platform_config (key, value, label) VALUES
  ('sponsor_margin_pct', 15,  'Margen del patrocinador (%)'),
  ('tx_fee_pct',          2.5, 'Comisión por transacción (%)'),
  ('spread_low_pct',      4,   'Spread mínimo (%)'),
  ('spread_high_pct',     8,   'Spread máximo (%)')
ON CONFLICT (key) DO NOTHING;

-- ── 3. update_platform_config — admin-only RPC ────────────────

CREATE OR REPLACE FUNCTION public.update_platform_config(
  p_key   TEXT,
  p_value NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.platform_config
  SET value = p_value, updated_at = now()
  WHERE key = p_key;

  IF NOT FOUND THEN
    INSERT INTO public.platform_config (key, value)
    VALUES (p_key, p_value);
  END IF;
END;
$$;

-- ── 4. execute_purchase — reads tx_fee_pct from config ────────
--
--  Only change from v2: fee rate read from platform_config
--  instead of hardcoded 0.025. Falls back to 2.5% if missing.

DROP FUNCTION IF EXISTS public.execute_purchase(text, uuid, text, numeric);
DROP FUNCTION IF EXISTS public.execute_purchase(text, uuid, text, numeric(12,2));

CREATE FUNCTION public.execute_purchase(
  p_event_id text,
  p_user_id  uuid,
  p_side     text,
  p_gross    numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_market       event_markets%rowtype;
  v_balance      numeric(12,2);
  v_total_shares numeric(14,4);
  v_price        numeric(10,6);
  v_tx_fee_rate  numeric(10,6);
  v_fee          numeric(12,2);
  v_net          numeric(12,2);
  v_contracts    numeric(14,4);
  v_payout       numeric(12,2);
  v_new_yes_lia  numeric(12,2);
  v_new_no_lia   numeric(12,2);
  v_max_lia      numeric(12,2);
  v_position_id  uuid;
BEGIN
  SELECT * INTO v_market
  FROM event_markets
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mercado no encontrado');
  END IF;

  IF v_market.status <> 'open' THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado: ' || v_market.status);
  END IF;

  IF p_side NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('error', 'Lado inválido: ' || p_side);
  END IF;

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

  -- ── Read tx fee rate from platform_config (fallback 2.5%) ──
  SELECT COALESCE(
    (SELECT value / 100 FROM platform_config WHERE key = 'tx_fee_pct'),
    0.025
  ) INTO v_tx_fee_rate;

  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF p_side = 'yes' THEN
    v_price := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_price := ROUND(v_market.no_shares  / v_total_shares, 6);
  END IF;

  v_fee       := ROUND(p_gross * v_tx_fee_rate, 2);
  v_net       := p_gross - v_fee;
  v_contracts := ROUND(v_net / v_price, 4);
  v_payout    := ROUND(v_contracts, 2);

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

  UPDATE profiles
  SET balance = balance - p_gross
  WHERE id = p_user_id;

  INSERT INTO positions
    (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES
    (p_event_id, p_user_id, p_side, v_contracts, v_price, v_contracts, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type)
  VALUES
    (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net, 'purchase');

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

  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (p_user_id, p_event_id, p_side, p_gross, v_payout)
  ON CONFLICT (user_id, event_id) DO UPDATE
    SET side            = EXCLUDED.side,
        amount          = EXCLUDED.amount,
        potential_cobro = EXCLUDED.potential_cobro,
        status          = 'active',
        resolved_at     = NULL;

  RETURN jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'price_at_purchase', v_price,
    'payout_if_win',     v_payout,
    'fee_paid',          v_fee,
    'gross_amount',      p_gross,
    'tx_fee_rate',       v_tx_fee_rate,
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

-- ── 5. initialize_market — reads sponsor_margin_pct from config ─
--
--  When p_sponsor_amount IS NOT NULL: reads margin from
--  platform_config instead of hardcoded 0.15.

DROP FUNCTION IF EXISTS public.initialize_market(TEXT, NUMERIC, INTEGER, BOOLEAN, INTEGER, NUMERIC);
DROP FUNCTION IF EXISTS public.initialize_market(TEXT, NUMERIC, INTEGER, BOOLEAN, INTEGER);

CREATE FUNCTION public.initialize_market(
  p_event_id         TEXT,
  p_pool_total       NUMERIC     DEFAULT 0,
  p_initial_yes_pct  INTEGER     DEFAULT 50,
  p_spread_enabled   BOOLEAN     DEFAULT true,
  p_synthetic_shares INTEGER     DEFAULT 1000,
  p_sponsor_amount   NUMERIC     DEFAULT NULL
)
RETURNS public.event_markets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pool_total       NUMERIC(12,2);
  v_platform_margin  NUMERIC(12,2);
  v_margin_rate      NUMERIC(10,6);
  v_yes              NUMERIC(14,4);
  v_no               NUMERIC(14,4);
  v_row              public.event_markets%rowtype;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_sponsor_amount IS NOT NULL THEN
    IF p_sponsor_amount <> FLOOR(p_sponsor_amount) THEN
      RAISE EXCEPTION 'sponsor_amount debe ser número entero (sin centavos)';
    END IF;
    IF p_sponsor_amount < 1000 THEN
      RAISE EXCEPTION 'sponsor_amount debe ser mínimo Q1,000';
    END IF;

    -- ── Read margin rate from platform_config (fallback 15%) ──
    SELECT COALESCE(
      (SELECT value / 100 FROM platform_config WHERE key = 'sponsor_margin_pct'),
      0.15
    ) INTO v_margin_rate;

    v_platform_margin := ROUND(p_sponsor_amount * v_margin_rate, 2);
    v_pool_total      := ROUND(p_sponsor_amount * (1 - v_margin_rate), 2);

    UPDATE public.events
    SET sponsor_amount  = p_sponsor_amount,
        platform_margin = v_platform_margin,
        pool_size       = v_pool_total::integer
    WHERE id = p_event_id;

    INSERT INTO public.platform_ledger (event_id, sponsor_amount, platform_margin)
    VALUES (p_event_id, p_sponsor_amount, v_platform_margin);

  ELSE
    v_pool_total      := ROUND(p_pool_total, 2);
    v_platform_margin := NULL;
  END IF;

  v_yes := ROUND((p_initial_yes_pct::NUMERIC / 100) * p_synthetic_shares, 4);
  v_no  := ROUND(p_synthetic_shares - v_yes, 4);

  INSERT INTO public.event_markets
    (event_id, pool_total, pool_committed, yes_shares, no_shares,
     spread_enabled, status, sponsor_amount, platform_margin)
  VALUES
    (p_event_id, ROUND(v_pool_total, 4), 0, v_yes, v_no,
     p_spread_enabled, 'open', p_sponsor_amount, v_platform_margin)
  ON CONFLICT (event_id) DO UPDATE
    SET pool_total      = EXCLUDED.pool_total,
        yes_shares      = EXCLUDED.yes_shares,
        no_shares       = EXCLUDED.no_shares,
        spread_enabled  = EXCLUDED.spread_enabled,
        sponsor_amount  = EXCLUDED.sponsor_amount,
        platform_margin = EXCLUDED.platform_margin,
        updated_at      = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

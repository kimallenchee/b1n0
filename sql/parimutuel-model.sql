-- ============================================================
--  PARIMUTUEL MODEL — Run in Supabase SQL Editor
--
--  Changes:
--    1. event_markets: add lp_capital, lp_return_pct, fees_collected columns
--    2. execute_purchase: user net goes INTO pool_total (parimutuel)
--       - No liability cap — pool grows with every purchase
--       - payout_if_win = estimated (recalculated at resolution)
--    3. preview_purchase: updated to match (no pool cap check)
--    4. settle_predictions: winners split pool proportionally by shares
--       - LP gets capital + fixed % return FIRST
--       - Sponsor seed stays in pool (marketing cost)
--       - Remainder split by winning shares
--    5. deposit_lp_capital: new RPC for LP deposits
--    6. Ronda Privada: supports 'private' status + tier gate
-- ============================================================

-- ── 0. Ensure base columns exist on events table ─────────────
--    (from 20260308_sponsor_amount migration — safe to re-run)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sponsor_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS platform_margin NUMERIC(12,2);

ALTER TABLE public.event_markets
  ADD COLUMN IF NOT EXISTS sponsor_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS platform_margin NUMERIC(12,2);

-- platform_ledger (if not already created)
CREATE TABLE IF NOT EXISTS public.platform_ledger (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_amount  NUMERIC(12,2) NOT NULL,
  platform_margin NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Schema additions (parimutuel) ─────────────────────────

ALTER TABLE event_markets
  ADD COLUMN IF NOT EXISTS lp_capital      numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lp_return_pct   numeric(6,4)  NOT NULL DEFAULT 0.08,
  ADD COLUMN IF NOT EXISTS fees_collected  numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bet_pool        numeric(14,4) NOT NULL DEFAULT 0;

-- lp_capital:     total Q deposited by LPs (not bettors)
-- lp_return_pct:  fixed return rate for LPs (default 8%)
-- fees_collected:  running total of 2.5% fees taken on this event
-- bet_pool:       running total of net bet money added to pool

-- LP deposits table — tracks individual LP contributions
CREATE TABLE IF NOT EXISTS public.lp_deposits (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    text        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  return_pct  numeric(6,4)  NOT NULL DEFAULT 0.08,
  status      text        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'returned', 'partial_loss')),
  payout           numeric(12,2),          -- filled at resolution
  fees_at_deposit  numeric(14,4) NOT NULL DEFAULT 0,  -- snapshot of fees_collected when LP deposited
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lp_deposits ENABLE ROW LEVEL SECURITY;

-- Add fees_at_deposit column if table already exists
ALTER TABLE public.lp_deposits
  ADD COLUMN IF NOT EXISTS fees_at_deposit numeric(14,4) NOT NULL DEFAULT 0;

-- LPs can read their own deposits
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lp_read_own_deposits') THEN
    CREATE POLICY lp_read_own_deposits ON public.lp_deposits FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

-- Admin can read all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_lp_deposits') THEN
    CREATE POLICY admin_read_lp_deposits ON public.lp_deposits FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;


-- ── 1b. Seed new platform_config keys ────────────────────────

INSERT INTO platform_config (key, value) VALUES
  ('fee_floor_pct',    1),
  ('fee_ceiling_pct',  5),
  ('sell_fee_pct',     2),
  ('depth_threshold',  50000)
ON CONFLICT (key) DO NOTHING;

-- Remove old tx_fee_pct (replaced by floor/ceiling)
-- DELETE FROM platform_config WHERE key = 'tx_fee_pct';
-- ^ Uncomment if you want to clean up, but harmless to leave


-- ── 2. execute_purchase — PARIMUTUEL MODEL ───────────────────

-- Force drop old version first
DROP FUNCTION IF EXISTS public.execute_purchase(text, uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.execute_purchase(
  p_event_id text,
  p_user_id  uuid,
  p_side     text,
  p_gross    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_spread_captured  numeric(12,2);
  v_position_id      uuid;
  v_event_q          text;
  v_new_pool         numeric(14,4);
  v_est_payout       numeric(12,2);
  v_winning_shares   numeric(14,4);
  v_spread_low       numeric(6,4) := 0.01;
  v_spread_high      numeric(6,4) := 0.02;
  v_fee_floor        numeric(6,4) := 0.01;
  v_fee_ceiling      numeric(6,4) := 0.05;
  v_depth_threshold  numeric(14,4) := 50000;
  v_fee_rate         numeric(6,4);
  v_depth_factor     numeric(10,6);
  v_user_role        text := 'user';
BEGIN
  -- Load spread + fee rates from platform_config (fallback to defaults)
  SELECT COALESCE(value, 1) / 100 INTO v_spread_low
  FROM platform_config WHERE key = 'spread_low_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_spread_high
  FROM platform_config WHERE key = 'spread_high_pct';
  SELECT COALESCE(value, 1) / 100 INTO v_fee_floor
  FROM platform_config WHERE key = 'fee_floor_pct';
  SELECT COALESCE(value, 5) / 100 INTO v_fee_ceiling
  FROM platform_config WHERE key = 'fee_ceiling_pct';
  SELECT COALESCE(value, 50000) INTO v_depth_threshold
  FROM platform_config WHERE key = 'depth_threshold';

  -- Check user role for fee exemption
  SELECT COALESCE(role, 'user') INTO v_user_role
  FROM profiles WHERE id = p_user_id;

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

  -- Private market: accessible only via direct link (no tier check)

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

  -- ── Mid-price (AMM unchanged) ──
  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF p_side = 'yes' THEN
    v_mid_price := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid_price := ROUND(v_market.no_shares  / v_total_shares, 6);
  END IF;

  -- ── Skew (used by both spread and fee) ──
  v_skew := ABS(v_mid_price - 0.50) / 0.50;

  -- ── Dynamic spread (low at 50/50 → high at extremes) ──
  IF v_market.spread_enabled THEN
    v_spread_rate := v_spread_low + (v_spread_high - v_spread_low) * v_skew;
    v_half_spread := ROUND(v_spread_rate / 2, 6);
    v_ask_price   := LEAST(v_mid_price + v_half_spread, 0.99);
    v_ask_price   := GREATEST(v_ask_price, 0.02);
  ELSE
    v_ask_price   := v_mid_price;
    v_spread_rate := 0;
  END IF;

  -- ── Dynamic fee (INVERSE: high at 50/50 → low at extremes) ──
  -- depth_factor: 0 (empty pool) → 1 (mature pool)
  v_depth_factor := LEAST(v_market.pool_total / GREATEST(v_depth_threshold, 1), 1.0);
  -- fee = ceiling - (ceiling - floor) × skew × depth_factor
  -- At 50/50 + shallow pool: fee ≈ ceiling (max uncertainty, thin market)
  -- At 90/10 + deep pool: fee ≈ floor (obvious outcome, liquid market)
  v_fee_rate := v_fee_ceiling - (v_fee_ceiling - v_fee_floor) * v_skew * v_depth_factor;
  v_fee_rate := GREATEST(LEAST(v_fee_rate, v_fee_ceiling), v_fee_floor);

  -- Market makers and sponsors are fee-exempt
  IF v_user_role IN ('market_maker', 'sponsor') THEN
    v_fee_rate := 0;
  END IF;

  -- ── Fee + net ──
  v_fee := ROUND(p_gross * v_fee_rate, 2);
  v_net := p_gross - v_fee;

  -- Contracts at ask price
  v_contracts := ROUND(v_net / v_ask_price, 4);

  -- Contracts at mid (for spread tracking)
  v_contracts_at_mid := ROUND(v_net / v_mid_price, 4);
  v_spread_captured := GREATEST(ROUND(v_contracts_at_mid - v_contracts, 2), 0);

  -- ── NEW: Calculate estimated payout (parimutuel) ──
  -- After this purchase, what's the new pool and what would winner get?
  v_new_pool := v_market.pool_total + v_net;
  IF p_side = 'yes' THEN
    v_winning_shares := v_market.yes_shares + v_contracts;
  ELSE
    v_winning_shares := v_market.no_shares + v_contracts;
  END IF;
  -- Estimate: (my_shares / winning_side_shares) × total_pool
  v_est_payout := ROUND((v_contracts / v_winning_shares) * v_new_pool, 2);

  -- ── NO LIABILITY CAP — pool grows with every purchase ──

  -- ── Atomic execution ────────────────────

  -- Deduct gross amount from user balance
  UPDATE profiles
  SET balance = balance - p_gross
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Create position record
  -- payout_if_win = estimate (will be recalculated at resolution)
  INSERT INTO positions
    (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES
    (p_event_id, p_user_id, p_side, v_contracts, v_ask_price, v_est_payout, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  -- Log transaction
  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type, spread_captured)
  VALUES
    (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net, 'purchase', v_spread_captured);

  -- Mint shares + grow pool (PARIMUTUEL: net goes into pool_total)
  UPDATE event_markets SET
    yes_shares      = CASE WHEN p_side = 'yes'
                           THEN ROUND(yes_shares + v_contracts, 4)
                           ELSE yes_shares END,
    no_shares       = CASE WHEN p_side = 'no'
                           THEN ROUND(no_shares + v_contracts, 4)
                           ELSE no_shares END,
    pool_total      = pool_total + v_net,           -- ← KEY CHANGE: pool grows
    bet_pool        = bet_pool + v_net,             -- track bet money separately
    fees_collected  = fees_collected + v_fee,       -- track fees
    pool_committed  = pool_committed + v_net,       -- repurposed: total bet volume net
    updated_at      = now()
  WHERE event_id = p_event_id;

  -- Sync events.pool_size so frontend reads live value
  UPDATE events SET pool_size = ROUND(pool_size + v_net) WHERE id = p_event_id;

  -- Upsert predictions row
  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (p_user_id, p_event_id, p_side, p_gross, v_est_payout)
  ON CONFLICT (user_id, event_id, side) DO UPDATE
    SET side            = EXCLUDED.side,
        amount          = predictions.amount + EXCLUDED.amount,
        potential_cobro = predictions.potential_cobro + EXCLUDED.potential_cobro,
        status          = 'active',
        resolved_at     = NULL;

  -- ── Ledger entry ──
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
    'yes_price_new',     ROUND(
      (v_market.yes_shares + CASE WHEN p_side = 'yes' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'no_price_new',      ROUND(
      (v_market.no_shares  + CASE WHEN p_side = 'no'  THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'pool_total',        v_new_pool,
    'est_payout',        v_est_payout,
    'fee_rate',          v_fee_rate,
    'depth_factor',      v_depth_factor
  );
END;
$$;


-- ── 3. preview_purchase — PARIMUTUEL MODEL ───────────────────

DROP FUNCTION IF EXISTS public.preview_purchase(text, text, numeric);

CREATE OR REPLACE FUNCTION public.preview_purchase(
  p_event_id text,
  p_side     text,
  p_gross    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market       event_markets%rowtype;
  v_total_shares numeric(14,4);
  v_mid_price    numeric(10,6);
  v_skew         numeric(10,6);
  v_spread_rate  numeric(10,6);
  v_half_spread  numeric(10,6);
  v_ask_price    numeric(10,6);
  v_fee          numeric(12,2);
  v_net          numeric(12,2);
  v_contracts    numeric(14,4);
  v_new_pool     numeric(14,4);
  v_est_payout   numeric(12,2);
  v_winning_shares numeric(14,4);
  v_spread_low       numeric(6,4) := 0.01;
  v_spread_high      numeric(6,4) := 0.02;
  v_fee_floor        numeric(6,4) := 0.01;
  v_fee_ceiling      numeric(6,4) := 0.05;
  v_depth_threshold  numeric(14,4) := 50000;
  v_fee_rate         numeric(6,4);
  v_depth_factor     numeric(10,6);
BEGIN
  -- Load rates from platform_config
  SELECT COALESCE(value, 1) / 100 INTO v_spread_low
  FROM platform_config WHERE key = 'spread_low_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_spread_high
  FROM platform_config WHERE key = 'spread_high_pct';
  SELECT COALESCE(value, 1) / 100 INTO v_fee_floor
  FROM platform_config WHERE key = 'fee_floor_pct';
  SELECT COALESCE(value, 5) / 100 INTO v_fee_ceiling
  FROM platform_config WHERE key = 'fee_ceiling_pct';
  SELECT COALESCE(value, 50000) INTO v_depth_threshold
  FROM platform_config WHERE key = 'depth_threshold';

  SELECT * INTO v_market
  FROM event_markets
  WHERE event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado no encontrado');
  END IF;

  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado cerrado: ' || v_market.status);
  END IF;

  -- Mid-price
  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF p_side = 'yes' THEN
    v_mid_price := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid_price := ROUND(v_market.no_shares  / v_total_shares, 6);
  END IF;

  -- Skew
  v_skew := ABS(v_mid_price - 0.50) / 0.50;

  -- Dynamic spread
  IF v_market.spread_enabled THEN
    v_spread_rate := v_spread_low + (v_spread_high - v_spread_low) * v_skew;
    v_half_spread := ROUND(v_spread_rate / 2, 6);
    v_ask_price   := LEAST(v_mid_price + v_half_spread, 0.99);
    v_ask_price   := GREATEST(v_ask_price, 0.02);
  ELSE
    v_ask_price   := v_mid_price;
    v_spread_rate := 0;
  END IF;

  -- Dynamic fee (inverse: high at 50/50 → low at extremes)
  v_depth_factor := LEAST(v_market.pool_total / GREATEST(v_depth_threshold, 1), 1.0);
  v_fee_rate := v_fee_ceiling - (v_fee_ceiling - v_fee_floor) * v_skew * v_depth_factor;
  v_fee_rate := GREATEST(LEAST(v_fee_rate, v_fee_ceiling), v_fee_floor);

  -- Fee + net
  v_fee       := ROUND(p_gross * v_fee_rate, 2);
  v_net       := p_gross - v_fee;
  v_contracts := ROUND(v_net / v_ask_price, 4);

  -- Estimated payout (parimutuel)
  v_new_pool := v_market.pool_total + v_net;
  IF p_side = 'yes' THEN
    v_winning_shares := v_market.yes_shares + v_contracts;
  ELSE
    v_winning_shares := v_market.no_shares + v_contracts;
  END IF;
  v_est_payout := ROUND((v_contracts / v_winning_shares) * v_new_pool, 2);

  -- NO liability cap check — always valid in parimutuel
  RETURN jsonb_build_object(
    'valid',          true,
    'reason',         null,
    'fee',            v_fee,
    'net',            v_net,
    'price',          v_ask_price,
    'mid_price',      v_mid_price,
    'spread_rate',    COALESCE(v_spread_rate, 0),
    'contracts',      v_contracts,
    'payout_if_win',  v_est_payout,
    'pool_total',     v_new_pool,
    'est_payout',     v_est_payout,
    'yes_price_new',  ROUND(
      (v_market.yes_shares + CASE WHEN p_side = 'yes' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'no_price_new',   ROUND(
      (v_market.no_shares  + CASE WHEN p_side = 'no'  THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'fee_rate',       v_fee_rate,
    'depth_factor',   v_depth_factor
  );
END;
$$;


-- ── 4. deposit_lp_capital — LP deposits into pool ────────────

CREATE OR REPLACE FUNCTION public.deposit_lp_capital(
  p_event_id    text,
  p_user_id     uuid,
  p_amount      numeric,
  p_return_pct  numeric DEFAULT 0.08
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market    event_markets%rowtype;
  v_balance   numeric(12,2);
  v_new_balance numeric(12,2);
  v_deposit_id uuid;
BEGIN
  -- Admin only (LPs deposit through admin for now)
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('error', 'Solo admin puede registrar capital LP');
  END IF;

  -- Lock market
  SELECT * INTO v_market
  FROM event_markets
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mercado no encontrado');
  END IF;

  -- Only allow LP deposits on private or open markets
  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado para capital LP');
  END IF;

  -- Check LP balance
  SELECT balance INTO v_balance
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RETURN jsonb_build_object('error', 'Saldo LP insuficiente');
  END IF;

  -- Deduct from LP's balance
  UPDATE profiles
  SET balance = balance - p_amount
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Record LP deposit (snapshot current fees so LP only earns on future fees)
  INSERT INTO lp_deposits (event_id, user_id, amount, return_pct, fees_at_deposit)
  VALUES (p_event_id, p_user_id, p_amount, p_return_pct, COALESCE(v_market.fees_collected, 0))
  RETURNING id INTO v_deposit_id;

  -- Add to pool (LP capital deepens the market)
  UPDATE event_markets
  SET pool_total = pool_total + p_amount,
      lp_capital = lp_capital + p_amount,
      updated_at = now()
  WHERE event_id = p_event_id;

  -- Sync events.pool_size for frontend
  UPDATE events SET pool_size = ROUND(pool_size + p_amount) WHERE id = p_event_id;

  -- Ledger entry
  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'lp_deposit', -p_amount, v_new_balance,
          'Capital LP: ' || p_event_id, v_deposit_id::text);

  RETURN jsonb_build_object(
    'deposit_id',  v_deposit_id,
    'amount',      p_amount,
    'return_pct',  p_return_pct,
    'new_pool',    v_market.pool_total + p_amount
  );
END;
$$;


-- Drop old version (return type changed from integer → jsonb)
DROP FUNCTION IF EXISTS public.settle_predictions(text, text);

-- ── 5. settle_predictions — PARIMUTUEL RESOLUTION ────────────
--
--  Resolution order:
--    1. Pay LP capital + fixed return (senior claim)
--    2. Remaining pool split among winning shareholders
--    3. If pool can't fully cover LP returns, LPs take partial loss
--

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
  v_pool_after_lp    numeric(14,4);
  v_winning_shares   numeric(14,4) := 0;
  v_user_payout      numeric(12,2);
  v_net_margins      numeric(12,2) := 0;  -- fees + spread collected on this event
  v_lp_margin_share  numeric(12,2);
  v_lp_payout        numeric(12,2);
  v_lp_shortfall_pct numeric(10,6);
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
  -- Net margins = fees_collected (2.5% on every trade)
  -- The spread captured is already embedded in the pool via pricing

  v_net_margins := COALESCE(v_market.fees_collected, 0);

  -- Calculate total LP capital to return
  SELECT COALESCE(SUM(amount), 0)
  INTO v_lp_total_owed
  FROM lp_deposits
  WHERE event_id = p_event_id AND status = 'active';

  -- LP payout = capital + (their return_pct × total net margins)
  -- Check if pool can cover LP capital return (margins come from fees already collected)
  IF v_lp_total_owed <= v_total_pool THEN
    v_pool_after_lp := v_total_pool - v_lp_total_owed;
    v_lp_shortfall_pct := 0;
  ELSE
    v_lp_shortfall_pct := 1 - (v_total_pool / v_lp_total_owed);
    v_pool_after_lp := 0;
  END IF;

  -- Pay each LP: capital back (from pool) + margin share (fees earned AFTER deposit)
  FOR v_lp_row IN
    SELECT id, user_id, amount, return_pct, COALESCE(fees_at_deposit, 0) AS fees_at_deposit
    FROM lp_deposits
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    -- Capital return (pro-rata if shortfall)
    v_lp_payout := ROUND(v_lp_row.amount * (1 - v_lp_shortfall_pct), 2);
    -- Margin share: LP's return_pct × (total fees - fees at time of deposit)
    -- This ensures LP only earns on fees generated AFTER they committed capital
    v_lp_margin_share := ROUND(v_lp_row.return_pct * GREATEST(v_net_margins - v_lp_row.fees_at_deposit, 0), 2);
    v_lp_payout := v_lp_payout + v_lp_margin_share;
    v_lp_actual_paid := v_lp_actual_paid + v_lp_payout;

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

  -- ── Step 3: Split remaining pool among winners proportionally ──
  -- If no winning shares (everyone bet on the losing side), the remaining pool
  -- is platform surplus (stays unclaimed for now)

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
    'lp_margin_earned',      v_lp_actual_paid - ROUND(v_lp_total_owed * (1 - v_lp_shortfall_pct), 2),
    'lp_actual_paid',        v_lp_actual_paid,
    'pool_to_winners',       v_pool_after_lp,
    'winning_shares',        v_winning_shares,
    'lp_shortfall_pct',      ROUND(v_lp_shortfall_pct * 100, 2)
  );
END;
$$;


-- ── 6. initialize_market — PARIMUTUEL VERSION ────────────────
--
--  Changes from previous version:
--    - sponsor_amount is OPTIONAL (can be 0 or NULL for pure parimutuel)
--    - pool_total starts as sponsor seed (can be 0) — grows with bets
--    - Initializes new parimutuel columns: lp_capital, bet_pool, fees_collected
--    - Accepts p_lp_return_pct for default LP return rate on this event
--    - Status respects p_launch_mode ('public' → 'open', 'private' → 'private')
--

-- Drop ALL overloads of initialize_market regardless of signature
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'initialize_market'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE FUNCTION public.initialize_market(
  p_event_id         TEXT,
  p_pool_total       NUMERIC     DEFAULT 0,
  p_initial_yes_pct  INTEGER     DEFAULT 50,
  p_spread_enabled   BOOLEAN     DEFAULT true,
  p_synthetic_shares INTEGER     DEFAULT 1000,
  p_sponsor_amount   NUMERIC     DEFAULT NULL,
  p_lp_return_pct    NUMERIC     DEFAULT 0.08,
  p_launch_mode      TEXT        DEFAULT 'public'
)
RETURNS public.event_markets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pool_total       NUMERIC(12,2);
  v_platform_margin  NUMERIC(12,2);
  v_yes              NUMERIC(14,4);
  v_no               NUMERIC(14,4);
  v_row              public.event_markets%rowtype;
  v_status           TEXT;
BEGIN
  -- Admin only
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Determine market status from launch mode
  v_status := CASE WHEN p_launch_mode = 'private' THEN 'private' ELSE 'open' END;

  IF p_sponsor_amount IS NOT NULL AND p_sponsor_amount > 0 THEN
    -- Sponsor is providing seed money — 100% goes to pool (no platform cut)
    IF p_sponsor_amount <> FLOOR(p_sponsor_amount) THEN
      RAISE EXCEPTION 'sponsor_amount debe ser número entero (sin centavos)';
    END IF;

    v_platform_margin := 0;
    v_pool_total      := ROUND(p_sponsor_amount, 2);

    -- Store on events table
    UPDATE public.events
    SET sponsor_amount  = p_sponsor_amount,
        platform_margin = 0,
        pool_size       = v_pool_total::integer
    WHERE id = p_event_id;

    -- Log to platform_ledger
    INSERT INTO public.platform_ledger (event_id, sponsor_amount, platform_margin)
    VALUES (p_event_id, p_sponsor_amount, 0);

  ELSE
    -- Pure parimutuel: no sponsor seed, pool starts at 0 (or use p_pool_total fallback)
    v_pool_total      := ROUND(COALESCE(p_pool_total, 0), 2);
    v_platform_margin := 0;

    UPDATE public.events
    SET sponsor_amount  = 0,
        platform_margin = 0,
        pool_size       = v_pool_total::integer
    WHERE id = p_event_id;
  END IF;

  -- Synthetic AMM shares (initial price = p_initial_yes_pct / 100)
  v_yes := ROUND((p_initial_yes_pct::NUMERIC / 100) * p_synthetic_shares, 4);
  v_no  := ROUND(p_synthetic_shares - v_yes, 4);

  INSERT INTO public.event_markets
    (event_id, pool_total, pool_committed, yes_shares, no_shares,
     spread_enabled, status, sponsor_amount, platform_margin,
     lp_capital, lp_return_pct, bet_pool, fees_collected)
  VALUES
    (p_event_id, ROUND(v_pool_total, 4), 0, v_yes, v_no,
     p_spread_enabled, v_status, p_sponsor_amount, v_platform_margin,
     0, p_lp_return_pct, 0, 0)
  ON CONFLICT (event_id) DO UPDATE
    SET pool_total      = EXCLUDED.pool_total,
        yes_shares      = EXCLUDED.yes_shares,
        no_shares       = EXCLUDED.no_shares,
        spread_enabled  = EXCLUDED.spread_enabled,
        sponsor_amount  = EXCLUDED.sponsor_amount,
        platform_margin = EXCLUDED.platform_margin,
        lp_capital      = EXCLUDED.lp_capital,
        lp_return_pct   = EXCLUDED.lp_return_pct,
        bet_pool        = EXCLUDED.bet_pool,
        fees_collected  = EXCLUDED.fees_collected,
        status          = EXCLUDED.status,
        updated_at      = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


NOTIFY pgrst, 'reload schema';

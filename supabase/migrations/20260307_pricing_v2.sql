-- ============================================================
--  Pricing Engine v2
--
--  Changes from v1:
--    1. profiles.balance → numeric(12,2)   (was integer)
--    2. predictions.amount → numeric(12,2) (was integer)
--    3. event_markets: add max_yes_liability, max_no_liability
--    4. execute_purchase: fully atomic — balance check + deduction,
--       correct max(yes,no) liability cap, mid-price (no spread),
--       writes prediction row for portfolio/history compatibility
--    5. preview_purchase: read-only simulation (new)
--    6. settle_event: credits user balances (was missing)
--    7. cast_vote: updated to numeric amounts
-- ============================================================

-- ── 1. Decimal balances ─────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'balance' AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN balance TYPE numeric(12,2) USING balance::numeric(12,2);
  END IF;
END $$;

-- ── 2. Decimal prediction amounts ──────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'predictions'
      AND column_name = 'amount' AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.predictions
      ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric(12,2);
  END IF;
END $$;

-- ── 3. Per-side liability columns on event_markets ──────────

ALTER TABLE public.event_markets
  ADD COLUMN IF NOT EXISTS max_yes_liability numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_no_liability  numeric(12,2) NOT NULL DEFAULT 0;

-- ── 4. execute_purchase — fully atomic ──────────────────────
--
--  Single DB transaction:
--    - Lock event_markets row (FOR UPDATE)
--    - Lock profiles row (FOR UPDATE)
--    - Check status, balance, pool cap
--    - Deduct gross from balance
--    - Mint shares (update yes_shares or no_shares)
--    - Update per-side liabilities + pool_committed
--    - Insert position + market_transaction
--    - Upsert predictions row (portfolio/history compat)
--    - Return position details + new prices
--
--  Pool cap: max(max_yes_liability, max_no_liability) ≤ pool_total
--  Price: mid-market (shares ratio, no spread)
--  Fee: 2.5% of gross → net buys shares

DROP FUNCTION IF EXISTS public.execute_purchase(text, uuid, text, numeric);
DROP FUNCTION IF EXISTS public.execute_purchase(text, uuid, text, numeric(12,2));

CREATE FUNCTION public.execute_purchase(
  p_event_id text,
  p_user_id  uuid,
  p_side     text,       -- 'yes' | 'no'
  p_gross    numeric     -- gross amount (before fee), Q
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_market       event_markets%rowtype;
  v_balance      numeric(12,2);
  v_total_shares numeric(14,4);
  v_price        numeric(10,6);
  v_fee          numeric(12,2);
  v_net          numeric(12,2);
  v_contracts    numeric(14,4);
  v_payout       numeric(12,2);
  v_new_yes_lia  numeric(12,2);
  v_new_no_lia   numeric(12,2);
  v_max_lia      numeric(12,2);
  v_position_id  uuid;
BEGIN
  -- Lock event market row — prevents concurrent share minting
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

  -- Lock user balance row — prevents double-spend
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

  -- Mid-price (spec: price = shares / total_shares, no spread)
  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF p_side = 'yes' THEN
    v_price := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_price := ROUND(v_market.no_shares  / v_total_shares, 6);
  END IF;

  -- Fee + net (all DECIMAL — never float)
  v_fee       := ROUND(p_gross * 0.025, 2);
  v_net       := p_gross - v_fee;                   -- exact decimal
  v_contracts := ROUND(v_net / v_price, 4);
  v_payout    := ROUND(v_contracts, 2);             -- 1 contract = Q1.00

  -- Pool liability: platform only ever pays the winning side
  -- Exposure = max(all_yes_payouts, all_no_payouts)
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

  -- ── Atomic execution (all or nothing) ────────────────────

  -- Deduct gross amount from user balance
  UPDATE profiles
  SET balance = balance - p_gross
  WHERE id = p_user_id;

  -- Create position record (locked price + payout)
  INSERT INTO positions
    (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES
    (p_event_id, p_user_id, p_side, v_contracts, v_price, v_contracts, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  -- Log transaction (fee to platform ledger)
  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type)
  VALUES
    (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net, 'purchase');

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
    pool_committed    = v_max_lia,   -- true exposure = max(yes,no)
    updated_at        = now()
  WHERE event_id = p_event_id;

  -- Upsert predictions row (portfolio + history pages read from here)
  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (p_user_id, p_event_id, p_side, p_gross, v_payout)
  ON CONFLICT (user_id, event_id) DO UPDATE
    SET side            = EXCLUDED.side,
        amount          = EXCLUDED.amount,
        potential_cobro = EXCLUDED.potential_cobro,
        status          = 'active',
        resolved_at     = NULL;

  -- Return position details + new prices (post-mint)
  RETURN jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'price_at_purchase', v_price,
    'payout_if_win',     v_payout,
    'fee_paid',          v_fee,
    'gross_amount',      p_gross,
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

-- ── 5. preview_purchase — read-only simulation ─────────────
--
--  Same math as execute_purchase but no state changes.
--  Clients call this before confirming to show exact payout.

CREATE OR REPLACE FUNCTION public.preview_purchase(
  p_event_id text,
  p_side     text,
  p_gross    numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_market       event_markets%rowtype;
  v_total_shares numeric(14,4);
  v_price        numeric(10,6);
  v_fee          numeric(12,2);
  v_net          numeric(12,2);
  v_contracts    numeric(14,4);
  v_payout       numeric(12,2);
  v_new_yes_lia  numeric(12,2);
  v_new_no_lia   numeric(12,2);
  v_max_lia      numeric(12,2);
BEGIN
  SELECT * INTO v_market
  FROM event_markets
  WHERE event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado no encontrado');
  END IF;

  IF v_market.status <> 'open' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado cerrado');
  END IF;

  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF p_side = 'yes' THEN
    v_price := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_price := ROUND(v_market.no_shares  / v_total_shares, 6);
  END IF;

  v_fee       := ROUND(p_gross * 0.025, 2);
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

  RETURN jsonb_build_object(
    'valid',          v_max_lia <= v_market.pool_total,
    'reason',         CASE WHEN v_max_lia > v_market.pool_total
                           THEN 'Pool cap reached — mercado lleno' ELSE null END,
    'price',          v_price,
    'fee',            v_fee,
    'net',            v_net,
    'contracts',      v_contracts,
    'payout_if_win',  v_payout,
    'pool_remaining', v_market.pool_total - v_max_lia,
    'pool_committed', v_max_lia,
    'pool_total',     v_market.pool_total,
    'yes_price_new',  ROUND(
      (v_market.yes_shares + CASE WHEN p_side = 'yes' THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6),
    'no_price_new',   ROUND(
      (v_market.no_shares  + CASE WHEN p_side = 'no'  THEN v_contracts ELSE 0 END)
      / (v_total_shares + v_contracts), 6)
  );
END;
$$;

-- ── 6. settle_event — credits user balances ────────────────
--
--  Previously only updated positions + logged transactions.
--  Now also: UPDATE profiles SET balance = balance + payout_if_win

CREATE OR REPLACE FUNCTION public.settle_event(
  p_event_id text,
  p_result   text    -- 'yes' | 'no'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payouts jsonb := '[]'::jsonb;
  v_row     record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE event_markets
  SET status = 'settled', result = p_result, updated_at = now()
  WHERE event_id = p_event_id AND status = 'open';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Market not open or not found');
  END IF;

  FOR v_row IN
    SELECT id, user_id, side, payout_if_win
    FROM positions
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    IF v_row.side = p_result THEN
      UPDATE positions SET status = 'won' WHERE id = v_row.id;

      -- Credit winner balance
      UPDATE profiles
      SET balance = balance + ROUND(v_row.payout_if_win, 2)
      WHERE id = v_row.user_id;

      INSERT INTO market_transactions
        (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type)
      VALUES
        (v_row.id, p_event_id, v_row.user_id, ROUND(v_row.payout_if_win, 2), 0, 0, 'payout');

      v_payouts := v_payouts || jsonb_build_object(
        'user_id', v_row.user_id, 'position_id', v_row.id,
        'payout', v_row.payout_if_win, 'outcome', 'won'
      );
    ELSE
      UPDATE positions SET status = 'lost' WHERE id = v_row.id;

      v_payouts := v_payouts || jsonb_build_object(
        'user_id', v_row.user_id, 'position_id', v_row.id,
        'payout', 0, 'outcome', 'lost'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('result', p_result, 'payouts', v_payouts);
END;
$$;

-- ── 7. cast_vote — updated to numeric amounts ───────────────
--  (used for open events which don't go through execute_purchase)

DROP FUNCTION IF EXISTS public.cast_vote(text, text, integer, numeric);

CREATE OR REPLACE FUNCTION public.cast_vote(
  p_event_id        text,
  p_side            text,
  p_amount          numeric,    -- was integer
  p_potential_cobro numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid            := auth.uid();
  v_balance     numeric(12,2);
  v_pred_id     uuid;
  v_prev_amount numeric(12,2)   := 0;
  v_is_new      boolean         := true;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id FOR UPDATE;

  SELECT id, amount
  INTO v_pred_id, v_prev_amount
  FROM predictions
  WHERE user_id = v_user_id AND event_id = p_event_id;

  IF FOUND THEN
    v_is_new := false;
  ELSE
    v_prev_amount := 0;
  END IF;

  IF (v_balance + v_prev_amount) < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (v_user_id, p_event_id, p_side, ROUND(p_amount, 2), ROUND(p_potential_cobro, 2))
  ON CONFLICT (user_id, event_id) DO UPDATE
    SET side            = EXCLUDED.side,
        amount          = EXCLUDED.amount,
        potential_cobro = EXCLUDED.potential_cobro
  RETURNING id INTO v_pred_id;

  UPDATE profiles
  SET balance           = balance + v_prev_amount - ROUND(p_amount, 2),
      total_predictions = CASE WHEN v_is_new
                               THEN total_predictions + 1
                               ELSE total_predictions END
  WHERE id = v_user_id;

  RETURN v_pred_id;
END;
$$;

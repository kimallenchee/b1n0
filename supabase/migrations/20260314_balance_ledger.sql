-- ============================================================
--  Migration: balance_ledger — audit trail for all balance changes
--
--  Every deposit, withdrawal, vote, win, or loss creates a row.
--  profiles.balance stays as the "current" snapshot.
-- ============================================================

-- ── 1. balance_ledger table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.balance_ledger (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           TEXT          NOT NULL CHECK (type IN ('deposit','withdraw','vote','win','loss','refund')),
  amount         NUMERIC(12,2) NOT NULL,  -- positive = credit, negative = debit
  balance_after  NUMERIC(12,2) NOT NULL,
  label          TEXT          NOT NULL DEFAULT '',
  reference_id   TEXT,          -- position_id, external tx ref, etc.
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger
CREATE POLICY "ledger_own_read"
  ON public.balance_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- Admin can read all ledger entries
CREATE POLICY "ledger_admin_read"
  ON public.balance_ledger FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Only server-side (security definer) functions insert rows
-- No direct insert policy for regular users

CREATE INDEX IF NOT EXISTS idx_ledger_user_created
  ON public.balance_ledger (user_id, created_at DESC);


-- ── 2. deposit_balance — RPC for deposits ────────────────────

CREATE OR REPLACE FUNCTION public.deposit_balance(
  p_amount  NUMERIC,
  p_label   TEXT DEFAULT 'Depósito'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_new_balance  NUMERIC(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Monto inválido');
  END IF;

  UPDATE profiles
  SET balance = balance + p_amount
  WHERE id = v_user_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label)
  VALUES (v_user_id, 'deposit', p_amount, v_new_balance, p_label);

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;


-- ── 3. withdraw_balance — RPC for withdrawals ────────────────

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
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;

  IF p_amount < 50 THEN
    RETURN jsonb_build_object('error', 'Mínimo Q50 por retiro');
  END IF;

  SELECT balance INTO v_balance
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('error', 'Saldo insuficiente');
  END IF;

  v_new_balance := v_balance - p_amount;
  v_label := 'Retiro vía ' || p_method;

  UPDATE profiles
  SET balance = v_new_balance
  WHERE id = v_user_id;

  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label)
  VALUES (v_user_id, 'withdraw', -p_amount, v_new_balance, v_label);

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;


-- ── 4. Patch execute_purchase to write ledger entry ──────────
--
--  We add a single INSERT INTO balance_ledger after the
--  balance deduction. The rest of the function is unchanged.

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
  v_market           event_markets%rowtype;
  v_balance          numeric(12,2);
  v_new_balance      numeric(12,2);
  v_total_shares     numeric(14,4);
  v_mid              numeric(10,6);
  v_skew             numeric(10,6);
  v_spread_rate      numeric(10,6);
  v_half_spread      numeric(10,6);
  v_ask              numeric(10,6);
  v_tx_fee_rate      numeric(10,6);
  v_fee              numeric(12,2);
  v_net              numeric(12,2);
  v_contracts        numeric(14,4);
  v_contracts_at_mid numeric(14,4);
  v_spread_captured  numeric(12,2);
  v_payout           numeric(12,2);
  v_new_yes_lia      numeric(12,2);
  v_new_no_lia       numeric(12,2);
  v_max_lia          numeric(12,2);
  v_position_id      uuid;
  v_event_q          text;
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

  -- Read tx fee rate from platform_config (fallback 2.5%)
  SELECT COALESCE(
    (SELECT value / 100 FROM platform_config WHERE key = 'tx_fee_pct'),
    0.025
  ) INTO v_tx_fee_rate;

  v_total_shares := v_market.yes_shares + v_market.no_shares;

  IF p_side = 'yes' THEN
    v_mid := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid := ROUND(v_market.no_shares  / v_total_shares, 6);
  END IF;

  -- Dynamic spread: 4% + 4% × skew → ask = mid + half_spread
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

  -- Deduct balance
  v_new_balance := v_balance - p_gross;
  UPDATE profiles
  SET balance = v_new_balance
  WHERE id = p_user_id;

  INSERT INTO positions
    (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES
    (p_event_id, p_user_id, p_side, v_contracts, v_ask, v_contracts, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, spread_captured, tx_type)
  VALUES
    (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net, v_spread_captured, 'purchase');

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

  -- ── Ledger entry for the vote ──
  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;

  INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
  VALUES (p_user_id, 'vote', -p_gross, v_new_balance,
          COALESCE(v_event_q, p_event_id), v_position_id::text);

  RETURN jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'mid_price',         v_mid,
    'ask_price',         v_ask,
    'spread_rate',       v_spread_rate,
    'spread_captured',   v_spread_captured,
    'price_at_purchase', v_ask,
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


-- ── 5. Backfill: seed initial deposit for existing users ─────
--  (Run manually or adjust as needed)

-- INSERT INTO balance_ledger (user_id, type, amount, balance_after, label)
-- SELECT id, 'deposit', balance, balance, 'Depósito inicial'
-- FROM profiles
-- WHERE balance > 0;


NOTIFY pgrst, 'reload schema';

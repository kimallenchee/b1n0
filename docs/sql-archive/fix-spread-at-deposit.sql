-- ============================================================
--  Fix #1: Add spread_at_deposit to lp_deposits
--
--  Problem: fees_at_deposit snapshots fees_collected at deposit
--  time, but not spread_collected. So LPs earn commission on
--  spread generated BEFORE they deposited — slightly generous.
--
--  Fix: snapshot spread_collected too, subtract both at settlement.
-- ============================================================

-- ── 1. Add column ────────────────────────────────────────────

ALTER TABLE public.lp_deposits
  ADD COLUMN IF NOT EXISTS spread_at_deposit numeric(14,4) NOT NULL DEFAULT 0;


-- ── 2. Patch deposit_lp_capital to snapshot spread ───────────

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
  -- Admin only
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

  -- Record LP deposit (snapshot BOTH fees and spread so LP only earns on future activity)
  INSERT INTO lp_deposits (event_id, user_id, amount, return_pct, fees_at_deposit, spread_at_deposit)
  VALUES (p_event_id, p_user_id, p_amount, p_return_pct,
          COALESCE(v_market.fees_collected, 0),
          COALESCE(v_market.spread_collected, 0))
  RETURNING id INTO v_deposit_id;

  -- Add to pool
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


-- ── 3. Patch settle_predictions to subtract both snapshots ───

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
  v_margins_at_deposit numeric(12,2) := 0;
  v_lp_margin_share  numeric(12,2);
  v_lp_payout        numeric(12,2);
  v_lp_shortfall_pct numeric(10,6);
  v_treasury_id      uuid := '00000000-0000-0000-0000-000000000001';
  v_treasury_bal     numeric(12,2);
BEGIN
  -- Admin only
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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
  -- Net margins = fees_collected + spread_collected
  -- LP earns only on margins generated AFTER their deposit
  -- Snapshot: fees_at_deposit + spread_at_deposit

  v_net_margins := COALESCE(v_market.fees_collected, 0) + COALESCE(v_market.spread_collected, 0);

  SELECT COALESCE(SUM(amount), 0)
  INTO v_lp_total_owed
  FROM lp_deposits
  WHERE event_id = p_event_id AND status = 'active';

  IF v_lp_total_owed <= v_total_pool THEN
    v_pool_after_lp := v_total_pool - v_lp_total_owed;
    v_lp_shortfall_pct := 0;
  ELSE
    v_lp_shortfall_pct := 1 - (v_total_pool / v_lp_total_owed);
    v_pool_after_lp := 0;
  END IF;

  FOR v_lp_row IN
    SELECT id, user_id, amount, return_pct,
           COALESCE(fees_at_deposit, 0) AS fees_at_deposit,
           COALESCE(spread_at_deposit, 0) AS spread_at_deposit
    FROM lp_deposits
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    v_lp_payout := ROUND(v_lp_row.amount * (1 - v_lp_shortfall_pct), 2);

    -- Margin earned = total margins now - margins that existed at deposit time
    v_margins_at_deposit := v_lp_row.fees_at_deposit + v_lp_row.spread_at_deposit;
    v_lp_margin_share := ROUND(v_lp_row.return_pct * GREATEST(v_net_margins - v_margins_at_deposit, 0), 2);

    v_lp_payout := v_lp_payout + v_lp_margin_share;
    v_lp_actual_paid := v_lp_actual_paid + v_lp_payout;
    v_lp_total_margin := v_lp_total_margin + v_lp_margin_share;

    UPDATE profiles
    SET balance = balance + v_lp_payout
    WHERE id = v_lp_row.user_id
    RETURNING balance INTO v_new_balance;

    UPDATE lp_deposits
    SET status = CASE WHEN v_lp_shortfall_pct > 0 THEN 'partial_loss' ELSE 'returned' END,
        payout = v_lp_payout
    WHERE id = v_lp_row.id;

    INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
    VALUES (v_lp_row.user_id, 'lp_return', v_lp_payout, v_new_balance,
            'Retorno LP: ' || COALESCE(v_event_q, p_event_id), v_lp_row.id::text);
  END LOOP;

  -- Debit treasury for LP margin
  IF v_lp_total_margin > 0 THEN
    UPDATE profiles
    SET balance = balance - v_lp_total_margin
    WHERE id = v_treasury_id
    RETURNING balance INTO v_treasury_bal;

    INSERT INTO balance_ledger (user_id, type, amount, balance_after, label, reference_id)
    VALUES (v_treasury_id, 'withdraw', -v_lp_total_margin, v_treasury_bal,
            'Comisión LP pagada: ' || COALESCE(v_event_q, p_event_id), p_event_id);
  END IF;

  -- ── Step 3: Split remaining pool among winners ──
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
      v_user_payout := ROUND((v_row.user_shares / v_winning_shares) * v_pool_after_lp, 2);

      UPDATE predictions
      SET status = 'won', resolved_at = now(), potential_cobro = v_user_payout
      WHERE id = v_row.pred_id;

      UPDATE profiles
      SET balance             = balance + v_user_payout,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + v_user_payout
      WHERE id = v_row.user_id
      RETURNING balance INTO v_new_balance;

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

  -- ── Step 5: Mark positions ──
  UPDATE positions SET status = 'won'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND (side = p_result OR side = (p_result || '::yes'));

  UPDATE positions SET status = 'lost'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND side <> p_result
    AND side <> (p_result || '::yes');

  -- ── Step 6: Resolve event ──
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

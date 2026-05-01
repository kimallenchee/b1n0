-- ============================================================
--  Migration: execute_purchase must write balance_ledger row
--  Date: 2026-05-01
--
--  ROOT CAUSE (reconciliation $5 drift):
--    execute_purchase (binary markets) updated profiles.balance
--    when a user bought a position, but never inserted a matching
--    row into balance_ledger. Every binary purchase therefore
--    silently widened the ledger-vs-balance drift by exactly the
--    purchase amount.
--
--    sum(balance_ledger) - sum(profiles.balance) = +Σ purchases
--
--  COMPARISON WITH PEER RPCS:
--    execute_option_purchase  → writes type='vote', amount=-p_gross ✓
--    execute_sell             → writes type='sell', amount=v_proceeds ✓
--    settle_predictions       → writes 'win'/'loss'/'skim'           ✓
--    deposit_balance          → writes 'deposit'                     ✓
--    withdraw_balance         → writes 'withdraw'                    ✓
--    execute_purchase         → MISSING                              ✗
--
--  FIX:
--    1. Recreate execute_purchase with an INSERT INTO balance_ledger
--       (type='vote', amount=-p_gross, balance_after=v_new_balance)
--       matching the convention used by execute_option_purchase.
--    2. Backfill any historical purchases that lack a ledger row.
--       For each market_transactions row with tx_type='purchase' and
--       success=true that has no corresponding balance_ledger row
--       (matched by reference_id = position_id::text), insert one.
--
--  Idempotent: backfill uses NOT EXISTS, so re-running is safe.
-- ============================================================

BEGIN;

-- ── 1. Recreate execute_purchase with the missing ledger insert ─

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

  -- ▸ AMOUNT (USD)
  IF p_gross IS NULL OR p_gross < 1 THEN
    RETURN jsonb_build_object('error', 'Monto mínimo: $1');
  END IF;
  IF p_gross > 10000 THEN
    RETURN jsonb_build_object('error', 'Monto excede límite del sistema');
  END IF;

  -- ▸ MARKET
  SELECT * INTO v_market FROM event_markets WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mercado no encontrado');
  END IF;
  IF v_market.status <> 'open' THEN
    RETURN jsonb_build_object('error', 'Mercado cerrado: ' || v_market.status);
  END IF;
  IF p_side NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('error', 'Lado inválido: ' || p_side);
  END IF;

  -- ▸ EVENT
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evento no encontrado');
  END IF;
  IF v_event.min_entry IS NOT NULL AND p_gross < v_event.min_entry THEN
    RETURN jsonb_build_object('error', 'Entrada mínima: $' || v_event.min_entry);
  END IF;
  IF v_event.max_entry IS NOT NULL AND p_gross > v_event.max_entry THEN
    RETURN jsonb_build_object('error', 'Entrada máxima: $' || v_event.max_entry);
  END IF;

  -- ▸ PROFILE + TIER
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;
  IF v_profile.tier < COALESCE(v_event.tier_required, 1) THEN
    RETURN jsonb_build_object('error',
      'Este evento requiere Nivel ' || v_event.tier_required || '+. Subí tu nivel para participar.');
  END IF;

  v_tier_cap := CASE v_profile.tier
    WHEN 1 THEN 50
    WHEN 2 THEN 250
    WHEN 3 THEN 1000
    ELSE 50
  END;
  IF p_gross > v_tier_cap THEN
    RETURN jsonb_build_object('error',
      'Límite para Nivel ' || v_profile.tier || ': $' || v_tier_cap || '. Subí de nivel para participar más.');
  END IF;

  v_balance := v_profile.balance;
  IF v_balance < p_gross THEN
    RETURN jsonb_build_object('error', 'Saldo insuficiente');
  END IF;

  -- ▸ AMM PRICING
  SELECT COALESCE(
    (SELECT value / 100 FROM platform_config WHERE key = 'tx_fee_pct'),
    0.025
  ) INTO v_tx_fee_rate;

  v_total_shares := v_market.yes_shares + v_market.no_shares;
  IF p_side = 'yes' THEN
    v_mid := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid := ROUND(v_market.no_shares / v_total_shares, 6);
  END IF;

  v_skew := ABS(v_mid - 0.5) / 0.5;
  v_spread_rate := COALESCE(
    (SELECT value / 100 FROM platform_config WHERE key = 'spread_low_pct'),
    0.01
  ) + (
    COALESCE(
      (SELECT value / 100 FROM platform_config WHERE key = 'spread_high_pct'),
      0.02
    ) - COALESCE(
      (SELECT value / 100 FROM platform_config WHERE key = 'spread_low_pct'),
      0.01
    )
  ) * v_skew;
  v_half_spread := v_spread_rate / 2;
  v_ask := LEAST(0.99, v_mid + v_half_spread);

  v_fee       := ROUND(p_gross * v_tx_fee_rate, 2);
  v_net       := p_gross - v_fee;
  v_contracts := ROUND(v_net / v_ask, 4);
  v_contracts_at_mid := ROUND(v_net / v_mid, 4);
  v_spread_captured  := ROUND((v_contracts_at_mid - v_contracts) * v_mid, 2);
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

  -- ▸ DEBIT USER (and write the matching ledger row — THIS IS THE FIX)
  v_new_balance := v_balance - p_gross;
  UPDATE profiles SET balance = v_new_balance WHERE id = p_user_id;

  INSERT INTO positions
    (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  VALUES
    (p_event_id, p_user_id, p_side, v_contracts, v_ask, v_payout, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, spread_captured, success, tx_type)
  VALUES
    (v_position_id, p_event_id, p_user_id, p_gross, v_fee, v_net - v_spread_captured, v_spread_captured, true, 'purchase');

  -- ✅ FIX: Insert the balance_ledger row for the purchase debit.
  -- type='vote' matches execute_option_purchase's convention; amount
  -- is negative because money is leaving the user's profile balance.
  -- reference_id = position id so we can join back to the trade.
  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;
  INSERT INTO public.balance_ledger
    (user_id, type, amount, balance_after, label, reference_id)
  VALUES
    (p_user_id, 'vote', -p_gross, v_new_balance,
     'Llamado: ' || COALESCE(v_event_q, p_event_id) || ' — ' || UPPER(p_side),
     v_position_id::text);

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

  -- Credit treasury with fee + spread captured.
  PERFORM public.sweep_to_treasury();

  RETURN jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'price_at_purchase', v_ask,
    'payout_if_win',     v_payout,
    'fee_paid',          v_fee,
    'spread_captured',   v_spread_captured,
    'gross_amount',      p_gross,
    'tx_fee_rate',       v_tx_fee_rate,
    'mid_price',         v_mid,
    'spread_rate',       v_spread_rate,
    'pool_remaining',    v_market.pool_total - v_max_lia
  );
END;
$$;


-- ── 2. Backfill missing ledger rows for historical purchases ────
--
--  Match each successful 'purchase' market_transactions row that has
--  NO corresponding balance_ledger row (joined by position_id =
--  reference_id) and insert the missing -gross_amount row. balance_after
--  is reconstructed as the user's CURRENT balance minus all subsequent
--  ledger movements after the purchase timestamp — which, since the only
--  missing rows are these purchases, is just the current balance.

INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id, created_at)
SELECT
  mt.user_id,
  'vote'                                       AS type,
  -mt.gross_amount                             AS amount,
  -- Reconstruct balance_after: profile.balance now + everything that
  -- happened AFTER this purchase (so we "undo" later movements to get
  -- the balance state right after this purchase).
  ROUND(
    p.balance
    + COALESCE((
        SELECT SUM(bl2.amount)
        FROM public.balance_ledger bl2
        WHERE bl2.user_id = mt.user_id
          AND bl2.created_at > mt.created_at
      ), 0)
    - mt.gross_amount,
    2
  )                                            AS balance_after,
  'Backfill: llamado histórico ' || COALESCE(e.question, mt.event_id) AS label,
  mt.position_id::text                         AS reference_id,
  mt.created_at                                AS created_at
FROM public.market_transactions mt
JOIN public.profiles p ON p.id = mt.user_id
LEFT JOIN public.events e ON e.id = mt.event_id
WHERE mt.tx_type = 'purchase'
  AND mt.success = true
  AND NOT EXISTS (
    SELECT 1 FROM public.balance_ledger bl
    WHERE bl.reference_id = mt.position_id::text
      AND bl.type = 'vote'
  );

COMMIT;

-- ── Verification (run after applying) ───────────────────────────
--
--   -- Should now be 0 (or empty)
--   SELECT
--     p.id, p.name, p.balance,
--     COALESCE((SELECT SUM(amount) FROM public.balance_ledger WHERE user_id = p.id), 0) AS ledger,
--     ROUND(p.balance - COALESCE((SELECT SUM(amount) FROM public.balance_ledger WHERE user_id = p.id), 0), 4) AS delta
--   FROM public.profiles p
--   WHERE ABS(p.balance - COALESCE((SELECT SUM(amount) FROM public.balance_ledger WHERE user_id = p.id), 0)) > 0.01;
--
--   -- Re-run reconciliation; ledger_balance_delta should be 0.00.
--   SELECT public.run_reconciliation();

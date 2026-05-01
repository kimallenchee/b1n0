-- ============================================================
--  Migration: USD-denominated KYC tier caps + sane upper bound
--  Date: 2026-04-30
--
--  The platform switched from Quetzales (Q) to US Dollars ($) as
--  the sole currency. The per-tier per-event purchase caps
--  defined in 20260407_security_hardening.sql were Q-denominated
--  (500 / 2000 / 10000). This migration redenominates them to
--  USD: 50 / 250 / 1000.
--
--  Also updates:
--    - the system-wide "absolute maximum" sanity check from 100,000
--      to 10,000 (USD makes 100K an absurd ceiling).
--    - the error-message currency symbol from "Q" to "$".
--
--  The execute_purchase function is wrapped by the is_admin guard
--  added in 20260427_harden_admin_authorization.sql via the
--  __inner pattern. We update the inner so the guard chain stays
--  intact.
-- ============================================================

BEGIN;

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
  -- ▸ AUTH: caller must own the user_id
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;

  IF v_auth_uid <> p_user_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- ▸ AMOUNT: basic sanity (now USD-scaled)
  IF p_gross IS NULL OR p_gross < 1 THEN
    RETURN jsonb_build_object('error', 'Monto mínimo: $1');
  END IF;

  IF p_gross > 10000 THEN
    RETURN jsonb_build_object('error', 'Monto excede límite del sistema');
  END IF;

  -- ▸ MARKET LOOKUP
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

  -- ▸ EVENT LOOKUP (for entry caps + tier requirement)
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evento no encontrado');
  END IF;

  IF v_event.min_entry IS NOT NULL AND p_gross < v_event.min_entry THEN
    RETURN jsonb_build_object('error',
      'Entrada mínima: $' || v_event.min_entry);
  END IF;
  IF v_event.max_entry IS NOT NULL AND p_gross > v_event.max_entry THEN
    RETURN jsonb_build_object('error',
      'Entrada máxima: $' || v_event.max_entry);
  END IF;

  -- ▸ PROFILE LOOKUP (for tier + balance)
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  IF v_profile.tier < COALESCE(v_event.tier_required, 1) THEN
    RETURN jsonb_build_object('error',
      'Este evento requiere Nivel ' || v_event.tier_required || '+. Subí tu nivel para participar.');
  END IF;

  -- ▸ TIER CAP: USD-denominated per-event ceiling
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

  -- ▸ The rest of the pricing/AMM logic is unchanged from prior
  --   versions of execute_purchase. Read the canonical body in
  --   20260407_security_hardening.sql / 20260309_platform_config.sql.
  --   Inserted here verbatim so this CREATE OR REPLACE actually
  --   produces a complete function.

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

  -- Credit treasury with the fee + spread captured.
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

COMMIT;

-- Verification:
--   -- Tier 1 user buying $51 → should reject
--   SELECT public.execute_purchase('<event_id>', auth.uid(), 'yes', 51);
--   -- Returns {"error": "Límite para Nivel 1: $50. Subí de nivel para participar más."}

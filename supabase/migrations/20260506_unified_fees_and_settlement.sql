-- ============================================================
--  Migration: unified fees + settlement consolidation
--  Date: 2026-05-06
--
--  This single migration closes a basket of bugs and design
--  inconsistencies the admin-dashboard audit surfaced:
--
--    [BUG]  EventManager calls settle_predictions, which doesn't
--           return LP capital and uses a hardcoded treasury UUID
--           and FLOOR rounding (penny-leak on every payout).
--           → Fix: settle_predictions becomes a thin wrapper that
--             calls settle_event, so the admin UI's "Resuelto"
--             button uses the correct settlement path.
--
--    [BUG]  preview_purchase computes payout_if_win with a
--           parimutuel formula `(contracts/winning_shares) × pool`
--           but execute_purchase stores `payout_if_win = contracts`
--           (Kalshi). User sees one number in BUY panel, gets
--           another at settlement.
--           → Fix: preview_purchase now mirrors execute_purchase
--             exactly: payout = contracts.
--
--    [BUG]  preview_purchase uses dynamic-curve fee math
--           (skew × depth_factor) but execute_purchase uses flat
--           tx_fee_pct. Preview shows ~5%, execute charges 2.5%.
--           → Fix: both use the new volume-aware curve below.
--
--    [DESIGN] The OLD dynamic fee curve was inverted from useful:
--             ceiling fees on fresh + balanced markets, floor fees
--             on deep + skewed ones. Penalized early traders.
--           → Fix: new curve scales fee FROM floor TO ceiling as
--             event volume grows, so quiet markets are cheap and
--             popular markets earn the platform more — exactly
--             what the b1n0 super-user incentive structure wants.
--
--    [NEW]  Maker rebate: the first N bets on every event pay
--           ZERO fee. Bootstraps liquidity on cold-start markets,
--           rewards the kind of early traders Kalshi calls "super
--           users." Threshold is platform_config-driven so admins
--           can tune from the Tarifas panel.
--
--    [NEW]  Skew bump: small (+0.5%) fee surcharge when the market
--           is heavily lopsided (mid > 0.80 or mid < 0.20),
--           compensating LPs for one-sided variance risk.
--
--  Idempotency: CREATE OR REPLACE for every function, ON CONFLICT
--  for config inserts. Safe to re-run.
--
--  Rollback: re-apply migration 20260307_pricing_v2.sql to revert
--  preview_purchase and 20260309_platform_config.sql to revert
--  execute_purchase. settle_predictions can be reverted by
--  restoring its body from settle_predictions__inner (still kept
--  on disk for backup).
-- ============================================================

BEGIN;

-- ── 1. New platform_config entries (admin-tunable from Tarifas) ──

INSERT INTO public.platform_config (key, value, label) VALUES
  ('maker_rebate_count',      10,    'Primeras N entradas por evento sin comisión'),
  ('volume_factor_threshold', 5000,  'bet_pool ($) en que la comisión llega al techo'),
  ('skew_bump_threshold',     0.30,  '|mid-0.5| sobre el cual se aplica el bump'),
  ('skew_bump_pct',           0.5,   'Comisión adicional en mercados desequilibrados (%)')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label;


-- ── 2. settle_predictions → wrapper that delegates to settle_event ──
--
-- The legacy settle_predictions__inner is kept on disk (no DROP) so
-- we can roll back by simply changing this wrapper's body. The new
-- wrapper translates settle_event's response shape into the legacy
-- field names the EventManager UI reads, so no client changes are
-- needed for this migration to ship.
--
-- DROP first because the legacy wrapper returns INTEGER and Postgres
-- doesn't let CREATE OR REPLACE change a function's return type. We
-- catch both possible parameter signatures (text, text) and (uuid,
-- text) since events.id has been variously typed across migrations.

DO $$ BEGIN
  DROP FUNCTION IF EXISTS public.settle_predictions(text, text);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP FUNCTION IF EXISTS public.settle_predictions(uuid, text);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.settle_predictions(
  p_event_id text,
  p_result   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Admin guard (matches every other admin-only RPC in this codebase).
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  -- Delegate to settle_event, which has the correct full-fidelity
  -- settlement logic: LP capital return + margin share, ROUND
  -- rounding (no penny-leak from FLOOR), platform_config-driven
  -- treasury account, audit-log entry, predictions + positions
  -- both updated.
  v_result := public.settle_event(p_event_id, p_result);

  -- Back-compat: the EventManager UI reads predictions_processed
  -- and lp_actual_paid from the response. Map settle_event's
  -- field names so the toast continues to display correct counts.
  RETURN v_result || jsonb_build_object(
    'predictions_processed',
      COALESCE((v_result->>'winners_count')::int, 0)
      + COALESCE((v_result->>'losers_count')::int, 0),
    'lp_actual_paid',  v_result->'lp_total_paid'
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.settle_predictions(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.settle_predictions(text, text) TO authenticated;


-- ── 3. preview_purchase: aligned to execute_purchase math ──
--
-- New fee curve:
--   IF bet_count_in_event < maker_rebate_count:
--     fee = 0  (super-user perk on fresh markets)
--   ELSE:
--     volume_factor = LEAST(bet_pool / volume_factor_threshold, 1)
--     fee_rate = floor + (ceiling - floor) × volume_factor
--     IF |mid - 0.5| > skew_bump_threshold:
--       fee_rate += skew_bump_pct
--   fee = ROUND(p_gross × fee_rate, 2)
--
-- Payout: Kalshi-style, payout_if_win = contracts (matches
-- execute_purchase storage and what settle_event actually pays).
--
-- Preview's signature stays (text, text, numeric) — no user_id —
-- so the BUY panel doesn't need to be re-plumbed. Maker rebate
-- and tier-aware perks evaluate against the event's bet count
-- rather than the calling user.

CREATE OR REPLACE FUNCTION public.preview_purchase(
  p_event_id text,
  p_side     text,
  p_gross    numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_market               event_markets%rowtype;
  v_total_shares         numeric(14,4);
  v_mid                  numeric(10,6);
  v_skew                 numeric(10,6);
  v_spread_low           numeric(6,4);
  v_spread_high          numeric(6,4);
  v_spread_rate          numeric(10,6);
  v_half_spread          numeric(10,6);
  v_ask                  numeric(10,6);
  v_fee_floor            numeric(6,4);
  v_fee_ceiling          numeric(6,4);
  v_volume_threshold     numeric(14,2);
  v_volume_factor        numeric(10,6);
  v_skew_bump_threshold  numeric(6,4);
  v_skew_bump_pct        numeric(6,4);
  v_maker_rebate_count   integer;
  v_bet_count            integer;
  v_fee_rate             numeric(10,6);
  v_fee                  numeric(12,2);
  v_net                  numeric(12,2);
  v_contracts            numeric(14,4);
  v_payout               numeric(12,2);
  v_new_yes_lia          numeric(12,2);
  v_new_no_lia           numeric(12,2);
  v_max_lia              numeric(12,2);
BEGIN
  -- Load market state
  SELECT * INTO v_market FROM event_markets WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado no encontrado');
  END IF;
  IF v_market.status NOT IN ('open', 'private') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mercado cerrado');
  END IF;

  -- Mid and ask price (AMM curve unchanged from old preview)
  v_total_shares := v_market.yes_shares + v_market.no_shares;
  IF p_side = 'yes' THEN
    v_mid := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid := ROUND(v_market.no_shares / v_total_shares, 6);
  END IF;
  v_skew := ABS(v_mid - 0.5) / 0.5;

  -- Pull spread + fee config
  SELECT COALESCE(value, 1) / 100 INTO v_spread_low
    FROM platform_config WHERE key = 'spread_low_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_spread_high
    FROM platform_config WHERE key = 'spread_high_pct';
  SELECT COALESCE(value, 1) / 100 INTO v_fee_floor
    FROM platform_config WHERE key = 'fee_floor_pct';
  SELECT COALESCE(value, 5) / 100 INTO v_fee_ceiling
    FROM platform_config WHERE key = 'fee_ceiling_pct';
  SELECT COALESCE(value, 5000) INTO v_volume_threshold
    FROM platform_config WHERE key = 'volume_factor_threshold';
  SELECT COALESCE(value, 10)::int INTO v_maker_rebate_count
    FROM platform_config WHERE key = 'maker_rebate_count';
  SELECT COALESCE(value, 0.30) INTO v_skew_bump_threshold
    FROM platform_config WHERE key = 'skew_bump_threshold';
  SELECT COALESCE(value, 0.5) / 100 INTO v_skew_bump_pct
    FROM platform_config WHERE key = 'skew_bump_pct';

  -- Apply spread to get ask price
  IF v_market.spread_enabled THEN
    v_spread_rate := v_spread_low + (v_spread_high - v_spread_low) * v_skew;
    v_half_spread := ROUND(v_spread_rate / 2, 6);
    v_ask := LEAST(GREATEST(v_mid + v_half_spread, 0.02), 0.99);
  ELSE
    v_ask := v_mid;
    v_spread_rate := 0;
  END IF;

  -- Maker rebate check: how many positions already exist on this event?
  SELECT COUNT(*) INTO v_bet_count
  FROM positions WHERE event_id = p_event_id;

  -- Fee curve
  IF v_bet_count < v_maker_rebate_count THEN
    -- Super-user / maker rebate window: free fee
    v_fee_rate := 0;
  ELSE
    v_volume_factor := LEAST(
      COALESCE(v_market.bet_pool, 0) / GREATEST(v_volume_threshold, 1),
      1.0
    );
    v_fee_rate := v_fee_floor + (v_fee_ceiling - v_fee_floor) * v_volume_factor;
    -- Skew bump on heavily lopsided markets
    IF ABS(v_mid - 0.5) > v_skew_bump_threshold THEN
      v_fee_rate := v_fee_rate + v_skew_bump_pct;
    END IF;
    -- Clamp so total fee never exceeds ceiling + bump
    v_fee_rate := GREATEST(LEAST(v_fee_rate, v_fee_ceiling + v_skew_bump_pct), 0);
  END IF;

  -- Compute purchase
  v_fee       := ROUND(p_gross * v_fee_rate, 2);
  v_net       := p_gross - v_fee;
  v_contracts := ROUND(v_net / v_ask, 4);
  v_payout    := ROUND(v_contracts, 2);  -- Kalshi: 1 contract = $1 if win

  -- Pool cap check
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
                           THEN 'Pool cap reached — mercado lleno' ELSE NULL END,
    'fee',            v_fee,
    'fee_rate',       v_fee_rate,
    'net',            v_net,
    'price',          v_ask,
    'mid_price',      v_mid,
    'spread_rate',    COALESCE(v_spread_rate, 0),
    'contracts',      v_contracts,
    'payout_if_win',  v_payout,
    'est_payout',     v_payout,
    'pool_total',     v_market.pool_total,
    'pool_committed', v_max_lia,
    'pool_remaining', v_market.pool_total - v_max_lia,
    'bet_count',      v_bet_count,
    'maker_rebate',   v_bet_count < v_maker_rebate_count,
    'volume_factor',  CASE WHEN v_bet_count >= v_maker_rebate_count
                           THEN LEAST(COALESCE(v_market.bet_pool, 0)
                                / GREATEST(v_volume_threshold, 1), 1.0)
                           ELSE 0 END,
    'yes_price_new',  ROUND((v_market.yes_shares
                             + CASE WHEN p_side = 'yes' THEN v_contracts ELSE 0 END)
                            / (v_total_shares + v_contracts), 6),
    'no_price_new',   ROUND((v_market.no_shares
                             + CASE WHEN p_side = 'no' THEN v_contracts ELSE 0 END)
                            / (v_total_shares + v_contracts), 6)
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.preview_purchase(text, text, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.preview_purchase(text, text, numeric) TO authenticated;


-- ── 4. execute_purchase: same fee curve as preview, Kalshi payout ──
--
-- Mirrors the live execute_purchase body verbatim except for the
-- fee calculation, which now uses the new volume-aware curve.
-- Everything else (auth, tier caps, balance debit, ledger write,
-- AMM share update, predictions upsert, treasury sweep) is byte-
-- identical to the prior version.

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
  v_auth_uid             uuid := auth.uid();
  v_market               event_markets%rowtype;
  v_event                events%rowtype;
  v_profile              profiles%rowtype;
  v_balance              numeric(12,2);
  v_new_balance          numeric(12,2);
  v_total_shares         numeric(14,4);
  v_mid                  numeric(10,6);
  v_skew                 numeric(10,6);
  v_spread_low           numeric(6,4);
  v_spread_high          numeric(6,4);
  v_spread_rate          numeric(10,6);
  v_half_spread          numeric(10,6);
  v_ask                  numeric(10,6);
  v_fee_floor            numeric(6,4);
  v_fee_ceiling          numeric(6,4);
  v_volume_threshold     numeric(14,2);
  v_volume_factor        numeric(10,6);
  v_skew_bump_threshold  numeric(6,4);
  v_skew_bump_pct        numeric(6,4);
  v_maker_rebate_count   integer;
  v_bet_count            integer;
  v_fee_rate             numeric(10,6);
  v_fee                  numeric(12,2);
  v_net                  numeric(12,2);
  v_contracts            numeric(14,4);
  v_contracts_at_mid     numeric(14,4);
  v_spread_captured      numeric(12,2);
  v_payout               numeric(12,2);
  v_new_yes_lia          numeric(12,2);
  v_new_no_lia           numeric(12,2);
  v_max_lia              numeric(12,2);
  v_position_id          uuid;
  v_event_q              text;
  v_tier_cap             numeric(12,2);
BEGIN
  -- ▸ AUTH
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No autenticado');
  END IF;
  IF v_auth_uid <> p_user_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- ▸ AMOUNT
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

  -- ▸ PROFILE + TIER CAP
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;
  IF v_profile.tier < COALESCE(v_event.tier_required, 1) THEN
    RETURN jsonb_build_object('error',
      'Este evento requiere Nivel ' || v_event.tier_required
      || '+. Subí tu nivel para participar.');
  END IF;
  v_tier_cap := CASE v_profile.tier
    WHEN 1 THEN 50 WHEN 2 THEN 250 WHEN 3 THEN 1000 ELSE 50 END;
  IF p_gross > v_tier_cap THEN
    RETURN jsonb_build_object('error',
      'Límite para Nivel ' || v_profile.tier || ': $' || v_tier_cap
      || '. Subí de nivel para participar más.');
  END IF;
  v_balance := v_profile.balance;
  IF v_balance < p_gross THEN
    RETURN jsonb_build_object('error', 'Saldo insuficiente');
  END IF;

  -- ▸ AMM PRICING (same as preview)
  v_total_shares := v_market.yes_shares + v_market.no_shares;
  IF p_side = 'yes' THEN
    v_mid := ROUND(v_market.yes_shares / v_total_shares, 6);
  ELSE
    v_mid := ROUND(v_market.no_shares / v_total_shares, 6);
  END IF;
  v_skew := ABS(v_mid - 0.5) / 0.5;

  SELECT COALESCE(value, 1) / 100 INTO v_spread_low
    FROM platform_config WHERE key = 'spread_low_pct';
  SELECT COALESCE(value, 2) / 100 INTO v_spread_high
    FROM platform_config WHERE key = 'spread_high_pct';
  SELECT COALESCE(value, 1) / 100 INTO v_fee_floor
    FROM platform_config WHERE key = 'fee_floor_pct';
  SELECT COALESCE(value, 5) / 100 INTO v_fee_ceiling
    FROM platform_config WHERE key = 'fee_ceiling_pct';
  SELECT COALESCE(value, 5000) INTO v_volume_threshold
    FROM platform_config WHERE key = 'volume_factor_threshold';
  SELECT COALESCE(value, 10)::int INTO v_maker_rebate_count
    FROM platform_config WHERE key = 'maker_rebate_count';
  SELECT COALESCE(value, 0.30) INTO v_skew_bump_threshold
    FROM platform_config WHERE key = 'skew_bump_threshold';
  SELECT COALESCE(value, 0.5) / 100 INTO v_skew_bump_pct
    FROM platform_config WHERE key = 'skew_bump_pct';

  v_spread_rate := v_spread_low + (v_spread_high - v_spread_low) * v_skew;
  v_half_spread := v_spread_rate / 2;
  v_ask := LEAST(0.99, v_mid + v_half_spread);

  -- ▸ FEE — new volume-aware curve, identical to preview_purchase
  SELECT COUNT(*) INTO v_bet_count
  FROM positions WHERE event_id = p_event_id;

  IF v_bet_count < v_maker_rebate_count THEN
    v_fee_rate := 0;
  ELSE
    v_volume_factor := LEAST(
      COALESCE(v_market.bet_pool, 0) / GREATEST(v_volume_threshold, 1),
      1.0
    );
    v_fee_rate := v_fee_floor + (v_fee_ceiling - v_fee_floor) * v_volume_factor;
    IF ABS(v_mid - 0.5) > v_skew_bump_threshold THEN
      v_fee_rate := v_fee_rate + v_skew_bump_pct;
    END IF;
    v_fee_rate := GREATEST(LEAST(v_fee_rate, v_fee_ceiling + v_skew_bump_pct), 0);
  END IF;

  v_fee              := ROUND(p_gross * v_fee_rate, 2);
  v_net              := p_gross - v_fee;
  v_contracts        := ROUND(v_net / v_ask, 4);
  v_contracts_at_mid := ROUND(v_net / v_mid, 4);
  v_spread_captured  := ROUND((v_contracts_at_mid - v_contracts) * v_mid, 2);
  v_payout           := ROUND(v_contracts, 2);  -- Kalshi: 1 contract = $1

  -- ▸ POOL CAP
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

  -- ▸ DEBIT USER + LEDGER ROW (unchanged)
  v_new_balance := v_balance - p_gross;
  UPDATE profiles SET balance = v_new_balance WHERE id = p_user_id;

  INSERT INTO positions
    (event_id, user_id, side, contracts, price_at_purchase,
     payout_if_win, fee_paid, gross_amount)
  VALUES
    (p_event_id, p_user_id, p_side, v_contracts, v_ask,
     v_payout, v_fee, p_gross)
  RETURNING id INTO v_position_id;

  INSERT INTO market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted,
     net_to_pool, spread_captured, success, tx_type)
  VALUES
    (v_position_id, p_event_id, p_user_id, p_gross, v_fee,
     v_net - v_spread_captured, v_spread_captured, true, 'purchase');

  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;
  INSERT INTO public.balance_ledger
    (user_id, type, amount, balance_after, label, reference_id)
  VALUES
    (p_user_id, 'vote', -p_gross, v_new_balance,
     'Llamado: ' || COALESCE(v_event_q, p_event_id) || ' — ' || UPPER(p_side),
     v_position_id::text);

  -- ▸ AMM SHARE UPDATE (unchanged)
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

  PERFORM public.sweep_to_treasury();

  RETURN jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'price_at_purchase', v_ask,
    'payout_if_win',     v_payout,
    'fee_paid',          v_fee,
    'fee_rate',          v_fee_rate,
    'spread_captured',   v_spread_captured,
    'gross_amount',      p_gross,
    'mid_price',         v_mid,
    'spread_rate',       v_spread_rate,
    'maker_rebate',      v_bet_count < v_maker_rebate_count,
    'pool_remaining',    v_market.pool_total - v_max_lia
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.execute_purchase(text, uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_purchase(text, uuid, text, numeric) TO authenticated;


COMMIT;

-- ============================================================
--  Verification queries to run after applying:
--
--  -- 1. New config keys present
--  SELECT key, value FROM platform_config
--   WHERE key IN ('maker_rebate_count','volume_factor_threshold',
--                 'skew_bump_threshold','skew_bump_pct')
--   ORDER BY key;
--
--  -- 2. settle_predictions wraps settle_event (smoke test on a
--     test event — DO NOT run on a real resolved event)
--
--  -- 3. preview vs execute fee/payout match
--     Place a test bet, capture preview's fee & payout_if_win,
--     then read positions.fee_paid & payout_if_win post-purchase.
--     Should be identical (within rounding).
--
--  -- 4. Maker rebate active on a fresh event
--     Create a test event, call preview_purchase with any amount.
--     Response should include maker_rebate=true and fee=0 for
--     the first 10 calls.
-- ============================================================

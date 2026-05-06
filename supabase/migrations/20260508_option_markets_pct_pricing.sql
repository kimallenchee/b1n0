-- ============================================================
--  Migration: initialize_option_markets must use pct for shares
--  Date: 2026-05-08
--
--  PROBLEM:
--    The fix in 20260507 correctly parsed 'label:pct:pool' from
--    events.options and used the pool value for option_markets.
--    pool_total. But it set yes_shares=1000 and no_shares=1000
--    on every option, ignoring the pct field. Since the AMM
--    prices SÍ as yes_shares / (yes_shares + no_shares), every
--    option ends up at SÍ=0.50 (mid) regardless of how the admin
--    weighted the probabilities. Mundial 2026 case: Argentina at
--    19% and México at 4% both initialized at 0.51 SÍ.
--
--  FIX:
--    Use the pct field to skew the synthetic shares so the
--    initial mid price matches the admin-specified probability:
--      yes_shares = synthetic * pct / 100
--      no_shares  = synthetic * (100 - pct) / 100
--    With synthetic=1000:
--      Argentina (19%): yes=190, no=810 → mid = 0.19
--      México (4%):     yes=40,  no=960 → mid = 0.04
--    Pct is clamped between 1 and 99 to avoid a 0-share side
--    that would break the AMM division.
--
--  Idempotency: CREATE OR REPLACE. Safe to re-run.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.initialize_option_markets(
  p_event_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_event       events%ROWTYPE;
  v_entry       TEXT;
  v_parts       TEXT[];
  v_label       TEXT;
  v_pool        NUMERIC(12,2);
  v_pct         NUMERIC(6,2);
  v_synthetic   NUMERIC(14,4) := 1000;
  v_yes_shares  NUMERIC(14,4);
  v_no_shares   NUMERIC(14,4);
  v_count       INTEGER := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evento no encontrado');
  END IF;

  IF v_event.options IS NULL OR array_length(v_event.options, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'Evento no tiene opciones definidas');
  END IF;

  FOREACH v_entry IN ARRAY v_event.options LOOP
    v_entry := TRIM(v_entry);
    IF v_entry = '' THEN CONTINUE; END IF;

    v_parts := string_to_array(v_entry, ':');
    v_label := TRIM(COALESCE(v_parts[1], ''));
    IF v_label = '' THEN CONTINUE; END IF;

    -- Probability % SÍ inicial (second field)
    BEGIN
      v_pct := COALESCE(NULLIF(TRIM(v_parts[2]), ''), '50')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_pct := 50;
    END;
    -- Clamp 1..99 so neither side is 0-share (breaks the AMM)
    v_pct := GREATEST(LEAST(v_pct, 99), 1);

    -- Per-option pool size (third field)
    BEGIN
      v_pool := COALESCE(NULLIF(TRIM(v_parts[3]), ''), '0')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_pool := 0;
    END;

    -- Skew synthetic shares so the AMM mid price = pct/100 from the start.
    -- price_si = yes_shares / (yes_shares + no_shares)
    v_yes_shares := ROUND(v_synthetic * v_pct / 100, 4);
    v_no_shares  := ROUND(v_synthetic - v_yes_shares, 4);

    INSERT INTO option_markets
      (event_id, option_label, pool_total, yes_shares, no_shares)
    VALUES
      (p_event_id, v_label, v_pool, v_yes_shares, v_no_shares)
    ON CONFLICT (event_id, option_label) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'options_created', v_count
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.initialize_option_markets(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_option_markets(TEXT) TO authenticated;

COMMIT;

-- ============================================================
--  Verification:
--    -- For an existing event, recompute pricing manually
--    SELECT option_label, yes_shares, no_shares,
--           ROUND(yes_shares / (yes_shares + no_shares), 4) AS mid_si
--    FROM option_markets
--    WHERE event_id = '<event-id>'
--    ORDER BY mid_si DESC;
-- ============================================================

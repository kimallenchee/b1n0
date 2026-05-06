-- ============================================================
--  Migration: fix initialize_option_markets to handle text[]
--             and parse 'label:pct:pool' option entries
--  Date: 2026-05-07
--
--  PROBLEM:
--    events.options has column type TEXT[] (array of text), but
--    the legacy initialize_option_markets RPC was written assuming
--    it was a TEXT (comma-separated). Two specific failures:
--      1. 'IF v_event.options <> ''''  triggers malformed array
--         literal at runtime when Postgres tries to cast empty
--         string to text[].
--      2. string_to_array(v_event.options, ',') on an array would
--         also fail.
--    Plus each array element from the admin form is serialized
--    as 'label:pct:pool', not just a bare label, so the legacy
--    function was inserting things like 'Argentina:19:300' as the
--    option_label instead of 'Argentina'.
--    On top of that, the function used a deprecated sponsor-margin
--    formula to compute pool size, ignoring the per-option pool
--    that the admin actually set on the form.
--
--  FIX:
--    Rewrite the function to:
--      - Treat v_event.options as TEXT[] directly (no string_to_array).
--      - Iterate each element with FOREACH, then split on ':' to
--        extract label / pct / pool.
--      - Use the parsed pool as option_markets.pool_total directly.
--        Falls back to 0 if missing.
--      - No sponsor calculation; b1n0 is LP-funded since the 2026-04
--        sponsor-removal pass.
--      - Same admin guard via is_admin().
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
  v_count       INTEGER := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evento no encontrado');
  END IF;

  -- options is TEXT[]; reject if NULL or empty array.
  IF v_event.options IS NULL OR array_length(v_event.options, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'Evento no tiene opciones definidas');
  END IF;

  -- Iterate each 'label:pct:pool' entry.
  FOREACH v_entry IN ARRAY v_event.options LOOP
    v_entry := TRIM(v_entry);
    IF v_entry = '' THEN CONTINUE; END IF;

    v_parts := string_to_array(v_entry, ':');
    v_label := TRIM(COALESCE(v_parts[1], ''));
    IF v_label = '' THEN CONTINUE; END IF;

    -- Pool is the third field; default to 0 if absent or unparseable.
    BEGIN
      v_pool := COALESCE(NULLIF(TRIM(v_parts[3]), ''), '0')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_pool := 0;
    END;

    INSERT INTO option_markets
      (event_id, option_label, pool_total, yes_shares, no_shares)
    VALUES
      (p_event_id, v_label, v_pool, 1000, 1000)
    ON CONFLICT (event_id, option_label) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'options_created', v_count);
END;
$func$;

REVOKE ALL ON FUNCTION public.initialize_option_markets(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_option_markets(TEXT) TO authenticated;

COMMIT;

-- ============================================================
--  Verification:
--    SELECT pg_get_functiondef(oid) ILIKE '%FOREACH v_entry%'
--    FROM pg_proc WHERE proname = 'initialize_option_markets';
--    -- Expect: t (true)
-- ============================================================

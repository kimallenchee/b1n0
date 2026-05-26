-- ============================================================
-- Simulation settle: impersonate a sim-admin user
-- ============================================================
--
-- settle_event__inner and settle_predictions both have inline
-- 'IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND
-- is_admin = true) THEN RAISE Unauthorized' guards. When
-- admin_simulate_settle is called via service-role, auth.uid() is
-- NULL → guard fires → 'Unauthorized' aborts the settle.
--
-- Fix: impersonate any simulated admin user (all sim users are
-- is_admin=true per 20260528c) before calling the inner functions.
-- The impersonation is transaction-local so it doesn't leak.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_simulate_settle(
  p_event_id text,
  p_result   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_sim            boolean;
  v_admin_id           uuid;
  v_settle_result      jsonb;
  v_predictions_result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.positions p
      JOIN public.profiles pr ON pr.id = p.user_id
     WHERE p.event_id = p_event_id AND pr.is_simulated = true
  ) INTO v_has_sim;

  IF NOT v_has_sim THEN
    RAISE EXCEPTION 'admin_simulate_settle refuses event % (no simulated positions)', p_event_id;
  END IF;

  -- Find any simulated admin user to impersonate. All sim users have
  -- is_admin=true per migration 20260528c, so any of them works.
  SELECT id INTO v_admin_id
    FROM public.profiles
   WHERE is_simulated = true AND is_admin = true
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'no simulated admin user available for settle impersonation — did 20260528c apply?';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- Now call the inner functions; auth.uid() = v_admin_id (is_admin=true),
  -- so the inline admin guards pass.
  v_settle_result := public.settle_event__inner(p_event_id, p_result);

  BEGIN
    v_predictions_result := public.settle_predictions__inner(p_event_id, p_result);
  EXCEPTION WHEN undefined_function THEN
    v_predictions_result := public.settle_predictions(p_event_id, p_result);
  END;

  RETURN jsonb_build_object(
    'settle_event',       v_settle_result,
    'settle_predictions', v_predictions_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_simulate_settle(text, text)
  TO authenticated, service_role;

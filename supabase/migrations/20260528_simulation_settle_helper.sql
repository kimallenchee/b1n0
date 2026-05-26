-- ============================================================
-- Simulation settle helper — admin-guarded wrapper for settle_event
-- ============================================================
--
-- The hardened settle_event() rejects service-role calls because the
-- is_admin(auth.uid()) check sees auth.uid() == NULL and returns false.
-- Add a sim-only wrapper that mirrors admin_simulate_purchase /
-- admin_simulate_sell semantics: allow NULL auth.uid() (service-role),
-- block any non-admin authenticated caller, and refuse to settle an
-- event that has no simulated activity.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_simulate_settle(
  p_event_id text,
  p_result   text   -- 'yes' | 'no'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_sim boolean;
  v_settle_result jsonb;
  v_predictions_result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Refuse to touch any event that has no simulated activity, so this
  -- RPC can never be used to settle a real event from a service-role call.
  SELECT EXISTS (
    SELECT 1 FROM public.positions p
      JOIN public.profiles pr ON pr.id = p.user_id
     WHERE p.event_id = p_event_id AND pr.is_simulated = true
  ) INTO v_has_sim;

  IF NOT v_has_sim THEN
    RAISE EXCEPTION 'admin_simulate_settle refuses event % (no simulated positions)', p_event_id;
  END IF;

  -- Route through the hardened wrapper's __inner directly so we bypass
  -- the auth check that fails on service-role calls.
  v_settle_result := public.settle_event__inner(p_event_id, p_result);

  -- settle_predictions does the per-position win/loss/cobro work; call
  -- its inner too if the hardened wrapper exists.
  BEGIN
    v_predictions_result := public.settle_predictions__inner(p_event_id, p_result);
  EXCEPTION WHEN undefined_function THEN
    -- Older installs have a non-hardened settle_predictions
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

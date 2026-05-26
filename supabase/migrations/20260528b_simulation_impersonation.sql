-- ============================================================
-- Simulation impersonation — fix for execute_purchase auth gate
-- ============================================================
--
-- execute_purchase / execute_sell check auth.uid() at the top:
--   IF v_auth_uid IS NULL THEN RETURN error 'No autenticado';
--   IF v_auth_uid <> p_user_id THEN RETURN error 'No autorizado';
--
-- When called via service-role from the simulation script,
-- auth.uid() is NULL, so all sim purchases were silently no-op'd
-- (returned a JSON {error: ...} but no Postgres exception, so the
-- orchestrator counted them as success).
--
-- Fix: inside the admin_simulate_* wrappers, impersonate the
-- simulated user by setting request.jwt.claim.sub. auth.uid() reads
-- from that setting, so execute_purchase sees the right uid and
-- proceeds. The set is LOCAL (third arg = true) so it's confined to
-- the current transaction.
--
-- We re-emit the entire wrapper functions because Postgres doesn't
-- allow partial replacement.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_simulate_purchase(
  p_user_id  uuid,
  p_event_id text,
  p_side     text,
  p_amount   numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_sim boolean;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT is_simulated INTO v_is_sim
    FROM public.profiles WHERE id = p_user_id;
  IF v_is_sim IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_simulate_purchase refuses non-simulated user %', p_user_id;
  END IF;

  -- Impersonate the simulated user so auth.uid() returns their UUID
  -- inside execute_purchase's auth gate. The set is transaction-local.
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  v_result := public.execute_purchase(p_event_id, p_user_id, p_side, p_amount);

  -- Soft-error detection: surface {error: ...} as a hard exception
  -- so the orchestrator counts it as a failure, not a phantom success.
  IF v_result ? 'error' THEN
    RAISE EXCEPTION 'execute_purchase soft-failed: %', v_result->>'error';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_simulate_purchase(uuid, text, text, numeric)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_simulate_sell(
  p_position_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_sim  boolean;
  v_result  jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.positions WHERE id = p_position_id;

  SELECT is_simulated INTO v_is_sim
    FROM public.profiles WHERE id = v_user_id;
  IF v_is_sim IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_simulate_sell refuses non-simulated user %', v_user_id;
  END IF;

  -- Same impersonation trick: make auth.uid() = v_user_id inside execute_sell.
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  v_result := public.execute_sell(p_position_id, v_user_id);

  IF v_result ? 'error' THEN
    RAISE EXCEPTION 'execute_sell soft-failed: %', v_result->>'error';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_simulate_sell(uuid)
  TO authenticated, service_role;

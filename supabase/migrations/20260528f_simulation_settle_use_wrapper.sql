-- ============================================================
-- Simulation settle: call the full settle_event wrapper, not __inner
-- ============================================================
--
-- Previous admin_simulate_settle called settle_event__inner +
-- settle_predictions__inner. Those are the LEGACY (20260307) versions
-- that only handle event_markets.status + per-prediction status —
-- they do NOT credit cobros to balance_ledger, do NOT update
-- profiles.balance for winners, and do NOT write platform_ledger.
--
-- The unified-fees-and-settlement migration (20260506) replaced
-- settle_event with a new version that DOES all the accounting:
--   - settles event_markets
--   - resolves every position (won/lost/voided)
--   - credits winning cobros to balance_ledger + profiles.balance
--   - writes the platform's margin take to platform_ledger
--   - returns LP P&L (lp_capital returned + margin share)
--
-- Since admin_simulate_settle impersonates a sim-admin user (all
-- sim users have is_admin=true per 20260528c), the wrapper's admin
-- check passes and the full settlement logic runs.
--
-- Note: settle_predictions is itself now a wrapper that calls
-- settle_event (per 20260506 comments). So we don't need to call it
-- separately — settle_event handles everything.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_simulate_settle(
  p_event_id text,
  p_result   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_sim       boolean;
  v_admin_id      uuid;
  v_settle_result jsonb;
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

  -- Pick any simulated admin user to impersonate. All sim users have
  -- is_admin=true per 20260528c.
  SELECT id INTO v_admin_id
    FROM public.profiles
   WHERE is_simulated = true AND is_admin = true
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'no simulated admin user available — did 20260528c apply?';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- Call the FULL settle_event wrapper (the 20260506 version that
  -- does cobro credits + platform_ledger writes). The admin check
  -- inside it passes because we impersonated an admin user.
  v_settle_result := public.settle_event(p_event_id, p_result);

  RETURN v_settle_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_simulate_settle(text, text)
  TO authenticated, service_role;

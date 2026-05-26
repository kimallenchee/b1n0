-- ============================================================
-- Simulation wipe: also delete admin_actions referencing sim users
-- ============================================================
--
-- The 20260505_settle_event_lp_return migration writes audit log
-- entries via log_admin_action, which inserts into admin_actions
-- with actor_id = auth.uid(). Since admin_simulate_settle
-- impersonates a sim user, that user becomes the actor_id. Then
-- admin_wipe_simulated's DELETE FROM auth.users fails because of
-- the admin_actions_actor_id_fkey constraint.
--
-- Same fix pattern as 20260528e for market_transactions: explicit
-- DELETE before the auth.users cascade.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_wipe_simulated()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_user_count    integer;
  v_pos_count     integer;
  v_tx_count      integer;
  v_led_count     integer;
  v_audit_count   integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT COUNT(*) INTO v_user_count FROM public.profiles WHERE is_simulated = true;
  SELECT COUNT(*) INTO v_pos_count
    FROM public.positions p JOIN public.profiles pr ON pr.id = p.user_id
   WHERE pr.is_simulated = true;
  SELECT COUNT(*) INTO v_tx_count
    FROM public.market_transactions mt JOIN public.profiles pr ON pr.id = mt.user_id
   WHERE pr.is_simulated = true;
  SELECT COUNT(*) INTO v_led_count
    FROM public.balance_ledger bl JOIN public.profiles pr ON pr.id = bl.user_id
   WHERE pr.is_simulated = true;
  SELECT COUNT(*) INTO v_audit_count
    FROM public.admin_actions aa JOIN public.profiles pr ON pr.id = aa.actor_id
   WHERE pr.is_simulated = true;

  -- Explicit deletes in dependency order, before the auth.users cascade.
  DELETE FROM public.market_transactions
   WHERE user_id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  DELETE FROM public.predictions
   WHERE user_id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  DELETE FROM public.admin_actions
   WHERE actor_id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  -- Now safe to delete the auth.users rows.
  DELETE FROM auth.users
   WHERE id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  RETURN jsonb_build_object(
    'users_removed',                v_user_count,
    'positions_removed',            v_pos_count,
    'market_transactions_removed',  v_tx_count,
    'balance_ledger_rows_removed',  v_led_count,
    'admin_actions_removed',        v_audit_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_wipe_simulated() TO authenticated, service_role;

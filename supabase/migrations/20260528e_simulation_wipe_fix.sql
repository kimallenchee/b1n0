-- ============================================================
-- Simulation wipe: handle market_transactions FK manually
-- ============================================================
--
-- admin_wipe_simulated() failed with:
--   ERROR: update or delete on table "users" violates foreign key
--   constraint "market_transactions_user_id_fkey" on table
--   "market_transactions"
--
-- The FK from market_transactions.user_id → auth.users(id) is not
-- ON DELETE CASCADE, so deleting the auth.users row blocks. Add
-- explicit deletes for every dependent table BEFORE deleting auth.users.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_wipe_simulated()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_user_count integer;
  v_pos_count  integer;
  v_tx_count   integer;
  v_led_count  integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Count for reporting before deletion
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

  -- Explicit deletes in dependency order. The CASCADE chain (auth.users
  -- → profiles → positions / balance_ledger) covers most of it, but
  -- market_transactions has a direct FK to auth.users(id) without
  -- CASCADE, so we delete it manually first.
  DELETE FROM public.market_transactions
   WHERE user_id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  -- predictions table (if it has positions referenced by sim users)
  -- also nuked manually as defense — same FK pattern in some installs.
  DELETE FROM public.predictions
   WHERE user_id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  -- Now safe to delete the auth.users rows. profiles + positions +
  -- balance_ledger cascade from this delete.
  DELETE FROM auth.users
   WHERE id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  RETURN jsonb_build_object(
    'users_removed',                v_user_count,
    'positions_removed',            v_pos_count,
    'market_transactions_removed',  v_tx_count,
    'balance_ledger_rows_removed',  v_led_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_wipe_simulated() TO authenticated, service_role;

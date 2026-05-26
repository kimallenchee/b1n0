-- ============================================================
-- Simulation helpers — math-validation harness for b1n0
-- ============================================================
--
-- This migration adds the scaffolding to run an internal simulation
-- of the platform (mock users, mock purchases, mock sells, settle,
-- invariants check) WITHOUT touching real users or real money.
--
-- Key design choices:
--   - Simulated users live in the SAME tables as real users, gated
--     by a single `is_simulated` boolean flag on profiles.
--   - All simulation actions go through admin-only RPCs that
--     internally call the REAL execute_purchase / execute_sell /
--     settle_event functions. We are testing the actual code path,
--     not a parallel re-implementation of it.
--   - admin_wipe_simulated() cleans up everything in one call. The
--     FK cascade does the heavy lifting (positions, ledger, etc.).
--
-- All RPCs are SECURITY DEFINER and guarded by is_admin(auth.uid()),
-- consistent with the rest of the admin RPC suite.
-- ============================================================

-- ── 1. is_simulated flag on profiles ────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_simulated_idx
  ON public.profiles (is_simulated)
  WHERE is_simulated = true;

COMMENT ON COLUMN public.profiles.is_simulated IS
  'true for accounts created by scripts/simulate-platform.mjs. Wipe-able via admin_wipe_simulated().';

-- ── 2. admin_spawn_simulated_user ───────────────────────────
-- Creates a fake auth.users row + profile row, marks is_simulated=true,
-- and credits an initial balance via the normal balance_ledger flow
-- (so the deposit shows up in invariants accounting).
CREATE OR REPLACE FUNCTION public.admin_spawn_simulated_user(
  p_username         text,
  p_starting_balance numeric DEFAULT 100,
  p_tier             smallint DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_email   text;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Fake email keeps auth.users happy + makes simulated users easy to
  -- spot in the auth dashboard (all end in @sim.b1n0.test, never deliverable).
  v_email := lower(p_username) || '+' || substr(v_user_id::text, 1, 8) || '@sim.b1n0.test';

  -- Insert into auth.users directly. We are not going through Supabase
  -- Auth signup because we don't need email confirmation or a real password.
  -- encrypted_password is a dummy bcrypt hash of '!simulated!' — these
  -- accounts can never log in.
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    '$2a$10$simulated.simulated.simulated.simulated.simulated.simu',
    now(),
    jsonb_build_object('name', p_username, 'simulated', true),
    jsonb_build_object('simulated', true),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  -- handle_new_user trigger should fire and create the profile row.
  -- We then patch it with the simulated flag + correct balance + tier.
  -- Some installations don't have that trigger; insert defensively.
  INSERT INTO public.profiles (id, name, balance, tier, is_simulated)
  VALUES (v_user_id, p_username, 0, COALESCE(p_tier, 1), true)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        tier = EXCLUDED.tier,
        is_simulated = true;

  -- Credit the starting balance via the normal balance_ledger flow so
  -- the deposit appears in the same accounting bucket as real deposits.
  IF p_starting_balance > 0 THEN
    UPDATE public.profiles
       SET balance = balance + p_starting_balance
     WHERE id = v_user_id;

    INSERT INTO public.balance_ledger
      (user_id, type, amount, balance_after, label, reference_id)
    VALUES
      (v_user_id, 'deposit', p_starting_balance, p_starting_balance,
       'Simulation seed deposit', 'sim:spawn');
  END IF;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_spawn_simulated_user(text, numeric, smallint)
  TO authenticated, service_role;

-- ── 3. admin_simulate_purchase ──────────────────────────────
-- Wraps the real execute_purchase. The guard ensures only admins (or
-- service-role calls with no auth.uid()) can drive simulated purchases.
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

  -- Hard guard: only simulated users may be driven through this path.
  -- Stops accidentally using this RPC to manipulate real accounts.
  SELECT is_simulated INTO v_is_sim
    FROM public.profiles WHERE id = p_user_id;
  IF v_is_sim IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_simulate_purchase refuses non-simulated user %', p_user_id;
  END IF;

  v_result := public.execute_purchase(p_event_id, p_user_id, p_side, p_amount);
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_simulate_purchase(uuid, text, text, numeric)
  TO authenticated, service_role;

-- ── 4. admin_simulate_sell ──────────────────────────────────
-- Looks up the user_id from the position and routes to execute_sell.
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

  v_result := public.execute_sell(p_position_id, v_user_id);
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_simulate_sell(uuid)
  TO authenticated, service_role;

-- ── 5. admin_wipe_simulated ─────────────────────────────────
-- Nukes every simulated user and (via CASCADE FKs) their positions,
-- ledger entries, market_transactions, comments, and notifications.
-- Returns a count of what was removed for the runbook output.
CREATE OR REPLACE FUNCTION public.admin_wipe_simulated()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_user_count integer;
  v_pos_count  integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT COUNT(*) INTO v_user_count
    FROM public.profiles WHERE is_simulated = true;

  SELECT COUNT(*) INTO v_pos_count
    FROM public.positions p
    JOIN public.profiles pr ON pr.id = p.user_id
   WHERE pr.is_simulated = true;

  -- profiles.id has ON DELETE CASCADE from auth.users(id), so deleting
  -- the auth.users row removes the profile, which CASCADEs to positions,
  -- balance_ledger, market_transactions, comments, notifications.
  DELETE FROM auth.users
   WHERE id IN (SELECT id FROM public.profiles WHERE is_simulated = true);

  RETURN jsonb_build_object(
    'users_removed',    v_user_count,
    'positions_removed', v_pos_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_wipe_simulated() TO authenticated, service_role;

-- ============================================================
-- End of simulation helpers
-- ============================================================

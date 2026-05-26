-- ============================================================
-- Simulation: grant is_admin to simulated users
-- ============================================================
--
-- execute_purchase calls PERFORM public.sweep_to_treasury() near
-- the end. The hardening migration (20260427) wrapped sweep_to_treasury
-- with an is_admin(auth.uid()) check. When we impersonate a non-admin
-- simulated user inside admin_simulate_purchase, the sweep fails with
-- 'unauthorized: admin access required' and the whole purchase aborts.
--
-- Simulated users have one job: exercise the RPC chain to validate the
-- math. They are NEVER real users, NEVER log in, and live only behind
-- the is_simulated=true flag. Granting them is_admin lets the call
-- chain complete without breaking any real-user code path.
--
-- The admin_simulate_purchase / admin_simulate_sell wrappers already
-- refuse any user without is_simulated=true, so this can't accidentally
-- escalate a real user.
-- ============================================================

-- 1. Backfill: existing simulated users get is_admin=true.
UPDATE public.profiles
   SET is_admin = true
 WHERE is_simulated = true;

-- 2. Patch admin_spawn_simulated_user so future spawns get admin flag too.
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

  v_email := lower(p_username) || '+' || substr(v_user_id::text, 1, 8) || '@sim.b1n0.test';

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
    jsonb_build_object('simulated', true, 'is_admin', true),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  -- Insert profile with is_admin=true so the chain through
  -- sweep_to_treasury() inside execute_purchase passes.
  INSERT INTO public.profiles (id, name, balance, tier, is_simulated, is_admin)
  VALUES (v_user_id, p_username, 0, COALESCE(p_tier, 1), true, true)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        tier = EXCLUDED.tier,
        is_simulated = true,
        is_admin = true;

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

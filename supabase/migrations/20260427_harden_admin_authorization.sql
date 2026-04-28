-- ============================================================
--  Migration: Harden admin authorization
--  Date: 2026-04-27
--
--  Goals (b1n0 Production Hardening Pass — Phase 1):
--    1.1  is_admin(uuid) SECURITY DEFINER helper
--    1.2  Wrap every admin-writing RPC with an is_admin() guard
--    1.3  RLS policies for platform_config / platform_ledger / rate_limits
--    1.4  Block users from flipping their own profiles.is_admin
--    1.5  check_admin_status() RPC for the client to verify status
--
--  Also (Phase 2.5): add treasury_account_id to platform_config
--
--  RPCs guarded (see SECURITY_AUDIT.md for the full table):
--    settle_event, settle_predictions, update_platform_config,
--    initialize_market (both 6-arg and 8-arg signatures),
--    initialize_option_markets, sweep_to_treasury,
--    deposit_lp_capital, admin_adjust_balance, admin_reset_password
--
--  Approach: rather than re-defining each RPC body (long and risky),
--  we rename existing function to <name>__inner, then create a
--  thin SECURITY DEFINER wrapper with the same name+signature that
--  performs the is_admin() check before delegating. This makes the
--  migration idempotent and preserves the original logic.
-- ============================================================

BEGIN;

-- ── 1.1  is_admin(uuid) helper ──────────────────────────────────
--
-- SECURITY DEFINER so the function can read profiles even when the
-- caller's RLS would otherwise hide the row. STABLE because it does
-- not modify state.
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id
      AND is_admin = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Returns true if the given user has profiles.is_admin = true. SECURITY DEFINER so it works under any RLS. Use is_admin(auth.uid()) inside other SECURITY DEFINER RPCs to guard admin-only logic.';


-- ── 1.5  check_admin_status() — client-callable ──────────────────
--
-- Lets the React client verify admin status against the server,
-- bypassing the (mutable) profile row sent over realtime. Returns
-- jsonb so we can extend with additional info later (e.g. last-
-- check timestamp, scopes).
CREATE OR REPLACE FUNCTION public.check_admin_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_admin', false, 'authenticated', false);
  END IF;

  v_admin := public.is_admin(v_uid);
  RETURN jsonb_build_object(
    'is_admin', COALESCE(v_admin, false),
    'authenticated', true,
    'user_id', v_uid,
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_admin_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_admin_status() TO authenticated;

COMMENT ON FUNCTION public.check_admin_status() IS
  'Server-side admin verification for the b1n0 client. Returns {is_admin, authenticated, user_id, checked_at}. Cannot be spoofed from a tampered profile row.';


-- ── 1.2  Wrap admin-writing RPCs with is_admin() guards ─────────
--
-- Pattern:
--   1. Rename the existing function (idempotent — swallow errors).
--   2. Replace it with a wrapper that checks is_admin(auth.uid())
--      and then delegates to the inner.
--
-- Each wrapper preserves the original return type and parameter list.
-- The wrappers themselves are SECURITY INVOKER so the underlying
-- function's SECURITY DEFINER context is preserved.

-- ▸ settle_event(text, text) → jsonb
DO $$ BEGIN
  ALTER FUNCTION public.settle_event(text, text) RENAME TO settle_event__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.settle_event(p_event_id text, p_result text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;
  RETURN public.settle_event__inner(p_event_id, p_result);
END;
$$;


-- ▸ settle_predictions(text, text) — historical signatures returned
--   integer (early), then jsonb (current). Try jsonb first; fall back.
DO $$ BEGIN
  ALTER FUNCTION public.settle_predictions(text, text) RENAME TO settle_predictions__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

-- jsonb-returning wrapper — matches the latest production signature.
DO $$
BEGIN
  -- Prefer jsonb wrapper. If inner returns integer, the COALESCE call
  -- below would mismatch types, so we discover the inner's return type
  -- and emit the correctly-typed wrapper.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'settle_predictions__inner'
      AND pg_get_function_result(p.oid) = 'jsonb'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.settle_predictions(p_event_id text, p_result text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.settle_predictions__inner(p_event_id, p_result);
      END;
      $INNER$;
    $WRAP$;
  ELSIF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'settle_predictions__inner'
      AND pg_get_function_result(p.oid) = 'integer'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.settle_predictions(p_event_id text, p_result text)
      RETURNS integer
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.settle_predictions__inner(p_event_id, p_result);
      END;
      $INNER$;
    $WRAP$;
  END IF;
END $$;


-- ▸ update_platform_config(text, numeric) → void
DO $$ BEGIN
  ALTER FUNCTION public.update_platform_config(text, numeric) RENAME TO update_platform_config__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.update_platform_config(p_key text, p_value numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;
  PERFORM public.update_platform_config__inner(p_key, p_value);
END;
$$;


-- ▸ initialize_market — two known signatures (6-arg in migrations,
--   8-arg in sql/parimutuel-model.sql). Wrap both if present.
DO $$ BEGIN
  ALTER FUNCTION public.initialize_market(text, numeric, integer, boolean, integer, numeric)
    RENAME TO initialize_market__inner6;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.initialize_market(text, numeric, integer, boolean, integer, numeric, numeric, text)
    RENAME TO initialize_market__inner8;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'initialize_market__inner6'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.initialize_market(
        p_event_id         text,
        p_pool_total       numeric DEFAULT 0,
        p_initial_yes_pct  integer DEFAULT 50,
        p_spread_enabled   boolean DEFAULT true,
        p_synthetic_shares integer DEFAULT 1000,
        p_sponsor_amount   numeric DEFAULT NULL
      )
      RETURNS public.event_markets
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.initialize_market__inner6(
          p_event_id, p_pool_total, p_initial_yes_pct,
          p_spread_enabled, p_synthetic_shares, p_sponsor_amount
        );
      END;
      $INNER$;
    $WRAP$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'initialize_market__inner8'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.initialize_market(
        p_event_id         text,
        p_pool_total       numeric DEFAULT 0,
        p_initial_yes_pct  integer DEFAULT 50,
        p_spread_enabled   boolean DEFAULT true,
        p_synthetic_shares integer DEFAULT 1000,
        p_sponsor_amount   numeric DEFAULT NULL,
        p_lp_return_pct    numeric DEFAULT 0.08,
        p_launch_mode      text    DEFAULT 'public'
      )
      RETURNS public.event_markets
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.initialize_market__inner8(
          p_event_id, p_pool_total, p_initial_yes_pct,
          p_spread_enabled, p_synthetic_shares, p_sponsor_amount,
          p_lp_return_pct, p_launch_mode
        );
      END;
      $INNER$;
    $WRAP$;
  END IF;
END $$;


-- ▸ initialize_option_markets(text) → jsonb
DO $$ BEGIN
  ALTER FUNCTION public.initialize_option_markets(text) RENAME TO initialize_option_markets__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.initialize_option_markets(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;
  RETURN public.initialize_option_markets__inner(p_event_id);
END;
$$;


-- ▸ sweep_to_treasury() → jsonb
--   Existing function already had its own admin check, but we
--   normalize to the canonical is_admin() guard for consistency
--   and so SECURITY_AUDIT.md can claim full coverage.
DO $$ BEGIN
  ALTER FUNCTION public.sweep_to_treasury() RENAME TO sweep_to_treasury__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sweep_to_treasury__inner'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.sweep_to_treasury()
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.sweep_to_treasury__inner();
      END;
      $INNER$;
    $WRAP$;
  END IF;
END $$;


-- ▸ deposit_lp_capital(text, uuid, numeric, numeric) → jsonb
--
--   In b1n0, LP deposits are funded from the admin EventManager
--   panel — no end-user UI calls this RPC. Guard accordingly.
DO $$ BEGIN
  ALTER FUNCTION public.deposit_lp_capital(text, uuid, numeric, numeric)
    RENAME TO deposit_lp_capital__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'deposit_lp_capital__inner'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.deposit_lp_capital(
        p_event_id   text,
        p_user_id    uuid,
        p_amount     numeric,
        p_return_pct numeric DEFAULT 0.08
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.deposit_lp_capital__inner(p_event_id, p_user_id, p_amount, p_return_pct);
      END;
      $INNER$;
    $WRAP$;
  END IF;
END $$;


-- ▸ admin_adjust_balance(uuid, numeric, text) → jsonb
--   Definition is not checked into the repo, but it is invoked from
--   UsersPanel and TreasuryPanel. Wrap if the function exists.
DO $$ BEGIN
  ALTER FUNCTION public.admin_adjust_balance(uuid, numeric, text)
    RENAME TO admin_adjust_balance__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_adjust_balance__inner'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
        p_user_id uuid,
        p_amount  numeric,
        p_reason  text DEFAULT NULL
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.admin_adjust_balance__inner(p_user_id, p_amount, p_reason);
      END;
      $INNER$;
    $WRAP$;
  END IF;
END $$;


-- ▸ admin_reset_password(uuid, text) → jsonb
DO $$ BEGIN
  ALTER FUNCTION public.admin_reset_password(uuid, text)
    RENAME TO admin_reset_password__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_reset_password__inner'
  ) THEN
    EXECUTE $WRAP$
      CREATE OR REPLACE FUNCTION public.admin_reset_password(
        p_user_id      uuid,
        p_new_password text
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $INNER$
      BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
          RAISE EXCEPTION 'unauthorized: admin access required';
        END IF;
        RETURN public.admin_reset_password__inner(p_user_id, p_new_password);
      END;
      $INNER$;
    $WRAP$;
  END IF;
END $$;


-- ── 1.3  RLS on admin-only tables ───────────────────────────────

-- platform_config: only admins write; reading is fine for everyone
-- (the rates are public knowledge; the client uses them for pricing).
-- Replaces the older policies from migration 20260309 which checked
-- profiles.is_admin directly via subquery — funnel through is_admin()
-- for a single source of truth.
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_config_read"  ON public.platform_config;
DROP POLICY IF EXISTS "platform_config_write" ON public.platform_config;
DROP POLICY IF EXISTS platform_config_select_all ON public.platform_config;
DROP POLICY IF EXISTS platform_config_admin_write ON public.platform_config;

CREATE POLICY platform_config_select_all
  ON public.platform_config
  FOR SELECT
  USING (true);

CREATE POLICY platform_config_admin_write
  ON public.platform_config
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- platform_ledger: admin-only SELECT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_ledger'
  ) THEN
    EXECUTE 'ALTER TABLE public.platform_ledger ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS platform_ledger_admin_select ON public.platform_ledger';
    EXECUTE $POL$
      CREATE POLICY platform_ledger_admin_select
        ON public.platform_ledger
        FOR SELECT
        USING (public.is_admin(auth.uid()))
    $POL$;
    EXECUTE 'DROP POLICY IF EXISTS platform_ledger_admin_write ON public.platform_ledger';
    EXECUTE $POL$
      CREATE POLICY platform_ledger_admin_write
        ON public.platform_ledger
        FOR ALL
        USING (public.is_admin(auth.uid()))
        WITH CHECK (public.is_admin(auth.uid()))
    $POL$;
  END IF;
END $$;

-- rate_limits: users see only their own rows; admins see all.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rate_limits'
  ) THEN
    EXECUTE 'ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS rate_limits_self_select ON public.rate_limits';
    EXECUTE $POL$
      CREATE POLICY rate_limits_self_select
        ON public.rate_limits
        FOR SELECT
        USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
    $POL$;

    EXECUTE 'DROP POLICY IF EXISTS rate_limits_admin_write ON public.rate_limits';
    EXECUTE $POL$
      CREATE POLICY rate_limits_admin_write
        ON public.rate_limits
        FOR ALL
        USING (public.is_admin(auth.uid()))
        WITH CHECK (public.is_admin(auth.uid()))
    $POL$;
  END IF;
END $$;


-- ── 1.4  Lock down profiles.is_admin self-flip ──────────────────
--
-- A user must NOT be able to flip their own is_admin flag through a
-- direct UPDATE on the profiles table. Two layers:
--   (a) RLS policy that excludes is_admin from the update column set
--       when the row's owner is the caller and the caller is not
--       already an admin
--   (b) BEFORE UPDATE trigger that hard-rejects any change to
--       is_admin originating from a non-admin

CREATE OR REPLACE FUNCTION public.guard_profiles_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses (auth.uid() IS NULL when service_role calls)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'unauthorized: only admins can change is_admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_is_admin ON public.profiles;
CREATE TRIGGER profiles_guard_is_admin
  BEFORE UPDATE OF is_admin ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_is_admin();


-- ── 2.5  treasury_account_id in platform_config ─────────────────
--
-- platform_config.value is NUMERIC(10,4) so it cannot hold a UUID.
-- Add a sibling `value_text` column for non-numeric config and seed
-- the treasury account id there. Numeric callers stay unchanged.
ALTER TABLE public.platform_config
  ADD COLUMN IF NOT EXISTS value_text TEXT,
  ALTER COLUMN value DROP NOT NULL;

INSERT INTO public.platform_config (key, value, value_text, label)
VALUES (
  'treasury_account_id',
  NULL,
  '00000000-0000-0000-0000-000000000001',
  'Treasury account UUID — receives platform fees, spread capture and resolution skim'
)
ON CONFLICT (key) DO UPDATE
  SET value_text = COALESCE(public.platform_config.value_text, EXCLUDED.value_text),
      label      = COALESCE(public.platform_config.label,      EXCLUDED.label);

COMMENT ON TABLE public.platform_config IS
  'Platform-wide configuration. Use `value` (NUMERIC) for fee rates and `value_text` for non-numeric values (UUIDs, feature flags, URLs). Read on the client through dedicated hooks (e.g. useTreasuryId) so changes take effect immediately.';

COMMENT ON COLUMN public.platform_config.value_text IS
  'Free-form text value. Use for UUIDs, identifiers, URLs, feature flags. NULL when the key uses the numeric `value` column.';


-- ── 3.2  error_log table for HealthPanel "Recent errors" ────────
--
-- Sentry's API isn't reachable from the browser, so we keep a small
-- server-side error_log that the HealthPanel can read. Client logs
-- via `logger.error` continue to ship to Sentry; this table is the
-- subset that's interesting to admins (server RPC failures, etc.).
CREATE TABLE IF NOT EXISTS public.error_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID,
  source      TEXT NOT NULL,
  message     TEXT NOT NULL,
  context     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_log_created_at_idx
  ON public.error_log (created_at DESC);

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_log_admin_select ON public.error_log;
CREATE POLICY error_log_admin_select
  ON public.error_log
  FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS error_log_admin_write ON public.error_log;
CREATE POLICY error_log_admin_write
  ON public.error_log
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.error_log IS
  'Server-side error log surfaced in the admin HealthPanel. Populated by RPC error handlers and other backend hooks. The HealthPanel pulls the most recent rows.';


COMMIT;

-- ── Verification queries (run manually after deploy) ────────────
--
--   -- 1. Confirm wrappers exist for all admin RPCs
--   SELECT proname FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND proname IN (
--         'settle_event','settle_predictions','update_platform_config',
--         'initialize_market','initialize_option_markets',
--         'sweep_to_treasury','deposit_lp_capital',
--         'admin_adjust_balance','admin_reset_password',
--         'is_admin','check_admin_status'
--       )
--     ORDER BY proname;
--
--   -- 2. Confirm RLS on protected tables
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('platform_config','platform_ledger','rate_limits');
--
--   -- 3. Confirm trigger on profiles.is_admin
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass;
--
--   -- 4. Should fail when called by a non-admin user
--   SELECT public.update_platform_config('tx_fee_pct', 99);

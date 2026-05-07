-- ============================================================
--  Migration: admin claim → auth.users.raw_app_meta_data
--  Date: 2026-05-07
--
--  Why:
--    Today admin status lives in `profiles.is_admin`, which is
--    readable by any authenticated user via RLS (each user can
--    SELECT their own profile row). That means a curious user can
--    open devtools, query their profile, and read the entire admin
--    surface from the JS bundle even though every admin RPC is
--    server-guarded. The leak is cosmetic — no buttons actually
--    work for non-admins — but it advertises the admin code path
--    and the schema column to anyone who looks.
--
--    Supabase's intended location for server-controlled identity
--    claims is `auth.users.raw_app_meta_data`. That column is
--    writable only by service-role, automatically embedded into
--    every JWT the client receives, and tamper-proof end-to-end
--    because the JWT is signed by Supabase. Reading from it on
--    the client is a synchronous JWT decode, no RPC needed.
--
--  What this migration does:
--    1. One-time backfill — copies profiles.is_admin into the
--       corresponding auth.users.raw_app_meta_data.is_admin
--       claim for every user. Idempotent; safe to re-run.
--
--    2. Trigger — keeps the two in sync. When an admin toggles
--       is_admin via the UsersPanel (which writes to profiles.is_admin),
--       the trigger propagates that change into raw_app_meta_data
--       so the user's next-issued JWT has the fresh claim.
--
--    3. is_admin(uuid) function rewritten — checks
--       raw_app_meta_data first (the new authoritative source),
--       falls back to profiles.is_admin during the transition.
--       Once you trust the JWT path, the fallback can be removed
--       in a follow-up migration.
--
--    4. check_admin_status() RPC kept as-is for back-compat. The
--       client may still call it for defense-in-depth but no longer
--       needs to — JWT app_metadata is sufficient.
--
--  Caveats:
--    - Existing user sessions hold JWTs with the OLD claims until
--      they expire (default ~1 hour). Users who become admins via
--      the UsersPanel won't see admin UI until next refresh / login.
--      That's actually a feature: it bounds how long a stale claim
--      can persist if you ever revoke admin.
--    - This migration writes to auth.users which requires service-
--      role privilege. It runs fine inside the Supabase SQL editor
--      because that runs as service role.
--
--  Idempotency: ON CONFLICT-style upserts via UPDATE … WHERE,
--  CREATE OR REPLACE for the function/trigger, DROP TRIGGER IF
--  EXISTS to allow re-run. Safe.
--
--  Rollback: drop the trigger; restore is_admin() body from
--  20260427_harden_admin_authorization.sql; profiles.is_admin
--  remains the source of truth.
-- ============================================================

BEGIN;

-- ── 1. Backfill: profiles.is_admin → auth.users.raw_app_meta_data.is_admin

UPDATE auth.users u
SET raw_app_meta_data =
  COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('is_admin', COALESCE(p.is_admin, false))
FROM public.profiles p
WHERE u.id = p.id
  AND (
    -- Only update if the claim differs (idempotent on re-run)
    (u.raw_app_meta_data->>'is_admin') IS DISTINCT FROM
    (COALESCE(p.is_admin, false))::text
  );


-- ── 2. Sync trigger: profiles.is_admin → auth.users.raw_app_meta_data

CREATE OR REPLACE FUNCTION public.sync_admin_to_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  -- Only fire when is_admin actually changes (or on insert).
  IF (TG_OP = 'INSERT')
    OR (TG_OP = 'UPDATE' AND OLD.is_admin IS DISTINCT FROM NEW.is_admin)
  THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('is_admin', COALESCE(NEW.is_admin, false))
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_admin_to_app_metadata ON public.profiles;

CREATE TRIGGER profiles_sync_admin_to_app_metadata
AFTER INSERT OR UPDATE OF is_admin ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_admin_to_app_metadata();


-- ── 3. is_admin(uuid) — prefer auth.users.raw_app_meta_data

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_meta_admin boolean;
BEGIN
  IF user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Primary source: server-controlled JWT claim.
  SELECT (raw_app_meta_data->>'is_admin')::boolean
    INTO v_meta_admin
    FROM auth.users
    WHERE id = user_id;

  IF v_meta_admin = true THEN
    RETURN true;
  END IF;

  -- Transitional fallback: profiles.is_admin. Remove this branch
  -- once you've confirmed every active admin has the app_metadata
  -- claim populated (i.e. once the trigger has run for every UI
  -- toggle and every account has been touched at least once).
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND is_admin = true
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Returns true if the user is an admin. Prefers auth.users.raw_app_meta_data.is_admin (server-controlled, JWT-embedded), falls back to profiles.is_admin during transition. SECURITY DEFINER + STABLE.';


COMMIT;

-- ============================================================
--  Verification (run after applying):
--
--    -- 1. Backfill landed for every admin
--    SELECT u.email, u.raw_app_meta_data->>'is_admin' AS app_meta_admin,
--           p.is_admin AS profile_admin
--    FROM auth.users u
--    JOIN public.profiles p ON p.id = u.id
--    WHERE p.is_admin = true OR u.raw_app_meta_data->>'is_admin' = 'true'
--    ORDER BY p.is_admin DESC;
--    -- Expect: every admin has BOTH columns true.
--
--    -- 2. Trigger fires on UPDATE — flip a test user, check both
--    --    columns updated. Then flip back.
--    -- (run from service role context)
--    UPDATE profiles SET is_admin = true WHERE username = 'YOUR_TEST_USER';
--    SELECT raw_app_meta_data->>'is_admin'
--    FROM auth.users
--    WHERE id = (SELECT id FROM profiles WHERE username = 'YOUR_TEST_USER');
--    -- Expect: 'true'
--    UPDATE profiles SET is_admin = false WHERE username = 'YOUR_TEST_USER';
--
--    -- 3. is_admin() reads from app_metadata correctly
--    SELECT is_admin(id), raw_app_meta_data->>'is_admin'
--    FROM auth.users LIMIT 5;
-- ============================================================

-- ============================================================
--  Migration: get_public_profile() — anon-readable profile lookup
--  Date: 2026-05-17
--
--  PROBLEM
--    The profiles table has RLS that only allows authenticated
--    users to SELECT. So /u/:username breaks for logged-out viewers
--    — they get "Usuario no encontrado" even though the profile
--    exists. That kills shareable profile URLs as a discovery
--    channel (Twitter, WhatsApp, etc.).
--
--  SOLUTION
--    A SECURITY DEFINER function that runs with the table owner's
--    permissions (bypassing RLS) but exposes ONLY the public-safe
--    columns. Email, balance, address, phone, DOB, kyc state — all
--    stay hidden. The function is granted to anon AND authenticated
--    so the calling code is identical whether the viewer is logged
--    in or not.
--
--    The ProfilePublic component still respects privacy_prefs at
--    render time (it owns the show_/hide_ logic). This function
--    just makes the row reachable.
--
--  Why a function (not a view):
--    Postgres views default to SECURITY INVOKER, meaning they use
--    the caller's permissions — RLS on the base table still blocks
--    anon. SECURITY DEFINER functions bypass RLS using the function
--    owner's perms. Cleanest pattern for "expose some columns to
--    anon" without weakening the base table.
-- ============================================================

BEGIN;

-- Drop any old version first so the signature can evolve without
-- conflict in re-runs.
DROP FUNCTION IF EXISTS public.get_public_profile(text);

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  id           uuid,
  name         text,
  username     text,
  tier         smallint,
  avatar_url   text,
  created_at   timestamptz,
  privacy_prefs jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.username,
    p.tier,
    p.avatar_url,
    p.created_at,
    COALESCE(p.privacy_prefs, '{}'::jsonb) AS privacy_prefs
  FROM public.profiles AS p
  WHERE p.username ILIKE p_username
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_public_profile(text) IS
  'Anon-readable public profile lookup. Returns only the columns safe to expose on /u/:username. Email, balance, address, phone, DOB, KYC state stay hidden because they are not in the column list. Privacy_prefs is returned so the client can render the right fields per the target user''s settings.';

-- Allow both anon (logged-out) and authenticated callers.
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  Verification:
--    -- Anon role test (in SQL Editor, set role to simulate anon):
--    SET ROLE anon;
--    SELECT * FROM public.get_public_profile('kim');
--    RESET ROLE;
--    -- Expect: one row with public-safe columns. No email/balance.
-- ============================================================

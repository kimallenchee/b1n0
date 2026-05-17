-- ============================================================
--  Migration: get_public_user_comments() — anon-readable comments
--  Date: 2026-05-17
--
--  WHY
--    The comments table RLS doesn't allow anon SELECT, so the
--    public profile's activity feed was missing comments for
--    logged-out viewers. Llamados (positions) happen to work
--    because positions RLS is more permissive; comments needs
--    its own anon-readable gate.
--
--    Same SECURITY DEFINER pattern as get_public_profile(text):
--    function exposes ONLY the safe fields and is granted to
--    anon + authenticated.
--
--  PRIVACY ENFORCEMENT
--    The function respects the target user's privacy_prefs.show_activity_comments:
--    - If the viewer is the profile owner (auth.uid() = p_user_id),
--      always return the comments (so owners can see what's there
--      regardless of their own toggle).
--    - If the viewer is anyone else AND show_activity_comments
--      is false, return nothing.
--
--    Server-side enforcement matters because we can't trust the
--    client to honor the toggle when the API is reachable by curl.
--
--  Why plpgsql (not sql):
--    Conditional branching (owner vs not) is cleaner in plpgsql.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_public_user_comments(uuid);

CREATE OR REPLACE FUNCTION public.get_public_user_comments(p_user_id uuid)
RETURNS TABLE (
  id             uuid,
  event_id       text,
  event_question text,
  text           text,
  created_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_show boolean;
BEGIN
  -- Owner viewing own profile: always return, regardless of privacy.
  IF auth.uid() = p_user_id THEN
    RETURN QUERY
      SELECT c.id, c.event_id, e.question AS event_question, c.text, c.created_at
      FROM public.comments c
      LEFT JOIN public.events e ON e.id = c.event_id
      WHERE c.user_id = p_user_id
      ORDER BY c.created_at DESC
      LIMIT 10;
    RETURN;
  END IF;

  -- Anyone else: respect the privacy toggle.
  -- NOTE: alias the table and fully qualify the column.
  -- The RETURNS TABLE clause declares an OUT parameter named `id`, which
  -- shadows unqualified `id` references inside the function body. Hitting
  -- this on the anon path threw 42702 ("column reference 'id' is ambiguous")
  -- — the owner branch returned before this query ran, so the issue only
  -- surfaced for logged-out viewers.
  SELECT COALESCE((p.privacy_prefs ->> 'show_activity_comments')::boolean, true)
  INTO v_show
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_show IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT c.id, c.event_id, e.question AS event_question, c.text, c.created_at
    FROM public.comments c
    LEFT JOIN public.events e ON e.id = c.event_id
    WHERE c.user_id = p_user_id
    ORDER BY c.created_at DESC
    LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.get_public_user_comments(uuid) IS
  'Anon + authenticated readable comment list for the public profile activity feed. Owner sees all their own comments; others see comments only if privacy_prefs.show_activity_comments is true. JOINs events for the question so the client can render a one-line event title without a second roundtrip.';

GRANT EXECUTE ON FUNCTION public.get_public_user_comments(uuid) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  Verification (run as anon to confirm anon can read):
--    SET ROLE anon;
--    SELECT * FROM public.get_public_user_comments(
--      (SELECT id FROM auth.users WHERE email = 'kimallenchee@gmail.com')
--    );
--    RESET ROLE;
-- ============================================================

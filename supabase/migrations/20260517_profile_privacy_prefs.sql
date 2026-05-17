-- ============================================================
--  Migration: profiles.privacy_prefs JSONB column
--  Date: 2026-05-17
--
--  WHAT THIS DOES
--    Adds a per-user JSONB column that controls what's visible on
--    the public profile page (/u/:username). All fields default to
--    public — users can opt OUT of any specific field via the
--    Privacidad section under Perfil → Configuración.
--
--  SHAPE OF privacy_prefs (all keys default true when missing):
--    {
--      "show_tier":               true,
--      "show_total_cobrado":      true,
--      "show_accuracy_rate":      true,
--      "show_total_predictions":  true,
--      "show_full_name":          true,
--      "show_join_date":          true,
--      "show_avatar":              true
--    }
--
--  Why JSONB (not separate columns):
--    - Adding a new privacy toggle in the future doesn't require a
--      migration — just write a new key.
--    - Mirrors the notification_prefs pattern we already have, so
--      operators have a consistent mental model.
--    - Selecting all prefs in one read is cheap (no joins, no
--      column gymnastics).
-- ============================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.privacy_prefs IS
  'Per-user privacy toggles for the public profile page. JSONB so adding new toggles never requires a migration. Missing keys default to true (public). See src/pages/ProfilePublic.tsx for the consumer.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  Verification:
--    SELECT id, name, privacy_prefs FROM profiles LIMIT 3;
--    -- Expect: privacy_prefs is '{}'::jsonb for all rows (default)
--
--    -- Smoke: write one toggle for a user
--    UPDATE profiles
--    SET privacy_prefs = jsonb_set(privacy_prefs, '{show_total_cobrado}', 'false')
--    WHERE username = 'kimchee';
--    SELECT privacy_prefs FROM profiles WHERE username = 'kimchee';
--    -- Expect: {"show_total_cobrado": false}
-- ============================================================

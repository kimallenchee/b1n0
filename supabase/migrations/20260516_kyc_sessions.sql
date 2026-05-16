-- ============================================================
--  Migration: KYC sessions table (Didit integration)
--  Date: 2026-05-16
--
--  Tracks identity-verification sessions created via Didit
--  (didit.me). When a session is Approved by Didit's webhook,
--  the trigger below promotes the user's profile.tier to the
--  target tier (if higher than current).
--
--  Why a separate table:
--    - profiles.tier is the *current* effective tier, written by
--      multiple paths (admin override, KYC approval, manual edge
--      cases). The kyc_sessions table is the *audit trail* of
--      every verification attempt.
--    - Multiple sessions per user over time (re-verifications,
--      retries on rejection).
--    - The webhook needs idempotency: same session_id arriving
--      twice should not re-trigger anything.
--
--  Server-side only: this table is written by the kyc-create-
--  session and kyc-webhook edge functions running with service
--  role. The client reads its own rows via RLS.
-- ============================================================

BEGIN;

-- ── 1. The table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_tier     int  NOT NULL CHECK (target_tier IN (2, 3)),
  provider        text NOT NULL DEFAULT 'didit',
  provider_session_id  text NOT NULL,
  verification_url     text,
  status          text NOT NULL DEFAULT 'Not Started'
                    CHECK (status IN ('Not Started','In Progress','In Review',
                                      'Approved','Declined','Abandoned','Expired')),
  decision        jsonb,                  -- full payload from Didit webhook
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One Didit session_id is unique globally
  UNIQUE (provider, provider_session_id)
);

CREATE INDEX IF NOT EXISTS kyc_sessions_user_idx
  ON public.kyc_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kyc_sessions_status_idx
  ON public.kyc_sessions (status)
  WHERE status IN ('Not Started','In Progress','In Review');

-- ── 2. RLS — user reads own rows, admin reads all ─────────────
ALTER TABLE public.kyc_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY kyc_sessions_user_select
  ON public.kyc_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY kyc_sessions_admin_select
  ON public.kyc_sessions FOR SELECT
  USING (public.is_admin(auth.uid()));

-- No INSERT/UPDATE policies: those must come from service-role
-- (edge functions), not from the client.

-- ── 3. Trigger: promote profile.tier on Approved ─────────────
--
-- When a session's status flips to 'Approved' and target_tier
-- is higher than the user's current tier, bump it. Lower-tier
-- approvals don't downgrade.
CREATE OR REPLACE FUNCTION public.kyc_session_promote_tier()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_tier int;
BEGIN
  IF NEW.status = 'Approved'
     AND (OLD.status IS NULL OR OLD.status <> 'Approved')
  THEN
    SELECT tier INTO v_current_tier
    FROM public.profiles
    WHERE id = NEW.user_id;

    IF v_current_tier IS NULL OR NEW.target_tier > v_current_tier THEN
      UPDATE public.profiles
      SET tier = NEW.target_tier
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kyc_sessions_promote ON public.kyc_sessions;
CREATE TRIGGER kyc_sessions_promote
AFTER INSERT OR UPDATE OF status ON public.kyc_sessions
FOR EACH ROW
EXECUTE FUNCTION public.kyc_session_promote_tier();

-- ── 4. updated_at autotouch ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.kyc_session_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS kyc_sessions_touch ON public.kyc_sessions;
CREATE TRIGGER kyc_sessions_touch
BEFORE UPDATE ON public.kyc_sessions
FOR EACH ROW
EXECUTE FUNCTION public.kyc_session_touch_updated_at();

COMMIT;

-- ============================================================
--  Verification (run after applying):
--
--    -- 1. Table + policies in place
--    \d public.kyc_sessions
--    SELECT polname FROM pg_policy WHERE polrelid = 'public.kyc_sessions'::regclass;
--
--    -- 2. Trigger flips tier on Approved (test as service role)
--    INSERT INTO kyc_sessions (user_id, target_tier, provider_session_id, status)
--    VALUES ('YOUR_TEST_UUID', 2, 'test-session-1', 'Not Started');
--    UPDATE kyc_sessions SET status='Approved' WHERE provider_session_id='test-session-1';
--    SELECT tier FROM profiles WHERE id='YOUR_TEST_UUID';
--    -- Expect: 2 (or higher if already higher)
-- ============================================================

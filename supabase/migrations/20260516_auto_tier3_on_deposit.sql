-- ============================================================
--  Migration: Auto-promote to Tier 3 on cumulative deposit threshold
--  Date: 2026-05-16
--
--  POLICY (Kim's call):
--    A Nivel 2 user who has cumulatively deposited >= $1,000
--    auto-promotes to Nivel 3 (raising per-event cap from $250
--    to $1,000). This is "promote first, AML scan later" — the
--    user is NOT blocked from continuing, but the profile is
--    flagged `needs_aml_review = true` so:
--      - Perfil surfaces a passive banner asking them to
--        complete the Didit T3 flow (which runs AML/PEP)
--      - Admin UsersPanel can filter to the pending-AML queue
--      - When the Didit T3 session is Approved, the existing
--        kyc_session_promote_tier trigger clears the flag
--
--  Why deposit-based (not volume / cobro / age):
--    Deposits are the cleanest commitment signal — a user who
--    has put $1k of real money in the platform has self-selected
--    out of the bot/test-account population.
--
--  Why require tier 2 first:
--    Tier 1 users have only phone verification (no document,
--    no liveness). Skipping straight to $1k caps would mean an
--    unverified user could move four-figure sums — a clear
--    AML red flag.
--
--  Threshold is configurable via platform_config so RatesPanel
--  can tune it without a migration.
-- ============================================================

BEGIN;

-- ── 1. Config key (default $1000) ────────────────────────────
INSERT INTO public.platform_config (key, value, label)
VALUES (
  'auto_tier3_deposit_threshold',
  1000,
  'Cumulative deposit threshold ($) for auto-promotion from Tier 2 to Tier 3'
)
ON CONFLICT (key) DO NOTHING;


-- ── 2. profiles.needs_aml_review flag ────────────────────────
-- Set true when a user is auto-promoted via deposit threshold.
-- Cleared by kyc_session_promote_tier when the user completes
-- a Didit T3 verification (which runs AML/PEP screening).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS needs_aml_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.needs_aml_review IS
  'true = user was auto-promoted to Tier 3 by deposit volume and still '
  'needs to complete the Didit T3 verification flow (AML/PEP screening). '
  'Cleared automatically when kyc_sessions.status = Approved at target_tier=3.';


-- ── 3. Trigger function: check threshold on deposit ─────────
CREATE OR REPLACE FUNCTION public.auto_promote_tier3_on_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold       numeric(12,2);
  v_total_deposited numeric(12,2);
  v_current_tier    int;
  v_user_question   text;
BEGIN
  -- Only fires on deposit ledger entries. Sanity guard for any
  -- future trigger expansion.
  IF NEW.type <> 'deposit' THEN
    RETURN NEW;
  END IF;

  -- Look up the user's current tier. Bail fast if not exactly
  -- Tier 2 (we don't auto-promote from N1 because they haven't
  -- completed any identity verification, and we don't re-promote
  -- N3 users).
  SELECT tier INTO v_current_tier
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_current_tier <> 2 THEN
    RETURN NEW;
  END IF;

  -- Read the configurable threshold.
  SELECT COALESCE(value, 1000) INTO v_threshold
  FROM public.platform_config
  WHERE key = 'auto_tier3_deposit_threshold';

  -- Sum ALL successful deposits for this user.
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited
  FROM public.balance_ledger
  WHERE user_id = NEW.user_id
    AND type = 'deposit';

  IF v_total_deposited < v_threshold THEN
    RETURN NEW;
  END IF;

  -- Promote + flag for AML review.
  UPDATE public.profiles
  SET tier             = 3,
      needs_aml_review = true
  WHERE id = NEW.user_id
    AND tier = 2;  -- belt-and-suspenders: avoid clobber if a
                   -- concurrent transaction already promoted

  -- Notify the user. Reuses the notify_user helper from the
  -- notifications system; respects per-user prefs.
  PERFORM public.notify_user(
    NEW.user_id,
    'nivel_subio',
    '¡Subiste a Nivel 3!',
    'Llegaste a $' || v_threshold || ' en depósitos. Ahora podés '
      || 'participar con hasta $1,000 por evento. Solo nos falta '
      || 'una verificación rápida de seguridad — entrá a Perfil '
      || 'cuando quieras.',
    jsonb_build_object(
      'old_tier', 2,
      'new_tier', 3,
      'trigger',  'auto_deposit_threshold',
      'amount',   v_total_deposited
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_promote_tier3_on_deposit ON public.balance_ledger;
CREATE TRIGGER trg_auto_promote_tier3_on_deposit
  AFTER INSERT ON public.balance_ledger
  FOR EACH ROW
  WHEN (NEW.type = 'deposit')
  EXECUTE FUNCTION public.auto_promote_tier3_on_deposit();


-- ── 4. Extend kyc_session_promote_tier to clear AML flag ────
-- When a user completes Didit T3 (target_tier=3 Approved),
-- we promote AND clear needs_aml_review. The existing trigger
-- only handled the tier bump; this version handles both.
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

    -- Bump tier if Didit approved a higher tier than the user
    -- currently holds.
    IF v_current_tier IS NULL OR NEW.target_tier > v_current_tier THEN
      UPDATE public.profiles
      SET tier = NEW.target_tier
      WHERE id = NEW.user_id;
    END IF;

    -- If this was a T3 approval, always clear the AML review
    -- flag — even if the user was already T3 (e.g., they were
    -- auto-promoted and are now retroactively completing the
    -- Didit flow). The flag goes false regardless of whether
    -- tier actually changed.
    IF NEW.target_tier = 3 THEN
      UPDATE public.profiles
      SET needs_aml_review = false
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  Verification:
--
--    -- 1. Config key was seeded
--    SELECT key, value, label FROM platform_config
--    WHERE key = 'auto_tier3_deposit_threshold';
--
--    -- 2. Column exists
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'profiles' AND column_name = 'needs_aml_review';
--
--    -- 3. Trigger exists
--    SELECT tgname FROM pg_trigger
--    WHERE tgname = 'trg_auto_promote_tier3_on_deposit';
--
--    -- 4. Smoke test (replace with a test Tier 2 user id):
--    --    a) Verify user is Tier 2
--    --    b) Insert a deposit that puts cumulative >= 1000
--    --    c) Confirm tier flipped to 3 AND needs_aml_review = true
--    --    d) Confirm a notification row exists for the user
-- ============================================================

-- ============================================================
--  Migration: Email triggers for event resolution (win/loss/LP)
--  Date: 2026-05-16
--
--  WHAT THIS DOES
--    Adds two AFTER UPDATE triggers that fire the
--    `send-resolution-email` Edge Function via pg_net whenever:
--
--      A. A position transitions active → won/lost
--         (sends the WIN or LOSS template)
--      B. An lp_deposit transitions active → returned
--         (sends the LP_RETURN template)
--
--    Both fires are asynchronous via pg_net.http_post — failures
--    in the Edge Function do NOT roll back the underlying state
--    change. The Resend HTTP call itself is rate-limited and
--    retried by Resend, not by us.
--
--  CONFIG (platform_config keys, settable from RatesPanel later)
--    resolution_email_url    — full edge fn URL, e.g.
--      https://<ref>.supabase.co/functions/v1/send-resolution-email
--    resolution_email_token  — service_role JWT used as the
--      Authorization Bearer header. The edge fn checks that the
--      raw service_role secret is a substring of this header.
--
--    If either is NULL the trigger no-ops with a NOTICE — that
--    lets you deploy this migration before configuring Resend.
--
--  Idempotent: DROP TRIGGER IF EXISTS guards everything.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Seed the config keys (NULL until set in platform_config) ─
INSERT INTO public.platform_config (key, value_text, value, label)
VALUES
  ('resolution_email_url',   NULL, NULL,
   'Edge Function URL for resolution emails (set after deploy)'),
  ('resolution_email_token', NULL, NULL,
   'Service-role bearer token used to authenticate the trigger to the Edge Function')
ON CONFLICT (key) DO NOTHING;


-- ── Internal helper: post one resolution email payload ──────
CREATE OR REPLACE FUNCTION public._post_resolution_email(p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url   text;
  v_token text;
BEGIN
  SELECT value_text INTO v_url
  FROM public.platform_config WHERE key = 'resolution_email_url';

  SELECT value_text INTO v_token
  FROM public.platform_config WHERE key = 'resolution_email_token';

  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE NOTICE 'resolution_email_url / resolution_email_token not configured — email skipped';
    RETURN;
  END IF;

  -- Fire and forget. pg_net queues this; the http worker delivers it.
  PERFORM net.http_post(
    url     := v_url,
    body    := p_body,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    )
  );
END;
$$;


-- ── Trigger A: position resolved (won/lost) ─────────────────
CREATE OR REPLACE FUNCTION public.email_on_position_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question text;
  v_payload  jsonb;
  v_kind     text;
  v_amount   numeric(12,2);
  v_skim_pct numeric(6,4);
BEGIN
  -- Only on the active → won/lost edge
  IF NOT (OLD.status = 'active' AND NEW.status IN ('won','lost')) THEN
    RETURN NEW;
  END IF;

  SELECT question INTO v_question FROM events WHERE id = NEW.event_id;

  IF NEW.status = 'won' THEN
    v_kind := 'win';
    -- Edge fn templates expect NET payout (post-skim). settle_event
    -- has already deducted the skim before this trigger runs, so
    -- payout_if_win is the gross. We approximate net as
    -- payout * (1 - skim_pct) using the same config the settler used.
    SELECT COALESCE(value, 5) / 100 INTO v_skim_pct
    FROM platform_config WHERE key = 'resolution_skim_pct';
    v_amount := ROUND(NEW.payout_if_win * (1 - COALESCE(v_skim_pct, 0.05)), 2);
  ELSE
    v_kind   := 'loss';
    v_amount := 0;
  END IF;

  v_payload := jsonb_build_object(
    'user_id',        NEW.user_id,
    'type',           v_kind,
    'event_question', COALESCE(v_question, NEW.event_id),
    'amount',         v_amount,
    'entry',          ROUND(NEW.gross_amount, 2),
    'event_id',       NEW.event_id
  );

  PERFORM public._post_resolution_email(v_payload);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_on_position_resolved ON public.positions;
CREATE TRIGGER trg_email_on_position_resolved
  AFTER UPDATE ON public.positions
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status IN ('won','lost'))
  EXECUTE FUNCTION public.email_on_position_resolved();


-- ── Trigger B: LP capital returned ──────────────────────────
CREATE OR REPLACE FUNCTION public.email_on_lp_returned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question text;
  v_payload  jsonb;
BEGIN
  IF NOT (OLD.status = 'active' AND NEW.status = 'returned') THEN
    RETURN NEW;
  END IF;

  SELECT question INTO v_question FROM events WHERE id = NEW.event_id;

  v_payload := jsonb_build_object(
    'user_id',        NEW.user_id,
    'type',           'lp_return',
    'event_question', COALESCE(v_question, NEW.event_id),
    'amount',         ROUND(COALESCE(NEW.payout, NEW.amount), 2),
    'entry',          ROUND(NEW.amount, 2),
    'event_id',       NEW.event_id
  );

  PERFORM public._post_resolution_email(v_payload);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_on_lp_returned ON public.lp_deposits;
CREATE TRIGGER trg_email_on_lp_returned
  AFTER UPDATE ON public.lp_deposits
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status = 'returned')
  EXECUTE FUNCTION public.email_on_lp_returned();


COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  Setup (run AFTER deploying the edge function):
--
--    -- 1. Set the edge fn URL
--    UPDATE platform_config
--    SET    value_text = 'https://<project-ref>.supabase.co/functions/v1/send-resolution-email'
--    WHERE  key = 'resolution_email_url';
--
--    -- 2. Set the service_role bearer (copy from Supabase Dashboard →
--    --    Settings → API → service_role secret)
--    UPDATE platform_config
--    SET    value_text = '<service_role_jwt>'
--    WHERE  key = 'resolution_email_token';
--
--  Smoke test:
--    -- Resolve a test event with one position and one LP, then:
--    SELECT * FROM net._http_response
--    WHERE created > now() - interval '5 minutes'
--    ORDER BY created DESC;
--    -- Expect: rows with status_code 200 from send-resolution-email
-- ============================================================

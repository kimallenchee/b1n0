-- ============================================================
--  Migration: Reconciliation cron
--  Date: 2026-04-28
--
--  Goals (Reconciliation Cron + Ledger Invariants):
--   2.1  reconciliation_log table (admin-readable via RLS)
--   2.2  run_reconciliation() — SECURITY DEFINER computer of all
--        invariants from LEDGER_INVARIANTS.md, returns the row
--        it just inserted
--   2.3  pg_cron schedule: nightly at 03:00 UTC
--   2.4  Trigger on INSERT WHERE status='critical' → POST to the
--        reconciliation-alert Edge Function via pg_net (which in
--        turn ships to Sentry as a captured message)
--
--  See LEDGER_INVARIANTS.md for the human-readable description of
--  every invariant this function checks.
-- ============================================================

BEGIN;

-- ── Extensions required ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ── 2.1  reconciliation_log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reconciliation_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at                timestamptz NOT NULL DEFAULT now(),
  ledger_sum            numeric(14,4) NOT NULL,
  balance_sum           numeric(14,4) NOT NULL,
  ledger_balance_delta  numeric(14,4) NOT NULL,
  deposits_net          numeric(14,4) NOT NULL,
  treasury_balance      numeric(14,4) NOT NULL,
  user_balances_total   numeric(14,4) NOT NULL,
  money_in_positions    numeric(14,4) NOT NULL,
  conservation_delta    numeric(14,4) NOT NULL,
  status                text NOT NULL CHECK (status IN ('ok', 'warning', 'critical')),
  notes                 text
);

CREATE INDEX IF NOT EXISTS reconciliation_log_run_at_idx
  ON public.reconciliation_log (run_at DESC);

CREATE INDEX IF NOT EXISTS reconciliation_log_status_idx
  ON public.reconciliation_log (status, run_at DESC);

ALTER TABLE public.reconciliation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_select_reconciliation ON public.reconciliation_log;
CREATE POLICY admin_select_reconciliation
  ON public.reconciliation_log
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- No write policies — only the SECURITY DEFINER function inserts.
-- The function itself bypasses RLS as the owner of reconciliation_log.

COMMENT ON TABLE public.reconciliation_log IS
  'Append-only log of nightly (and on-demand) reconciliation runs. Admin-only SELECT via RLS. Inserts come exclusively from run_reconciliation().';


-- ── 2.2  run_reconciliation() ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_reconciliation()
RETURNS public.reconciliation_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_treasury_id        uuid;
  v_ledger_sum         numeric(14,4);
  v_balance_sum        numeric(14,4);
  v_ledger_balance_delta numeric(14,4);
  v_deposits           numeric(14,4);
  v_withdrawals        numeric(14,4);
  v_deposits_net       numeric(14,4);
  v_treasury_balance   numeric(14,4);
  v_user_total         numeric(14,4);
  v_money_in_pos       numeric(14,4);
  v_conservation_delta numeric(14,4);
  v_status             text;
  v_max_delta          numeric(14,4);
  v_notes              text;
  v_row                public.reconciliation_log;
BEGIN
  -- 1) Treasury account id (from platform_config)
  SELECT value_text::uuid INTO v_treasury_id
  FROM public.platform_config
  WHERE key = 'treasury_account_id';

  IF v_treasury_id IS NULL THEN
    RAISE EXCEPTION 'run_reconciliation: treasury_account_id missing from platform_config';
  END IF;

  -- 2) Invariant 1 — ledger-to-balance (aggregate across all users)
  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_sum
  FROM public.balance_ledger;

  SELECT COALESCE(SUM(balance), 0) INTO v_balance_sum
  FROM public.profiles;

  v_ledger_balance_delta := ROUND(v_ledger_sum - v_balance_sum, 4);

  -- 3) Invariant 2 — conservation
  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'deposit'), 0),
         COALESCE(SUM(amount) FILTER (WHERE type = 'withdraw'), 0)
    INTO v_deposits, v_withdrawals
  FROM public.balance_ledger;

  -- withdraw amounts are stored negative, so net = deposits + withdrawals
  v_deposits_net := ROUND(v_deposits + v_withdrawals, 4);

  SELECT COALESCE(balance, 0) INTO v_treasury_balance
  FROM public.profiles WHERE id = v_treasury_id;

  SELECT COALESCE(SUM(balance), 0) INTO v_user_total
  FROM public.profiles WHERE id <> v_treasury_id;

  -- Implicit money in active markets (per invariant 2)
  v_money_in_pos := ROUND(v_deposits_net - v_treasury_balance - v_user_total, 4);

  -- The conservation invariant rearranges to:
  --   net_deposits = treasury + users + money_in_positions
  -- so the delta is the residual (which by construction is 0 — kept
  -- as a column for trend visibility).
  v_conservation_delta := ROUND(
    v_deposits_net - v_treasury_balance - v_user_total - v_money_in_pos,
    4
  );

  -- 4) Status classification — driven by the worst-case delta
  v_max_delta := GREATEST(
    ABS(v_ledger_balance_delta),
    ABS(v_conservation_delta)
  );

  IF v_money_in_pos < -0.50 THEN
    -- Negative implied money-in-positions means we paid out more
    -- than was deposited — always critical regardless of deltas.
    v_status := 'critical';
    v_notes  := 'money_in_positions is negative — likely settlement bug or unbalanced ledger';
  ELSIF v_max_delta > 5.00 THEN
    v_status := 'critical';
  ELSIF v_max_delta > 0.50 THEN
    v_status := 'warning';
  ELSE
    v_status := 'ok';
  END IF;

  -- 5) Persist
  INSERT INTO public.reconciliation_log (
    ledger_sum,
    balance_sum,
    ledger_balance_delta,
    deposits_net,
    treasury_balance,
    user_balances_total,
    money_in_positions,
    conservation_delta,
    status,
    notes
  ) VALUES (
    v_ledger_sum,
    v_balance_sum,
    v_ledger_balance_delta,
    v_deposits_net,
    v_treasury_balance,
    v_user_total,
    v_money_in_pos,
    v_conservation_delta,
    v_status,
    v_notes
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.run_reconciliation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_reconciliation() TO authenticated, service_role;

COMMENT ON FUNCTION public.run_reconciliation() IS
  'Computes ledger-to-balance and conservation invariants, classifies the run as ok / warning / critical, persists to reconciliation_log, and returns the inserted row. SECURITY DEFINER so cron and admin clients can both call it.';

-- Wrap with is_admin guard to keep the spec rule
-- ("any authenticated admin or cron can run it")
DO $$ BEGIN
  ALTER FUNCTION public.run_reconciliation() RENAME TO run_reconciliation__inner;
EXCEPTION
  WHEN undefined_function THEN NULL;
  WHEN duplicate_function THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.run_reconciliation()
RETURNS public.reconciliation_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Allow cron (auth.uid() IS NULL when called via pg_cron) and admins.
  IF v_uid IS NOT NULL AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;
  RETURN public.run_reconciliation__inner();
END;
$$;

REVOKE ALL ON FUNCTION public.run_reconciliation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_reconciliation() TO authenticated, service_role;


-- ── 2.4  Drift alerting via Edge Function ───────────────────────
--
-- We store the alert URL + shared secret in platform_config so the
-- trigger can read them without hardcoding deployment-specific values.
-- The Edge Function lives at supabase/functions/reconciliation-alert
-- and POSTs the row to Sentry as a captureMessage with
-- tag 'reconciliation_drift'.
--
-- Seed the URL once the function is deployed:
--   INSERT INTO platform_config (key, value_text, label) VALUES
--     ('reconciliation_alert_url',
--      'https://<project-ref>.supabase.co/functions/v1/reconciliation-alert',
--      'Edge Function URL for reconciliation drift alerts')
--   ON CONFLICT (key) DO UPDATE SET value_text = EXCLUDED.value_text;
--
-- And the shared secret (any random string; also set in the Edge
-- Function secrets as RECONCILIATION_ALERT_SECRET):
--   INSERT INTO platform_config (key, value_text, label) VALUES
--     ('reconciliation_alert_secret', '<random-string>',
--      'Shared secret for reconciliation alert Edge Function')
--   ON CONFLICT (key) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO public.platform_config (key, value, value_text, label) VALUES
  ('reconciliation_alert_url', NULL, NULL,
   'Edge Function URL for reconciliation drift alerts (set after deploy)'),
  ('reconciliation_alert_secret', NULL, NULL,
   'Shared secret matching RECONCILIATION_ALERT_SECRET in the Edge Function')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_reconciliation_critical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_body   jsonb;
BEGIN
  IF NEW.status <> 'critical' THEN
    RETURN NEW;
  END IF;

  SELECT value_text INTO v_url
  FROM public.platform_config WHERE key = 'reconciliation_alert_url';

  SELECT value_text INTO v_secret
  FROM public.platform_config WHERE key = 'reconciliation_alert_secret';

  IF v_url IS NULL THEN
    RAISE WARNING 'reconciliation_alert_url not configured — critical drift not reported to Sentry. Row id: %', NEW.id;
    RETURN NEW;
  END IF;

  v_body := jsonb_build_object(
    'event',   'reconciliation_drift',
    'severity','error',
    'row',     row_to_json(NEW)
  );

  -- pg_net schedules the request asynchronously; failures here do
  -- not roll back the INSERT.
  PERFORM net.http_post(
    url     := v_url,
    body    := v_body,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Alert-Secret', COALESCE(v_secret, '')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reconciliation_critical_alert ON public.reconciliation_log;
CREATE TRIGGER reconciliation_critical_alert
  AFTER INSERT ON public.reconciliation_log
  FOR EACH ROW
  WHEN (NEW.status = 'critical')
  EXECUTE FUNCTION public.notify_reconciliation_critical();


-- ── 2.3  pg_cron schedule ───────────────────────────────────────
--
-- Schedule nightly at 03:00 UTC. The schedule is idempotent — if
-- the job already exists, we update its definition.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-reconciliation') THEN
    PERFORM cron.unschedule('nightly-reconciliation');
  END IF;

  PERFORM cron.schedule(
    'nightly-reconciliation',
    '0 3 * * *',
    $CRON$ SELECT public.run_reconciliation(); $CRON$
  );
END $$;


COMMIT;

-- ── Verification queries (run after deploy) ─────────────────────
--
--   -- 1. Run once on demand
--   SELECT * FROM public.run_reconciliation();
--
--   -- 2. Check the logged row
--   SELECT * FROM public.reconciliation_log ORDER BY run_at DESC LIMIT 1;
--
--   -- 3. Confirm cron registered
--   SELECT jobid, schedule, command, jobname FROM cron.job
--   WHERE jobname = 'nightly-reconciliation';
--
--   -- 4. Test the critical alert path (replace deltas with values
--   --    that breach the Q5 threshold). This row will fire the trigger.
--   --    The Edge Function POST happens asynchronously via pg_net.
--   INSERT INTO public.reconciliation_log (
--     ledger_sum, balance_sum, ledger_balance_delta,
--     deposits_net, treasury_balance, user_balances_total,
--     money_in_positions, conservation_delta, status, notes
--   ) VALUES (
--     0, 0, 100, 0, 0, 0, 0, 100, 'critical', 'manual test row'
--   );

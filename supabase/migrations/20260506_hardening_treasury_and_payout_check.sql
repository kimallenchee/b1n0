-- ============================================================
--  Migration: hardening (treasury UUID move + payout invariant)
--  Date: 2026-05-06 (later same day as 20260506_unified_fees)
--
--  Two unrelated but small hardening fixes bundled because both
--  are surface-area reductions before PSP integration:
--
--  1. settle_predictions__inner — the legacy resolution path kept
--     as a rollback safety net by the unified-fees migration —
--     still hardcoded the treasury UUID '00000000-...-0001'. If a
--     future operator ever rolls back the wrapper, that dead code
--     comes alive with a hardcoded reference to a UUID that may
--     not exist in a fresh staging clone or post-PSP environment.
--     This migration rewrites __inner so it reads
--     treasury_account_id from platform_config instead, matching
--     every other resolution function.
--
--  2. positions table — adds a CHECK constraint enforcing
--     payout_if_win = ROUND(contracts, 2) so the Kalshi invariant
--     can never silently drift again. Any future RPC variant that
--     forgets to set v_payout := v_contracts (regressing back
--     toward the parimutuel-projection bug we just killed) will
--     fail at INSERT instead of corrupting settlement weeks later.
--
--  Idempotency: CREATE OR REPLACE for the function, NOT VALID
--  CHECK first then VALIDATE. Safe to re-run.
--
--  Rollback: re-applying 20260427_harden_admin_authorization.sql
--  restores the inner function to its hardcoded form. The CHECK
--  can be dropped with `ALTER TABLE positions DROP CONSTRAINT
--  positions_payout_equals_contracts`.
-- ============================================================

BEGIN;

-- ── 1. Rewrite settle_predictions__inner to read treasury from config ──

CREATE OR REPLACE FUNCTION public.settle_predictions__inner(
  p_event_id text,
  p_result   text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count          integer := 0;
  v_row            record;
  v_new_balance    numeric(12,2);
  v_event_q        text;
  v_skim_pct       numeric(6,4) := 0.05;
  v_gross_payout   numeric(12,2);
  v_skim_amount    numeric(12,2);
  v_net_payout     numeric(12,2);
  v_total_skimmed  numeric(12,2) := 0;
  v_treasury_id    uuid;
  v_treasury_bal   numeric(12,2);
BEGIN
  -- Admin guard preserved from legacy.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Resolution skim from config.
  SELECT COALESCE(value, 5) / 100 INTO v_skim_pct
  FROM platform_config WHERE key = 'resolution_skim_pct';

  -- Treasury from config — the actual hardening fix.
  SELECT value_text::uuid INTO v_treasury_id
  FROM platform_config WHERE key = 'treasury_account_id';
  IF v_treasury_id IS NULL THEN
    RAISE EXCEPTION 'settle_predictions__inner: treasury_account_id missing from platform_config';
  END IF;

  SELECT question INTO v_event_q FROM public.events WHERE id = p_event_id;

  -- Process each active prediction (legacy logic preserved verbatim
  -- below this point — only the treasury source has changed).
  FOR v_row IN
    SELECT id, user_id, side, potential_cobro
    FROM public.predictions
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    IF v_row.side = p_result OR v_row.side = (p_result || '::yes') THEN
      v_gross_payout := FLOOR(v_row.potential_cobro)::numeric(12,2);
      v_skim_amount  := ROUND(v_gross_payout * v_skim_pct, 2);
      v_net_payout   := v_gross_payout - v_skim_amount;
      v_total_skimmed := v_total_skimmed + v_skim_amount;

      UPDATE public.predictions
      SET status = 'won', resolved_at = now()
      WHERE id = v_row.id;

      UPDATE public.profiles
      SET balance             = balance + v_net_payout,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + v_net_payout
      WHERE id = v_row.user_id
      RETURNING balance INTO v_new_balance;

      INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_row.user_id, 'win', v_net_payout, v_new_balance,
              '¡Lo sabías! ' || COALESCE(v_event_q, p_event_id), v_row.id::text);
    ELSE
      UPDATE public.predictions
      SET status = 'lost', resolved_at = now()
      WHERE id = v_row.id;

      SELECT balance INTO v_new_balance FROM public.profiles WHERE id = v_row.user_id;
      INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_row.user_id, 'loss', 0, v_new_balance,
              'Esta vez no: ' || COALESCE(v_event_q, p_event_id), v_row.id::text);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Mark winning positions
  UPDATE public.positions
  SET status = 'won'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND (side = p_result OR side = (p_result || '::yes'));

  -- Mark losing positions
  UPDATE public.positions
  SET status = 'lost'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND side <> p_result
    AND side <> (p_result || '::yes');

  -- Mark event resolved
  UPDATE public.events
  SET status = 'resolved', result = p_result
  WHERE id = p_event_id;

  -- Credit treasury (now from config-driven UUID).
  IF v_total_skimmed > 0 THEN
    UPDATE public.profiles
    SET balance = balance + v_total_skimmed
    WHERE id = v_treasury_id
    RETURNING balance INTO v_treasury_bal;

    INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id)
    VALUES (v_treasury_id, 'skim', v_total_skimmed, v_treasury_bal,
            'Resolución: ' || COALESCE(v_event_q, p_event_id), p_event_id);
  END IF;

  RETURN v_count;
END;
$$;


-- ── 2. payout_if_win invariant CHECK constraint ──
--
-- Enforce at the schema layer that every position row's
-- payout_if_win equals ROUND(contracts, 2) — the Kalshi invariant.
-- Any future RPC that diverges (regressing toward parimutuel-style
-- payout projection) will fail at INSERT instead of silently
-- corrupting settlement math.
--
-- We add NOT VALID first (instant — doesn't lock the table) and
-- then VALIDATE separately so a long-running scan doesn't block
-- writes. If validation fails, that means existing rows violate
-- the invariant and we need to investigate before enforcing.

ALTER TABLE public.positions
  DROP CONSTRAINT IF EXISTS positions_payout_equals_contracts;

ALTER TABLE public.positions
  ADD CONSTRAINT positions_payout_equals_contracts
  CHECK (payout_if_win = ROUND(contracts, 2)) NOT VALID;

-- Validate against existing rows. If this fails the constraint
-- can be dropped manually and the violating rows audited:
--   SELECT id, contracts, payout_if_win, payout_if_win - ROUND(contracts, 2) AS drift
--   FROM positions WHERE payout_if_win <> ROUND(contracts, 2);
ALTER TABLE public.positions
  VALIDATE CONSTRAINT positions_payout_equals_contracts;

COMMIT;

-- ============================================================
--  Verification:
--    -- 1. Confirm treasury config still loads (settle_predictions
--       smoke test on a throwaway event will run __inner via the
--       wrapper if you've reverted the wrapper, otherwise just
--       checking the constraint is enough).
--
--    -- 2. Confirm CHECK is active:
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid = 'public.positions'::regclass
--      AND conname = 'positions_payout_equals_contracts';
--
--    -- 3. Try violating it (should fail with check constraint
--       violation — will need to use service role to bypass RLS):
--    INSERT INTO positions (event_id, user_id, side, contracts,
--      price_at_purchase, payout_if_win, fee_paid, gross_amount)
--    VALUES ('test', '00000000-0000-0000-0000-000000000001', 'yes',
--      100, 0.5, 999, 0, 100);
--    -- Expect: ERROR — new row violates check constraint
-- ============================================================

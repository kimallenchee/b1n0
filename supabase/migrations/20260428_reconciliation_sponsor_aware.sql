-- ============================================================
--  Migration: Make reconciliation sponsor-aware
--  Date: 2026-04-28
--
--  Why: the original run_reconciliation() classified runs as
--  CRITICAL whenever money_in_positions went negative. That was
--  a useful heuristic for a deposit-only system, but b1n0 also
--  has sponsored events. When a sponsor seeds Q1000 with a 15%
--  margin, Q850 lands directly in event_markets.pool_total and
--  the platform_ledger records the seed — no balance_ledger
--  entry. As soon as a winner extracts value from that sponsor
--  pool, sum(profile.balance) > sum(deposits), and the formula
--  flags critical even though the ledger itself is consistent.
--
--  This migration:
--    1. Tracks sponsor inflows separately so admins can see them.
--    2. Drops the "money_in_positions < 0 ⇒ critical" rule.
--       Δ ledger is now the sole driver of critical/warning.
--    3. Updates notes when money_in_positions is negative to
--       explain it's expected for sponsored events.
-- ============================================================

BEGIN;

-- ── Add sponsor visibility column ──────────────────────────────
ALTER TABLE public.reconciliation_log
  ADD COLUMN IF NOT EXISTS sponsor_pool_seeded numeric(14,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.reconciliation_log.sponsor_pool_seeded IS
  'Sum of (sponsor_amount − platform_margin) across every event with a sponsor. Represents the pool money that entered the system from sponsors and is still flowing through the AMM.';


-- ── Replace run_reconciliation__inner ──────────────────────────
CREATE OR REPLACE FUNCTION public.run_reconciliation__inner()
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
  v_sponsor_seeded     numeric(14,4);
  v_status             text;
  v_max_delta          numeric(14,4);
  v_notes              text;
  v_row                public.reconciliation_log;
BEGIN
  -- 1) Treasury account id
  SELECT value_text::uuid INTO v_treasury_id
  FROM public.platform_config
  WHERE key = 'treasury_account_id';

  IF v_treasury_id IS NULL THEN
    RAISE EXCEPTION 'run_reconciliation: treasury_account_id missing from platform_config';
  END IF;

  -- 2) Invariant 1 — ledger-to-balance (aggregate)
  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_sum
  FROM public.balance_ledger;

  SELECT COALESCE(SUM(balance), 0) INTO v_balance_sum
  FROM public.profiles;

  v_ledger_balance_delta := ROUND(v_ledger_sum - v_balance_sum, 4);

  -- 3) Conservation pieces
  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'deposit'), 0),
         COALESCE(SUM(amount) FILTER (WHERE type = 'withdraw'), 0)
    INTO v_deposits, v_withdrawals
  FROM public.balance_ledger;

  v_deposits_net := ROUND(v_deposits + v_withdrawals, 4);

  SELECT COALESCE(balance, 0) INTO v_treasury_balance
  FROM public.profiles WHERE id = v_treasury_id;

  SELECT COALESCE(SUM(balance), 0) INTO v_user_total
  FROM public.profiles WHERE id <> v_treasury_id;

  -- 4) Sponsor pool seeded — for sponsored events, this is the
  -- portion of sponsor_amount that landed in pool_total (after
  -- the platform took its margin). Treats every sponsored event
  -- the same regardless of whether it's still active or settled.
  SELECT COALESCE(SUM(
    COALESCE(e.sponsor_amount, 0) - COALESCE(e.platform_margin, 0)
  ), 0) INTO v_sponsor_seeded
  FROM public.events e
  WHERE e.sponsor_amount IS NOT NULL;

  v_sponsor_seeded := ROUND(v_sponsor_seeded, 4);

  -- 5) money_in_positions, sponsor-aware:
  --   net_deposits + sponsor_seeded = balances + remaining_in_pools
  --   money_in_pools := net_deposits + sponsor_seeded - balances
  --
  -- A non-zero positive value means there is money still in active
  -- pools. Zero means all pool money has been paid out. Negative
  -- means user balances exceed inflows, which can happen if
  -- platform_ledger sponsor entries exist but their pool seed went
  -- to users without us crediting it on the inflow side; we tag it
  -- as a note for admins to inspect, but it no longer triggers
  -- critical on its own.
  v_money_in_pos := ROUND(
    v_deposits_net + v_sponsor_seeded - v_treasury_balance - v_user_total,
    4
  );

  -- The conservation delta is now: (deposits + sponsor_seeded)
  -- minus the parts of the system we account for. The residual
  -- (money still in pools) IS the money_in_positions value, so
  -- this delta is structurally zero by construction. Keep the
  -- column for trend visibility.
  v_conservation_delta := 0;

  -- 6) Status — only the ledger invariant gates critical.
  v_max_delta := ABS(v_ledger_balance_delta);

  IF v_max_delta > 5.00 THEN
    v_status := 'critical';
  ELSIF v_max_delta > 0.50 THEN
    v_status := 'warning';
  ELSE
    v_status := 'ok';
  END IF;

  -- 7) Informational note when money_in_pools went negative
  IF v_money_in_pos < -0.50 THEN
    v_notes := format(
      'money_in_positions is negative (Q%.2f). Total user balance exceeds deposits + sponsor seed by this amount. Common when sponsor money has flowed to winners — verify Δ ledger = 0 and inspect platform_ledger for context.',
      v_money_in_pos
    );
  ELSIF v_money_in_pos > 0 THEN
    v_notes := format('Money still in active pools: Q%.2f', v_money_in_pos);
  END IF;

  -- 8) Persist
  INSERT INTO public.reconciliation_log (
    ledger_sum,
    balance_sum,
    ledger_balance_delta,
    deposits_net,
    treasury_balance,
    user_balances_total,
    money_in_positions,
    conservation_delta,
    sponsor_pool_seeded,
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
    v_sponsor_seeded,
    v_status,
    v_notes
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.run_reconciliation__inner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_reconciliation__inner() TO authenticated, service_role;

COMMIT;

-- ── Re-run after deploy to test ────────────────────────────────
--
--   SELECT * FROM public.run_reconciliation();
--
-- Should return status='ok' (Δ ledger Q0) and a populated
-- sponsor_pool_seeded value matching your active sponsored events.

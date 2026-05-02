-- ============================================================
--  Migration: Drop sponsor from reconciliation
--  Date: 2026-04-28
--
--  Sponsor model has been removed (pools now back exclusively by
--  LP capital flowing through balance_ledger). The conservation
--  invariant goes back to the simple form:
--
--    deposits − withdrawals = treasury + user_balances + money_in_pools
--
--  This migration reverts run_reconciliation__inner to compute
--  money_in_positions purely from net deposits minus account
--  balances. The sponsor_pool_seeded column on reconciliation_log
--  stays in the schema for historical rows but is always written
--  as 0 going forward.
-- ============================================================

BEGIN;

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
  v_status             text;
  v_max_delta          numeric(14,4);
  v_notes              text;
  v_row                public.reconciliation_log;
BEGIN
  SELECT value_text::uuid INTO v_treasury_id
  FROM public.platform_config
  WHERE key = 'treasury_account_id';

  IF v_treasury_id IS NULL THEN
    RAISE EXCEPTION 'run_reconciliation: treasury_account_id missing from platform_config';
  END IF;

  -- Invariant 1 — ledger-to-balance (aggregate)
  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_sum
  FROM public.balance_ledger;

  SELECT COALESCE(SUM(balance), 0) INTO v_balance_sum
  FROM public.profiles;

  v_ledger_balance_delta := ROUND(v_ledger_sum - v_balance_sum, 4);

  -- Conservation pieces
  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'deposit'), 0),
         COALESCE(SUM(amount) FILTER (WHERE type = 'withdraw'), 0)
    INTO v_deposits, v_withdrawals
  FROM public.balance_ledger;

  v_deposits_net := ROUND(v_deposits + v_withdrawals, 4);

  SELECT COALESCE(balance, 0) INTO v_treasury_balance
  FROM public.profiles WHERE id = v_treasury_id;

  SELECT COALESCE(SUM(balance), 0) INTO v_user_total
  FROM public.profiles WHERE id <> v_treasury_id;

  -- Money still in active pools — derived from conservation:
  --   deposits − balances = money still in markets (LP commitments,
  --   user-funded positions awaiting resolution).
  v_money_in_pos := ROUND(
    v_deposits_net - v_treasury_balance - v_user_total,
    4
  );

  -- Status — only the ledger invariant gates critical.
  v_max_delta := ABS(v_ledger_balance_delta);

  IF v_max_delta > 5.00 THEN
    v_status := 'critical';
  ELSIF v_max_delta > 0.50 THEN
    v_status := 'warning';
  ELSE
    v_status := 'ok';
  END IF;

  IF v_money_in_pos < -0.50 THEN
    v_notes := format(
      'money_in_positions is negative (Q%.2f). Without sponsor seeding, this should not happen — investigate balance_ledger for unbacked credits or settlement bug.',
      v_money_in_pos
    );
  ELSIF v_money_in_pos > 0 THEN
    v_notes := format('Money still in active pools: Q%.2f (LP capital + user position contributions)', v_money_in_pos);
  END IF;

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
    0,    -- conservation_delta is always 0 by construction now
    0,    -- sponsor_pool_seeded — kept for column compat, always 0
    v_status,
    v_notes
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMIT;

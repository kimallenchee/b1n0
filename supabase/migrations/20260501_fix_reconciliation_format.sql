-- ============================================================
--  Migration: Fix run_reconciliation format() bug
--  Date: 2026-05-01
--
--  Postgres format() supports only %s, %I, %L, %%. The previous
--  version of run_reconciliation__inner used printf-style %.2f
--  which Postgres rejects with:
--      unrecognized format() type specifier "."
--
--  Replace format() with explicit string concatenation using
--  to_char() for decimal formatting. Also switch the currency
--  symbol from Q to $ to match the platform-wide USD switch.
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

  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_sum   FROM public.balance_ledger;
  SELECT COALESCE(SUM(balance), 0) INTO v_balance_sum FROM public.profiles;
  v_ledger_balance_delta := ROUND(v_ledger_sum - v_balance_sum, 4);

  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'deposit'),  0),
         COALESCE(SUM(amount) FILTER (WHERE type = 'withdraw'), 0)
    INTO v_deposits, v_withdrawals
  FROM public.balance_ledger;

  v_deposits_net := ROUND(v_deposits + v_withdrawals, 4);

  SELECT COALESCE(balance, 0) INTO v_treasury_balance
  FROM public.profiles WHERE id = v_treasury_id;

  SELECT COALESCE(SUM(balance), 0) INTO v_user_total
  FROM public.profiles WHERE id <> v_treasury_id;

  v_money_in_pos := ROUND(
    v_deposits_net - v_treasury_balance - v_user_total,
    4
  );

  v_max_delta := ABS(v_ledger_balance_delta);

  IF v_max_delta > 5.00 THEN
    v_status := 'critical';
  ELSIF v_max_delta > 0.50 THEN
    v_status := 'warning';
  ELSE
    v_status := 'ok';
  END IF;

  -- Notes: USD symbol, plain string concatenation (Postgres format()
  -- doesn't support printf %.2f).
  IF v_money_in_pos < -0.50 THEN
    v_notes := 'money_in_positions is negative ($'
      || to_char(v_money_in_pos, 'FM999999990.00')
      || '). Without sponsor seeding this should not happen — investigate balance_ledger for unbacked credits or settlement bug.';
  ELSIF v_money_in_pos > 0 THEN
    v_notes := 'Money still in active pools: $'
      || to_char(v_money_in_pos, 'FM999999990.00')
      || ' (LP capital + user position contributions).';
  END IF;

  -- Add a note when the ledger drift itself is non-zero — this is
  -- the single most important signal in the system, surface it loud.
  IF v_max_delta > 0.50 THEN
    v_notes := COALESCE(v_notes || ' | ', '')
      || 'LEDGER DRIFT: $'
      || to_char(v_ledger_balance_delta, 'FM999999990.00')
      || ' between sum(balance_ledger) and sum(profile.balance).';
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
    0,
    0,
    v_status,
    v_notes
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMIT;

-- Lifecycle test for the b1n0 ledger invariant.
-- Paste the entire script (including the DO $$ ... $$; block) into
-- Supabase SQL editor and run as a single statement.

DO $$
DECLARE
  v_kim                       uuid    := 'd56e5604-2e1e-4ac5-9cdd-16915cbf90c2';
  v_event_id                  text    := 'lifecycle-test-' || EXTRACT(epoch FROM now())::bigint::text;
  v_kim_balance_before        numeric;
  v_kim_balance_after_init    numeric;
  v_kim_balance_after_buy     numeric;
  v_kim_balance_after_settle  numeric;
  v_recon_before              public.reconciliation_log;
  v_recon_after_init          public.reconciliation_log;
  v_recon_after_buy           public.reconciliation_log;
  v_recon_after_settle        public.reconciliation_log;
  v_buy_result                jsonb;
  v_settle_result             jsonb;
  v_init_result               public.event_markets;
  v_failed                    boolean := false;
BEGIN
  -- Spoof Kim's auth (Kim is admin so this passes both user-level
  -- and admin-level guards through the test).
  PERFORM set_config('request.jwt.claim.sub', v_kim::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_kim::text, 'role', 'authenticated')::text,
    true
  );

  IF auth.uid() IS DISTINCT FROM v_kim THEN
    RAISE EXCEPTION 'Auth spoof failed: auth.uid()=% expected %', auth.uid(), v_kim;
  END IF;

  -- BASELINE
  SELECT balance INTO v_kim_balance_before FROM public.profiles WHERE id = v_kim;
  v_recon_before := public.run_reconciliation();

  RAISE NOTICE '---- BASELINE ----';
  RAISE NOTICE 'Kim balance:    $%', v_kim_balance_before;
  RAISE NOTICE 'Recon status:   %', v_recon_before.status;
  RAISE NOTICE 'Ledger delta:   $%', v_recon_before.ledger_balance_delta;

  -- STEP 1: Create test event
  INSERT INTO public.events
    (id, question, category, subtype,
     yes_percent, no_percent, pool_size, currency,
     time_remaining, is_live,
     min_entry, max_entry, tier_required, status, ends_at)
  VALUES
    (v_event_id, 'TEST: Lifecycle invariant test passes?', 'futbol', 'binary',
     50, 50, 100, '$',
     '7d', true,
     1, 100, 1, 'open', now() + interval '7 days');

  RAISE NOTICE '---- EVENT CREATED ----';
  RAISE NOTICE 'event_id: %', v_event_id;

  -- STEP 2: Initialize market with $100 LP-funded pool
  v_init_result := public.initialize_market(
    v_event_id,    -- p_event_id
    100,           -- p_pool_total
    50,            -- p_initial_yes_pct
    true,          -- p_spread_enabled
    1000,          -- p_synthetic_shares
    NULL           -- p_sponsor_amount (sponsor model removed)
  );

  RAISE NOTICE '---- MARKET INITIALIZED ----';
  RAISE NOTICE 'pool_total:  $%', v_init_result.pool_total;
  RAISE NOTICE 'yes_shares:  %', v_init_result.yes_shares;

  SELECT balance INTO v_kim_balance_after_init FROM public.profiles WHERE id = v_kim;
  v_recon_after_init := public.run_reconciliation();
  RAISE NOTICE 'Recon delta: $%', v_recon_after_init.ledger_balance_delta;

  -- STEP 3: Kim buys $5 YES
  v_buy_result := public.execute_purchase(v_event_id, v_kim, 'yes', 5);

  RAISE NOTICE '---- KIM BUYS $5 YES ----';
  RAISE NOTICE 'Buy result:  %', v_buy_result;

  IF v_buy_result ? 'error' THEN
    v_failed := true;
    RAISE EXCEPTION 'Buy failed: %', v_buy_result->>'error';
  END IF;

  SELECT balance INTO v_kim_balance_after_buy FROM public.profiles WHERE id = v_kim;
  v_recon_after_buy := public.run_reconciliation();
  RAISE NOTICE 'Kim balance: $% (was $%)',
    v_kim_balance_after_buy, v_kim_balance_after_init;
  RAISE NOTICE 'Recon delta: $% (must be $0.00)',
    v_recon_after_buy.ledger_balance_delta;

  IF v_recon_after_buy.ledger_balance_delta <> 0 THEN
    v_failed := true;
    RAISE WARNING 'Drift after buy: $%', v_recon_after_buy.ledger_balance_delta;
  END IF;

  -- STEP 4: Settle YES (Kim wins)
  v_settle_result := public.settle_event(v_event_id, 'yes');

  RAISE NOTICE '---- SETTLE YES (Kim wins) ----';
  RAISE NOTICE 'Settle result: %', v_settle_result;

  SELECT balance INTO v_kim_balance_after_settle FROM public.profiles WHERE id = v_kim;
  v_recon_after_settle := public.run_reconciliation();
  RAISE NOTICE 'Kim balance: $% (was $% after buy)',
    v_kim_balance_after_settle, v_kim_balance_after_buy;
  RAISE NOTICE 'Recon delta: $% (must be $0.00)',
    v_recon_after_settle.ledger_balance_delta;

  IF v_recon_after_settle.ledger_balance_delta <> 0 THEN
    v_failed := true;
    RAISE WARNING 'Drift after settle: $%', v_recon_after_settle.ledger_balance_delta;
  END IF;

  -- STEP 5: Cleanup
  -- Naive cleanup that only deletes ledger rows by position_id leaves
  -- profile balances mutated. So we have to either rewind the profile
  -- balances or keep the ledger rows that match those changes.
  -- We rewind balances + delete every ledger row that mentions this
  -- event in any reference field.
  UPDATE public.profiles SET balance = v_kim_balance_before WHERE id = v_kim;
  UPDATE public.profiles
  SET balance = v_recon_before.treasury_balance
  WHERE id = '00000000-0000-0000-0000-000000000001';

  -- Reset Kim's prediction stats to their pre-test values.
  UPDATE public.profiles
  SET correct_predictions = correct_predictions - (
        SELECT COUNT(*) FROM public.predictions
        WHERE event_id = v_event_id AND user_id = v_kim AND status = 'won'),
      total_cobrado = total_cobrado - COALESCE((
        SELECT SUM(potential_cobro) FROM public.predictions
        WHERE event_id = v_event_id AND user_id = v_kim AND status = 'won'), 0)
  WHERE id = v_kim;

  -- Delete every ledger row from this test (by position, prediction,
  -- or event reference).
  DELETE FROM public.balance_ledger
  WHERE reference_id IN (
    SELECT id::text FROM public.positions    WHERE event_id = v_event_id
    UNION ALL
    SELECT id::text FROM public.predictions  WHERE event_id = v_event_id
    UNION ALL
    SELECT v_event_id
  );

  DELETE FROM public.market_transactions WHERE event_id = v_event_id;
  DELETE FROM public.predictions         WHERE event_id = v_event_id;
  DELETE FROM public.positions           WHERE event_id = v_event_id;
  DELETE FROM public.event_markets       WHERE event_id = v_event_id;
  DELETE FROM public.events              WHERE id = v_event_id;

  -- Final reconciliation after cleanup.
  PERFORM public.run_reconciliation();

  RAISE NOTICE '---- VERDICT ----';
  IF v_failed THEN
    RAISE WARNING 'LIFECYCLE TEST FAILED -- drift detected';
  ELSE
    RAISE NOTICE 'LIFECYCLE TEST PASSED';
  END IF;
END $$;

-- Show the most recent 5 reconciliation rows so we can see every
-- step of the test in one table.
SELECT
  to_char(run_at, 'HH24:MI:SS')            AS time,
  status,
  ledger_balance_delta                     AS ledger_delta,
  treasury_balance                         AS treasury,
  user_balances_total                      AS users,
  money_in_positions                       AS in_pools,
  LEFT(COALESCE(notes, ''), 60)            AS notes
FROM public.reconciliation_log
ORDER BY run_at DESC
LIMIT 5;

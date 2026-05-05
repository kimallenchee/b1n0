-- ============================================================
--  Migration: settle_event must return LP capital + return premium
--  Date: 2026-05-05
--
--  PROBLEM:
--    settle_event() pays winners (with skim) and credits the
--    treasury with the skim, but never touches lp_deposits.
--    Result: when a binary event resolves, every LP for that
--    event stays at status='active' with their principal
--    locked on the books and no balance credit. The companion
--    function settle_predictions() (used for open/multi-option
--    events) handles this correctly -- this migration brings
--    settle_event() in line with that behavior.
--
--    Empirically observed: event 2822a96e-... resolved with
--    $220 of LP capital still stuck in lp_deposits.status='active'
--    even though the event is resolved.
--
--  WHAT THIS MIGRATION DOES:
--    1. CREATE OR REPLACE settle_event() with an LP return loop
--       added between the position payout loop and the final
--       events.status update. Mirrors the LP logic in
--       settle_predictions:
--         - principal returned at face value (no haircut here;
--           the liability check at purchase ensures pool covers
--           winner payouts, so LP principal is always solvent
--           on a clean settle)
--         - margin share: lp_deposit.return_pct x (fees collected
--           on this event AFTER this LP deposited)
--         - lp_deposits.status flips to 'returned', payout
--           recorded
--         - balance_ledger row of type 'lp_return' written
--    2. The audit row written via log_admin_action now includes
--       lp_count and lp_total_paid in the payload so the audit
--       trail shows the LP side of the resolution too.
--
--  WHAT THIS DOES NOT DO:
--    - Backfill the stuck $220 from event 2822a96e. That's a
--      real money decision -- Kim needs to look at the event's
--      actual financial state (winners paid? pool drained?) and
--      decide whether to refund the LPs principal, mark them as
--      partial_loss, or do something else. See the diagnostic
--      query in the verification block below.
--
--  Idempotency: CREATE OR REPLACE. Safe to re-run.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.settle_event(
  p_event_id text,
  p_result   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_payouts        jsonb := '[]'::jsonb;
  v_row            record;
  v_skim_pct       numeric(6,4) := 0.05;
  v_gross_payout   numeric(12,2);
  v_skim_amount    numeric(12,2);
  v_net_payout     numeric(12,2);
  v_total_skimmed  numeric(12,2) := 0;
  v_treasury_id    uuid;
  v_treasury_bal   numeric(12,2);
  v_winner_bal     numeric(12,2);
  v_event_q        text;
  v_winners_count  int := 0;
  v_losers_count   int := 0;
  v_summary        jsonb;
  -- LP return locals
  v_lp_row             record;
  v_market_fees        numeric(12,2);
  v_lp_user_bal        numeric(12,2);
  v_lp_payout          numeric(12,2);
  v_lp_margin_share    numeric(12,2);
  v_lp_count           int := 0;
  v_lp_total_paid      numeric(12,2) := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  SELECT COALESCE(value, 5) / 100 INTO v_skim_pct
  FROM platform_config WHERE key = 'resolution_skim_pct';

  SELECT value_text::uuid INTO v_treasury_id
  FROM platform_config WHERE key = 'treasury_account_id';

  IF v_treasury_id IS NULL THEN
    RAISE EXCEPTION 'settle_event: treasury_account_id missing from platform_config';
  END IF;

  UPDATE event_markets
  SET status = 'settled', result = p_result, updated_at = now()
  WHERE event_id = p_event_id AND status = 'open';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Market not open or not found');
  END IF;

  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;

  -- Pay winners + mark losers (unchanged behavior).
  FOR v_row IN
    SELECT id, user_id, side, payout_if_win
    FROM positions
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    IF v_row.side = p_result THEN
      v_gross_payout := ROUND(v_row.payout_if_win, 2);
      v_skim_amount  := ROUND(v_gross_payout * v_skim_pct, 2);
      v_net_payout   := v_gross_payout - v_skim_amount;
      v_total_skimmed := v_total_skimmed + v_skim_amount;
      v_winners_count := v_winners_count + 1;

      UPDATE positions SET status = 'won' WHERE id = v_row.id;

      UPDATE profiles
      SET balance             = balance + v_net_payout,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + v_net_payout
      WHERE id = v_row.user_id
      RETURNING balance INTO v_winner_bal;

      INSERT INTO public.balance_ledger
        (user_id, type, amount, balance_after, label, reference_id)
      VALUES
        (v_row.user_id, 'win', v_net_payout, v_winner_bal,
         'Cobro: ' || COALESCE(v_event_q, p_event_id),
         v_row.id::text);

      UPDATE public.predictions
      SET status = 'won', resolved_at = now()
      WHERE event_id = p_event_id
        AND user_id = v_row.user_id
        AND status = 'active';

      INSERT INTO market_transactions
        (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type, success)
      VALUES
        (v_row.id, p_event_id, v_row.user_id,
         v_gross_payout, v_skim_amount, 0, 'payout', true);

      v_payouts := v_payouts || jsonb_build_object(
        'user_id',     v_row.user_id,
        'position_id', v_row.id,
        'gross',       v_gross_payout,
        'skim',        v_skim_amount,
        'net',         v_net_payout,
        'outcome',     'won'
      );

    ELSE
      v_losers_count := v_losers_count + 1;
      UPDATE positions SET status = 'lost' WHERE id = v_row.id;

      SELECT balance INTO v_winner_bal FROM profiles WHERE id = v_row.user_id;

      INSERT INTO public.balance_ledger
        (user_id, type, amount, balance_after, label, reference_id)
      VALUES
        (v_row.user_id, 'loss', 0, v_winner_bal,
         'Esta vez no: ' || COALESCE(v_event_q, p_event_id),
         v_row.id::text);

      UPDATE public.predictions
      SET status = 'lost', resolved_at = now()
      WHERE event_id = p_event_id
        AND user_id = v_row.user_id
        AND status = 'active';

      v_payouts := v_payouts || jsonb_build_object(
        'user_id',     v_row.user_id,
        'position_id', v_row.id,
        'payout',      0,
        'outcome',     'lost'
      );
    END IF;
  END LOOP;

  -- Treasury credit for skim (unchanged behavior).
  IF v_total_skimmed > 0 THEN
    UPDATE public.profiles
    SET balance = balance + v_total_skimmed
    WHERE id = v_treasury_id
    RETURNING balance INTO v_treasury_bal;

    INSERT INTO public.balance_ledger
      (user_id, type, amount, balance_after, label, reference_id)
    VALUES
      (v_treasury_id, 'skim', v_total_skimmed, v_treasury_bal,
       'Resolución: ' || COALESCE(v_event_q, p_event_id),
       p_event_id);
  END IF;

  -- NEW: return LP capital + margin share to each active LP.
  -- Mirrors the LP block in settle_predictions(): each LP earns
  -- return_pct * (fees collected since they joined) on top of
  -- getting their principal back. fees_at_deposit is the snapshot
  -- taken when the LP funded, so an LP who arrived late only earns
  -- on fees collected after them.
  SELECT COALESCE(fees_collected, 0) INTO v_market_fees
  FROM event_markets WHERE event_id = p_event_id;

  FOR v_lp_row IN
    SELECT id, user_id, amount, return_pct,
           COALESCE(fees_at_deposit, 0) AS fees_at_deposit
    FROM lp_deposits
    WHERE event_id = p_event_id AND status = 'active'
    FOR UPDATE
  LOOP
    v_lp_payout := ROUND(v_lp_row.amount, 2);
    v_lp_margin_share := ROUND(
      v_lp_row.return_pct
        * GREATEST(v_market_fees - v_lp_row.fees_at_deposit, 0),
      2
    );
    v_lp_payout := v_lp_payout + v_lp_margin_share;
    v_lp_total_paid := v_lp_total_paid + v_lp_payout;
    v_lp_count := v_lp_count + 1;

    UPDATE profiles
    SET balance = balance + v_lp_payout
    WHERE id = v_lp_row.user_id
    RETURNING balance INTO v_lp_user_bal;

    UPDATE lp_deposits
    SET status = 'returned', payout = v_lp_payout
    WHERE id = v_lp_row.id;

    INSERT INTO public.balance_ledger
      (user_id, type, amount, balance_after, label, reference_id)
    VALUES
      (v_lp_row.user_id, 'lp_return', v_lp_payout, v_lp_user_bal,
       'Retorno LP: ' || COALESCE(v_event_q, p_event_id),
       v_lp_row.id::text);
  END LOOP;

  -- Mark the event resolved.
  UPDATE public.events
  SET status = 'resolved', result = p_result
  WHERE id = p_event_id;

  v_summary := jsonb_build_object(
    'result',          p_result,
    'event_question',  v_event_q,
    'payouts',         v_payouts,
    'winners_count',   v_winners_count,
    'losers_count',    v_losers_count,
    'total_skimmed',   v_total_skimmed,
    'skim_pct',        v_skim_pct,
    'lp_count',        v_lp_count,
    'lp_total_paid',   v_lp_total_paid
  );

  PERFORM public.log_admin_action(
    'settle_event',
    'event',
    p_event_id,
    'Resolved as ' || p_result,
    v_summary
  );

  RETURN v_summary;
END;
$func$;

COMMIT;

-- ============================================================
--  Verification:
--    -- 1. Function still exists, body now contains lp_return logic
--    SELECT pg_get_functiondef(oid) ILIKE '%lp_return%'
--    FROM pg_proc WHERE proname = 'settle_event';
--    -- Expect: t (true)
--
--    -- 2. Diagnose the existing stuck event 2822a96e-...
--    SELECT em.event_id, em.status, em.pool_total, em.bet_pool,
--           em.lp_capital, em.fees_collected,
--           COUNT(p.id) FILTER (WHERE p.status = 'won')  AS winners,
--           COUNT(p.id) FILTER (WHERE p.status = 'lost') AS losers,
--           COALESCE(SUM(p.payout_if_win) FILTER (WHERE p.status = 'won'), 0)
--             AS total_paid_to_winners
--    FROM event_markets em
--    LEFT JOIN positions p ON p.event_id = em.event_id
--    WHERE em.event_id = '2822a96e-9507-4246-a890-460f4f69971e'
--    GROUP BY em.event_id, em.status, em.pool_total, em.bet_pool,
--             em.lp_capital, em.fees_collected;
--
--    -- 3. Smoke test the new path
--    --    a) Create a fresh test event with $5 LP + a $2 SÍ stake
--    --    b) Resolve "SÍ ganó" via admin UI
--    --    c) SELECT id, status, payout FROM lp_deposits
--    --         WHERE event_id = '<new-event-id>';
--    --       -> status='returned', payout=$5+ (principal+margin)
--    --    d) SELECT public.run_reconciliation();
--    --       -> status='ok', ledger_balance_delta=0
-- ============================================================

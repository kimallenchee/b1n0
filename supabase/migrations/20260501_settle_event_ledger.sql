-- ============================================================
--  Migration: settle_event must write balance_ledger + skim
--  Date: 2026-05-01
--
--  ROOT CAUSE (lifecycle test caught this):
--    settle_event credits winner profile.balance directly
--    without writing a matching balance_ledger row, and never
--    applies the 5% resolution skim that settle_predictions
--    does. Every settled binary event silently widens drift by
--    sum(winner payouts) and the platform earns nothing on
--    settlement.
--
--      sum(balance_ledger) - sum(profiles.balance) -= payout
--
--  COMPARISON:
--    settle_predictions (20260412_resolution_skim.sql) does
--    everything right: skim + ledger rows for win/loss/skim.
--    settle_event was just never brought in line.
--
--  FIX:
--    Recreate settle_event so each winner:
--      - gets net payout (gross - skim) credited to profile,
--      - has correct_predictions and total_cobrado bumped,
--      - has a 'win' balance_ledger row written;
--    each loser:
--      - has a $0 'loss' ledger row for symmetry / audit trail;
--    treasury:
--      - is credited with the total skim,
--      - has a matching 'skim' ledger row.
--    Predictions tied to settled positions are marked won/lost
--    so the user-facing "Mis Llamados" tab reflects reality.
--
--  Idempotency: this is CREATE OR REPLACE; safe to re-run.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.settle_event(
  p_event_id text,
  p_result   text    -- 'yes' | 'no'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
BEGIN
  -- Admin only.
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  -- Load skim rate from platform_config (default 5%).
  SELECT COALESCE(value, 5) / 100 INTO v_skim_pct
  FROM platform_config WHERE key = 'resolution_skim_pct';

  -- Load treasury account id from platform_config.
  SELECT value_text::uuid INTO v_treasury_id
  FROM platform_config WHERE key = 'treasury_account_id';

  IF v_treasury_id IS NULL THEN
    RAISE EXCEPTION 'settle_event: treasury_account_id missing from platform_config';
  END IF;

  -- Mark market settled. Bail out if it wasn't open.
  UPDATE event_markets
  SET status = 'settled', result = p_result, updated_at = now()
  WHERE event_id = p_event_id AND status = 'open';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Market not open or not found');
  END IF;

  -- Event question for ledger labels.
  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;

  -- Iterate every active position on this event.
  FOR v_row IN
    SELECT id, user_id, side, payout_if_win
    FROM positions
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    IF v_row.side = p_result THEN
      -- Winner.
      v_gross_payout := ROUND(v_row.payout_if_win, 2);
      v_skim_amount  := ROUND(v_gross_payout * v_skim_pct, 2);
      v_net_payout   := v_gross_payout - v_skim_amount;
      v_total_skimmed := v_total_skimmed + v_skim_amount;

      UPDATE positions SET status = 'won' WHERE id = v_row.id;

      -- Credit NET payout to winner + bump stats.
      UPDATE profiles
      SET balance             = balance + v_net_payout,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + v_net_payout
      WHERE id = v_row.user_id
      RETURNING balance INTO v_winner_bal;

      -- Ledger row for the win, keyed to the position so cleanup
      -- can match it.
      INSERT INTO public.balance_ledger
        (user_id, type, amount, balance_after, label, reference_id)
      VALUES
        (v_row.user_id, 'win', v_net_payout, v_winner_bal,
         'Cobro: ' || COALESCE(v_event_q, p_event_id),
         v_row.id::text);

      -- Mark the prediction as won (user-facing "Mis Llamados").
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
      -- Loser.
      UPDATE positions SET status = 'lost' WHERE id = v_row.id;

      -- Audit-trail ledger row at $0 so reconciliation can prove
      -- every position was processed.
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

  -- Credit accumulated skim to treasury, with a single matching
  -- ledger row keyed to the event.
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

  -- Mark the event itself resolved so the admin UI stops listing it.
  UPDATE public.events
  SET status = 'resolved', result = p_result
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'result',         p_result,
    'payouts',        v_payouts,
    'total_skimmed',  v_total_skimmed,
    'skim_pct',       v_skim_pct
  );
END;
$$;

COMMIT;

-- Verification (after applying):
--   -- Run the lifecycle test. The "after settle" reconciliation
--   -- row should report status='ok' with ledger_balance_delta = 0.
--   SELECT public.run_reconciliation();

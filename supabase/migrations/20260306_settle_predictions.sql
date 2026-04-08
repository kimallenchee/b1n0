-- ============================================================
--  settle_predictions: update predictions + award balances
--  Called after settle_event (binary) or directly (open events)
--
--  p_result for binary events:  'yes' | 'no'
--  p_result for open events:    the winning option label (e.g. 'Messi')
--
--  Winning logic:
--    binary:  prediction.side = p_result                  → won
--    open YES: prediction.side = '{p_result}::yes'        → won
--    open NO:  prediction.side = '{p_result}::no'         → lost
--    open other option: side label doesn't match          → lost
-- ============================================================

CREATE OR REPLACE FUNCTION public.settle_predictions(
  p_event_id text,
  p_result   text
)
RETURNS integer   -- number of predictions processed
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count       integer := 0;
  v_row         record;
  v_new_balance numeric(12,2);
  v_event_q     text;
BEGIN
  -- Admin only
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch event question for ledger labels
  SELECT question INTO v_event_q FROM public.events WHERE id = p_event_id;

  -- Process each active prediction for this event
  FOR v_row IN
    SELECT id, user_id, side, potential_cobro
    FROM public.predictions
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    IF v_row.side = p_result OR v_row.side = (p_result || '::yes') THEN
      -- Winner
      UPDATE public.predictions
      SET status = 'won', resolved_at = now()
      WHERE id = v_row.id;

      -- Credit payout to balance
      UPDATE public.profiles
      SET balance             = balance + FLOOR(v_row.potential_cobro)::integer,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + FLOOR(v_row.potential_cobro)::integer
      WHERE id = v_row.user_id
      RETURNING balance INTO v_new_balance;

      -- Ledger entry for win
      INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_row.user_id, 'win', FLOOR(v_row.potential_cobro)::integer, v_new_balance,
              '¡Lo sabías! ' || COALESCE(v_event_q, p_event_id), v_row.id::text);
    ELSE
      -- Loser
      UPDATE public.predictions
      SET status = 'lost', resolved_at = now()
      WHERE id = v_row.id;

      -- Ledger entry for loss (amount = 0, just a record)
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

  -- Mark event resolved in events table (so the feed shows it correctly)
  UPDATE public.events
  SET status = 'resolved', result = p_result
  WHERE id = p_event_id;

  RETURN v_count;
END;
$$;

-- Enable realtime for predictions and profiles so the frontend
-- receives live updates without polling (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'predictions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- ============================================================
--  Allow composite sides for open events ("Messi::yes")
--  and replace cast_vote with upsert-capable version
-- ============================================================

-- 1. Drop the side CHECK constraint so composite sides ("label::yes") are accepted
ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_side_check;

-- 2. Admin delete policy for predictions (soft-delete support)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'predictions' AND policyname = 'Admins delete predictions'
  ) THEN
    CREATE POLICY "Admins delete predictions"
      ON public.predictions FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_admin = true
        )
      );
  END IF;
END $$;

-- 3. Replace cast_vote with upsert version that handles re-votes and composite sides
CREATE OR REPLACE FUNCTION public.cast_vote(
  p_event_id        text,
  p_side            text,
  p_amount          integer,
  p_potential_cobro numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid    := auth.uid();
  v_balance     integer;
  v_pred_id     uuid;
  v_prev_amount integer := 0;
  v_is_new      boolean := true;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the user's balance row
  SELECT balance INTO v_balance FROM profiles WHERE id = v_user_id FOR UPDATE;

  -- Check for existing prediction on this event
  SELECT id, amount
  INTO v_pred_id, v_prev_amount
  FROM predictions
  WHERE user_id = v_user_id AND event_id = p_event_id;

  IF FOUND THEN
    v_is_new := false;
  ELSE
    v_prev_amount := 0;
  END IF;

  -- Effective balance check: allow existing amount to be reallocated
  IF (v_balance + v_prev_amount) < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  -- Upsert: insert or update if same event
  INSERT INTO predictions (user_id, event_id, side, amount, potential_cobro)
  VALUES (v_user_id, p_event_id, p_side, p_amount, p_potential_cobro)
  ON CONFLICT (user_id, event_id) DO UPDATE
    SET side            = EXCLUDED.side,
        amount          = EXCLUDED.amount,
        potential_cobro = EXCLUDED.potential_cobro
  RETURNING id INTO v_pred_id;

  -- Adjust balance and total_predictions counter
  UPDATE profiles
  SET balance           = balance + v_prev_amount - p_amount,
      total_predictions = CASE WHEN v_is_new
                               THEN total_predictions + 1
                               ELSE total_predictions
                          END
  WHERE id = v_user_id;

  RETURN v_pred_id;
END;
$$;

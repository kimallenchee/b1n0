-- ============================================================
--  Fix: allow multiple sides per user per event (multi-outcome)
--  Old constraint: unique(user_id, event_id)
--  New constraint: unique(user_id, event_id, side)
-- ============================================================

-- Drop the old constraint
ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_user_id_event_id_key;

-- Add the new one that allows different sides on same event
DO $$ BEGIN
  ALTER TABLE public.predictions
    ADD CONSTRAINT predictions_user_event_side_key UNIQUE (user_id, event_id, side);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

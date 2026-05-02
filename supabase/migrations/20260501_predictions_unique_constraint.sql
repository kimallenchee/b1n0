-- ============================================================
--  Migration: Ensure predictions has unique(user_id, event_id)
--  Date: 2026-05-01
--
--  execute_purchase relies on:
--      INSERT INTO predictions (...) VALUES (...)
--      ON CONFLICT (user_id, event_id) DO UPDATE ...
--
--  That requires a unique constraint or unique index on the
--  pair. Without it Postgres returns:
--      ERROR: there is no unique or exclusion constraint
--      matching the ON CONFLICT specification
--
--  This migration adds the constraint idempotently. If the
--  constraint already exists (from 20260314_fix_predictions_unique.sql
--  or similar), the DO block silently no-ops.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.predictions'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 2
      AND conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.predictions'::regclass AND attname = 'user_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.predictions'::regclass AND attname = 'event_id')
      ]
  ) THEN
    -- Strip duplicates first if any exist (defensive)
    DELETE FROM public.predictions a
    USING public.predictions b
    WHERE a.id < b.id
      AND a.user_id = b.user_id
      AND a.event_id = b.event_id;

    ALTER TABLE public.predictions
      ADD CONSTRAINT predictions_user_event_unique
      UNIQUE (user_id, event_id);
  END IF;
END $$;

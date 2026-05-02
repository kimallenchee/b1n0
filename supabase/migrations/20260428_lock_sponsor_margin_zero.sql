-- ============================================================
--  Migration: Lock sponsor_margin_pct = 0
--  Date: 2026-04-28
--
--  Sponsor money is supposed to flow 100% into the event pool.
--  The platform takes its cut from user transaction fees and AMM
--  spread, never from the sponsor's contribution. Earlier code
--  defaulted `sponsor_margin_pct` to 15 in platform_config, which
--  meant initialize_market() siphoned 15% of every sponsor amount
--  into platform_ledger before the pool was seeded.
--
--  This migration:
--    1. Forces the config row to value = 0 if it isn't already.
--    2. Adds a row-level CHECK constraint so any future UPDATE
--       that tries to set sponsor_margin_pct to non-zero fails
--       with a clear error.
--    3. Leaves the row in place (no DROP) so update_platform_config
--       and the Tarifas UI continue to read it; they just can't
--       move it off zero.
--
--  Idempotent: re-running is safe — UPDATE is a no-op if value
--  already 0, and the CHECK constraint creation skips when one
--  by the same name exists.
-- ============================================================

BEGIN;

-- 1. Force the row to zero before adding the constraint, so the
--    constraint can apply without rejecting existing data.
UPDATE public.platform_config
   SET value      = 0,
       updated_at = now()
 WHERE key = 'sponsor_margin_pct'
   AND value <> 0;

-- 2. Add the CHECK constraint. Phrased as "either the key is not
--    sponsor_margin_pct, OR the value is 0" so it only constrains
--    that one row and ignores everything else.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sponsor_margin_must_be_zero'
      AND conrelid = 'public.platform_config'::regclass
  ) THEN
    ALTER TABLE public.platform_config
      ADD CONSTRAINT sponsor_margin_must_be_zero
      CHECK (key <> 'sponsor_margin_pct' OR value = 0);
  END IF;
END $$;

COMMIT;

-- ── Verification (run after deploy) ────────────────────────────
--
--   -- Should return value = 0
--   SELECT key, value FROM public.platform_config
--   WHERE key = 'sponsor_margin_pct';
--
--   -- Should fail with check_violation
--   UPDATE public.platform_config SET value = 15
--   WHERE key = 'sponsor_margin_pct';
--   -- ERROR: new row for relation "platform_config" violates
--   -- check constraint "sponsor_margin_must_be_zero"
--
--   -- Should still succeed (other config rows unaffected)
--   SELECT public.update_platform_config('tx_fee_pct', 2.5);

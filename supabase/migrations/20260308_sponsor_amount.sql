-- ============================================================
--  Migration: sponsor_amount → pool_total derivation
--
--  Business rule:
--    sponsor_amount  = full invoice amount the sponsor pays
--    platform_margin = sponsor_amount × 0.15   (b1n0's cut, logged separately)
--    pool_total      = sponsor_amount × 0.85   (goes into the prize pool)
--
--  Changes:
--    1. events: add sponsor_amount + platform_margin columns
--    2. event_markets: add sponsor_amount + platform_margin columns
--    3. platform_ledger: new append-log table for revenue reporting
--    4. Backfill existing rows (reverse-derive from pool_size)
--    5. initialize_market: updated to accept p_sponsor_amount and
--       derive pool_total server-side — frontend can never override this
-- ============================================================

-- ── 1. Add columns to events ─────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sponsor_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS platform_margin NUMERIC(12,2);

-- ── 2. Add columns to event_markets ─────────────────────────

ALTER TABLE public.event_markets
  ADD COLUMN IF NOT EXISTS sponsor_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS platform_margin NUMERIC(12,2);

-- ── 3. platform_ledger — append log for revenue reporting ────
--
--  One row per event creation/update (multiple rows are fine —
--  this is an audit trail, not a single-record-per-event view).

CREATE TABLE IF NOT EXISTS public.platform_ledger (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_amount  NUMERIC(12,2) NOT NULL,
  platform_margin NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_ledger_event_id_idx
  ON public.platform_ledger (event_id);

-- ── 4. Backfill existing rows ────────────────────────────────
--
--  Reverse-derive: pool_size = sponsor_amount × 0.85
--  → sponsor_amount = ROUND(pool_size / 0.85, 0)
--  → platform_margin = sponsor_amount × 0.15

UPDATE public.events
SET
  sponsor_amount  = ROUND(pool_size / 0.85, 0),
  platform_margin = ROUND(ROUND(pool_size / 0.85, 0) * 0.15, 2)
WHERE sponsor_amount IS NULL AND pool_size > 0;

-- Propagate to event_markets
UPDATE public.event_markets em
SET
  sponsor_amount  = e.sponsor_amount,
  platform_margin = e.platform_margin
FROM public.events e
WHERE em.event_id = e.id
  AND em.sponsor_amount IS NULL
  AND e.sponsor_amount IS NOT NULL;

-- Backfill platform_ledger from existing events
INSERT INTO public.platform_ledger (event_id, sponsor_amount, platform_margin)
SELECT
  id,
  sponsor_amount,
  platform_margin
FROM public.events
WHERE sponsor_amount IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.platform_ledger pl WHERE pl.event_id = events.id
  );

-- ── 5. initialize_market — accepts p_sponsor_amount ──────────
--
--  When p_sponsor_amount IS NOT NULL:
--    - Validates: must be integer, must be ≥ 1,000
--    - Derives pool_total = sponsor_amount × 0.85 (server-side — not trusted from frontend)
--    - Stores sponsor_amount + platform_margin on events + event_markets
--    - Appends row to platform_ledger
--  When NULL: falls back to p_pool_total (backwards-compatible)

DROP FUNCTION IF EXISTS public.initialize_market(TEXT, NUMERIC, INTEGER, BOOLEAN, INTEGER);

CREATE FUNCTION public.initialize_market(
  p_event_id         TEXT,
  p_pool_total       NUMERIC     DEFAULT 0,
  p_initial_yes_pct  INTEGER     DEFAULT 50,
  p_spread_enabled   BOOLEAN     DEFAULT true,
  p_synthetic_shares INTEGER     DEFAULT 1000,
  p_sponsor_amount   NUMERIC     DEFAULT NULL
)
RETURNS public.event_markets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pool_total       NUMERIC(12,2);
  v_platform_margin  NUMERIC(12,2);
  v_yes              NUMERIC(14,4);
  v_no               NUMERIC(14,4);
  v_row              public.event_markets%rowtype;
BEGIN
  -- Admin only
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_sponsor_amount IS NOT NULL THEN
    -- Validate: must be a whole number
    IF p_sponsor_amount <> FLOOR(p_sponsor_amount) THEN
      RAISE EXCEPTION 'sponsor_amount debe ser número entero (sin centavos)';
    END IF;
    -- Validate: minimum Q1,000
    IF p_sponsor_amount < 1000 THEN
      RAISE EXCEPTION 'sponsor_amount debe ser mínimo Q1,000';
    END IF;

    -- Server-side derivation — frontend value is ignored
    v_platform_margin := ROUND(p_sponsor_amount * 0.15, 2);
    v_pool_total      := ROUND(p_sponsor_amount * 0.85, 2);

    -- Store on events table
    UPDATE public.events
    SET sponsor_amount  = p_sponsor_amount,
        platform_margin = v_platform_margin,
        pool_size       = v_pool_total::integer
    WHERE id = p_event_id;

    -- Log to platform_ledger (append — intentional, not a duplicate guard)
    INSERT INTO public.platform_ledger (event_id, sponsor_amount, platform_margin)
    VALUES (p_event_id, p_sponsor_amount, v_platform_margin);

  ELSE
    -- Backwards-compatible: caller supplied pool_total directly
    v_pool_total      := ROUND(p_pool_total, 2);
    v_platform_margin := NULL;
  END IF;

  -- Synthetic AMM shares (initial price = p_initial_yes_pct / 100)
  v_yes := ROUND((p_initial_yes_pct::NUMERIC / 100) * p_synthetic_shares, 4);
  v_no  := ROUND(p_synthetic_shares - v_yes, 4);

  INSERT INTO public.event_markets
    (event_id, pool_total, pool_committed, yes_shares, no_shares,
     spread_enabled, status, sponsor_amount, platform_margin)
  VALUES
    (p_event_id, ROUND(v_pool_total, 4), 0, v_yes, v_no,
     p_spread_enabled, 'open', p_sponsor_amount, v_platform_margin)
  ON CONFLICT (event_id) DO UPDATE
    SET pool_total      = EXCLUDED.pool_total,
        yes_shares      = EXCLUDED.yes_shares,
        no_shares       = EXCLUDED.no_shares,
        spread_enabled  = EXCLUDED.spread_enabled,
        sponsor_amount  = EXCLUDED.sponsor_amount,
        platform_margin = EXCLUDED.platform_margin,
        updated_at      = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

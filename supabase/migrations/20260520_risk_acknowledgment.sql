-- ============================================================
--  Migration: profiles.risk_acknowledged_at + acknowledge_risk()
--  Date: 2026-05-20
--
--  WHY
--    Regulator-facing audit primitive. Every user must explicitly
--    acknowledge that:
--      - Llamados imply capital risk
--      - b1n0 is not investment advice
--      - 18+ required
--      - Compliance with their own jurisdiction is on them
--    BEFORE the first deposit AND before the first llamado.
--
--    The acknowledgment is captured client-side (modal + checkbox)
--    AND server-side as a single immutable timestamp on the profile
--    so we can produce an audit trail on demand. Without the
--    server-side timestamp, the only evidence is browser state,
--    which is worthless under audit.
--
--  USAGE
--    Client calls supabase.rpc('acknowledge_risk') on first deposit
--    OR first llamado confirmation. The RPC is idempotent — calling
--    it after the timestamp is set returns the existing value
--    instead of overwriting. This means the FIRST acknowledgment is
--    what's preserved, and we don't accidentally reset the audit
--    trail if the client retries.
--
--  WHY SECURITY DEFINER
--    Uses auth.uid() to identify the caller; needs to UPDATE the
--    profiles row without relying on the per-user UPDATE policy
--    (which exists but this keeps the surface tight and explicit).
-- ============================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS risk_acknowledged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.risk_acknowledged_at IS
  'Timestamp of the user''s first risk acknowledgment. Set on first deposit or first llamado confirmation. NEVER reset — this is the audit primitive for regulator inquiries.';

CREATE OR REPLACE FUNCTION public.acknowledge_risk()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing timestamptz;
  v_now      timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;

  -- Idempotent: if already set, return the existing timestamp.
  SELECT risk_acknowledged_at INTO v_existing
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_now := now();
  UPDATE public.profiles
    SET risk_acknowledged_at = v_now
    WHERE id = auth.uid()
      AND risk_acknowledged_at IS NULL;  -- defensive: race-safe

  RETURN v_now;
END;
$$;

COMMENT ON FUNCTION public.acknowledge_risk() IS
  'Idempotently records the user''s first risk acknowledgment. Returns the existing timestamp if already set, or sets and returns now() on first call. Called from client when user confirms the risk modal (first deposit) or checks the risk checkbox in EntryFlow (first llamado).';

GRANT EXECUTE ON FUNCTION public.acknowledge_risk() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  Verification:
--    -- As an authenticated user:
--    SELECT public.acknowledge_risk();          -- returns now()
--    SELECT public.acknowledge_risk();          -- returns same ts
--    SELECT risk_acknowledged_at FROM profiles WHERE id = auth.uid();
-- ============================================================

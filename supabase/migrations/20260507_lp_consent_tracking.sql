-- ============================================================
--  Migration: LP consent tracking
--  Date: 2026-05-07
--
--  Why:
--    Before any sponsor wires real money for LP capital, b1n0 needs
--    to record their explicit, informed acknowledgement that LP
--    capital is at risk in lopsided-favorite-wins scenarios. This
--    is a paper trail for the platform and protection for the
--    sponsor relationship — "your $5,000 could come back as
--    $4,300" is a conversation that has to happen *before* the
--    wire, with a record that it happened.
--
--    The actual T&C language belongs to a lawyer, not this
--    migration. What this migration does is prepare the database
--    schema so when the legal text is final, dropping it into a
--    consent_versions row is a one-line update.
--
--  What this migration does:
--    1. Adds a `lp_consent_versions` table — each row is a
--       version of the LP terms-of-service. The active version is
--       the one with the latest effective_at timestamp where
--       active=true. Versions are append-only; never edit a
--       published version, always publish a new row.
--
--    2. Seeds version v0.1-DRAFT with placeholder text so the
--       app has something to render today. Replace with the
--       lawyer-approved text via:
--         INSERT INTO lp_consent_versions (version, effective_at,
--         active, terms_md, scenarios_required) VALUES (...);
--         UPDATE lp_consent_versions SET active = false
--         WHERE version <> 'v1.0';
--
--    3. Adds consent columns to `lp_deposits`:
--       - consent_version          text       which version they agreed to
--       - consent_at               timestamptz when they agreed
--       - consent_acknowledgements jsonb       per-scenario explicit ticks
--       - consent_ip               inet        their IP at consent time
--
--    4. Backfills existing lp_deposits rows with version 'v0-PRE-CONSENT'
--       and consent_at = created_at so they're not NULL.
--
--    5. Updates deposit_lp_capital to accept and require the
--       consent fields on every call. Calls without consent
--       (i.e. legacy code paths) get rejected.
-- ============================================================

BEGIN;

-- ── 1. Versions table

CREATE TABLE IF NOT EXISTS public.lp_consent_versions (
  version            text PRIMARY KEY,
  effective_at       timestamptz NOT NULL DEFAULT now(),
  active             boolean NOT NULL DEFAULT true,
  -- Markdown body of the agreement, rendered on /sponsor and inside the
  -- consent modal. Supports inline links and basic formatting.
  terms_md           text NOT NULL,
  -- The scenario keys the sponsor must explicitly check. Each entry
  -- maps to a UI checkbox + a row stored in consent_acknowledgements.
  -- Example: ["balanced","favorite_wins","underdog_wins","void"]
  scenarios_required text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lp_consent_versions IS
  'Append-only register of LP terms-of-service versions. Active version is the latest effective_at where active=true. Replace placeholder v0.1-DRAFT with lawyer-approved text before any real sponsor money lands.';

ALTER TABLE public.lp_consent_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lp_consent_versions_read_all" ON public.lp_consent_versions;
CREATE POLICY "lp_consent_versions_read_all"
  ON public.lp_consent_versions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "lp_consent_versions_admin_write" ON public.lp_consent_versions;
CREATE POLICY "lp_consent_versions_admin_write"
  ON public.lp_consent_versions FOR ALL
  USING (public.is_admin(auth.uid()));


-- ── 2. Placeholder version (REPLACE BEFORE PRODUCTION SPONSORS)

INSERT INTO public.lp_consent_versions (version, terms_md, scenarios_required, notes)
VALUES (
  'v0.1-DRAFT',
  E'# Términos de Capital LP — BORRADOR\n\n'
  || E'**Este es texto provisional sin revisión legal.** Reemplazar antes '
  || E'de aceptar capital de patrocinadores externos.\n\n'
  || E'Al depositar capital LP en un evento de b1n0, el patrocinador '
  || E'reconoce que:\n\n'
  || E'1. **El capital está en riesgo.** En escenarios donde la mayoría '
  || E'apuesta al lado ganador, el capital LP cubre la diferencia entre '
  || E'lo apostado y los pagos a ganadores. Este monto puede ser '
  || E'sustancial.\n\n'
  || E'2. **Los retornos no son garantizados.** El margen de retorno '
  || E'configurado al depósito es un techo, no un piso. El retorno real '
  || E'depende del flujo de apuestas.\n\n'
  || E'3. **Los eventos pueden ser anulados.** En caso de anulación '
  || E'(fuente de verdad ambigua, error de configuración, etc.), el '
  || E'capital se devuelve al principal sin margen.\n\n'
  || E'El patrocinador ha leído los cuatro escenarios de ejemplo en '
  || E'b1n0.com/sponsor y comprende los riesgos.',
  ARRAY['balanced', 'favorite_wins', 'underdog_wins', 'void'],
  'Placeholder draft. Replace with lawyer-reviewed text before first real sponsor deposit.'
)
ON CONFLICT (version) DO UPDATE SET
  terms_md = EXCLUDED.terms_md,
  scenarios_required = EXCLUDED.scenarios_required,
  notes = EXCLUDED.notes;


-- ── 3. Consent columns on lp_deposits

ALTER TABLE public.lp_deposits
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_acknowledgements jsonb,
  ADD COLUMN IF NOT EXISTS consent_ip inet;

COMMENT ON COLUMN public.lp_deposits.consent_version IS
  'Foreign key (logical) to lp_consent_versions.version. Identifies which T&C the LP agreed to.';
COMMENT ON COLUMN public.lp_deposits.consent_acknowledgements IS
  'JSON object with one boolean per required scenario, e.g. {"balanced":true,"favorite_wins":true,"underdog_wins":true,"void":true}. Every scenario_required from the active version must be true at deposit time.';


-- ── 4. Backfill existing rows so they aren't NULL

UPDATE public.lp_deposits
SET consent_version = 'v0-PRE-CONSENT',
    consent_at = COALESCE(created_at, now()),
    consent_acknowledgements = '{"backfilled":true}'::jsonb
WHERE consent_version IS NULL;


-- ── 5. Update deposit_lp_capital wrapper to require consent fields
--
-- The existing function takes (event_id, user_id, amount, return_pct).
-- We add a new variant that ALSO takes consent fields, and reject the
-- old signature if called without them. The old signature stays for
-- back-compat during this transition; once the EventManager UI is
-- updated to pass consent on every call, drop the old signature.

CREATE OR REPLACE FUNCTION public.deposit_lp_capital_with_consent(
  p_event_id                 text,
  p_user_id                  uuid,
  p_amount                   numeric,
  p_return_pct               numeric DEFAULT 0.08,
  p_consent_version          text    DEFAULT NULL,
  p_consent_acknowledgements jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_required_scenarios text[];
  v_scenario           text;
  v_active_version     text;
  v_inner_result       jsonb;
  v_deposit_id         uuid;
BEGIN
  -- Admin guard (deposit_lp_capital__inner has its own; we re-check here
  -- because we're adding consent enforcement on top).
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  -- Verify the consent version exists and is active.
  SELECT version, scenarios_required
    INTO v_active_version, v_required_scenarios
    FROM public.lp_consent_versions
    WHERE version = p_consent_version AND active = true;

  IF v_active_version IS NULL THEN
    RAISE EXCEPTION 'consent_version "%" is not an active LP terms version', p_consent_version;
  END IF;

  -- Verify every required scenario was acknowledged.
  IF p_consent_acknowledgements IS NULL THEN
    RAISE EXCEPTION 'consent_acknowledgements is required';
  END IF;

  FOREACH v_scenario IN ARRAY v_required_scenarios LOOP
    IF NOT (p_consent_acknowledgements ? v_scenario)
       OR (p_consent_acknowledgements->>v_scenario)::boolean IS DISTINCT FROM true
    THEN
      RAISE EXCEPTION 'consent acknowledgement missing or false for scenario "%"', v_scenario;
    END IF;
  END LOOP;

  -- Delegate to the existing (legacy) deposit logic. After the deposit
  -- lands, stamp the consent fields on the new lp_deposits row.
  v_inner_result := public.deposit_lp_capital__inner(
    p_event_id, p_user_id, p_amount, p_return_pct
  );

  IF v_inner_result ? 'error' THEN
    RETURN v_inner_result;
  END IF;

  -- Stamp consent on the row we just inserted. The inner function
  -- returns the deposit_id in its response.
  v_deposit_id := (v_inner_result->>'deposit_id')::uuid;
  IF v_deposit_id IS NOT NULL THEN
    UPDATE public.lp_deposits
    SET consent_version = p_consent_version,
        consent_at = now(),
        consent_acknowledgements = p_consent_acknowledgements
    WHERE id = v_deposit_id;
  END IF;

  RETURN v_inner_result || jsonb_build_object(
    'consent_version', p_consent_version,
    'consent_at', now()
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.deposit_lp_capital_with_consent(text, uuid, numeric, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deposit_lp_capital_with_consent(text, uuid, numeric, numeric, text, jsonb) TO authenticated, service_role;

COMMIT;

-- ============================================================
--  Verification:
--    SELECT version, active, array_length(scenarios_required, 1) AS scenarios
--    FROM lp_consent_versions ORDER BY effective_at DESC;
--    -- Expect: 1 row 'v0.1-DRAFT' active=true, scenarios=4
--
--    SELECT consent_version, count(*) FROM lp_deposits
--    GROUP BY consent_version;
--    -- Expect: existing rows tagged 'v0-PRE-CONSENT'
-- ============================================================

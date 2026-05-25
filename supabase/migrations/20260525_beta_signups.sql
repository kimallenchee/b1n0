-- ============================================================================
-- Beta signups — lead capture for the pre-launch gate page.
--
-- A new visitor lands on b1n0.com/, enters an email, and gets routed into
-- the app. We record the email + IP + user-agent + visit count so we can:
--   • Track funnel (visits → signups → activations)
--   • Detect duplicate signups across devices (same IP, different email)
--   • Identify returning visitors and skip the gate
--
-- INSERTs happen via the `beta-signup` edge function (so IP can be read
-- from x-forwarded-for and we control which fields the client can set).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.beta_signups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  -- Captured server-side from x-forwarded-for / cf-connecting-ip headers.
  ip_address      TEXT,
  user_agent      TEXT,
  -- Free-form referrer (utm_source, referer header, etc) — useful when
  -- we start running paid campaigns and want to attribute signups.
  referrer        TEXT,
  -- Lifecycle counters. Bumped each time the same email re-enters the gate.
  visit_count     INT  NOT NULL DEFAULT 1,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Optional: the converted user_id once the visitor signs up for real.
  converted_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  converted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS beta_signups_last_seen_idx ON public.beta_signups (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS beta_signups_ip_idx        ON public.beta_signups (ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS beta_signups_converted_idx ON public.beta_signups (converted_at DESC) WHERE converted_user_id IS NOT NULL;

COMMENT ON TABLE public.beta_signups IS
  'Pre-launch beta gate signups. Captured via beta-signup edge function. Used to gate b1n0.com/ → /inicio for first-time visitors.';

-- RLS: client never touches this table directly; the edge function uses
-- the service role. Lock everything down by default.
ALTER TABLE public.beta_signups ENABLE ROW LEVEL SECURITY;

-- Admins can read for the admin dashboard list view.
CREATE POLICY beta_signups_admin_select ON public.beta_signups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- No INSERT / UPDATE / DELETE policies for any role → only service_role
-- (used by the edge function) can write.

-- ----------------------------------------------------------------------------
-- record_beta_signup RPC — used by the edge function
-- ----------------------------------------------------------------------------
-- Idempotent on email. Returns the row's id + whether the visitor is new
-- so the page can show the right welcome message.
CREATE OR REPLACE FUNCTION public.record_beta_signup(
  p_email      TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_referrer   TEXT DEFAULT NULL
)
RETURNS TABLE (
  id            UUID,
  is_returning  BOOLEAN,
  visit_count   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
BEGIN
  -- Normalize email (lowercase, trim).
  p_email := LOWER(TRIM(p_email));
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  -- Upsert. If the email already exists, bump the counter + last_seen.
  SELECT * INTO v_existing FROM public.beta_signups WHERE email = p_email;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.beta_signups
       SET last_seen_at = now(),
           visit_count  = visit_count + 1,
           -- Keep the freshest IP / UA for fraud signals if they re-enter.
           ip_address   = COALESCE(p_ip_address, ip_address),
           user_agent   = COALESCE(p_user_agent, user_agent)
     WHERE id = v_existing.id;
    RETURN QUERY SELECT v_existing.id, TRUE, v_existing.visit_count + 1;
  ELSE
    INSERT INTO public.beta_signups (email, ip_address, user_agent, referrer)
    VALUES (p_email, p_ip_address, p_user_agent, p_referrer)
    RETURNING beta_signups.id INTO v_existing.id;
    RETURN QUERY SELECT v_existing.id, FALSE, 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_beta_signup FROM public;
GRANT EXECUTE ON FUNCTION public.record_beta_signup TO service_role;

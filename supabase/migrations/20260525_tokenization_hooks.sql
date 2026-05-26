-- ============================================================================
-- Tokenization lifecycle hooks
--
-- These are the integration points where the off-chain Postgres flow
-- (position created → settled → paid out) meets the on-chain flow
-- (token minted → resolved → redeemed).
--
-- Today every event has onchain_status = 'off_chain' and these hooks
-- are no-ops. When Monetae (or alternative) is wired, the edge
-- function `tokenization-orchestrator` listens for the events these
-- functions emit and calls the provider's APIs.
--
-- See docs/payments-architecture.md §4.5 and §6.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tokenization_enabled() — single source of truth for "is tokenization on?"
-- ----------------------------------------------------------------------------
-- All lifecycle hooks check this before queueing on-chain work. Toggled
-- via platform_config so admin can flip tokenization on/off without a
-- deploy.
-- platform_config has two value columns: NUMERIC `value` for fee rates
-- and TEXT `value_text` for UUIDs / URLs / feature flags. These three
-- config rows are all text-typed, so they use value_text.
CREATE OR REPLACE FUNCTION public.tokenization_enabled()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT value_text INTO v_value FROM public.platform_config WHERE key = 'tokenization_enabled';
  RETURN COALESCE(v_value, 'false') = 'true';
END;
$$;

GRANT EXECUTE ON FUNCTION public.tokenization_enabled TO authenticated, anon, service_role;

-- Seed the config rows in 'off' state. Admin flips them when ready.
INSERT INTO public.platform_config (key, value, value_text, label)
VALUES (
  'tokenization_enabled',
  NULL,
  'false',
  'Master switch for the on-chain tokenization layer. When true, new events spawn token contracts and positions get minted on-chain.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_config (key, value, value_text, label)
VALUES (
  'tokenization_provider',
  NULL,
  'monetae',
  'Which TokenizationProvider implementation is active. Possible: monetae, tohkn, tokeny.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_config (key, value, value_text, label)
VALUES (
  'tokenization_chain',
  NULL,
  'polygon',
  'Default chain for tokenized events. polygon, base, tron.'
)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. queue_event_tokenization — called on event creation
-- ----------------------------------------------------------------------------
-- Inserts a placeholder event_tokens row in 'unminted' state. The
-- tokenization-orchestrator edge function (to be written when Monetae
-- is wired) watches this table and calls
-- TokenizationProvider.deployEventTokens() to populate the contract
-- address, condition_id, token ids.
--
-- Safe to call on every event creation — when tokenization is off,
-- the row sits unprocessed and is ignored.
CREATE OR REPLACE FUNCTION public.queue_event_tokenization(
  p_event_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
  v_chain    TEXT;
BEGIN
  -- Always insert the placeholder row, even when tokenization is off.
  -- This way when we flip the switch later, every event has a row to
  -- update rather than needing a back-fill migration.
  SELECT value_text INTO v_provider FROM public.platform_config WHERE key = 'tokenization_provider';
  SELECT value_text INTO v_chain    FROM public.platform_config WHERE key = 'tokenization_chain';

  INSERT INTO public.event_tokens (
    event_id, token_model, provider, chain, collateral_token
  )
  VALUES (
    p_event_id,
    CASE WHEN public.tokenization_enabled() THEN 'ctf' ELSE 'unminted' END,
    COALESCE(v_provider, 'monetae'),
    COALESCE(v_chain, 'polygon'),
    'USDC'
  )
  ON CONFLICT (event_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_event_tokenization FROM public;
GRANT EXECUTE ON FUNCTION public.queue_event_tokenization TO service_role, authenticated;

-- Trigger that calls queue_event_tokenization on every event insert.
-- Cheap (one-row insert) and idempotent.
CREATE OR REPLACE FUNCTION public.events_after_insert_queue_tokenization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.queue_event_tokenization(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_queue_tokenization ON public.events;
CREATE TRIGGER events_queue_tokenization
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_after_insert_queue_tokenization();

-- ----------------------------------------------------------------------------
-- 3. queue_position_mint — called from buy flow when a position is created
-- ----------------------------------------------------------------------------
-- When a user buys a position and tokenization is on, the position row
-- gets onchain_status='pending_mint'. The orchestrator picks these up
-- and calls TokenizationProvider.mintOutcomeTokens(), which on success
-- flips status to 'minted' with the mint_tx_hash recorded.
--
-- Called from inside execute_purchase / execute_option_purchase after
-- the position row is inserted.
CREATE OR REPLACE FUNCTION public.queue_position_mint(
  p_position_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_wallet TEXT;
  v_event_id    TEXT;   -- positions.event_id is TEXT (matches events.id)
  v_status      TEXT;
BEGIN
  IF NOT public.tokenization_enabled() THEN
    RETURN;
  END IF;

  SELECT p.event_id, p.onchain_status, pr.wallet_address
    INTO v_event_id, v_status, v_user_wallet
    FROM public.positions p
    JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.id = p_position_id;

  -- Skip if user has no wallet yet (shouldn't happen post-Phase-3 but
  -- defensive) or already minted.
  IF v_user_wallet IS NULL THEN
    RETURN;
  END IF;
  IF v_status NOT IN ('off_chain', 'mint_failed') THEN
    RETURN;
  END IF;

  UPDATE public.positions
     SET onchain_status = 'pending_mint',
         wallet_address = v_user_wallet
   WHERE id = p_position_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_position_mint FROM public;
GRANT EXECUTE ON FUNCTION public.queue_position_mint TO service_role, authenticated;

-- ----------------------------------------------------------------------------
-- 4. queue_event_resolution — called when admin resolves an event
-- ----------------------------------------------------------------------------
-- Mark the event_tokens row as needing on-chain resolution. Orchestrator
-- calls TokenizationProvider.resolveEvent() — winning side becomes
-- redeemable.
CREATE OR REPLACE FUNCTION public.queue_event_resolution(
  p_event_id      TEXT,   -- events.id is TEXT (slug-style), not UUID
  p_winning_side  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tokenization_enabled() THEN
    RETURN;
  END IF;

  -- Mark the event_tokens row pending resolution. Orchestrator picks
  -- it up via a watcher / cron job.
  UPDATE public.event_tokens
     SET token_model = 'ctf_pending_resolve'
   WHERE event_id = p_event_id
     AND token_model IN ('ctf', 'erc1155_pair');
END;
$$;

REVOKE ALL ON FUNCTION public.queue_event_resolution FR
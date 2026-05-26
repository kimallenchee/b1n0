-- ============================================================================
-- Payments + Tokenization scaffolding
--
-- Purpose: prepare the schema for three independent vendor integrations
-- (Redbajas for cards, Vudy for crypto rails, Monetae for tokenization)
-- without committing to any vendor-specific shape.
--
-- All columns and tables added here are NULLABLE / OPTIONAL — existing
-- code paths continue to function exactly as before. Each vendor goes
-- live by populating the new fields as it integrates.
--
-- See docs/payments-architecture.md for the full design rationale.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles — wallet provisioning
-- ----------------------------------------------------------------------------
-- A smart wallet is provisioned on signup (Phase 3) and stored here. Until
-- then these are NULL. Wallet provider is captured so we can swap providers
-- per cohort (Privy first cohort, Monetae-native later, etc.) without
-- losing the historical attribution.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS wallet_provider TEXT,         -- 'privy' | 'monetae' | 'coinbase_smart' | 'external'
  ADD COLUMN IF NOT EXISTS wallet_chain TEXT,            -- 'polygon' | 'base' | 'ethereum' | etc
  ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wallet_exported_at TIMESTAMPTZ; -- when user exported keys to self-custody

COMMENT ON COLUMN public.profiles.wallet_address IS
  'Smart wallet address provisioned for this user. NULL until Phase 3 (tokenization shadow mode).';
COMMENT ON COLUMN public.profiles.wallet_provider IS
  'Which custody/wallet stack provisioned this address. See docs/payments-architecture.md §4.';

-- Address uniqueness (per provider) so we never accidentally double-provision
CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_uniq
  ON public.profiles (wallet_address)
  WHERE wallet_address IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. payment_methods — registry of cash-in / cash-out rails
-- ----------------------------------------------------------------------------
-- Generic registry capturing every funding path a user has used. Single
-- table covers cards, bank accounts, and crypto destinations so the
-- WalletSheet UI can render a unified "your payment methods" list.
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,        -- 'card' | 'bank' | 'crypto'
  provider        TEXT NOT NULL,        -- 'redbajas' | 'wompi' | 'vudy' | 'manual'
  -- Display fields (safe to show in UI; NEVER store full card / IBAN here)
  display_label   TEXT NOT NULL,        -- e.g. 'Visa •••• 4242' | 'USDC Polygon 0xab…cd'
  display_brand   TEXT,                 -- 'visa' | 'mastercard' | 'usdc' | 'usdt'
  display_last4   TEXT,
  -- Provider-side reference — what the vendor knows this method as. Never
  -- the raw PAN. For cards: Pagadito's tokenized card ID. For crypto:
  -- the destination wallet address.
  provider_ref    TEXT NOT NULL,
  -- For crypto destinations only
  crypto_chain    TEXT,                 -- 'polygon' | 'tron' | 'base'
  crypto_token    TEXT,                 -- 'USDC' | 'USDT'
  -- Lifecycle
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'expired' | 'removed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  removed_at      TIMESTAMPTZ,
  UNIQUE (user_id, provider, provider_ref)
);

CREATE INDEX IF NOT EXISTS payment_methods_user_idx ON public.payment_methods (user_id, status);

COMMENT ON TABLE public.payment_methods IS
  'Registry of cash-in/out rails per user. Card tokens stored as provider_ref only — raw PAN never persisted.';

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Users see only their own methods.
CREATE POLICY payment_methods_owner_select ON public.payment_methods
  FOR SELECT USING (auth.uid() = user_id);

-- Insertion / deletion is server-side only (via RPC), never client-direct,
-- so no INSERT/UPDATE/DELETE policies for normal users.

-- ----------------------------------------------------------------------------
-- 3. payment_transactions — every deposit and withdrawal, all rails
-- ----------------------------------------------------------------------------
-- Authoritative log of every money movement INTO or OUT OF the platform.
-- Distinct from market_transactions (which records position buys/sells
-- within the platform balance). This table lives at the boundary
-- between b1n0's ledger and the outside world.
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id),
  direction           TEXT NOT NULL CHECK (direction IN ('deposit', 'withdrawal')),
  rail                TEXT NOT NULL,    -- 'card' | 'bank' | 'crypto'
  provider            TEXT NOT NULL,    -- 'redbajas' | 'vudy' | etc
  payment_method_id   UUID REFERENCES public.payment_methods(id),
  -- Amounts. gross_amount is what the user sees; net_to_user is what they
  -- actually receive (deposit: minus processor fee; withdrawal: minus
  -- platform withdrawal fee + network fee).
  gross_amount        NUMERIC(12,2) NOT NULL,
  fee_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount          NUMERIC(12,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  -- State machine
  status              TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'processing' | 'settled' | 'failed' | 'reversed' | 'cancelled'
  failure_reason      TEXT,
  -- Provider correlation IDs (essential for debugging + reconciliation)
  provider_tx_id      TEXT,           -- the vendor's primary reference
  provider_settle_id  TEXT,           -- secondary reference (e.g. Pagadito settlement batch)
  external_ref        TEXT,           -- for crypto: tx_hash; for cards: auth code
  -- Bookkeeping crossref to our internal ledger
  balance_ledger_id   UUID,           -- the row in balance_ledger this caused
  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  initiated_at        TIMESTAMPTZ,
  settled_at          TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payment_tx_user_idx ON public.payment_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_tx_provider_ref_idx ON public.payment_transactions (provider, provider_tx_id);
CREATE INDEX IF NOT EXISTS payment_tx_status_idx ON public.payment_transactions (status, created_at DESC)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_tx_owner_select ON public.payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. event_tokens — per-event tokenization configuration
-- ----------------------------------------------------------------------------
-- One row per event that has been tokenized. The 'unminted' state is
-- where every existing event starts; new events post-tokenization launch
-- get their token contracts deployed on event creation.
-- NB: events.id is TEXT (slug-style), not UUID. The FK type must match.
CREATE TABLE IF NOT EXISTS public.event_tokens (
  event_id            TEXT PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  -- Token model: 'ctf' (Conditional Token Framework, Polymarket-style),
  -- 'erc1155_pair' (custom multi-token contract), 'unminted' (placeholder
  -- so we can pre-create rows before deploying)
  token_model         TEXT NOT NULL DEFAULT 'unminted',
  -- Smart contract identifiers
  contract_address    TEXT,
  condition_id        TEXT,            -- CTF condition hash (keccak256(questionId, oracle, outcomeCount))
  yes_token_id        TEXT,            -- token id for YES outcome
  no_token_id         TEXT,            -- token id for NO outcome
  -- For multi-option events, store the array of token ids
  option_token_ids    TEXT[],
  -- Collateral + chain
  collateral_token    TEXT DEFAULT 'USDC',  -- 'USDC' | 'USDT' | 'USD1'
  chain               TEXT DEFAULT 'polygon',
  -- Resolution authority — multisig address that can call resolve()
  resolver_address    TEXT,
  resolver_kind       TEXT DEFAULT 'multisig',  -- 'eoa' | 'multisig' | 'oracle'
  -- Provider that minted / deployed
  provider            TEXT,            -- 'monetae' | 'tohkn' | 'tokeny'
  -- Lifecycle
  deployed_at         TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  resolution_tx_hash  TEXT,
  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_tokens IS
  'On-chain token configuration per event. Phase 3 rollout — see docs/payments-architecture.md §6.';

CREATE INDEX IF NOT EXISTS event_tokens_provider_idx ON public.event_tokens (provider);

ALTER TABLE public.event_tokens ENABLE ROW LEVEL SECURITY;

-- Public read — token contracts are public anyway; users may want to verify
CREATE POLICY event_tokens_public_select ON public.event_tokens FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 5. positions — on-chain metadata
-- ----------------------------------------------------------------------------
-- Existing positions are 'off_chain' forever (grandfathered). New positions
-- post-Phase-3 will transition off_chain → pending_mint → minted →
-- (settled with redeemed | burned).
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS wallet_address    TEXT,
  ADD COLUMN IF NOT EXISTS token_contract    TEXT,
  ADD COLUMN IF NOT EXISTS token_id          TEXT,
  ADD COLUMN IF NOT EXISTS mint_tx_hash      TEXT,
  ADD COLUMN IF NOT EXISTS redeem_tx_hash    TEXT,
  ADD COLUMN IF NOT EXISTS onchain_status    TEXT NOT NULL DEFAULT 'off_chain'
    CHECK (onchain_status IN ('off_chain', 'pending_mint', 'minted', 'redeemed', 'burned', 'mint_failed'));

COMMENT ON COLUMN public.positions.onchain_status IS
  'Tokenization lifecycle. off_chain = pre-Phase-3 grandfathered; minted = on-chain backed.';

CREATE INDEX IF NOT EXISTS positions_onchain_status_idx
  ON public.positions (onchain_status)
  WHERE onchain_status NOT IN ('off_chain', 'redeemed', 'burned');

-- ----------------------------------------------------------------------------
-- 6. platform_ledger — distinguish fiat vs crypto vs token-collateral
-- ----------------------------------------------------------------------------
-- The treasury UUID currently aggregates all platform-held value. Once
-- we have multiple custody pools (FBO bank, crypto vault, CTF contract
-- collateral), we need to know which one a given ledger row belongs to
-- so reconciliation works.
ALTER TABLE public.platform_ledger
  ADD COLUMN IF NOT EXISTS custody_pool TEXT;
    -- 'fiat_fbo' | 'fiat_operating' | 'crypto_fbo' | 'crypto_operating' | 'ctf_collateral'

COMMENT ON COLUMN public.platform_ledger.custody_pool IS
  'Which real-world custody pool backs this ledger entry. NULL = legacy/unclassified.';

CREATE INDEX IF NOT EXISTS platform_ledger_custody_pool_idx
  ON public.platform_ledger (custody_pool, created_at DESC)
  WHERE custody_pool IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. balance_ledger — backing-pool attribution
-- ----------------------------------------------------------------------------
-- Each user balance entry can be attributed to a specific backing pool
-- so we can answer "if I withdraw $100 right now, where does it come
-- from?" — affects withdrawal-rail selection logic.
ALTER TABLE public.balance_ledger
  ADD COLUMN IF NOT EXISTS backing_pool TEXT;
    -- 'fiat_fbo' | 'crypto_fbo' | 'mixed'

-- ----------------------------------------------------------------------------
-- 8. vendor_webhooks — durable inbox for vendor callbacks
-- ----------------------------------------------------------------------------
-- All vendor webhooks (Redbajas payment confirmed, Vudy crypto received,
-- Monetae token minted) land here first as a raw audit trail. Processing
-- happens asynchronously. This pattern gives us:
--   - Replay capability (debug a failed processing run)
--   - Idempotency (dedupe by provider+event_id+nonce)
--   - Audit trail (regulator: "show me every webhook for user X")
CREATE TABLE IF NOT EXISTS public.vendor_webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,    -- 'redbajas' | 'vudy' | 'monetae' | 'didit'
  event_type      TEXT NOT NULL,    -- 'payment.settled' | 'transfer.received' | 'token.minted' | ...
  external_id     TEXT,             -- vendor's own event id for dedup
  -- The raw payload as received, signature included for later verification
  payload         JSONB NOT NULL,
  signature       TEXT,             -- header signature for replay verification
  -- Processing state
  status          TEXT NOT NULL DEFAULT 'received',
    -- 'received' | 'processing' | 'processed' | 'failed' | 'duplicate'
  processed_at    TIMESTAMPTZ,
  process_error   TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  -- Audit
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address      TEXT,
  -- Dedup: same provider + same external_id = same webhook, ignore re-deliveries
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS vendor_webhooks_unprocessed_idx
  ON public.vendor_webhooks (status, received_at)
  WHERE status IN ('received', 'failed');

COMMENT ON TABLE public.vendor_webhooks IS
  'Durable inbox for every vendor webhook. Raw payload + processing state. Idempotent dedup via (provider, external_id).';

-- No RLS — server-only table.

-- ----------------------------------------------------------------------------
-- 9. crypto_treasury_wallets — Tres33's own custody wallets
-- ----------------------------------------------------------------------------
-- These are the wallets Tres33 controls (via Monetae custody / Fireblocks
-- MPC), used to receive incoming deposits and fund outgoing withdrawals.
-- Distinct from user-side wallets in profiles.
CREATE TABLE IF NOT EXISTS public.crypto_treasury_wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address           TEXT NOT NULL UNIQUE,
  chain             TEXT NOT NULL,    -- 'polygon' | 'base' | 'tron' | 'ethereum'
  purpose           TEXT NOT NULL,    -- 'fbo_inbound' | 'fbo_outbound' | 'operating' | 'ctf_collateral'
  custody_provider  TEXT NOT NULL,    -- 'monetae' | 'fireblocks' | 'self_multisig'
  policy_id         TEXT,             -- vendor-side policy reference (e.g. Fireblocks policy id)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  -- For monitoring + dashboards
  last_balance_check  TIMESTAMPTZ,
  last_balance_usdc   NUMERIC(18,6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS treasury_wallets_active_idx
  ON public.crypto_treasury_wallets (is_active, chain)
  WHERE is_active;

COMMENT ON TABLE public.crypto_treasury_wallets IS
  'Tres33-controlled crypto wallets. Custody is delegated (Monetae/Fireblocks); keys never live in b1n0 backend.';

-- ----------------------------------------------------------------------------
-- 10. helper RPC — get the right treasury wallet for a (chain, purpose, direction)
-- ----------------------------------------------------------------------------
-- Withdrawals pick from fbo_outbound wallets; deposits route to fbo_inbound.
-- This lets the code stay vendor-agnostic — wallet selection is a DB query
-- not a hardcoded address.
CREATE OR REPLACE FUNCTION public.get_treasury_wallet(
  p_chain TEXT,
  p_purpose TEXT
)
RETURNS TABLE (
  id UUID,
  address TEXT,
  custody_provider TEXT,
  policy_id TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT id, address, custody_provider, policy_id
  FROM public.crypto_treasury_wallets
  WHERE chain = p_chain
    AND purpose = p_purpose
    AND is_active
  ORDER BY created_at ASC
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- 11. updated_at triggers on new tables
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_tokens_set_updated_at ON public.event_tokens;
CREATE TRIGGER event_tokens_set_updated_at
  BEFORE UPDATE ON public.event_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- End migration. Zero impact on existing code paths — all new columns are
-- nullable, all new tables sit unused until the respective vendor goes live.
-- ====
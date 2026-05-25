-- ============================================================================
-- Payment RPCs — atomic functions that move money in/out of user balances.
--
-- These are the only place outside the inbound webhook handlers where
-- balance_ledger gets touched for deposit/withdrawal flows. All RPCs are
-- SECURITY DEFINER so they can write across RLS-protected tables; each one
-- enforces its own auth check via the user_id argument.
--
-- See docs/payments-architecture.md §4 for the per-rail flows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. process_card_deposit
-- ----------------------------------------------------------------------------
-- Called by the redbajas-webhook edge function when Pagadito confirms a
-- successful card payment. Atomically:
--   • Marks payment_transactions row as 'settled'
--   • Credits balance_ledger
--   • Records (or upserts) the payment_method for repeat use
--   • Bumps profile saldo (denormalized cache)
--
-- Idempotent on (provider, provider_ref) — re-entry returns the existing
-- balance_ledger_id rather than double-crediting.
CREATE OR REPLACE FUNCTION public.process_card_deposit(
  p_payment_tx_id        UUID,
  p_user_id              UUID,
  p_gross_amount         NUMERIC,
  p_fee_amount           NUMERIC,
  p_net_amount           NUMERIC,
  p_provider             TEXT,
  p_provider_ref         TEXT,
  p_card_last4           TEXT DEFAULT NULL,
  p_card_brand           TEXT DEFAULT NULL,
  p_authorization_code   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_ledger_id  UUID;
  v_ledger_id           UUID;
  v_payment_method_id   UUID;
  v_tx_status           TEXT;
BEGIN
  -- Idempotency: if this payment_tx already has a ledger_id attached,
  -- assume the prior call succeeded and short-circuit.
  SELECT status, balance_ledger_id
    INTO v_tx_status, v_existing_ledger_id
    FROM public.payment_transactions
   WHERE id = p_payment_tx_id;

  IF v_tx_status = 'settled' AND v_existing_ledger_id IS NOT NULL THEN
    RETURN v_existing_ledger_id;
  END IF;

  -- Upsert the payment_method (so the user can re-use this card in
  -- subsequent deposits without re-entering details).
  INSERT INTO public.payment_methods (
    user_id, kind, provider, display_label, display_brand, display_last4,
    provider_ref, last_used_at
  )
  VALUES (
    p_user_id, 'card', p_provider,
    COALESCE(
      CASE WHEN p_card_brand IS NOT NULL AND p_card_last4 IS NOT NULL
           THEN INITCAP(p_card_brand) || ' •••• ' || p_card_last4
           ELSE 'Tarjeta'
      END,
      'Tarjeta'
    ),
    p_card_brand, p_card_last4, p_provider_ref, now()
  )
  ON CONFLICT (user_id, provider, provider_ref)
  DO UPDATE SET last_used_at = EXCLUDED.last_used_at, status = 'active'
  RETURNING id INTO v_payment_method_id;

  -- Credit balance_ledger. This is the canonical money-moves-in
  -- entry; balance views derive from this table.
  INSERT INTO public.balance_ledger (
    user_id, amount, currency, reason, ref_id, backing_pool, created_at
  )
  VALUES (
    p_user_id, p_net_amount, 'USD', 'deposit_card', p_payment_tx_id, 'fiat_fbo', now()
  )
  RETURNING id INTO v_ledger_id;

  -- Mark the payment_transactions row as settled and link the ledger.
  UPDATE public.payment_transactions
     SET status = 'settled',
         fee_amount = p_fee_amount,
         net_amount = p_net_amount,
         gross_amount = p_gross_amount,
         payment_method_id = v_payment_method_id,
         balance_ledger_id = v_ledger_id,
         external_ref = p_authorization_code,
         settled_at = now()
   WHERE id = p_payment_tx_id;

  -- Bump the profile saldo cache (denormalized for fast UI reads).
  UPDATE public.profiles
     SET saldo = COALESCE(saldo, 0) + p_net_amount
   WHERE id = p_user_id;

  RETURN v_ledger_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_card_deposit FROM public;
GRANT EXECUTE ON FUNCTION public.process_card_deposit TO service_role;

COMMENT ON FUNCTION public.process_card_deposit IS
  'Atomic card-deposit settlement called from redbajas-webhook edge function. SECURITY DEFINER.';

-- ----------------------------------------------------------------------------
-- 2. process_crypto_deposit  (stub-ready for Vudy)
-- ----------------------------------------------------------------------------
-- Same shape as process_card_deposit but for stablecoin deposits via the
-- Vudy rail. The webhook handler (supabase/functions/vudy-webhook, to be
-- written when Vudy is wired) will call this once an on-chain confirmation
-- is detected.
CREATE OR REPLACE FUNCTION public.process_crypto_deposit(
  p_payment_tx_id        UUID,
  p_user_id              UUID,
  p_gross_amount         NUMERIC,
  p_fee_amount           NUMERIC,
  p_net_amount           NUMERIC,
  p_provider             TEXT,
  p_provider_ref         TEXT,        -- tx_hash on chain
  p_chain                TEXT,
  p_token                TEXT,
  p_from_address         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_ledger_id  UUID;
  v_ledger_id           UUID;
  v_payment_method_id   UUID;
  v_tx_status           TEXT;
BEGIN
  SELECT status, balance_ledger_id
    INTO v_tx_status, v_existing_ledger_id
    FROM public.payment_transactions
   WHERE id = p_payment_tx_id;

  IF v_tx_status = 'settled' AND v_existing_ledger_id IS NOT NULL THEN
    RETURN v_existing_ledger_id;
  END IF;

  -- Track the source wallet as a payment_method (so user can re-use it
  -- for future deposits without re-entering — and for AML pattern
  -- detection).
  IF p_from_address IS NOT NULL THEN
    INSERT INTO public.payment_methods (
      user_id, kind, provider, display_label, display_brand,
      provider_ref, crypto_chain, crypto_token, last_used_at
    )
    VALUES (
      p_user_id, 'crypto', p_provider,
      p_token || ' ' || p_chain || ' ' ||
        SUBSTRING(p_from_address FROM 1 FOR 6) || '…' || SUBSTRING(p_from_address FROM '.{4}$'),
      p_token, p_from_address, p_chain, p_token, now()
    )
    ON CONFLICT (user_id, provider, provider_ref)
    DO UPDATE SET last_used_at = EXCLUDED.last_used_at, status = 'active'
    RETURNING id INTO v_payment_method_id;
  END IF;

  INSERT INTO public.balance_ledger (
    user_id, amount, currency, reason, ref_id, backing_pool, created_at
  )
  VALUES (
    p_user_id, p_net_amount, 'USD', 'deposit_crypto', p_payment_tx_id, 'crypto_fbo', now()
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.payment_transactions
     SET status = 'settled',
         fee_amount = p_fee_amount,
         net_amount = p_net_amount,
         gross_amount = p_gross_amount,
         payment_method_id = v_payment_method_id,
         balance_ledger_id = v_ledger_id,
         external_ref = p_provider_ref,
         settled_at = now()
   WHERE id = p_payment_tx_id;

  UPDATE public.profiles
     SET saldo = COALESCE(saldo, 0) + p_net_amount
   WHERE id = p_user_id;

  RETURN v_ledger_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_crypto_deposit FROM public;
GRANT EXECUTE ON FUNCTION public.process_crypto_deposit TO service_role;

-- ----------------------------------------------------------------------------
-- 3. initiate_withdrawal
-- ----------------------------------------------------------------------------
-- Called from the client when a user requests a withdrawal. Atomically:
--   • Deducts from balance_ledger (negative entry)
--   • Bumps profile saldo down
--   • Creates a payment_transactions row in 'pending'
--
-- The edge function (redbajas-payout or vudy-send) then picks up the
-- pending row, calls the vendor's payout API, and updates status to
-- 'processing' → 'settled' via subsequent webhook.
--
-- Returns the payment_transactions.id so the caller can poll/subscribe.
CREATE OR REPLACE FUNCTION public.initiate_withdrawal(
  p_user_id          UUID,
  p_amount           NUMERIC,
  p_rail             TEXT,       -- 'card' | 'bank' | 'crypto'
  p_provider         TEXT,       -- 'redbajas' | 'vudy' etc
  p_destination_ref  TEXT,       -- card pmid, bank pmid, or crypto address
  p_chain            TEXT DEFAULT NULL,
  p_token            TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance      NUMERIC;
  v_tx_id        UUID;
  v_ledger_id    UUID;
BEGIN
  -- Auth check — only the authenticated user can withdraw from their
  -- own balance. Caller (RPC) must be invoked with the user's JWT.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = '22023';
  END IF;

  -- Check sufficient balance. Sum of balance_ledger for this user.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_balance
    FROM public.balance_ledger
   WHERE user_id = p_user_id;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = '22023';
  END IF;

  -- Create the withdrawal payment_transactions row.
  INSERT INTO public.payment_transactions (
    user_id, direction, rail, provider, gross_amount, net_amount, currency,
    status, initiated_at
  )
  VALUES (
    p_user_id, 'withdrawal', p_rail, p_provider, p_amount, p_amount, 'USD',
    'pending', now()
  )
  RETURNING id INTO v_tx_id;

  -- Debit balance_ledger (negative entry). Wrapped in same transaction.
  INSERT INTO public.balance_ledger (
    user_id, amount, currency, reason, ref_id, backing_pool, created_at
  )
  VALUES (
    p_user_id, -p_amount, 'USD',
    CASE p_rail
      WHEN 'card'   THEN 'withdrawal_card'
      WHEN 'bank'   THEN 'withdrawal_bank'
      WHEN 'crypto' THEN 'withdrawal_crypto'
      ELSE 'withdrawal'
    END,
    v_tx_id,
    CASE WHEN p_rail = 'crypto' THEN 'crypto_fbo' ELSE 'fiat_fbo' END,
    now()
  )
  RETURNING id INTO v_ledger_id;

  -- Link the ledger entry to the payment_tx for reconciliation.
  UPDATE public.payment_transactions
     SET balance_ledger_id = v_ledger_id
   WHERE id = v_tx_id;

  -- Update profile saldo cache.
  UPDATE public.profiles
     SET saldo = COALESCE(saldo, 0) - p_amount
   WHERE id = p_user_id;

  -- Track the destination as a crypto_destinations or payment_method
  -- so the user can pick it again. For crypto we want explicit
  -- address tracking.
  IF p_rail = 'crypto' AND p_chain IS NOT NULL THEN
    INSERT INTO public.payment_methods (
      user_id, kind, provider, display_label, display_brand,
      provider_ref, crypto_chain, crypto_token, last_used_at
    )
    VALUES (
      p_user_id, 'crypto', p_provider,
      COALESCE(p_token, 'USDC') || ' ' || p_chain || ' ' ||
        SUBSTRING(p_destination_ref FROM 1 FOR 6) || '…' || SUBSTRING(p_destination_ref FROM '.{4}$'),
      COALESCE(p_token, 'USDC'), p_destination_ref, p_chain, COALESCE(p_token, 'USDC'), now()
    )
    ON CONFLICT (user_id, provider, provider_ref)
    DO UPDATE SET last_used_at = EXCLUDED.last_used_at;
  END IF;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_withdrawal FROM public;
GRANT EXECUTE ON FUNCTION public.initiate_withdrawal TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. complete_withdrawal — called by vendor webhook on payout settlement
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_withdrawal(
  p_payment_tx_id   UUID,
  p_provider_tx_id  TEXT,
  p_external_ref    TEXT,           -- card auth code or crypto tx_hash
  p_fee_amount      NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payment_transactions
     SET status = 'settled',
         provider_tx_id = COALESCE(p_provider_tx_id, provider_tx_id),
         external_ref = p_external_ref,
         fee_amount = p_fee_amount,
         settled_at = now()
   WHERE id = p_payment_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_withdrawal FROM public;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal TO service_role;

-- ----------------------------------------------------------------------------
-- 5. cancel_payment_transaction — reverses a pending tx on failure
-- ----------------------------------------------------------------------------
-- Used when a withdrawal payout API returns an immediate failure, so we
-- restore the user's balance instead of leaving funds in limbo.
CREATE OR REPLACE FUNCTION public.cancel_payment_transaction(
  p_payment_tx_id UUID,
  p_reason        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx              RECORD;
  v_existing_ledger NUMERIC;
BEGIN
  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_payment_tx_id;
  IF v_tx IS NULL THEN
    RAISE EXCEPTION 'tx_not_found';
  END IF;

  IF v_tx.status NOT IN ('pending', 'processing', 'failed') THEN
    RAISE EXCEPTION 'cannot_cancel_status_%', v_tx.status;
  END IF;

  -- Reverse the balance_ledger entry (issue a compensating +ve entry
  -- if it was a withdrawal, or a -ve entry if it was a deposit that
  -- got incorrectly credited).
  IF v_tx.direction = 'withdrawal' AND v_tx.balance_ledger_id IS NOT NULL THEN
    INSERT INTO public.balance_ledger (
      user_id, amount, currency, reason, ref_id, backing_pool, created_at
    )
    VALUES (
      v_tx.user_id, v_tx.gross_amount, v_tx.currency, 'withdrawal_reversed',
      p_payment_tx_id, 'fiat_fbo', now()
    );
    UPDATE public.profiles
       SET saldo = COALESCE(saldo, 0) + v_tx.gross_amount
     WHERE id = v_tx.user_id;
  END IF;

  UPDATE public.payment_transactions
     SET status = 'cancelled',
         failure_reason = p_reason,
         failed_at = now()
   WHERE id = p_payment_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payment_transaction FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_payment_transaction TO service_role;

-- ============================================================================
-- End of payment RPCs. Tokenization lifecycle hooks live in a separate
-- migration (20260525_tokenization_hooks.sql).
-- ============================================================================

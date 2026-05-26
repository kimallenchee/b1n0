-- ============================================================================
-- Payment rail feature flags
--
-- Granular on/off switches for each rail × direction combination. Each
-- defaults to 'false' so the UI shows "Próximamente" until Kim signs
-- the vendor and flips the flag.
--
-- platform_config has two value columns:
--   value      NUMERIC   — for fee rates / percentages
--   value_text TEXT      — for UUIDs, URLs, feature flags
--
-- We use value_text for these (they're 'true' / 'false' strings).
--
-- Reading: SELECT value_text FROM platform_config WHERE key = '...'
-- Toggling: UPDATE platform_config SET value_text='true' WHERE key='...';
--
-- The WalletSheet UI reads these on mount via usePaymentFlags hook.
-- ============================================================================

INSERT INTO public.platform_config (key, value, value_text, label)
VALUES
  -- Card rail (Pagadito via Redbajas). Flip on once b1n0 has its OWN
  -- Pagadito contract + production credentials live in Supabase secrets.
  ('card_deposits_enabled',    NULL, 'false', 'Show "Tarjeta" as a deposit option. False = "Próximamente" badge.'),
  ('card_withdrawals_enabled', NULL, 'false', 'Show "Tarjeta" as a withdrawal option.'),

  -- Bank rail (SPEI / wire / ACH — manual admin processing today, vendor
  -- integration later). Decoupled from cards because the contracting +
  -- compliance path is different (bank account onboarding vs card processor).
  ('bank_deposits_enabled',    NULL, 'false', 'Show "Cuenta bancaria" as a deposit option.'),
  ('bank_withdrawals_enabled', NULL, 'false', 'Show "Cuenta bancaria" as a withdrawal option.'),

  -- Crypto rail (Vudy). Flip on once Vudy contract + custody arrangement
  -- (Monetae or Fir
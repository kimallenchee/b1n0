-- ============================================================================
-- Payment rail feature flags
--
-- Granular on/off switches for each rail × direction combination. Each
-- defaults to 'false' so the UI shows "Próximamente" until Kim signs
-- the vendor and flips the flag.
--
-- Reading: SELECT value FROM platform_config WHERE key IN (...)
-- Toggling: UPDATE platform_config SET value='true' WHERE key='...';
--
-- The WalletSheet UI reads these on mount (no realtime — flags change
-- rarely and a page refresh is acceptable).
-- ============================================================================

INSERT INTO public.platform_config (key, value, label)
VALUES
  -- Card rail (Pagadito via Redbajas). Flip on once b1n0 has its OWN
  -- Pagadito contract + production credentials live in Supabase secrets.
  ('card_deposits_enabled',  'false', 'Show "Tarjeta" as a deposit option. False = "Próximamente" badge.'),
  ('card_withdrawals_enabled','false', 'Show "Tarjeta" as a withdrawal option.'),

  -- Bank rail (SPEI / wire / ACH — manual admin processing today, vendor
  -- integration later). Decoupled from cards because the contracting +
  -- compliance path is different (bank account onboarding vs card processor).
  ('bank_deposits_enabled',   'false', 'Show "Cuenta bancaria" as a deposit option.'),
  ('bank_withdrawals_enabled','false', 'Show "Cuenta bancaria" as a withdrawal option.'),

  -- Crypto rail (Vudy). Flip on once Vudy contract + custody arrangement
  -- (Monetae or Fireblocks-direct) are in place.
  ('crypto_deposits_enabled',  'false', 'Show "Stablecoin" as a deposit option.'),
  ('crypto_withdrawals_enabled','false', 'Show "Stablecoin" as a withdrawal option.')
ON CONFLICT (key) DO NOTHING;

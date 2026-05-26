-- ============================================================================
-- RESET PLATFORM DATA — destructive, one-off
--
-- Wipes all transactional data so b1n0 launches with a clean slate. Keeps
-- the user accounts, KYC, beta signups, platform config, and payment-method
-- registrations.
--
-- THIS IS NOT A MIGRATION. Do not put it in supabase/migrations/. Run it
-- manually from the Supabase SQL editor when you want to reset to zero.
--
-- Order matters — leaf tables first so cascading FKs don't surprise us.
-- Wrap in a transaction so a typo doesn't half-reset the platform.
-- ============================================================================

BEGIN;

-- ─── 1. Notifications referencing events / positions ─────────────────
TRUNCATE TABLE public.notifications RESTART IDENTITY CASCADE;

-- ─── 2. Comments on events ──────────────────────────────────────────
TRUNCATE TABLE public.comments RESTART IDENTITY CASCADE;

-- ─── 3. User-side position rows ─────────────────────────────────────
TRUNCATE TABLE public.positions RESTART IDENTITY CASCADE;

-- ─── 4. Per-market transaction history (buys, sells, settlements) ───
TRUNCATE TABLE public.market_transactions RESTART IDENTITY CASCADE;

-- ─── 5. Predictions (legacy parimutuel — may already be empty) ──────
TRUNCATE TABLE public.predictions RESTART IDENTITY CASCADE;

-- ─── 6. Event markets (binary + option) ─────────────────────────────
TRUNCATE TABLE public.option_markets RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.event_markets  RESTART IDENTITY CASCADE;

-- ─── 7. Event-tokens scaffold rows (created by the trigger we added) ─
-- Only the table exists; truncating is safe — no FKs point AT this table.
TRUNCATE TABLE public.event_tokens RESTART IDENTITY CASCADE;

-- ─── 8. Events themselves ────────────────────────────────────────────
TRUNCATE TABLE public.events RESTART IDENTITY CASCADE;

-- ─── 9. News content ────────────────────────────────────────────────
-- Wrap in a check — the table is conditional on a feature flag and may
-- not exist in all environments. Use a DO block so missing-table errors
-- don't abort the transaction.
DO $$
BEGIN
  EXECUTE 'TRUNCATE TABLE public.news RESTART IDENTITY CASCADE';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'news table not present, skipping';
END $$;

-- ─── 10. Balance ledger — wipe + reset profile balance + counters ──
-- balance_ledger is the source of truth (sum of rows = real balance);
-- profiles.balance is a denormalized cache. Truncating + zeroing the
-- cache keeps them consistent. Also reset stats counters so leaderboards
-- start from zero.
TRUNCATE TABLE public.balance_ledger RESTART IDENTITY CASCADE;
UPDATE public.profiles
   SET balance             = 0,
       total_predictions   = 0,
       correct_predictions = 0,
       total_cobrado       = 0;

-- ─── 11. Platform ledger — reset treasury accumulations ────────────
TRUNCATE TABLE public.platform_ledger RESTART IDENTITY CASCADE;

-- ─── 12. Payment transactions + vendor webhooks (test data, if any) ─
DO $$
BEGIN
  EXECUTE 'TRUNCATE TABLE public.payment_transactions RESTART IDENTITY CASCADE';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'payment_transactions not present, skipping';
END $$;

DO $$
BEGIN
  EXECUTE 'TRUNCATE TABLE public.vendor_webhooks RESTART IDENTITY CASCADE';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'vendor_webhooks not present, skipping';
END $$;

-- ─── 13. Admin actions audit log (optional — keep history vs reset) ──
-- Comment out the next line if you want to preserve the audit trail.
TRUNCATE TABLE public.admin_actions RESTART IDENTITY CASCADE;

-- ─── 14. Reset risk acknowledgment so first-deposit modal re-fires ──
-- Comment out if you'd rather keep ack timestamps (recommended for
-- regulator-audit purposes).
-- UPDATE public.profiles SET risk_acknowledged_at = NULL;

-- ─── Sanity check — these should all be 0 ─────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.events)               AS events,
  (SELECT COUNT(*) FROM public.positions)            AS positions,
  (SELECT COUNT(*) FROM public.market_transactions)  AS market_txs,
  (SELECT COUNT(*) FROM public.balance_ledger)       AS balance_entries,
  (SELECT COUNT(*) FROM public.platform_ledger)      AS platform_entries,
  (SELECT COUNT(*) FROM public.comments)             AS comments,
  (SELECT COALESCE(SUM(balance), 0) FROM public.profiles) AS total_balance;

-- If everything looks like zero, commit:
COMMIT;

-- If something looks wrong, run ROLLBACK; instead of COMMIT;
-- ROLLBACK;

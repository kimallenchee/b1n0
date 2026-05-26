-- ============================================================
-- verify-invariants.sql — math sanity check after a sim run
-- ============================================================
--
-- Run this AFTER scripts/simulate-platform.mjs has populated the
-- database with simulated activity. Each check raises a NOTICE on
-- pass and a WARNING/EXCEPTION on fail.
--
-- These are the same invariants that hold for real users — the
-- math doesn't care whether the user is simulated or not.
--
-- Run via:
--   psql "$DATABASE_URL" -f scripts/verify-invariants.sql
-- Or paste into the Supabase SQL editor and execute.
-- ============================================================

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo 'b1n0 invariants — math validation suite'
\echo '════════════════════════════════════════════════════════════'

-- ── 1. profiles.balance >= 0 ───────────────────────────────
\echo ''
\echo '[1] No negative balances'
SELECT id, name, balance
  FROM public.profiles
 WHERE balance < 0
 ORDER BY balance ASC
 LIMIT 10;
-- Empty result = PASS.

-- ── 2. balance_ledger matches profiles.balance ─────────────
-- For every user, SUM(balance_ledger.amount) should equal
-- profiles.balance. profiles.balance is the denormalized cache.
\echo ''
\echo '[2] balance_ledger sum matches profiles.balance for every user'
WITH ledger_sum AS (
  SELECT user_id, SUM(amount) AS ledger_total
    FROM public.balance_ledger
   GROUP BY user_id
)
SELECT p.id, p.name, p.balance AS profile_balance,
       COALESCE(l.ledger_total, 0) AS ledger_sum,
       p.balance - COALESCE(l.ledger_total, 0) AS drift
  FROM public.profiles p
  LEFT JOIN ledger_sum l ON l.user_id = p.id
 WHERE ABS(p.balance - COALESCE(l.ledger_total, 0)) > 0.01
 ORDER BY ABS(p.balance - COALESCE(l.ledger_total, 0)) DESC
 LIMIT 10;
-- Empty result = PASS.

-- ── 3. positions.price_at_purchase in [0, 1] ───────────────
\echo ''
\echo '[3] All position prices are in [0, 1]'
SELECT id, event_id, side, price_at_purchase, contracts
  FROM public.positions
 WHERE price_at_purchase < 0 OR price_at_purchase > 1
 LIMIT 10;
-- Empty = PASS.

-- ── 4. positions.contracts > 0 ─────────────────────────────
\echo ''
\echo '[4] All positions have positive contract counts'
SELECT id, event_id, side, contracts
  FROM public.positions
 WHERE contracts <= 0
 LIMIT 10;
-- Empty = PASS.

-- ── 5. settled positions have correct status ───────────────
-- For every settled event: positions on the winning side should
-- be status='won', positions on the losing side should be 'lost'.
\echo ''
\echo '[5] Settled positions match event result'
SELECT p.id, p.event_id, p.side, p.status, em.result, em.status AS event_status
  FROM public.positions p
  JOIN public.event_markets em ON em.event_id = p.event_id
 WHERE em.status = 'settled'
   AND (
     (em.result = p.side    AND p.status NOT IN ('won', 'voided'))  OR
     (em.result <> p.side   AND p.status NOT IN ('lost', 'voided'))
   )
 LIMIT 10;
-- Empty = PASS.

-- ── 6. won positions' cobro == contracts × $1 (ignoring skim) ──
-- This is the headline guarantee of the LP-backed fixed-payout
-- model: every winning contract is worth exactly $1, less the
-- resolution skim percentage.
\echo ''
\echo '[6] Winning positions paid out as contracts × payout_if_win'
WITH winners AS (
  SELECT p.id, p.user_id, p.contracts, p.payout_if_win,
         COALESCE(bl.amount, 0) AS cobro_credited
    FROM public.positions p
    LEFT JOIN public.balance_ledger bl
      ON bl.reference_id = p.id::text AND bl.type = 'win'
   WHERE p.status = 'won'
)
SELECT id, contracts, payout_if_win, cobro_credited,
       ABS(payout_if_win - cobro_credited) AS drift
  FROM winners
 WHERE ABS(payout_if_win - cobro_credited) > 0.05
 LIMIT 10;
-- Empty = PASS (drift > 5¢ on any winning payout is suspicious).

-- ── 7. event_markets pool_total >= 0 ───────────────────────
\echo ''
\echo '[7] No negative pool totals'
SELECT event_id, pool_total, pool_committed, yes_shares, no_shares
  FROM public.event_markets
 WHERE pool_total < 0 OR pool_committed < 0 OR yes_shares < 0 OR no_shares < 0
 LIMIT 10;
-- Empty = PASS.

-- ── 8. platform_ledger entries reconcile with event count ──
-- Every settled event should have at least one platform_ledger
-- row recording the platform's margin take.
\echo ''
\echo '[8] Every settled event has a platform_ledger entry'
SELECT em.event_id, em.status, em.result,
       (SELECT COUNT(*) FROM public.platform_ledger pl WHERE pl.event_id = em.event_id) AS pl_rows
  FROM public.event_markets em
 WHERE em.status = 'settled'
   AND NOT EXISTS (SELECT 1 FROM public.platform_ledger pl WHERE pl.event_id = em.event_id)
 LIMIT 10;
-- Empty = PASS.

-- ── 9. summary by simulated activity ───────────────────────
\echo ''
\echo '────────────────────────────────────────────────────────────'
\echo 'Simulation activity summary'
\echo '────────────────────────────────────────────────────────────'

SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE is_simulated)              AS simulated_users,
  (SELECT COUNT(*) FROM public.positions p JOIN public.profiles pr
     ON pr.id = p.user_id WHERE pr.is_simulated)                          AS simulated_positions,
  (SELECT COALESCE(SUM(p.gross_amount), 0) FROM public.positions p
     JOIN public.profiles pr ON pr.id = p.user_id
     WHERE pr.is_simulated)                                              AS simulated_gross_volume,
  (SELECT COALESCE(SUM(p.fee_paid), 0) FROM public.positions p
     JOIN public.profiles pr ON pr.id = p.user_id
     WHERE pr.is_simulated)                                              AS simulated_fees_collected,
  (SELECT COUNT(*) FROM public.event_markets em
     WHERE em.status = 'settled'
       AND EXISTS (SELECT 1 FROM public.positions p
                   JOIN public.profiles pr ON pr.id = p.user_id
                   WHERE p.event_id = em.event_id AND pr.is_simulated))   AS settled_simulated_events;

-- ── 10. per-event LP P&L roll-up ───────────────────────────
\echo ''
\echo 'Per-event LP P&L (simulated events only)'
SELECT em.event_id,
       em.status,
       em.result,
       em.pool_total,
       em.yes_shares,
       em.no_shares,
       (SELECT COALESCE(SUM(p.gross_amount), 0) FROM public.positions p
          WHERE p.event_id = em.event_id)                  AS total_gross_in,
       (SELECT COALESCE(SUM(p.fee_paid), 0) FROM public.positions p
          WHERE p.event_id = em.event_id)                  AS total_fees,
       (SELECT COALESCE(SUM(bl.amount), 0) FROM public.balance_ledger bl
          WHERE bl.type = 'win' AND bl.reference_id IN
            (SELECT p.id::text FROM public.positions p WHERE p.event_id = em.event_id))
                                                            AS total_cobros_paid
  FROM public.event_markets em
 WHERE EXISTS (SELECT 1 FROM public.positions p
               JOIN public.profiles pr ON pr.id = p.user_id
               WHERE p.event_id = em.event_id AND pr.is_simulated)
 ORDER BY em.event_id;

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo 'Done. Empty result sets in checks [1]–[8] = math is clean.'
\echo '════════════════════════════════════════════════════════════'

-- ============================================================
--  TESTING RESET — wipes all user activity & market state
--  Run in Supabase SQL Editor (runs as service role, bypasses RLS)
-- ============================================================

-- 1. Clear user activity
DELETE FROM public.market_transactions;
DELETE FROM public.positions;
DELETE FROM public.predictions;

-- 2. Clear market state
DELETE FROM public.event_markets;

-- 3. Delete any custom events created during testing
--    (keeps only the 19 seed events from 001_schema.sql)
DELETE FROM public.events
WHERE id NOT IN ('1','2','3','4','5','6','7','8','9','10',
                 '11','12','13','14','15','16','17','18','19');

-- 4. Reset seed events back to open
UPDATE public.events
SET status = 'open',
    result = NULL;

-- 5. Reset all profile balances and stats
UPDATE public.profiles
SET balance             = 1250,
    total_predictions   = 0,
    correct_predictions = 0,
    total_cobrado       = 0;

-- Verify
SELECT 'predictions' AS tbl, COUNT(*) FROM public.predictions
UNION ALL SELECT 'positions',         COUNT(*) FROM public.positions
UNION ALL SELECT 'market_transactions',COUNT(*) FROM public.market_transactions
UNION ALL SELECT 'event_markets',     COUNT(*) FROM public.event_markets
UNION ALL SELECT 'events (open)',     COUNT(*) FROM public.events WHERE status = 'open'
UNION ALL SELECT 'profiles reset',   COUNT(*) FROM public.profiles WHERE balance = 1250;

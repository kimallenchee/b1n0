# LEDGER_INVARIANTS.md

The five invariants that must hold for b1n0 to be considered solvent.
This document is the source of truth for what reconciliation checks
verify, what HealthPanel displays, and what the nightly cron alerts on.

If any of these break in production, **freeze withdrawals before
investigating**. A discrepancy in the ledger is louder than a silent
loss of funds.

| #   | Name                | What it checks                                                                                                          | Tolerance | Page that watches it |
| :-- | :------------------ | :---------------------------------------------------------------------------------------------------------------------- | :-------- | :------------------- |
| 1   | Ledger-to-balance   | Every credit/debit to a profile flows through balance_ledger                                                            | Q0.50     | HealthPanel · cron   |
| 2   | Conservation        | Money in = money parked + money in motion                                                                               | Q0.50     | HealthPanel · cron   |
| 3   | Treasury accounting | Treasury balance = sum of treasury ledger entries                                                                       | Q0.50     | cron                 |
| 4   | Per-event solvency  | No market can owe more than its backing                                                                                 | Q1.00     | cron                 |
| 5   | Spread accounting   | gross paid by user = net to pool + fee + spread captured                                                                | Q0.50     | cron (informational) |

The Q-cents tolerances exist because Postgres `numeric(14,4)` math
rounds to the fourth decimal but `numeric(12,2)` rounds to the second.
Anything past those tolerances is a real discrepancy, not rounding.

---

## Invariant 1 — Ledger-to-balance

**Statement.** For every user (including the treasury account), the
running sum of `balance_ledger.amount` rows equals their current
`profiles.balance`. Equivalently, every credit or debit to a profile
balance must be journaled in `balance_ledger`.

**Why it matters.** This is the most fundamental ledger property — a
break here means an `UPDATE profiles SET balance = …` ran somewhere
without a matching ledger entry, which is the single fastest way to
silently lose money in a financial system.

**SQL check (per-user).**

```sql
SELECT
  p.id,
  p.balance                  AS profile_balance,
  COALESCE(SUM(l.amount), 0) AS ledger_sum,
  ROUND(p.balance - COALESCE(SUM(l.amount), 0), 4) AS delta
FROM public.profiles p
LEFT JOIN public.balance_ledger l ON l.user_id = p.id
GROUP BY p.id, p.balance
HAVING ABS(p.balance - COALESCE(SUM(l.amount), 0)) > 0.50
ORDER BY ABS(p.balance - COALESCE(SUM(l.amount), 0)) DESC;
```

Empty result set ⇒ invariant holds.

**SQL check (aggregate).**

```sql
SELECT
  (SELECT COALESCE(SUM(amount), 0) FROM public.balance_ledger) AS ledger_sum,
  (SELECT COALESCE(SUM(balance), 0) FROM public.profiles)      AS balance_sum,
  ROUND(
    (SELECT COALESCE(SUM(amount), 0) FROM public.balance_ledger)
    -
    (SELECT COALESCE(SUM(balance), 0) FROM public.profiles)
  , 4) AS delta;
```

**Threshold.** `|delta| > 0.50` is broken.

**If it breaks.**

1. Freeze withdrawals (set `platform_config.withdraw_paused = 1`).
2. Run the per-user query above to find which profile drifted.
3. Look at recent direct `UPDATE profiles SET balance` writes — these
   should not exist outside `admin_adjust_balance` and the audited RPCs.
4. Don't "correct" the balance. Find the missing or extra ledger entry
   and journal a compensating row that explains why.

---

## Invariant 2 — Conservation of money

**Statement.** All money that has ever entered the platform sits in
exactly one of three places: liquid account balances (users + treasury)
or money committed to active markets.

```
deposits − withdrawals = sum(profile.balance) + money_in_active_markets
```

`money_in_active_markets` is implicit — we derive it from the
identity above rather than measuring it directly, because the
positions table doesn't store the spread that the AMM captures
(see invariant 5). This is the same formula HealthPanel uses for
"En posiciones".

**Why it matters.** This proves the platform isn't holding more
liability than it took in deposits. If `deposits − withdrawals` is
less than `sum(balance)`, we've credited money out of thin air.

**SQL check.**

```sql
WITH ledger AS (
  SELECT
    SUM(CASE WHEN type = 'deposit'  THEN amount ELSE 0 END) AS deposits,
    SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END) AS withdrawals
  FROM public.balance_ledger
),
balances AS (
  SELECT SUM(balance) AS total FROM public.profiles
)
SELECT
  ledger.deposits,
  ledger.withdrawals,
  (ledger.deposits + ledger.withdrawals)         AS net_deposits,
  balances.total                                  AS total_balances,
  (ledger.deposits + ledger.withdrawals)
    - balances.total                              AS implied_money_in_positions
FROM ledger, balances;
```

`withdraw` amounts are stored as negative numbers in `balance_ledger`,
so `deposits + withdrawals` is the net.

**Threshold.** `implied_money_in_positions` should always be `≥ 0`. A
negative value means we've paid out more than was deposited, which is
catastrophic. A positive value with no active positions means money is
trapped somewhere (also bad). Compare against:

```sql
SELECT SUM(gross_amount - fee_paid) AS position_table_net
FROM public.positions WHERE status = 'active';
```

`position_table_net` will overstate `implied_money_in_positions` by
exactly the cumulative `spread_captured` on the active positions
(see invariant 5). That difference is **expected** and should be
non-negative.

**If it breaks.**

1. Same as invariant 1 — freeze withdrawals.
2. If implied is negative, audit settlements: a `settle_predictions`
   call may have over-paid winners or paid the wrong side.
3. If implied is way higher than position table net, look for sales
   (`execute_sell`) that closed positions but didn't refund the user.

---

## Invariant 3 — Treasury accounting

**Statement.** The treasury account's running ledger balance equals
its `profiles.balance`. This is invariant 1 applied to the single
treasury row, but called out separately because the treasury sees
many more credit types than a regular user (`fee_revenue`, `skim`,
spread captures, sweeps) and is the most likely place for an
accounting bug to hide.

**SQL check.**

```sql
WITH treasury_id_row AS (
  SELECT value_text::uuid AS id
  FROM public.platform_config
  WHERE key = 'treasury_account_id'
)
SELECT
  (SELECT balance FROM public.profiles
    WHERE id = (SELECT id FROM treasury_id_row))                AS profile_balance,
  (SELECT COALESCE(SUM(amount), 0) FROM public.balance_ledger
    WHERE user_id = (SELECT id FROM treasury_id_row))           AS ledger_sum,
  (SELECT balance FROM public.profiles
    WHERE id = (SELECT id FROM treasury_id_row))
  -
  (SELECT COALESCE(SUM(amount), 0) FROM public.balance_ledger
    WHERE user_id = (SELECT id FROM treasury_id_row))           AS delta;
```

**Threshold.** `|delta| > 0.50` is broken.

**If it breaks.**

1. Compare `sum(market_transactions.fee_deducted)` against
   `sum(balance_ledger.amount)` on treasury where type = 'fee_revenue'.
   If those don't match, `sweep_to_treasury` missed a batch.
2. Run `SELECT public.sweep_to_treasury();` to retry.
3. If they still differ, an admin tampered with the treasury row
   directly — audit the `is_admin` trigger logs.

---

## Invariant 4 — Per-event solvency

**Statement.** No active market can have committed more payout than
its backing capital. Backing comes from the sponsor pool seed (100%
of `sponsor_amount` lands in `pool_total` — the platform takes
nothing from sponsor money by design) plus all active LP deposits
for that event.

```
pool_committed ≤ pool_total + sum(active lp_deposits.amount)
```

Where `pool_total = sponsor_amount` for sponsored events. The
`sponsor_margin_pct` config key exists for historical reasons but
should remain at 0 — any non-zero value means the platform is
skimming sponsor money before it reaches the pool, which violates
the design.

**Why it matters.** If a market's worst-case payout exceeds its
backing, the platform takes a loss to make winners whole. The
purchase RPCs already enforce this at write time
(`IF v_max_lia > v_market.pool_total` rejection), but a configuration
change or schema drift could let this slip. We check at rest too.

**SQL check.**

```sql
WITH backing AS (
  SELECT
    em.event_id,
    em.pool_committed,
    em.pool_total,
    COALESCE((
      SELECT SUM(amount) FROM public.lp_deposits lp
      WHERE lp.event_id = em.event_id AND lp.status = 'active'
    ), 0) AS lp_backing
  FROM public.event_markets em
  WHERE em.status = 'open'
)
SELECT
  event_id,
  pool_committed,
  pool_total,
  lp_backing,
  ROUND(pool_committed - (pool_total + lp_backing), 4) AS overshoot
FROM backing
WHERE pool_committed > (pool_total + lp_backing) + 1.00
ORDER BY overshoot DESC;
```

**Threshold.** Tolerance is Q1.00 here (looser than the others)
because pool_total is `numeric(14,4)` and committed liability rounds
during purchase math; an Q0.50 tolerance produces false positives on
markets right at capacity.

**If it breaks.**

1. The market is technically insolvent — close it before more bets
   stack on top: `UPDATE event_markets SET status = 'closed' WHERE event_id = ?;`.
2. Resolve it manually with a fair outcome and accept the loss.
3. Audit recent `execute_purchase` calls on that event for the bug
   that bypassed the liability check.

---

## Invariant 5 — Spread accounting

**Statement.** For every successful purchase, the gross amount the
user paid is split exactly three ways:

```
gross_amount = net_to_pool + fee_deducted + spread_captured
```

`net_to_pool` is what the bet pool gets, `fee_deducted` is the
transaction fee that goes to treasury, and `spread_captured` is the
AMM's bid-ask spread profit (also goes to treasury via sweep).

**Why it matters.** The positions table records `gross_amount` and
`fee_paid` only — there is no `spread_paid` column on `positions`.
That is the gap that confused HealthPanel until we switched to the
implicit conservation formula (invariant 2). This invariant verifies
the underlying source of truth (`market_transactions`) is internally
consistent.

**SQL check.**

```sql
SELECT
  id,
  gross_amount,
  fee_deducted,
  net_to_pool,
  spread_captured,
  ROUND(gross_amount - (net_to_pool + fee_deducted + COALESCE(spread_captured, 0)), 4) AS delta
FROM public.market_transactions
WHERE success = true
  AND tx_type = 'purchase'
  AND ABS(gross_amount - (net_to_pool + fee_deducted + COALESCE(spread_captured, 0))) > 0.50
ORDER BY ABS(gross_amount - (net_to_pool + fee_deducted + COALESCE(spread_captured, 0))) DESC
LIMIT 50;
```

**Threshold.** `|delta| > 0.50` per row is broken.

**Tech debt — flag.**

The `positions` row stores only `gross_amount` and `fee_paid`. There
is no `spread_paid` column on `positions`, so anything reading from
that table alone (admin panels, exports, client-side estimates) has
to either (a) join `market_transactions` to recover the spread or
(b) accept that it's working with overstated user-funded liability.

A future pass should add a `spread_paid numeric(14,4)` column to
`positions` populated by `execute_purchase`. Backfill it from
`market_transactions.spread_captured` for historical rows. Once that
exists, invariant 2's implicit derivation can be replaced with a
direct sum over positions, and HealthPanel's "En posiciones" card
won't need the explanatory caveat.

**If it breaks.**

1. Bug in `execute_purchase`: the math that splits `gross_amount`
   into the three buckets is wrong. Look at recent migrations that
   touched the function.
2. Spread captures from purchase paths that never wrote to
   `market_transactions` — older RPC versions did this. Sweep them
   with `SELECT public.sweep_to_treasury();` and re-check.

---

## Reconciliation cadence

| When                        | What                                                                      | Where it lives                       |
| :-------------------------- | :------------------------------------------------------------------------ | :----------------------------------- |
| On every admin page load    | Invariants 1 and 2 (HealthPanel)                                          | `src/components/admin/HealthPanel.tsx` |
| Nightly at 03:00 UTC        | All five invariants, results logged to `reconciliation_log`               | pg_cron job `nightly-reconciliation` |
| On critical drift           | Sentry alert via `reconciliation-alert` Edge Function                     | `supabase/functions/reconciliation-alert` |
| On demand                   | Manual "Run reconciliation now" button in HealthPanel                     | calls `run_reconciliation()` RPC     |

The `reconciliation_log` table keeps every nightly run for trend
analysis. HealthPanel sparkline reads the last 7 days from that table.

---

## Status thresholds

The `run_reconciliation()` function classifies each run as:

| Status     | Triggered when                                              | Action                                  |
| :--------- | :---------------------------------------------------------- | :-------------------------------------- |
| `ok`       | All deltas under Q0.50                                      | Log only                                |
| `warning`  | Any delta between Q0.50 and Q5.00                           | Log; surface in HealthPanel             |
| `critical` | Any delta over Q5.00                                        | Log; fire Sentry alert via Edge Function |

Q5.00 is the current critical threshold. Tighten as transaction volume
grows (real production should be much closer to Q0.50 once spread
accounting is direct).

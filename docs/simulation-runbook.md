# Simulation runbook — math validation before real users

Internal harness to stress-test b1n0 with mock users + mock activity, **without touching real accounts or real money.** Use this whenever you want to validate the math holds before pointing 50 real beta users at the platform.

## What it does

End-to-end, the harness:

1. Spawns N simulated users (default 50) with random prefunded balances
2. Picks the M newest open events (default 5)
3. Runs a randomized purchase stream — mixed SÍ/NO, varied amounts respecting `min_entry` / `max_entry`, gated on tier
4. Occasionally sells positions mid-event (~20% chance per buy)
5. Optionally resolves each event with a coin-flip outcome
6. Prints a stats report
7. You run `verify-invariants.sql` to confirm the math closes

Every simulated action goes through the **real** `execute_purchase` / `execute_sell` / `settle_event` RPCs. We are not faking the math, only faking the user identities.

## Prerequisites

1. **Migration applied.** Apply `supabase/migrations/20260527_simulation_helpers.sql` via the Supabase SQL editor or CLI. This adds:
   - `profiles.is_simulated` boolean column
   - `admin_spawn_simulated_user(username, balance, tier)` RPC
   - `admin_simulate_purchase(user_id, event_id, side, amount)` RPC
   - `admin_simulate_sell(position_id)` RPC
   - `admin_wipe_simulated()` cleanup RPC
2. **At least M open events.** Create them via `/admin` first (or whatever you want to stress-test).
3. **Environment variables.** The orchestrator needs:
   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — service-role secret (find at https://supabase.com/dashboard/project/bebdvsdiqlruqzmkvmgy/settings/api). **Never commit this.**

## Run a simulation

```bash
SUPABASE_URL=https://bebdvsdiqlruqzmkvmgy.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/simulate-platform.mjs \
  --users 50 \
  --events 5 \
  --buys-per-event 30 \
  --sells-per-event 8 \
  --resolve \
  --seed 42
```

Flags:

| Flag | Default | Meaning |
|---|---|---|
| `--users N` | 50 | Number of mock users to spawn |
| `--events N` | 5 | How many open events to target |
| `--buys-per-event N` | 30 | Purchase attempts per event |
| `--sells-per-event N` | 8 | Minimum sells per event |
| `--resolve` | off | Resolve each event coin-flip + settle |
| `--seed N` | timestamp | Deterministic RNG seed for replays |

The script prints progress as it runs and a summary report at the end.

## Verify invariants

After the sim, run:

```bash
psql "$DATABASE_URL" -f scripts/verify-invariants.sql
```

(or paste it into the Supabase SQL editor and execute).

It runs 8 checks + 2 summary roll-ups. **Empty result sets in checks [1]–[8] = math is clean.** Any rows that come back are violations — investigate before shipping.

The summary roll-ups show simulated user count, total volume, fees collected, settled events, and per-event LP P&L.

## Cleanup

When you're done:

```sql
SELECT admin_wipe_simulated();
```

That cascade-deletes every simulated user from `auth.users`, which cascades to their `profiles`, `positions`, `balance_ledger`, `market_transactions`, `comments`, and `notifications`. Returns a count of what was removed.

`platform_ledger` and `event_markets` rows for events touched by the simulation persist — those represent the platform's accounting state, not user-owned data. If you want to reset events too, use the existing `scripts/reset-platform-data.sql`.

## Interpreting failures

| Check fails | Likely cause |
|---|---|
| [1] Negative balances | A purchase/sell wasn't atomic — investigate the RPC flow |
| [2] Ledger drift | Cache (`profiles.balance`) and source-of-truth (`balance_ledger`) diverged — usually a missed `INSERT INTO balance_ledger` somewhere |
| [3] Price out of [0,1] | Pricing engine produced bogus mid — check `pricing.ts` and `event_markets` shares |
| [4] Zero/negative contracts | Edge case in `execute_purchase` — likely amount < $1 after fee deduction |
| [5] Wrong settle status | `settle_predictions` didn't mark positions correctly |
| [6] Cobro drift | Payout calculation diverged from `payout_if_win` cache — check `settle_predictions` math |
| [7] Negative pool totals | Sell deducted more than purchase added — race condition or rounding |
| [8] Missing platform_ledger entry | `settle_event` didn't record the platform margin take — accounting story is broken |

Most violations point at a specific migration. Use `git log -p supabase/migrations/` to find when the relevant RPC was last edited.

## When to re-run

- Before any push that touches `execute_purchase`, `execute_sell`, `settle_event`, or `settle_predictions`
- Before onboarding the first cohort of real beta users
- Anytime you change the fee/spread/skim configuration in `platform_config`
- As a smoke test after applying a new payment/tokenization migration

## Limits and known caveats

- This is sequential, not concurrent. It does NOT test race conditions or row-locking edge cases. For that, you'd want a Phase 2 stress test (Promise.all hammering 500 users at the same event).
- It does not exercise the Pagadito iframe, KYC flow, withdrawal flow, or any UI surfaces. It only tests the on-platform math.
- It cannot fake `auth.uid()` for non-admin paths, so any RLS that checks `auth.uid() = user_id` is bypassed by SECURITY DEFINER. Real-user RLS is tested separately via E2E.

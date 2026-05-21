# sql-archive

Historical SQL files from the pre-migration era of b1n0. These are
**not** the canonical schema — the canonical source of truth is
`supabase/migrations/` (numbered timestamped migrations).

These files are preserved here for historical reference only:

| File | What it was |
|------|-------------|
| `dynamic-spread.sql` | Early draft of the AMM spread logic before it became `pricing.ts` + `pricing-config.sql` |
| `fix-balance-ledger.sql` | One-off hotfix that was folded into the migration that created the canonical `balance_ledger` table |
| `fix-execute-purchase.sql` | Patch to `execute_purchase` RPC, superseded by the unified fee/settlement migration (task #45) |
| `fix-spread-at-deposit.sql` | Spread accrual fix, now part of the spread tracking migration |
| `parimutuel-model.sql` | Experimental parimutuel model — replaced by the LP-backed fixed-payout market (task #42) |
| `private-allocation.sql` | Early sponsor-allocation scaffolding, now obsolete (task #59 removed the sponsor concept) |
| `treasury-auto-credit.sql` | Treasury credit logic, folded into the unified settlement migration |

**Do not run these against any database.** They reference older
schemas and would either no-op or conflict with the current state.
Apply changes via new files in `supabase/migrations/` instead.

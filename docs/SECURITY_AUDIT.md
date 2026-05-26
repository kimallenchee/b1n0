# SECURITY_AUDIT.md

## Security Posture v2 — shipped 2026-05-26

This section summarizes the broader public-facing security posture that landed after the original authorization-hardening audit below. It is the single artifact to point investors / IT skeptics / auditors at when they ask "show me your security."

### Disclosure stack (three free verifiable channels)

| Channel | URL | Purpose |
|---|---|---|
| Direct email | `security@b1n0.com` | Primary inbound, PGP available on request |
| GitHub Private Vulnerability Reporting | https://github.com/kimallenchee/b1n0/security/advisories/new | Coordinated private advisory, CVE assignment available |
| OpenBugBounty program | https://www.openbugbounty.org/bugbounty/b1n0/ | Public-verifiable third-party listing, neutral triage |

All three are referenced as `Contact:` channels in `public/.well-known/security.txt` and linked from `/confianza` Sección 06 (Divulgación responsable). The program follows the [disclose.io](https://disclose.io) open standard with an explicit safe-harbor clause.

**Response SLAs:**
- Acknowledgment within 5 business days
- Preliminary severity within 10 business days
- Default coordinated-disclosure window: 90 days post-fix, flexible

### Automated scanning

| Tool | Coverage | Runs on |
|---|---|---|
| GitHub Dependabot | npm + GitHub Actions dependency CVEs, version updates | Configured in `.github/dependabot.yml` — weekly grouped npm, monthly GHA |
| Semgrep (free OSS) | Static analysis with `p/security-audit` + `p/owasp-top-ten` + `p/typescript` + `p/react` + `p/secrets` rulesets | `.github/workflows/semgrep.yml` — every PR + weekly cron + manual dispatch |
| GitHub Secret Scanning | Detects committed API keys/tokens at push time | Enabled in repo settings (Push protection) |
| Truncation guard | Validates every `src/**/*.{ts,tsx}` parses cleanly before any build | `scripts/check-truncation.mjs`, runs as `prebuild` |

Semgrep results upload to the GitHub Security tab as SARIF. Dependabot opens grouped PRs (react-stack / supabase-stack / build-tooling) to avoid PR storm.

### Public verification surfaces

A skeptical reader can independently verify all of the above from outside the org:

| Verifier | URL |
|---|---|
| `security.txt` (RFC 9116) | https://www.b1n0.com/.well-known/security.txt |
| Trust page | https://www.b1n0.com/confianza |
| Mozilla Observatory | https://observatory.mozilla.org/analyze/www.b1n0.com |
| SecurityHeaders.com | https://securityheaders.com/?q=https%3A%2F%2Fwww.b1n0.com |
| SSL Labs | https://www.ssllabs.com/ssltest/analyze.html?d=www.b1n0.com |
| GitHub Security tab | https://github.com/kimallenchee/b1n0/security |
| OpenBugBounty program | https://www.openbugbounty.org/bugbounty/b1n0/ |

### Investor-facing one-paragraph summary

> Security reports reach us through three verifiable channels — GitHub's Private Vulnerability Reporting, OpenBugBounty, and direct PGP-encrypted email — under a disclose.io-aligned safe-harbor policy with 5-day acknowledgment and 10-day triage SLAs. Every PR runs Semgrep static analysis (OWASP top-ten + secrets) and Dependabot watches all dependencies for CVEs. Public scan grades (Mozilla Observatory, SecurityHeaders, SSL Labs) are linked from `/confianza` for independent verification. Full policy at `b1n0.com/.well-known/security.txt`.

---

## Authorization audit (Production Hardening Pass — Pre-PSP, April 2026)

Authorization audit for the b1n0 backend, completed as part of the
**Production Hardening Pass — Pre-PSP** (April 2026).

This file is the source of truth for which RPCs and tables are
admin-only, which authorization checks they perform, and where those
checks live.

The hardening migration is
[`supabase/migrations/20260427_harden_admin_authorization.sql`](supabase/migrations/20260427_harden_admin_authorization.sql).

## Authorization primitive

```sql
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER STABLE
AS $$
BEGIN
  IF user_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = user_id AND is_admin = true
  );
END;
$$;
```

`is_admin(auth.uid())` is the canonical guard used inside every
admin-writing RPC. It is `SECURITY DEFINER` so it bypasses RLS on
`profiles`, and `STABLE` so Postgres can cache it within a transaction.

`check_admin_status()` is the client-callable wrapper that the React
app uses to verify admin status against the server. It is wired
through `AuthContext.verifyAdminStatus()` and called on every mount of
an admin-protected route via `ProtectedRoute`.

## Admin RPC coverage

Every RPC in the table below has an `is_admin(auth.uid())` guard
applied at the top of the function body. The hardening migration uses
a wrapper pattern: the existing function is renamed to `<name>__inner`
and a new function with the original signature delegates after the
guard. This lets us add the check without re-deriving multi-hundred-
line function bodies, and is idempotent across re-runs of the
migration.

| RPC                          | Signature                                                                                                       | Guard | Source                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | :---: | ------------------------------------------------- |
| `is_admin`                   | `(user_id uuid) → boolean`                                                                                      |  n/a  | `20260427_harden_admin_authorization.sql`         |
| `check_admin_status`         | `() → jsonb {is_admin, authenticated, user_id, checked_at}`                                                     |  n/a  | `20260427_harden_admin_authorization.sql`         |
| `settle_event`               | `(p_event_id text, p_result text) → jsonb`                                                                      |   ✓   | wrapper in 20260427; inner from `20260307`        |
| `settle_predictions`         | `(p_event_id text, p_result text) → jsonb \| integer`                                                           |   ✓   | wrapper in 20260427; inner from `20260306`/etc    |
| `update_platform_config`     | `(p_key text, p_value numeric) → void`                                                                          |   ✓   | wrapper in 20260427; inner from `20260309`        |
| `initialize_market`          | `(text, numeric, integer, boolean, integer, numeric)` and `(…, numeric, text)`                                  |   ✓   | wrapper in 20260427; both signatures wrapped      |
| `initialize_option_markets`  | `(p_event_id text) → jsonb`                                                                                     |   ✓   | wrapper in 20260427; inner from `20260407_option_markets_rpcs` |
| `sweep_to_treasury`          | `() → jsonb`                                                                                                    |   ✓   | wrapper in 20260427; inner had its own check too  |
| `deposit_lp_capital`         | `(p_event_id text, p_user_id uuid, p_amount numeric, p_return_pct numeric DEFAULT 0.08) → jsonb`                |   ✓   | wrapper in 20260427; inner from `sql/parimutuel-model.sql` |
| `admin_adjust_balance`       | `(p_user_id uuid, p_amount numeric, p_reason text) → jsonb`                                                     |   ✓   | wrapper in 20260427; inner pre-existing in DB     |
| `admin_reset_password`       | `(p_user_id uuid, p_new_password text) → jsonb`                                                                 |   ✓   | wrapper in 20260427; inner pre-existing in DB     |

### User-facing RPCs (NOT admin-only — auth.uid checks only)

These RPCs are intentionally callable by any authenticated user. They
already enforce `auth.uid() = p_user_id` (or equivalent ownership
checks) at the top of the function. Listed here for completeness so
auditors can confirm they were considered:

- `execute_purchase` — owner check (`20260407_security_hardening.sql`)
- `execute_sell` — owner check
- `preview_purchase` — read-only, owner check on returned shape
- `execute_option_purchase` / `preview_option_purchase` — owner check
- `cast_vote` — owner check + event-status check
- `deposit_balance` / `withdraw_balance` — owner check + caps
- `reset_user_password` — server-issued token; rate-limited
- `check_rate_limit` / `record_rate_limit` — per-user

## RLS coverage

The hardening migration applies row-level security to every admin-only
table. Policies use `is_admin(auth.uid())` so they share a single
source of truth with the RPCs.

| Table              | Read              | Write             | Notes                                              |
| ------------------ | ----------------- | ----------------- | -------------------------------------------------- |
| `profiles`         | self + admin      | self (limited) + admin | Trigger `profiles_guard_is_admin` rejects any change to `is_admin` from a non-admin caller. Pre-existing per-row policies kept. |
| `platform_config`  | public (rates are public) | admin only | Old policies replaced with `is_admin()`-based ones. |
| `platform_ledger`  | admin only        | admin only        | RLS enabled; policies created if table exists.      |
| `rate_limits`      | self + admin      | admin only        | Self-select scoped to `auth.uid() = user_id`.       |
| `error_log`        | admin only        | admin only        | New table; surfaces in HealthPanel.                 |

Tables with their own pre-existing self/owner policies that we did
NOT touch (and which already enforce ownership):

- `predictions`, `positions`, `market_transactions`, `balance_ledger`,
  `comments`, `friendships`, `notifications`, `lp_deposits`,
  `event_markets`, `events`.

If an attacker bypasses an admin RPC (for example by editing a SQL
function ad-hoc in the SQL editor), RLS still prevents them from
writing to `platform_config` / `platform_ledger` / `error_log`
through the REST endpoint.

## profiles.is_admin self-update lockdown

`is_admin` cannot be flipped on the user's own profile via the REST
update endpoint. Two layers:

1. **Trigger** — `profiles_guard_is_admin` on `BEFORE UPDATE OF
   is_admin`. If `auth.uid()` is not an admin and the update would
   change `is_admin`, the trigger raises `unauthorized: only admins
   can change is_admin`.
2. **service_role bypass** — when `auth.uid()` is `NULL` (i.e. the
   caller is the service role / supabase admin key), the trigger
   passes through. Server-side bootstrapping scripts can still set
   the flag.

Verification:

```sql
-- as a non-admin user
UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();
-- ERROR: unauthorized: only admins can change is_admin
```

## Client-side gating

The React client treats `profile.isAdmin` as an optimistic flag for
rendering, but never as authorization. The real check is:

1. `ProtectedRoute({ requireAdmin: true })` calls
   `verifyAdminStatus()` on every mount of an admin route. This
   calls the `check_admin_status` RPC, which is `SECURITY DEFINER`
   and reads the live `profiles.is_admin` row. The result is cached
   in `AuthContext` for sibling components but re-verified on each
   admin-route mount and on session change.
2. If the RPC returns `is_admin: false`, `ProtectedRoute` redirects
   to `/`, regardless of the cached profile flag.
3. `AdminPage.tsx` keeps a defense-in-depth `profile.isAdmin` check
   so even if the route gate is bypassed somehow, no admin-only UI
   renders.

## Verification checklist

After deploying `20260427_harden_admin_authorization.sql`, run:

```sql
-- 1. Confirm wrappers and helpers exist
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'settle_event','settle_predictions','update_platform_config',
    'initialize_market','initialize_option_markets',
    'sweep_to_treasury','deposit_lp_capital',
    'admin_adjust_balance','admin_reset_password',
    'is_admin','check_admin_status'
  )
ORDER BY proname;

-- 2. Confirm RLS on protected tables
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('platform_config','platform_ledger','rate_limits','error_log');

-- 3. Confirm trigger on profiles.is_admin
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass;

-- 4. As a non-admin user — should fail
SELECT public.update_platform_config('tx_fee_pct', 99);
-- expected: ERROR: unauthorized: admin access required

-- 5. Confirm treasury_account_id is seeded
SELECT key, value, value_text FROM public.platform_config
WHERE key = 'treasury_account_id';
```

End-to-end verification from the client:

1. Sign in as an admin.
2. Open `/admin`. Network tab should show a `check_admin_status` POST
   to `/rest/v1/rpc/check_admin_status` with response `{ is_admin: true, … }`.
3. As a separate admin (or via SQL), run
   `UPDATE profiles SET is_admin = false WHERE id = '<that user>'`.
4. Refresh `/admin`. The `check_admin_status` call should return
   `{ is_admin: false, … }` and the user should be redirected to `/`.

## Out of scope

These items were out of scope for this pass and remain open:

- Payment processor integration (`DepositSheet`, `RetiroSheet`).
- Rotating the treasury UUID. The fallback in `useTreasuryId()` keeps
  legacy ledger entries findable; once the new UUID is fully populated,
  remove the fallback.
- Sentry → server `error_log` ingestion. For now, errors land in
  Sentry from the client and admins can write to `error_log` from
  server-side hooks as needed.

# b1n0

> **Mercado de opciones sobre eventos** for Central America.
> Live at [**www.b1n0.com**](https://www.b1n0.com).

b1n0 is a Spanish-first, mobile-first event-prediction market for Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica, Panamá, and Belize. Users take **SÍ** or **NO** positions on real-world questions — sports, politics, economy, culture — and the side that calls it right collects from the pool. Built between ESPN, Instagram, and a group chat where someone always has a hot take.

It is **not** a casino, sportsbook, or financial instrument. It's a social opinion game where brands back the prize pools and users prove they read the room better than everyone else.

**Operator:** [Tres33 SAS de CV](https://www.b1n0.com/confianza), registered in El Salvador.
**Tokenization:** operated by a CNAD-licensed third-party provider.
**License:** Proprietary — see [`LICENSE`](./LICENSE).

---

## Highlights

- **LP-backstopped Kalshi-style AMM.** Pools are funded by liquidity providers; pricing follows a parimutuel-tinted automated market maker (`src/lib/pricing.ts`, `supabase/migrations/*_fee_settlement.sql`). Blended take is ~8% across compra fee (1–5%), AMM spread (1–2%), salida fee (2%), and resolution skim (5%).
- **3-tier KYC via [Didit](https://business.didit.me)** — N1 phone, N2 DPI, N3 full identity + AML/PEP. Auto-promote to N3 at $1k cumulative deposits. Edge functions in `supabase/functions/kyc-*/`.
- **Server-side risk acknowledgment** captured before first deposit via the idempotent `acknowledge_risk()` RPC. Regulator-facing audit trail in `profiles.risk_acknowledged_at`.
- **Hard-isolated RLS + `SECURITY DEFINER` RPCs.** Public-readable surfaces (profiles, comments) go through dedicated RPCs that filter to safe columns only; admin claim lives in `auth.users.app_metadata`, not in user-mutable columns.
- **Public profile pages at `/u/:username`** with per-user privacy controls (10 toggles in `profiles.privacy_prefs` JSONB), preview-as-guest mode, and a mixed activity stream (votos + comentarios).
- **Live event resolution emails** via [Resend](https://resend.com) with brand-styled HTML templates fired by a Postgres trigger + `pg_net` edge call.
- **Strict CSP, HSTS preload, security.txt, and public scan grades** linked from [`/confianza`](https://www.b1n0.com/confianza). PDF version of the trust pack ships at `/docs/b1n0-confianza.pdf`.

---

## Tech stack

| Layer | What |
|------|------|
| Frontend | React 19 + TypeScript + Vite 7 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) + inline styles + design tokens in `src/index.css` |
| Routing | React Router DOM v7 |
| Backend | Supabase — Postgres + Auth + Realtime + Edge Functions + Storage |
| KYC | Didit (Tier 2 + Tier 3 workflows) |
| Email | Resend (transactional, brand-styled) |
| Monitoring | Sentry (lazy-loaded; `VITE_SENTRY_DSN` opt-in) |
| Hosting | Vercel (frontend + serverless `/api/og`) — DNS via GoDaddy |
| Type-safety | TypeScript 5.9, strict mode, `tsc --noEmit` in prebuild |
| E2E | Playwright (`e2e/`) |

---

## Project structure

```
b1n0/
├── api/                       # Vercel serverless functions
│   ├── og.tsx                 # Per-event OG image generator (1200×630)
│   └── tsconfig.json          # JSX config for the function build
├── docs/                      # Compliance + investor materials
│   ├── SECURITY_AUDIT.md      # Authorization audit (April 2026)
│   ├── RESEND_SETUP.md        # Email integration setup notes
│   └── sql-archive/           # Pre-migration historical SQL — do not run
├── e2e/                       # Playwright end-to-end tests
├── public/                    # Static assets — brand, fonts, manifest
│   ├── brand/                 # Logo variants (white, fullcolor, green)
│   ├── docs/b1n0-confianza.pdf# Public trust pack PDF
│   └── .well-known/security.txt
├── scripts/                   # Dev utilities (truncation guard, PDF builder)
├── src/
│   ├── pages/                 # Route-level pages (Inicio, Perfil, Portafolio…)
│   ├── components/            # UI primitives + feature components
│   │   ├── feed/              # EventCard, EntryFlow, SplitBar, CommentFeed
│   │   ├── wallet/            # WalletSheet, KYCSheet, RetiroSheet
│   │   ├── admin/             # 7-panel admin suite
│   │   └── layout/            # TopBar, BottomNav/DesktopDock, Footer
│   ├── context/               # AuthContext, EventsContext, VoteContext, etc.
│   ├── hooks/                 # usePricingEngine, useComments, useIsDesktop
│   ├── lib/                   # supabase client, pricing, logger, rateLimit
│   ├── content/               # Documentation + tutorial content trees
│   └── types/                 # Shared TypeScript interfaces
├── supabase/
│   ├── migrations/            # Canonical schema source (48+ migrations)
│   ├── functions/             # Edge functions (kyc-webhook, send-resolution-email…)
│   └── config.toml            # Edge function config (verify_jwt overrides)
├── LEDGER_INVARIANTS.md       # Accounting invariants reference
├── CLAUDE.md                  # Project conventions + language rules
├── vercel.json                # Routing, CSP, security headers, cache policy
└── LICENSE                    # Proprietary
```

---

## Quick start

```bash
git clone https://github.com/kimallenchee/b1n0.git
cd b1n0
npm install
cp .env.example .env.local      # fill in Supabase URL + anon key
npm run dev                     # localhost:5173
```

### Environment variables

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_SENTRY_DSN=                # optional; leave empty to skip Sentry
VITE_KYC_PROVIDER=didit         # or 'manual' for the legacy flow
```

Edge-function secrets (set via `supabase secrets set ...`):
- `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID_T2`, `DIDIT_WORKFLOW_ID_T3`
- `RESEND_API_KEY`
- `APP_URL` (e.g. `https://www.b1n0.com`)

---

## Commands

```bash
npm run dev              # Vite dev server
npm run build            # prebuild (truncation + tsc) → vite build
npm run lint             # ESLint
npm run preview          # serve the built dist/ locally
npm run test             # vitest unit tests
npm run test:e2e         # Playwright E2E (chromium)
```

The `prebuild` step runs `scripts/check-truncation.mjs` to catch the
truncated-file corruption that bit us during the OneDrive era, then
`tsc --noEmit` for type safety.

---

## Database

Schema lives entirely in **`supabase/migrations/`** — 48+ numbered migrations in chronological order. Apply via the Supabase SQL Editor or the Supabase CLI.

Key tables:
- `profiles` — user profiles with `privacy_prefs` JSONB and `risk_acknowledged_at` audit column
- `events`, `event_markets`, `option_markets` — event catalog + market state
- `positions`, `predictions` — user-side state
- `comments` — public comment thread per event
- `balance_ledger` — append-only accounting source of truth
- `friendships`, `notifications`, `kyc_sessions`, `platform_config`, `platform_ledger`, `rate_limits`

Key patterns:
- **Row-Level Security** on every user-data table
- **`SECURITY DEFINER` functions** for any privileged operation (resolution, balance adjustment, anon-readable subset of RLS-protected data)
- Admin claim lives in `auth.users.app_metadata.is_admin`, kept in sync with `profiles.is_admin` via a trigger

Authorization audit reference: [`docs/SECURITY_AUDIT.md`](./docs/SECURITY_AUDIT.md).

---

## Deployment

Production: [www.b1n0.com](https://www.b1n0.com) (Vercel; DNS via GoDaddy).

Standard deploy path:

```bash
git push                              # GitHub → Vercel webhook → cloud build
```

When Vercel's build cache gets sticky (e.g. bundle hash unchanged despite source changes), bypass the cloud build entirely:

```bash
npx vercel build --prod               # runs build locally → .vercel/output/
npx vercel deploy --prebuilt --prod   # uploads only the artifacts
```

Vercel-side env vars (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_KYC_PROVIDER`, `VITE_SENTRY_DSN`.

---

## Trust, security & legal

| Where | What |
|------|------|
| [`/confianza`](https://www.b1n0.com/confianza) | Public trust page — entity, model, money flow, security, partners, contact |
| [`/documentacion`](https://www.b1n0.com/documentacion) | How the platform works in detail — comissions, KYC tiers, custody, resolution |
| [`/terminos`](https://www.b1n0.com/terminos) | Terms of Service |
| [`/privacidad`](https://www.b1n0.com/privacidad) | Privacy Policy |
| [`/.well-known/security.txt`](https://www.b1n0.com/.well-known/security.txt) | RFC 9116 disclosure policy |
| [SecurityHeaders.com](https://securityheaders.com/?q=https%3A%2F%2Fwww.b1n0.com) | HTTP security header grade |
| [SSL Labs](https://www.ssllabs.com/ssltest/analyze.html?d=www.b1n0.com) | TLS configuration grade |
| [Mozilla Observatory](https://observatory.mozilla.org/analyze/www.b1n0.com) | Overall posture |

Report a security issue: [security@b1n0.com](mailto:security@b1n0.com)
General support: [soporte@b1n0.com](mailto:soporte@b1n0.com)
Press / partners: [hola@b1n0.com](mailto:hola@b1n0.com)
Legal: [legal@b1n0.com](mailto:legal@b1n0.com)

---

## License

Proprietary. Copyright © 2026 Tres33 SAS de CV. All rights reserved.
See [`LICENSE`](./LICENSE).

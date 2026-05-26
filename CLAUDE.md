# b1n0

## What This Project Is

b1n0 is an **LP-backed fixed-payout event-options market** for Central America. Users buy SÍ/NO (or multi-option) positions on real-world events at a market price; payouts are funded by liquidity-provider capital — *not* by a brand sponsor, *not* parimutuel, *not* a peer-to-peer order book. The LP is the counterparty.

- **Operating entity:** Tres33 SAS de CV — Salvadoran company under the CNAD framework.
- **Geography:** Central America today. Spanish-first interface. EN + additional languages will come back as crypto rails open the audience beyond CA.
- **Audience:** 18–35, mobile-first. Beta-gated at the root for expectation management — the gate is soft, not a regulatory wall.
- **LP model:** Hybrid. Some events are funded entirely by institutional LPs (Tres33 + investors); some open the LP pool to public capital ("Abierto para LP público" toggle on event creation).
- **Live at:** https://www.b1n0.com (Vercel, DNS via GoDaddy)

This is *not* a gambling app. It is *not* a generic social opinion game. It is *not* a Polymarket clone or a Kalshi clone — those comparisons exist only as "the closest US analogue" when explaining to investors, and never as product framing inside the codebase.

## Content Model

**Every event is admin-created manually.** The admin (Kim today; eventually a small ops team) writes the question, picks category + country, sets initial SÍ %, funds LP capital, sets min/max entry, and writes the **Contexto** field — which becomes the event's descriptor on the event page. There is no scraping, no AI generation, no syndication. News-feed integration was scoped in an earlier draft and ripped out entirely on 2026-05-26.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite (port 5173)
- **UI:** Custom CSS (inline styles + index.css) — no shadcn/ui, no component library
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- **Routing:** React Router DOM v7
- **i18n:** react-i18next (currently hardcoded to `lng: 'es'`; EN locale file exists for future re-enable)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions)
- **Monitoring:** Sentry (lazy-loaded, optional via `VITE_SENTRY_DSN`)
- **Deployment:** Vercel (auto-deploy from GitHub `main`)
- **Project ref:** `bebdvsdiqlruqzmkvmgy`

## Commands

```bash
npm run dev        # Start dev server (localhost:5173)
npm run build      # Production build (also runs tsc + truncation guard)
npm run lint       # ESLint
npm run preview    # Preview production build
```

## Theme System

Supports dark, light, and system modes via `ThemeContext`. Uses `[data-theme="light"]` on `<html>`.

**Critical CSS note:** Tailwind v4's `@theme { }` block resolves `var()` at COMPILE time. All runtime-reactive color aliases must be defined in a `:root { }` block AFTER `@theme` in `index.css`. This is why `--color-*` aliases exist in both places.

### Colors (dark mode defaults — canonical source is `src/index.css`)
```css
--b1n0-bg:       #090b10
--b1n0-surface:  #111318
--b1n0-card:     #161920
--b1n0-border:   rgba(255,255,255,0.06)
--b1n0-text-1:   #e2e4ed
--b1n0-muted:    #8b8fa3
--b1n0-si:       #06D47F   /* Brand green — CTA, live, wins, primary accent */
--b1n0-si-bg:    rgba(6,212,127,0.12)
--b1n0-si-hover: #04B86C
--b1n0-no:       #f59e0b   /* NO side — amber, NEVER red */
--b1n0-gold:     warm gold for tier 3 / premium accents
```

**The primary accent is `#06D47F` (vibrant brand green). Not teal.** Older code/docs may still reference `#14b8a6` — that is wrong and should be swept on sight. The canonical source is `src/index.css`.

### Typography
- **All text:** Inter (variable weights 400/500/600/700)
- **Numbers:** Inter with `font-variant-numeric: tabular-nums`, tight letter-spacing
- (Syne and Geist were removed during Phase 3b — do not re-introduce.)

## Language Rules (CRITICAL)

| Never say | Use instead |
|-----------|-------------|
| Apostar / Bet | Hacer tu voto / Participar |
| Ganar / Win | Tener razón / Cobrar |
| Perder / Lose | Esta vez no / No fue |
| Cuotas / Odds | Distribución / Split |
| Stake / Riesgo | Entrada / Tu participación |
| Payout / Premio | Cobro / Lo que colectás |
| Trade / Invertir | Participar / Tomar posición |
| Jugar / Juego | Participar / Voto |
| Probabilidad | ¿Qué dice la gente? |
| House edge | (never mention) |
| KYC (UI-facing) | Verificá tu cuenta |
| Sponsored / Brand-funded | (model removed — LP capital only) |
| Parimutuel / Kalshi clone / Polymarket clone | LP-backed fixed-payout (only in dev/investor framing) |

The route `/mis-votos` and component name `MisLlamados.tsx` exist in tension — the filename was kept after the `llamado → voto` rebrand (task #108) to avoid breaking imports. Use "voto" everywhere user-facing; "llamado" only survives in the filename.

## KYC Tiers

| Tier | Badge | Max per event | Requirement |
|------|-------|---------------|-------------|
| Nivel 1 | N1 gray | $50 | Phone number |
| Nivel 2 | N2 brand-green | $250 | Phone + DPI (Didit) |
| Nivel 3 | N3 gold | $1,000 | Full KYC (Didit + AML/PEP screening) — also auto-promotes on $1k cumulative deposits |

Currency is **USD** platform-wide.

## Payments & Tokenization (vendor-agnostic scaffold)

Three vendors are scaffolded but **none are contracted for b1n0 yet**:

| Vendor | Role | Status |
|---|---|---|
| **Redbajas / Pagadito** | Cards (deposit + withdrawal) | Sandbox code path complete. Existing Pagadito credentials in env belong to Kim's *other* lottery operation (escoge2/lotescdos) — they must NOT be used to drive real test transactions for b1n0. b1n0 needs its own contract before any live test. |
| **Vudy** | Crypto rails (USDC/USDT in + out) | Stubbed via `usePaymentFlags`. Vendor unsigned. |
| **Monetae (or alternate — tohkn, etc.)** | Tokenization + custody (CTF-style conditional tokens) | Stubbed. Vendor selection still open; deal currently being negotiated. Monetae is the most important regulatory shelter under CNAD. |

All deposit/withdrawal happens through `WalletSheet.tsx`. Feature flags live in `platform_config.value_text` (boolean as string) and are read via `usePaymentFlags`. The Pagadito flow lives in `PagaditoIframeSheet.tsx` to keep card data out of b1n0's PCI scope.

Tres33 needs to open **two Salvadoran bank accounts** before anything live: an operating account, and an FBO (for-benefit-of) custody account for user funds. This is the longest-lead-time pre-launch item.

See `docs/payments-architecture.md` for the full diagram and `docs/handoff-payments-expert.md` for the onboarding doc for the incoming payments expert.

## What NOT to Build / Re-introduce

- Decimal odds (1.43x, 2.8x) — finance/gambling signal
- Red for NO side — casino signal (use amber `#f59e0b`)
- Casino iconography (chips, dice, cards)
- Countdown timers with alarm urgency
- "Hot streaks" / "lucky" copy
- Order books or depth charts
- Auto-deposit prompts
- ROI / return language
- Brand-sponsored prize pool framing — LP capital is the only model
- News feed integration in `/inicio` — scoped and ripped on 2026-05-26
- Syne / Geist / DM Sans typography — Inter only
- Teal `#14b8a6` — brand green `#06D47F` is the truth
- "Social opinion game" / "ESPN + Instagram + group chat" framing — this was an earlier draft positioning

## Recently Shipped (2026-05-26)

The current production deploy contains the following batch landed on 2026-05-26:

- **Canonical positioning rewrite.** This file, `README.md`, `/confianza`, `/documentacion`, `index.html` `<meta>` tags, OG cards, Twitter cards and JSON-LD structured data are all on the "LP-backed fixed-payout event-options market" framing. The earlier "social opinion game / brands fund prize pools / ESPN+Instagram+group chat" framing has been swept everywhere.
- **News feed dead code ripped.** `NewsCard.tsx`, `NewsArticle` type, the `news` table, `EventFeed` news interleave, `fetch-news` + `rewrite-news` edge functions, and locale strings are gone. Events-only feed.
- **Drift sweep.** "Pool parimutuel" admin label → "Pool del mercado"; stale parimutuel comments → LP-backed fixed-payout; documentation.ts tone rules + section comments llamado → votos; teal `#14b8a6` → brand green `#06D47F` everywhere (emails, PDF, comments).
- **Payments expert handoff doc.** `docs/handoff-payments-expert.md` is the day-1 onboarding for the incoming payments/crypto-native expert.
- **Security posture v2 — free 3-channel disclosure stack.**
  - `.github/dependabot.yml` — weekly npm + monthly GHA updates, grouped to avoid PR storm.
  - `.github/workflows/semgrep.yml` — free OSS static analysis (security-audit + OWASP top-ten + TypeScript + React + secrets rulesets) on every PR + weekly cron. Replaces paid GitHub Advanced Security CodeQL.
  - `public/.well-known/security.txt` — RFC 9116 compliant, three Contact channels, disclose.io standard reference, full safe-harbor language.
  - `/confianza` Sección 06 (Divulgación responsable) + Sección 07 (Agradecimientos) — three verifiable channels: direct email to security@b1n0.com, GitHub Private Vulnerability Reporting, OpenBugBounty.
  - **OpenBugBounty program**: `openbugbounty.org/bugbounty/b1n0/` — domain `*.b1n0.com` verification in progress (security.txt `OpenBugBounty:` line is now live; their scanner will flip status to verified within minutes-to-24h).
  - **disclose.io** open standard adopted by reference (no signup, no fees — the standard itself is the badge).
  - **GitHub Private Vulnerability Reporting** enabled on the repo.

## Known Gaps (as of 2026-05-26)

- **No signed payment vendor for b1n0 yet** — Redbajas/Vudy/Monetae are all scaffolded but uncontracted.
- **Two Salvadoran bank accounts not opened** — operating + FBO. Blocks any real money movement.
- **Supabase auth email templates not pasted into dashboard** — HTML is ready in `docs/supabase-auth-email-templates.md`. Kim pastes manually.
- **i18n is single-language right now** — `lng: 'es'` hardcoded; EN locale file maintained for the future re-enable when crypto rails open the audience.
- **Recurring file-corruption bug** — Cowork's Edit/Write tools occasionally silently truncate files or pad them with NULL bytes. The truncation guard (`scripts/check-truncation.mjs`) catches it at prebuild. If you see "Invalid character" or "} expected" on a file you didn't break, restore from HEAD and re-apply via `python3` find/replace in bash.
- **GitHub Advanced Security toggles still in dashboard** — Dependabot config + Semgrep workflow are committed and active, but the matching repo-settings toggles (Private vulnerability reporting, Dependabot alerts, Dependabot security updates, Grouped security updates, Secret scanning + Push protection) need to be flipped manually at `github.com/kimallenchee/b1n0/settings/security_analysis`.

## Documentation System

Four layers — see `docs/README.md` for the full map.

1. **Repo root** (this file, `README.md`, `LICENSE`, `LEDGER_INVARIANTS.md`)
2. **`docs/*.md`** — engineering + business reference
3. **`src/content/*.ts`** — Spanish user-facing copy for `/documentacion` and the in-app tour
4. **`src/pages/{Legal,Confianza,Documentacion}.tsx`** — the actual user-facing legal/trust/docs pages

## Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_SENTRY_DSN=                # Optional
VITE_KYC_PROVIDER=didit         # or unset / 'manual' for legacy
```

Plus Supabase Edge Function secrets for Didit + (future) Redbajas/Vudy/Monetae. See `docs/env-variables.md`.

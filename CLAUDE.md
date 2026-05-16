# b1n0

## What This Project Is

b1n0 is a **sponsored prediction platform** for Central America (Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica, Panama, Belize). It is a social opinion game — not a gambling app, not a finance app. Brands fund prize pools and users prove they know their world better than everyone else. The product lives between ESPN, Instagram, and a group chat where someone always has a hot take.

**Spanish-first. Mobile-first. 18–35 age target.**

**Live at:** https://www.b1n0.com (Vercel, DNS via GoDaddy)

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite (port 5173)
- **UI:** Custom CSS (inline styles + index.css) — no shadcn/ui, no component library
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- **Routing:** React Router DOM v7
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Monitoring:** Sentry (lazy-loaded, optional via `VITE_SENTRY_DSN`)
- **Deployment:** Vercel (auto-deploy from GitHub)

## Commands

```bash
npm run dev        # Start dev server (localhost:5173)
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build
```

## Project Structure

```
src/
├── pages/                      # Route-level pages
│   ├── Inicio.tsx              # Main feed (events + news)
│   ├── MisLlamados.tsx         # User's active predictions (Mis Votos)
│   ├── Perfil.tsx              # Account, wallet, KYC, friends
│   ├── Portafolio.tsx          # Active positions with live P/L
│   ├── Historial.tsx           # Transaction history + vote history
│   ├── EventDetailPage.tsx     # Full event view with comments + purchase
│   ├── AdminPage.tsx           # 5-panel admin suite
│   ├── AuthPage.tsx            # Login / signup standalone page
│   ├── Legal.tsx               # Terms + privacy
│   └── Documentacion.tsx       # User-facing docs page
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx          # Fixed top: balance + avatar + tier badge
│   │   ├── BottomNav.tsx       # Fixed bottom: 5 tabs (mobile)
│   │   ├── SideNav.tsx         # Side navigation (desktop)
│   │   ├── RightPanel.tsx      # Desktop right sidebar
│   │   ├── NotificationDrawer.tsx
│   │   └── AccountDrawer.tsx
│   ├── feed/
│   │   ├── EventCard.tsx       # Signature UI — the entire product
│   │   ├── EventFeed.tsx       # Feed wrapper
│   │   ├── SplitBar.tsx        # Animated SÍ/NO split bar
│   │   ├── LiveDot.tsx         # Pulsing teal live indicator
│   │   ├── EntryFlow.tsx       # 3-step entry: pick side → amount → confirm
│   │   ├── CommentFeed.tsx     # Threaded comments on events
│   │   ├── PurchaseCelebration.tsx
│   │   └── NewsCard.tsx
│   ├── admin/
│   │   ├── EventManager.tsx    # Create/edit/resolve events (bulk import via xlsx)
│   │   ├── RevenuePanel.tsx    # Revenue tracking, LP commissions
│   │   ├── RatesPanel.tsx      # Fee rate configuration
│   │   ├── UsersPanel.tsx      # User management, balance adjustments
│   │   └── TreasuryPanel.tsx   # Platform treasury + sweeps
│   ├── wallet/
│   │   ├── WalletSheet.tsx     # Main wallet bottom sheet
│   │   ├── DepositSheet.tsx    # Deposit flow (TODO: payment processor)
│   │   ├── RetiroSheet.tsx     # Withdrawal flow (TODO: payment processor)
│   │   └── KYCSheet.tsx        # Tier upgrade flow
│   ├── AuthModal.tsx           # Login/signup modal overlay
│   ├── ErrorBoundary.tsx       # App-wide error catching + Sentry
│   ├── HowItWorks.tsx          # Onboarding modal
│   └── ProtectedRoute.tsx      # Admin route guard
├── context/
│   ├── AuthContext.tsx          # Supabase auth + profile sync + realtime
│   ├── EventsContext.tsx        # Event fetching + caching
│   ├── VoteContext.tsx          # Purchase/vote execution + optimistic updates
│   ├── NotificationContext.tsx  # Realtime notifications
│   ├── ThemeContext.tsx         # Dark/light/system theme
│   ├── NowContext.tsx           # Shared clock for countdown timers
│   └── AuthModalContext.tsx     # Modal state management
├── hooks/
│   ├── usePricingEngine.ts      # AMM pricing calculations
│   ├── useComments.ts           # Comment CRUD + realtime
│   └── useIsDesktop.ts          # Responsive breakpoint
├── lib/
│   ├── supabase.ts              # Supabase client init
│   ├── pricing.ts               # Parimutuel AMM math
│   ├── logger.ts                # Structured logging + Sentry
│   ├── retry.ts                 # Fetch retry with backoff
│   ├── rateLimit.ts             # Client-side rate limiting
│   ├── validate.ts              # Input validation helpers
│   └── theme.ts                 # Theme utilities
├── types/
│   └── index.ts                 # TypeScript interfaces
└── data/
    └── mockEvents.ts            # Mock data for offline dev
```

## Supabase Schema (19 migrations)

**Core tables:** profiles, events, predictions, positions, event_markets, option_markets, market_transactions, comments, balance_ledger, friendships, notifications, platform_config, platform_ledger, rate_limits

**Key RPCs:** execute_purchase, preview_purchase, execute_sell, settle_event, settle_predictions, cast_vote, deposit_balance, withdraw_balance, initialize_market, initialize_option_markets, execute_option_purchase, preview_option_purchase, update_platform_config, admin_adjust_balance

**Event types:** binary (SÍ/NO) and open (multi-option with per-option markets)

**Pricing:** Parimutuel AMM — users stake, pool reprices on every entry, winners split pro-rata. ~8% blended take across transaction fees (1-5%), spread capture (1-2%), and 5% resolution skim.

## Theme System

Supports dark, light, and system modes via `ThemeContext`. Uses `[data-theme="light"]` on `<html>`.

**Critical CSS note:** Tailwind v4's `@theme { }` block resolves `var()` at COMPILE time. All runtime-reactive color aliases must be defined in a `:root { }` block AFTER `@theme` in `index.css`. This is why `--color-*` aliases exist in both places.

**Selected-state pattern:** For tabs/pills that invert across themes, always use `bg: var(--b1n0-text-1)` + `color: var(--b1n0-bg)`. Container uses `--b1n0-card` for contrast. Never hardcode `#fff` on dynamic backgrounds.

### Colors (dark mode defaults)
```css
--b1n0-bg: #090b10
--b1n0-surface: #111318
--b1n0-card: #161920
--b1n0-border: rgba(255,255,255,0.06)
--b1n0-text-1: #e2e4ed
--b1n0-muted: #8b8fa3
--b1n0-si: #14b8a6        /* Primary accent — CTA, live, wins */
--b1n0-no: #f59e0b        /* NO side — amber, NOT red */
--b1n0-indigo: #6366f1    /* Tertiary — KYC, badges */
```

### Typography
- **Display / Questions:** Syne 800 — ESPN headline energy
- **Body / UI labels:** DM Sans 400/500 — clean at small sizes
- **Numbers:** Syne 700, letter-spacing: -1px, tabular-nums

## Language Rules (CRITICAL)

| Never say | Use instead |
|-----------|-------------|
| Apostar / Bet | Hacer tu llamado / Call it |
| Ganar / Win | Tener razón / Cobrar |
| Perder / Lose | Esta vez no / No fue |
| Cuotas / Odds | Distribución / Split |
| Stake / Riesgo | Entrada / Tu participación |
| Payout / Premio | Cobro / Lo que colectás |
| Trade / Invertir | Participar / Tomar posición |
| Probabilidad | ¿Qué dice la gente? |
| House edge | (never mention) |
| KYC | Verificá tu cuenta |

## KYC Tiers

| Tier | Badge | Max per event | Requirement |
|------|-------|---------------|-------------|
| Nivel 1 | N1 gray | $50 | Phone number |
| Nivel 2 | N2 teal | $250 | Phone + DPI |
| Nivel 3 | N3 gold | $1,000 | Full KYC |

Currency is **USD** platform-wide. Sponsor model removed — pools are funded exclusively by LP capital flowing through `balance_ledger`. See `LEDGER_INVARIANTS.md` for accounting invariants.

## What NOT to Build

- Decimal odds (1.43x, 2.8x) — finance/gambling signal
- Red for NO side — casino signal
- Casino iconography (chips, dice, cards)
- Countdown timers with alarm urgency
- "Hot streaks" / "lucky" copy
- Order books or depth charts
- Auto-deposit prompts
- ROI/return language

## Microcopy Examples

- Empty feed: *"No hay llamados activos. Volvé más tarde — esto se pone bueno."*
- Win: *"¡Lo sabías! Colectás $82.35"*
- Loss: *"Esta vez no. Seguí participando."*
- KYC upsell: *"Subí a Nivel 2 para participar hasta $250. Solo tarda 2 minutos."*
- Leaderboard: *"Los que más saben este mes"*

## KYC — Didit Integration

KYC verification is provider-pluggable. Set `VITE_KYC_PROVIDER=didit` to use Didit; leave unset / `manual` for the legacy flow.

**Setup steps:**

1. Create a Didit account at https://business.didit.me
2. In the Didit Console, create two **Workflows**:
   - **Tier 2** — KYC base template, document + liveness + face match
   - **Tier 3** — KYC base template + AML/PEP screening + database validation
3. Copy your API Key, Webhook Secret, and both Workflow IDs
4. Set them as Supabase Edge Function secrets:
   ```bash
   supabase secrets set DIDIT_API_KEY=...
   supabase secrets set DIDIT_WEBHOOK_SECRET=...
   supabase secrets set DIDIT_WORKFLOW_ID_T2=...
   supabase secrets set DIDIT_WORKFLOW_ID_T3=...
   supabase secrets set APP_URL=https://www.b1n0.com
   ```
5. Deploy the two edge functions:
   ```bash
   supabase functions deploy kyc-create-session
   supabase functions deploy kyc-webhook
   ```
6. In the Didit Console → Webhooks, configure the webhook URL:
   `https://YOUR_PROJECT.supabase.co/functions/v1/kyc-webhook`
7. Run the migration `20260516_kyc_sessions.sql`
8. Flip the client flag: `VITE_KYC_PROVIDER=didit` in production env
9. Test end-to-end with a test user

**Architecture:**

- Client (`src/lib/didit.ts`) → edge function (`kyc-create-session`) → Didit API
- Didit webhook → edge function (`kyc-webhook`) → updates `kyc_sessions`
- DB trigger (`kyc_session_promote_tier`) auto-promotes `profiles.tier` on Approved
- Realtime subscription in `KYCSheet` fires the success state when status flips

The Didit API key never touches the browser — all Didit calls go through the edge function.

## Known Gaps (as of April 2026)

- **Payment processor not integrated** — DepositSheet and RetiroSheet are stubs (TODO comments). Balances adjust via RPC but no real money moves.
- **Admin auth is client-side** — `isAdmin` flag on profile row. RPCs check `auth.uid()` server-side, but no dedicated admin role in Supabase.
- **Treasury ID hardcoded** — UUID `00000000-0000-0000-0000-000000000001` in RevenuePanel/TreasuryPanel. Should move to platform_config.
- **TypeScript `any` casts** — Several admin panels cast Supabase responses as `any[]` instead of typed interfaces.
- **No PWA manifest** — App works on mobile browser but can't be added to home screen as an app yet.

## Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_SENTRY_DSN=              # Optional: leave empty to skip S
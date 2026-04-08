# b1n0

## What This Project Is

b1n0 is a **sponsored prediction platform** for Central America (Guatemala, El Salvador, Honduras). It is a social opinion game — not a gambling app, not a finance app. Brands fund prize pools and users prove they know their world better than everyone else. The product lives between ESPN, Instagram, and a group chat where someone always has a hot take.

**Spanish-first. Mobile-first. 18–35 age target.**

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite (port 5173)
- **UI:** Custom CSS (inline styles + index.css) — no shadcn/ui, no component library
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- **Routing:** React Router DOM v7
- **Backend:** None yet — mock data in `src/data/mockEvents.ts`

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
├── pages/                  # 5 route-level pages
│   ├── Inicio.tsx          # Main feed
│   ├── EnVivo.tsx          # Live events only
│   ├── MisLlamados.tsx     # User's active predictions
│   ├── Tabla.tsx           # Leaderboard
│   └── Perfil.tsx          # Account + wallet + KYC
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx      # Fixed top: balance + avatar + tier badge
│   │   └── BottomNav.tsx   # Fixed bottom: 5 tabs
│   └── feed/
│       ├── EventCard.tsx   # Signature UI element — the entire product
│       ├── EventFeed.tsx   # Feed wrapper
│       ├── SplitBar.tsx    # Animated SÍ/NO split bar
│       ├── LiveDot.tsx     # Pulsing teal live indicator
│       └── EntryFlow.tsx   # 3-step entry: pick side → amount → confirm
├── data/
│   └── mockEvents.ts       # Mock events, predictions, leaderboard, user
└── types/
    └── index.ts            # TypeScript interfaces
```

## Design System

### Colors
```css
--bg: #090b10          /* Near black background */
--surface: #111318     /* Card background */
--surface2: #161920    /* Inner card elements */
--border: rgba(255,255,255,0.06)
--text: #e2e4ed
--muted: #8b8fa3
--teal: #14b8a6        /* Primary accent — CTA, live, wins */
--amber: #f59e0b       /* Secondary — timers, highlights */
--indigo: #6366f1      /* Tertiary — KYC, badges */
--red: #ef4444         /* Errors only — NEVER for NO side */
```

### Typography
- **Display / Questions:** Syne 800 — feels like an ESPN headline
- **Body / UI labels:** DM Sans 400/500 — clean at small sizes
- **Numbers:** Syne 700, letter-spacing: -1px, tabular-nums

### Category Accents (left border on cards)
| Category | Color |
|----------|-------|
| Fútbol | #14b8a6 |
| NFL/NBA | #f59e0b |
| Local | #6366f1 |
| Economía | #3b82f6 |
| Cultura | #a78bfa |

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

## KYC Tiers

| Tier | Badge | Max per event | Requirement |
|------|-------|---------------|-------------|
| Nivel 1 | N1 gray | Q500 | Phone number |
| Nivel 2 | N2 teal | Q2,000 | Phone + DPI |
| Nivel 3 | N3 gold | Q10,000 | Full KYC |

Never say "KYC" to users. Say "verificá tu cuenta."

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
- Win: *"¡Lo sabías! Colectás Q82.35"*
- Loss: *"Esta vez no. Seguí participando."*
- KYC upsell: *"Subí a Nivel 2 para participar hasta Q2,000. Solo tarda 2 minutos."*
- Leaderboard: *"Los que más saben este mes"*

## Environment Variables

None required for frontend-only mock mode.
When backend is added, prefix all with `VITE_`.

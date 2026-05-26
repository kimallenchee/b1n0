# How b1n0's documentation is organized

There are **four separate documentation systems** in this repo, and they answer different questions for different readers. If you're feeling lost, the confusion is real — not your fault. Here's the map.

| # | Where it lives | Who reads it | What it's for |
|---|---|---|---|
| 1 | Repo root (`/CLAUDE.md`, `/README.md`, `/LICENSE`, `/LEDGER_INVARIANTS.md`) | Future devs / AI agents / GitHub visitors | Foundational instructions, conventions, accounting rules |
| 2 | `/docs/*.md` (this folder) | You, future devs, investors, regulators | Engineering + business reference docs |
| 3 | `/src/content/*.ts` | Code that renders user-facing pages | The Spanish copy that shows up at `/documentacion` and in the in-app tour |
| 4 | `/src/pages/Legal.tsx` + `/src/pages/Confianza.tsx` + `/src/pages/Documentacion.tsx` | End users + regulators visiting b1n0.com | The actual /terminos, /privacidad, /confianza, /documentacion pages |

Below: what's in each layer, and at the end — **what's still open**.

---

## Layer 1 — Repo root

These are the four files at the top of `C:\Users\KimAl\dev\b1n0\`:

| File | Purpose |
|---|---|
| `CLAUDE.md` | Instructions for AI assistants (me, future Claude). Defines b1n0's positioning, the anti-gambling vocab rules, tech stack, schema, KYC tiers, Known Gaps. **When you ask me to do something across many sessions, this is the first thing I read.** Update when product/tech conventions change. |
| `README.md` | The repo's GitHub face. Quick-start, commands, env vars, deploy paths. Anyone landing on github.com/kimallenchee/b1n0 sees this first. |
| `LICENSE` | UNLICENSED — proprietary. b1n0 is closed-source. |
| `LEDGER_INVARIANTS.md` | The accounting rules: `balance_ledger` + `platform_ledger` must always reconcile to real money in custody. This is the audit story for CNAD + investors. |

---

## Layer 2 — `/docs/*.md` (this folder you're in)

Engineering + business reference. None of these render on the website. They're for **you, future devs, vendors on sales calls, and investors who ask "how does this work."**

| File | What's in it | When to open |
|---|---|---|
| `README.md` (this one) | Doc-system map + open to-dos | Whenever you feel lost |
| `payments-architecture.md` | The full architecture for payments + tokenization — Redbajas (cards), Vudy (crypto), Monetae (tokenization). Two-bank FBO/operating split. Flow diagrams. RACI per vendor. Phased rollout plan. | Before any vendor call, before any investor explaining the model |
| `vendor-outreach.md` | Copy-paste email templates + call agendas for Redbajas, Vudy, Monetae. The 12-question vendor questionnaire. | When you're about to email or meet a vendor |
| `handoff-payments-expert.md` | Single onboarding doc for the incoming payments / crypto expert — positioning, economic model, vendor status, what they can decide vs what needs Kim. | Send to the expert on day 1 |
| `env-variables.md` | Every environment variable b1n0 reads, where to set it (Vercel vs Supabase secret), per-phase activation steps | When wiring a new vendor or onboarding a new dev |
| `supabase-auth-email-templates.md` | Ready-to-paste HTML for the 5 Supabase auth emails (signup, reset password, magic link, change email, reauth) | Right now — you still need to paste these into the Supabase dashboard |
| `RESEND_SETUP.md` | Resend.com setup for transactional emails (event resolution wins/losses) | Already done; reference if you ever rotate keys |
| `SECURITY_AUDIT.md` | Security audit checklist (CSP, RLS, secrets handling). Useful for regulator/investor due-diligence | When someone asks "show me your security posture" |
| `sql-archive/` | Old SQL files from earlier work that aren't migrations. Archived for history. | Almost never — only if debugging something from before May |

---

## Layer 3 — `/src/content/*.ts`

These are TypeScript files that **export the user-facing Spanish copy** for two product surfaces. They're separate from `Layer 4` (the page components) because the page components are *renderers* and these files are the *content*.

| File | Renders at | What it holds |
|---|---|---|
| `src/content/documentation.ts` | `/documentacion` page | All sections, paragraphs, examples, callouts that appear on the user-facing docs page. JSON-style structured content. When you want to update what users read on /documentacion, edit this file (not Documentacion.tsx). |
| `src/content/tutorial.tsx` | The "Cómo participar" interactive tour modal | The illustrated onboarding slides users see the first time they sign in |

---

## Layer 4 — User-facing pages

These are React components that render the legal + trust + docs surfaces at b1n0.com. They share a `DocPageShell` component for consistent visual chrome.

| File | URL | Content lives in… |
|---|---|---|
| `src/pages/Legal.tsx` | `/terminos` + `/privacidad` | Inline JSX inside this file. 18 sections in Terms, 14 in Privacy. Spanish legal prose. To edit text, edit this file directly. |
| `src/pages/Confianza.tsx` | `/confianza` | Inline JSX. 9 sections + the floating "Descargar PDF" button. The PDF itself is generated by `scripts/build_confianza_pdf.py`. |
| `src/pages/Documentacion.tsx` | `/documentacion` | Renders content from `src/content/documentation.ts` (Layer 3) |

**Why the difference between Layer 3 and Layer 4 for Documentacion vs Legal/Confianza:**
The /documentacion page has so much content that it's easier to maintain as structured data (Layer 3). Legal/Confianza have less content + need finer typographic control, so the prose lives inline in the JSX (Layer 4).

---

## Where to find what — quick lookup

| I want to… | Open this |
|---|---|
| Change what users see on /documentacion | `src/content/documentation.ts` |
| Change what users see on /terminos or /privacidad | `src/pages/Legal.tsx` |
| Change what users see on /confianza | `src/pages/Confianza.tsx` (page) + `scripts/build_confianza_pdf.py` (PDF) |
| Change the onboarding tour content | `src/content/tutorial.tsx` |
| Update the architecture diagram for an investor | `docs/payments-architecture.md` |
| Email a vendor | `docs/vendor-outreach.md` |
| Find what env var to set for X | `docs/env-variables.md` |
| Add a new translatable chrome string | `src/i18n/locales/es.json` + add `t('key')` in the component |
| Update what AI agents know about the project | `CLAUDE.md` |
| Update the GitHub repo's public README | `README.md` |
| Understand the accounting invariants | `LEDGER_INVARIANTS.md` |

---

# Open to-dos — what's still left

Numbered roughly by priority. Items 1–4 unblock the beta launch. Items 5+ are post-launch.

## Pre-launch (do these before opening b1n0.com to real users)

### 1. Paste the Supabase auth email templates

The 5 templates (signup confirmation, password reset, magic link, change email, reauth) are written in `docs/supabase-auth-email-templates.md` but you have to paste them manually into the Supabase dashboard. I can't do this via Chrome connector — Supabase Studio blocks reading dashboard content with credentials in it.

**Where:** https://supabase.com/dashboard/project/bebdvsdiqlruqzmkvmgy/auth/templates
**Time:** ~5 minutes total
**Why it matters:** Right now signup emails look like generic Supabase emails, not branded b1n0 emails

### 2. Open Tres33's business bank account(s)

You need **two** Salvadoran bank accounts to be a real payments platform:
- **Operating account** — Tres33's working capital
- **FBO (customer-funds-in-custody) account** — held *for the benefit of* users, can't be touched for operating expenses

**Where:** Banco Cuscatlán, Banco Agrícola, or Banco Davivienda (whichever has best API access). Ask the bank manager for *"cuenta de depósito en custodia para fondos de clientes de plataforma digital."*

**Why it matters:** Without these, you can't accept real money via Pagadito or anyone else. This is the longest-lead-time item.

### 3. Decide & sign at least ONE payment vendor

Three vendors are scaffolded but none are signed for b1n0 yet:

| Vendor | What | Status |
|---|---|---|
| **Redbajas / Pagadito** | Cards — cash in + out | Sandbox code ready. Need b1n0's own contract (your lottery agreement won't work for b1n0). |
| **Vudy** | Crypto (USDC/USDT) rails | Stubbed. Need sales call + contract. |
| **Monetae** | Tokenization + custody | Stubbed. Need sales call + contract — also the most important regulatory shelter under CNAD. |

**Recommended order:** Monetae first (regulatory cover), then Vudy (crypto rails), then Pagadito (cards). All three email templates are in `docs/vendor-outreach.md`.

### 4. Smoke-test the live platform with $0 events

After deploy, create 2–3 test events through `/admin`, do a fake vote with adjusted-balance admin RPC, watch the flow end to end. You haven't done this since the reset.

## Post-launch (queued for after first real users)

### 5. English i18n — if/when needed

You stripped the EN toggle pre-launch. If English-speaking users start showing up, the path is:
- Restore the ES/EN pill in Footer.tsx (the code is commented out where the toggle was)
- Either fill out `en.json` manually OR add DeepL auto-translate at admin event creation
- See `docs/payments-architecture.md` and recent chat history for the full plan

### 6. Smart wallet provisioning (Privy)

For tokenization Phase 3. Every user gets an embedded smart wallet on signup. ~2 hours of work, blocked on Monetae contract decision.

### 7. Actual tokenization wiring (Monetae integration)

Once Monetae is signed: flip `platform_config.tokenization_enabled = 'true'`, populate the `event_tokens` table via the orchestrator edge function. See `docs/payments-architecture.md` §6 phased rollout.

### 8. Crypto deposits/withdrawals (Vudy integration)

Once Vudy is signed: set `crypto_deposits_enabled` + `crypto_withdrawals_enabled` flags to `true`, write the two edge functions (`vudy-payment` + `vudy-webhook`) following the Redbajas pattern.

### 9. PWA install prompt UX polish

PWA manifest is in place but the install prompt could be friendlier on iOS Safari (Apple ignores `manifest.webmanifest`).

### 10. Beta-signups admin view

The `beta_signups` table is collecting emails but there's no admin panel to view/export them. Add a simple read-only panel in `AdminPage.tsx`.

### 11. Notification preferences live in DB

Currently the notification preferences UI in Perfil doesn't persist — values get reset on reload. Wire to a `profiles.notification_prefs` JSONB column.

---

## How to track new to-dos going forward

I (Claude) track tasks per-session in a built-in task list, but **you can't see that list directly** between sessions. So I'll start dropping new open items here at the bottom of this file when we surface them mid-conversation. Look at `docs/README.md` (this file) any time you feel lost.

If you want a single command to print remaining work later, ask me: *"what's still open per docs/README.md?"* and I'll re-survey + update.

---

**Last updated:** 2026-05-26 — after the news rip-out + CLAUDE.md canonical positioning rewrite + drift sweep + handoff doc.

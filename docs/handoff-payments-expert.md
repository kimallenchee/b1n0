# Handoff to incoming payments / crypto expert

**Audience:** the person joining b1n0 to own payments + tokenization end-to-end.
**Author of this doc:** Kim (founder) with AI assistance, May 2026.
**TL;DR:** the product is ready, the rails are scaffolded vendor-agnostically, and nothing is signed yet — so you have leverage to choose the right counterparties.

---

## 1. What b1n0 actually is (so you don't get the wrong mental model)

b1n0 is an **LP-backed fixed-payout event-options market** for Central America. Users buy SÍ or NO positions on real-world events at a market price (cents on the dollar). Each contract pays exactly **$1.00 if the user's side wins, $0 if it loses.** The LP pool funds the payouts — meaning the LP is the counterparty, not other users.

It is **not**:

- a parimutuel (winning cobro is locked at entry; late entries don't dilute earlier ones)
- a peer-to-peer order book / CLOB (Kalshi-style)
- a brand-sponsored prize pool (that model was scoped early and removed entirely)
- a casino, sportsbook, or financial investment product
- a Polymarket clone (we are similar in spirit but legally and structurally different)

Read `CLAUDE.md` at repo root for the canonical positioning. If you find anything in the codebase contradicting it, it is drift and worth flagging.

**Operator:** Tres33 SAS de CV (Salvadoran company) under the CNAD framework.

**Audience today:** Central America Spanish-speakers (GT/SV/HN/NI/CR/PA/BZ). EN + other languages come back as crypto rails open the audience beyond CA.

**Beta status:** soft beta gate at `/` for expectation management. Not a regulatory wall. The product is technically fully open.

---

## 2. Economic model

- **LP capital funds the spread.** Per-event LPs deposit capital pre-event; they earn fees + (if their side loses across the book) a share of resolution skim. They take on bounded loss if their side wins.
- **Hybrid LP pool model.** Some events are 100% institutional (Tres33 + investors). Others toggle `lp_public` ON ("Abierto para LP público" in the event create form) and accept retail LP capital. There is **no** "anyone can be an LP" default — it's a per-event opt-in by the admin.
- **Blended platform take is ~8%**, split across:
  - **Compra fee** (1–5%) — taken on entry
  - **Spread capture** (1–2%) — the gap between buy and sell mid
  - **Salida fee** (2%) — taken on early-sell
  - **Resolution skim** (5%) — taken from the winning pool at settle
- **Accounting invariants** live in `LEDGER_INVARIANTS.md`. The `balance_ledger` + `platform_ledger` tables must reconcile to real money held in custody. This is the audit story for CNAD + investors. Don't break it.

---

## 3. Current state of payments rails

**Nothing is contracted for b1n0 yet.** The codebase is scaffolded vendor-agnostically (interfaces in `src/lib/payments/` and `src/lib/tokenization/`) so we can plug in whatever counterparty makes sense.

| Layer | Vendor scaffolded | Status |
|---|---|---|
| Cards (deposit/withdrawal) | **Redbajas / Pagadito** | Sandbox code path complete. PCI-scope-offloaded via `PagaditoIframeSheet.tsx`. No signed contract for b1n0. |
| Crypto rails (USDC/USDT in + out) | **Vudy** | Stubbed behind `usePaymentFlags`. No sales call, no contract. |
| Tokenization + custody (CTF-style) | **Monetae** (also considering Tohkn, etc.) | Stubbed. Most important regulatory shelter under CNAD. Negotiation open. |

### Critical do-not-touch

The Pagadito credentials currently in env (`client_id 019e0328-…`, `client_secret a8GXhg1Dpw…`) belong to Kim's **other lottery operation** (escoge2 / lotescdos), not b1n0. They were dropped in to let us test the sandbox code path locally without bothering vendor relationships. **Do not** use them to drive real transactions for b1n0, sandbox or live — that would cause friction with the existing vendor relationship and complicate b1n0's eventual contract. When b1n0 gets its own Pagadito contract, those creds get swapped out.

### What's wired vs stubbed

- **Wired (sandbox-ready):** Redbajas/Pagadito card flow end-to-end — iframe capture, edge function (`redbajas-payment`), webhook (`redbajas-webhook`), DB updates via `process_card_deposit` RPC, ledger writes, balance sync.
- **Stubbed:** Vudy crypto deposit/withdrawal flows. RPC stubs exist (`process_crypto_deposit`, `initiate_withdrawal`, `complete_withdrawal`) but the edge functions are not implemented. Pattern: follow the Redbajas edge-function structure exactly.
- **Stubbed:** Monetae tokenization. Tables exist (`event_tokens`, `crypto_treasury_wallets`), feature flag `tokenization_enabled` defaults to `false`. The orchestrator edge function that mints/burns event tokens has not been written.
- **Feature flags** live in `platform_config.value_text` (boolean as string — `'true'` / `'false'`). Read via `usePaymentFlags`. Toggle on/off without redeploy.

### Bank accounts (longest-lead-time item)

Tres33 needs **two Salvadoran bank accounts** before any real money moves through b1n0:

1. **Operating account** — Tres33's working capital. Standard business checking.
2. **FBO (for-benefit-of) custody account** — held *for the benefit of* users, can't be touched for operating expenses. The bank manager term to use: *"cuenta de depósito en custodia para fondos de clientes de plataforma digital."*

Recommended banks (best API access first): Banco Cuscatlán, Banco Agrícola, Banco Davivienda.

This is the single largest blocker. Until both accounts are open, neither cards nor crypto can settle to real custody.

---

## 4. Regulatory framing

- **Tres33 SAS de CV** is the operating entity for everything — events, payments, payouts, KYC.
- **CNAD (Comisión Nacional de Activos Digitales)** is the relevant Salvadoran regulator. b1n0 operates under their framework. Tokenization via a CNAD-licensed third-party provider (Monetae or equivalent) is the cleanest regulatory shelter.
- **KYC is 3-tier**, see `CLAUDE.md` for the table. Tier 2 + Tier 3 are Didit-backed (provider abstracted via `VITE_KYC_PROVIDER`).
- **AML/PEP screening** runs on Tier 3 promotion. Auto-promotes at $1k cumulative deposits.

---

## 5. What you can decide vs what needs Kim's sign-off

**You can decide alone:**
- Implementation details of vendor integrations (which edge functions to write, RPC shapes, error handling, retry policies)
- Whether to use a custodial vs non-custodial wallet pattern within each vendor's framework
- The exact webhook signing scheme (as long as we end up with HMAC-SHA256 or better)
- Which crypto chains to support beyond USDC/USDT day-1 (BNB, Tron, Polygon, etc.)
- Withdrawal limits per tier within the existing tier framework
- Reconciliation cadence

**Bring to Kim before committing:**
- Vendor selection (Monetae vs Tohkn vs other; Vudy vs Bitso vs Binance; Pagadito vs Wompi vs other)
- Anything that changes the LP economic split or the blended take
- Anything that requires a new bank account or a contract renegotiation
- Anything that materially changes the user-facing flow (e.g., adding seed-phrase steps mid-onboarding)
- Anything that changes Tres33's legal exposure

---


### Security posture (context, not your scope)

Before you dive in: the public security posture is already in place. Three-channel responsible disclosure (security@b1n0.com + GitHub PVR + OpenBugBounty), RFC 9116 security.txt, disclose.io standard adopted, Dependabot + Semgrep workflows running on every PR, GitHub Secret Scanning enabled. Public verification surfaces are listed in `docs/SECURITY_AUDIT.md` "Security Posture v2." This is mostly orthogonal to your payments work, but if you find anything in the vendor integrations that warrants a CVE, route it through the existing disclosure flow.

## 6. Files worth reading on day 1

In rough priority order:

1. **`CLAUDE.md`** — canonical product + tech context. Read first.
2. **`LEDGER_INVARIANTS.md`** — accounting invariants. Don't break these.
3. **`docs/payments-architecture.md`** — full vendor architecture, FBO/operating diagram, phased rollout plan.
4. **`docs/vendor-outreach.md`** — pre-written email templates + the 12-question vendor questionnaire.
5. **`docs/env-variables.md`** — every env var b1n0 reads and where to set it.
6. **`docs/README.md`** — map of the 4 documentation layers.
7. **`src/lib/payments/`** — PaymentRail interface + Redbajas implementation as the reference pattern.
8. **`src/lib/tokenization/`** — TokenizationProvider interface + stubs.
9. **`supabase/migrations/20260525_payments_tokenization_scaffold.sql`** — payment_methods, payment_transactions, vendor_webhooks, crypto_treasury_wallets schema.
10. **`supabase/migrations/20260525_payment_rpcs.sql`** — `process_card_deposit`, `process_crypto_deposit`, `initiate_withdrawal`, `complete_withdrawal`, `cancel_payment_transaction`.
11. **`supabase/functions/redbajas-payment/`** + **`redbajas-webhook/`** — the working pattern to copy for Vudy.
12. **`src/components/wallet/WalletSheet.tsx`** + **`PagaditoIframeSheet.tsx`** — UI surface for deposit/withdrawal.

---

## 7. Open work in order of impact

1. **Open the two Salvadoran bank accounts.** This blocks everything else. Kim's task, but you can help drive it.
2. **Choose + sign Monetae (or alternative).** Tokenization is the regulatory shelter. Without it, the platform's CNAD story is weaker.
3. **Choose + sign Vudy (or alternative crypto rail).** Unlocks the multilingual / global audience beyond CA.
4. **Sign b1n0's own Redbajas contract.** Replaces the borrowed creds from Kim's other operation.
5. **Implement `vudy-payment` + `vudy-webhook` edge functions** following the Redbajas pattern.
6. **Implement the Monetae orchestrator edge function** that mints `event_tokens` on event create and burns/settles on resolution.
7. **Flip feature flags** in `platform_config` as each vendor goes live: `card_deposits_enabled`, `crypto_deposits_enabled`, `crypto_withdrawals_enabled`, `tokenization_enabled`.

---

## 8. Communication

- Kim is the primary stakeholder. Treat anything in `CLAUDE.md` as the source of truth on product positioning — if you disagree with a framing, raise it and update the doc; don't drift the codebase.
- The docs are organized in 4 layers (`docs/README.md`). Update the right layer for the right audience.
- This project has had real drift problems in the past (sponsor model removed, parimutuel framing carried over, "social opinion game" framing carried over) — staying disciplined on vocabulary is part of the job.

Welcome aboard.

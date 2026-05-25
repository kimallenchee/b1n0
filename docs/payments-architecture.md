# b1n0 Payments + Tokenization Architecture

**Status:** Draft, vendor-shortlist phase
**Last updated:** 2026-05-25
**Owner:** Kim (Tres33 SAS de CV)

This document captures how money and tokens flow through b1n0. It's the
canonical reference for the engineering build, the vendor conversations,
and the regulator-facing description in `/confianza`.

---

## 1. The shape of the problem

b1n0 is an LP-backed fixed-payout market for Central American users. A
user signs up, deposits money, takes positions on events, and on
resolution either collects the payout or absorbs the loss. The platform
sits between three actors:

- **Users** — retail, mostly Salvadoran, depositing via card or crypto
- **LPs** — capital providers backing the fixed payouts
- **Tres33** — the operating company

The platform needs three independent infrastructure layers to function
end-to-end as a regulated product:

1. **Fiat rails** — accept card / bank deposits, push card / bank withdrawals
2. **Crypto rails** — accept stablecoin deposits, push stablecoin withdrawals
3. **Tokenization layer** — represent each position as an on-chain conditional token, settle on resolution

The vendors currently being evaluated map 1:1 to these layers:

| Layer            | Primary vendor              | Backup / alternative              |
|------------------|-----------------------------|-----------------------------------|
| Fiat rails       | **Redbajas** (Pagadito)     | Wompi, Hugo, Cybersource          |
| Crypto rails     | **Vudy**                    | IBEX direct, Conduit              |
| Tokenization     | **Monetae**                 | Tohkn, Tokeny + SV legal wrapper  |
| KYC              | Didit (already integrated)  | Sumsub (via Monetae bundle)       |

All three primary vendors are Salvadoran or operate under Salvadoran
licenses. This is deliberate — every regulated touchpoint lives under
one jurisdiction (CNAD / BCR / SSF) so the legal story to investors and
regulators is single-paragraph clean.

---

## 2. The two layers people confuse

Before getting into vendor specifics, the single most important
distinction in this architecture:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  LAYER 1 — Accounting (Postgres)                         │
│  • balance_ledger, platform_ledger, positions            │
│  • Just numbers. Books the claims.                       │
│  • The b1n0 backend lives entirely at this layer.        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  LAYER 2 — Custody (real money)                          │
│  • Fiat: Tres33's business bank accounts                 │
│    (operating + FBO customer-funds)                      │
│  • Crypto: USDC wallets (Monetae custody / Fireblocks)   │
│  • Tokens: smart-contract collateral pools               │
│  • Vendors live at this layer.                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Invariant:** for every $1 in `balance_ledger` (user claim), there must
be a corresponding $1 of asset backing in Layer 2. The split between
fiat-backing and crypto-backing can vary; the total must always reconcile.

This is the contract `LEDGER_INVARIANTS.md` exists to enforce, and the
single thing an auditor or CNAD inspector will care most about.

---

## 3. Why two bank accounts, not one (legal note)

Standard practice in regulated fintech — and what CNAD will expect — is
that user funds and operating capital are **legally separated**, not
just bookkept separately. Tres33 needs **two bank accounts**:

1. **Operating account** — Tres33's working capital, retained fees,
   LP cushion. Tres33's money. Can be tapped for payroll, vendor invoices,
   etc.
2. **Customer-funds-in-custody (FBO) account** — held *for the benefit
   of* users. In Salvadoran banking this is a *cuenta de depósito en
   custodia*. Cannot be touched for operating expenses; protected from
   creditors if Tres33 goes bankrupt; legally belongs to the users.

Mapping to b1n0's existing schema:

| Postgres                          | Bank-account-side                            |
|-----------------------------------|----------------------------------------------|
| `balance_ledger` user rows        | Backed by **customer funds (FBO) account**   |
| `platform_ledger` treasury row    | Backed by **operating account**              |
| Accrued fees on `event_markets`   | Move FBO → operating at settlement           |
| LP capital                        | Operating account (Tres33-controlled)        |

The same separation must apply to crypto custody — Monetae's wallet
architecture should distinguish a "customer funds vault" from a "Tres33
operating vault" with clear policy on which can fund which.

---

## 4. End-to-end flow per rail

### 4.1 Card deposit (Redbajas / Pagadito)

```
┌────────┐
│  User  │ 1. Clicks "Depositar con tarjeta", picks $100
└───┬────┘
    │
    │ 2. b1n0 backend POSTs /oauth/token to Redbajas → bearer token
    │ 3. b1n0 backend POSTs /api/payments with user metadata + amount
    │    → receives Pagadito session token
    │ 4. b1n0 renders Pagadito iframe (sandbox-payer or payer.pagadito.com)
    ▼
┌──────────────────┐
│ Pagadito iframe  │  5. User enters card data (b1n0 server NEVER sees it — PCI scope offloaded)
│ (3DS / Challenge)│  6. Card issuer authorizes
└────────┬─────────┘
         │
         │ 7. Pagadito webhook → b1n0 backend: "transaction X settled, $100"
         │ 8. b1n0 backend calls `deposit_balance(user_id=X, amount=100, source='redbajas', ref=...)`
         ▼
┌────────────────────────────┐
│ Postgres                    │
│ balance_ledger:  user +$100 │
│ payment_methods: card_xxx   │
└────────────────────────────┘
         ▲
         │
         │ 9. (T+2 days) Pagadito settles $100 minus fees to Tres33's FBO bank account
         │
┌────────────────────────────┐
│ Banco SV — FBO account      │  Customer funds segregated from operating.
└────────────────────────────┘
```

**What the b1n0 codebase needs to do:**
- Edge function `/api/redbajas-token` — proxy auth + setup-payer (so secrets stay server-side)
- Edge function `/api/redbajas-webhook` — receive Pagadito callback, verify signature, call `deposit_balance()`
- `WalletSheet` Depositar tab — render the iframe inside a `<BottomSheet>` with cleanup on close
- `payment_methods` table to record the source

### 4.2 Card / bank withdrawal

Pagadito supports payouts (push from your account to the user's card or
bank account). Flow mirrors the deposit:

1. User clicks "Retirar a tarjeta", confirms $50 to card ending 4242
2. b1n0 backend calls Pagadito payout API (need to confirm scope on sales call)
3. Pagadito moves $50 from FBO account → user's card / bank
4. Webhook back → b1n0 marks withdrawal `settled`

If Redbajas/Pagadito doesn't support direct payouts, the fallback is
manual ACH/wire via the FBO account's online banking, with admin queue
visible in `AdminPage.tsx`.

### 4.3 Crypto deposit (Vudy)

```
┌────────┐
│  User  │ 1. Clicks "Depositar con USDC", picks "Polygon"
└───┬────┘
    │
    │ 2. b1n0 backend calls Vudy Payments API → creates deposit address
    │    tied to user_id + Tres33 treasury wallet
    │ 3. b1n0 returns address + QR code to UI
    ▼
┌─────────────────┐
│  MetaMask /     │ 4. User scans QR, sends 100 USDC from their wallet
│  Phantom etc.   │
└────────┬────────┘
         │
         │ 5. On-chain confirmation (~30 sec on Polygon)
         │ 6. Vudy detects deposit, runs KYT via Chainalysis
         │ 7. Vudy webhook → b1n0: "user X deposited 100 USDC, tx_hash=0x..."
         ▼
┌────────────────────────────┐
│ Postgres                    │
│ balance_ledger:  user +$100 │
│ payment_methods: usdc-pol   │
└────────────────────────────┘
         ▲
         │
         │ 8. USDC now sits in Tres33's crypto treasury wallet
         │    (custody provided by Monetae / Fireblocks)
         │
┌────────────────────────────┐
│ Monetae Custody             │
│ Tres33 FBO USDC vault       │
└────────────────────────────┘
```

### 4.4 Crypto withdrawal (Vudy)

1. User clicks "Retirar a USDC", enters their wallet address (0xABC...) + picks chain
2. b1n0 backend calls `withdraw_balance(user_id, amount, dest_wallet, dest_chain)` → deducts from `balance_ledger`, creates pending row
3. b1n0 backend calls Vudy Send API → "send $50 USDC to 0xABC on Polygon from our treasury wallet"
4. Vudy signs and broadcasts the on-chain transfer (Monetae-custodied keys via Fireblocks MPC)
5. Webhook back → b1n0 marks withdrawal `settled` with tx_hash
6. User sees confirmation + block explorer link

### 4.5 Position lifecycle with tokenization (Monetae)

The fifth flow is the one that makes b1n0 *not a casino* legally —
positions become tradable digital assets, settled on-chain.

```
EVENT CREATION (admin)
┌──────────────────────────────────┐
│ AdminPage creates event "X"      │
│ → b1n0 calls Monetae:            │
│   "spawn CTF contract for event X│
│    with YES + NO outcome tokens" │
│ → Monetae deploys / registers    │
│ → b1n0 stores event_tokens row   │
│   (token_ids, contract, chain)   │
└──────────────────────────────────┘

USER BUYS POSITION
┌──────────────────────────────────┐
│ User clicks "$10 SÍ"             │
│ → b1n0 deducts $10 from saldo    │
│ → Position row created           │
│   (onchain_status='pending_mint')│
│ → b1n0 calls Monetae:            │
│   "mint 25 YES tokens for        │
│    user_X's wallet, collateral   │
│    $10 USDC from treasury"       │
│ → Monetae mints → token in       │
│   user wallet, USDC locked in    │
│   CTF contract                   │
│ → onchain_status='minted'        │
└──────────────────────────────────┘

EVENT RESOLVES
┌──────────────────────────────────┐
│ Resolver (Tres33 multisig +      │
│ Monetae co-signer) calls         │
│ resolve(event_X, 'YES')          │
│ → CTF marks YES winning          │
│ → User can call redeem(YES)      │
│   to get 1 USDC per token        │
│   (b1n0 UI does this for them    │
│   on settlement webhook)         │
└──────────────────────────────────┘

USER CASHES OUT
Same as 4.4 — winning USDC → user's external wallet
```

The crucial property: **once tokenization is live, every user position
has a real on-chain representation, not just a database row.** Users
who go crypto-native can export their tokens and trade them outside
b1n0. Regulators can audit the CTF contract directly. Investors can
verify the LP pool is real collateral, not a number on a screen.

---

## 5. Vendor responsibilities (the RACI)

| Function                          | Tres33 | Redbajas | Vudy | Monetae | Didit |
|-----------------------------------|--------|----------|------|---------|-------|
| Card payment capture (PCI scope)  | -      | **R**    | -    | -       | -     |
| Card → FBO bank settlement        | A      | **R**    | -    | -       | -     |
| Bank account (operating + FBO)    | **R**  | -        | -    | -       | -     |
| Crypto deposit address provisioning | A    | -        | **R**| -       | -     |
| Crypto send (withdrawal)          | A      | -        | **R**| -       | -     |
| KYT / on-chain AML monitoring     | A      | -        | **R**| C       | -     |
| USDC treasury custody             | A      | -        | -    | **R**   | -     |
| Token contract deployment         | A      | -        | -    | **R**   | -     |
| Token minting / burning           | A      | -        | -    | **R**   | -     |
| Event resolution authority        | **R**  | -        | -    | C       | -     |
| KYC user verification (T1/T2/T3)  | A      | -        | -    | -       | **R** |
| Postgres ledger (balance_ledger)  | **R**  | -        | -    | -       | -     |
| User-facing app (b1n0.com)        | **R**  | -        | -    | -       | -     |

R = Responsible, A = Accountable, C = Consulted

---

## 6. Phased rollout

The reason this architecture is being built now is to make the rollout
*sequential, not big-bang*. Each phase is independently shippable.

**Phase 0 — Scaffolding (this PR)**
- DB migrations: new tables (`event_tokens`, `payment_methods`,
  `crypto_destinations`), nullable columns added to `positions`,
  `profiles`
- TypeScript interfaces: `PaymentRail`, `TokenizationProvider`,
  `WalletProvider`. Stubs that throw `NotImplemented`.
- UI placeholders: WalletSheet has Crypto tab (greyed out "Próximamente")
- Investor / regulator docs updated to reference concrete vendor names
- **User-visible impact:** none. Foundation only.

**Phase 1 — Card rail live (Redbajas)**
- Edge functions `/api/redbajas-token` + `/api/redbajas-webhook`
- WalletSheet Depositar tab opens Pagadito iframe
- Withdrawal queue + admin approval flow in AdminPage
- Tres33 bank accounts opened (operating + FBO)
- **Trigger:** Redbajas contract signed, sandbox credentials in hand
- **User-visible impact:** real card deposits start working

**Phase 2 — Crypto rail live (Vudy)**
- Vudy API client + webhook handlers
- WalletSheet Crypto tab functional
- Tres33 treasury USDC wallet provisioned (with Monetae custody)
- **Trigger:** Vudy contract signed + custody arrangement confirmed
- **User-visible impact:** USDC deposits/withdrawals start working

**Phase 3 — Tokenization shadow mode (Monetae)**
- Embedded smart wallets on signup (Privy or Monetae-provided)
- New events auto-spawn CTF contracts
- Positions get tokens minted "in shadow" — DB is still authoritative,
  but tokens exist on-chain for parallel audit
- Old positions stay off-chain forever (grandfathered)
- **Trigger:** Monetae contract signed + CTF implementation confirmed
- **User-visible impact:** still none — tokens are silent

**Phase 4 — Tokenization authoritative**
- On-chain settlement becomes the source of truth for new events
- Users can export wallets to MetaMask
- Confianza page replaces "operado por proveedor licenciado" placeholder
  with literal Monetae attribution
- **Trigger:** Phase 3 has been live for 30+ days with zero
  reconciliation drift
- **User-visible impact:** "View on-chain" buttons appear on positions

**Phase 5 — Secondary market**
- Tokens become transferable between b1n0 users (and eventually to
  external addresses via Vudy)
- Users can sell positions before event closes
- **Trigger:** Phase 4 stable + market-maker arrangement in place

---

## 7. Open questions per vendor

These get asked on the next sales call with each vendor. Do not sign
without answers.

### Redbajas / Pagadito
1. Do you support **payouts** (push from merchant to cardholder) or only deposits?
2. What's the typical T+N settlement window to our bank account?
3. Per-transaction fee schedule — flat + percentage?
4. Is there an FBO-account integration pattern, or does everything settle to a single merchant account that we then need to split?
5. Chargeback handling — who eats the loss, what's the dispute window?
6. Does your platform accept prediction-market vertical, or is there a vertical restriction we need to verify?
7. Sandbox credentials immediately, or only after MSA signature?

### Vudy
1. Recommended **custody arrangement** for a Salvadoran fintech — IBEX, Monetae, or self-custody via Fireblocks?
2. KYT (Chainalysis) included in transaction fee or extra line item?
3. Per-deposit / per-send pricing — fixed or volume-tiered?
4. Acceptance of prediction-market vertical?
5. Bank-rail / fiat on-ramp in CA — does Payments API include local-bank → crypto, or crypto-only?
6. SLA on send completion (USDC on Polygon: how fast from API call to on-chain confirmation)?
7. Webhook delivery guarantees (at-least-once, dedup mechanism)?

### Monetae
1. Do you support **Conditional Token Framework (CTF)** or equivalent binary outcome / spawn-on-event tokens?
2. If not built-in, will your "Blockchain Solutions" team deploy CTF for us, and what's the engagement cost?
3. Per-event tokenization cost — flat per contract or per-token-mint?
4. Custody arrangement — Fireblocks MPC, what jurisdictions, what insurance?
5. KYC bridging — can you ingest Didit verifications, or require Sumsub re-verification?
6. Smart wallet provisioning — your own or partner with Privy / Coinbase Smart Wallet?
7. Resolver authority — single signer, multisig, oracle? We want a 2-of-3 (Tres33 + Monetae + neutral third party).
8. Reference customer in prediction-market or sports-trading vertical?
9. Time-to-first-tokenized-event from contract signing (realistic, not sales number)?
10. Asset-class permissions on the PSAD license — does it cover event-options tokens, or only RWA?

---

## 8. Source-of-truth references

- Redbajas API manual: `uploads/REDBAJAS Payment Services API Integration Manual Mar26.pdf`
- Vudy product overview: https://landing.vudy.app/
- Monetae product overview: https://monetae.io/
- Tohkn product overview: https://www.tohkn.com/en/ (under evaluation)
- CNAD registered DASPs: https://cnad.gob.sv/public-registry/digital-assets-service-provider/
- BCR registered PSBs: https://registrobitcoin.bcr.gob.sv/web/proveedores-registrados
- Didit KYC integration: see `CLAUDE.md` § "KYC — Didit Integration"
- b1n0 ledger invariants: `LEDGER_INVARIANTS.md`

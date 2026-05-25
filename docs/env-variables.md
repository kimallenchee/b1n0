# Environment variables — payments + tokenization

This document lists every environment variable b1n0 reads, where it
needs to be set (frontend / edge functions / DB), and the activation
state per phase.

**Security rule:** vendor credentials never live in the React bundle.
Anything prefixed `VITE_` is exposed to the browser; everything else
lives in Supabase secrets or Vercel project env and is only readable
by edge functions / server-side code.

---

## Already configured (don't touch)

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | Vercel + edge | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel | Public anon key for client SDK |
| `VITE_SENTRY_DSN` | Vercel (optional) | Monitoring; leave empty to skip |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge fns (auto by Supabase) | Service role for RPC-as-server |
| `DIDIT_API_KEY` | Edge secret | Didit KYC API |
| `DIDIT_WEBHOOK_SECRET` | Edge secret | Didit webhook HMAC verification |
| `DIDIT_WORKFLOW_ID_T2` | Edge secret | Tier 2 KYC workflow |
| `DIDIT_WORKFLOW_ID_T3` | Edge secret | Tier 3 KYC workflow |
| `APP_URL` | Edge secret | Used in KYC redirect URLs |
| `RESEND_API_KEY` | Edge secret | Transactional email (event resolution) |

---

## Phase 1 — Redbajas / Pagadito (CARDS)

Set these to turn on real card processing. Until they're set, the
PagaditoIframeSheet will return `redbajas_not_configured` and the UI
will show the error state.

### Supabase edge function secrets

Run these commands once you have credentials:

```bash
# Sandbox (use the credentials Kim shared from his other operation)
supabase secrets set REDBAJAS_API_BASE=https://sandbox-api.redbaja.com
supabase secrets set REDBAJAS_IFRAME_BASE=https://sandbox-payer.pagadito.com
supabase secrets set REDBAJAS_CLIENT_ID=<sandbox-client-id>
supabase secrets set REDBAJAS_CLIENT_SECRET=<sandbox-client-secret>
supabase secrets set REDBAJAS_WEBHOOK_SECRET=<get-from-redbajas-team>

# Production — different credentials, different host
# supabase secrets set REDBAJAS_API_BASE=https://api.redbaja.com
# supabase secrets set REDBAJAS_IFRAME_BASE=https://payer.pagadito.com
# (separate prod client_id + client_secret + webhook secret)
```

### Pagadito webhook URL — register with Redbajas

Give Redbajas/Pagadito this URL so they POST callbacks to it:

```
https://<your-supabase-project>.supabase.co/functions/v1/redbajas-webhook
```

(Replace `<your-supabase-project>` with your actual project ref; you
can find it as the subdomain of `VITE_SUPABASE_URL`.)

### Deploy the edge functions

```bash
supabase functions deploy redbajas-payment
supabase functions deploy redbajas-webhook
```

### Apply migrations

```bash
supabase db push
```

This creates the payment_methods, payment_transactions, event_tokens,
vendor_webhooks, crypto_treasury_wallets tables plus the
process_card_deposit / initiate_withdrawal / cancel_payment_transaction
RPCs.

### Test the end-to-end flow in sandbox

1. Open b1n0.com locally or on prod (with sandbox secrets set)
2. Sign in as a real user
3. Click Depositar → Tarjeta → enter amount $10 → Continuar a Pagadito
4. Iframe opens. Use Pagadito's test card numbers (ask Redbajas for the
   sandbox test card set)
5. Complete the payment in the iframe
6. Watch for the webhook to fire → `payment_transactions` row flips to
   `settled` → `balance_ledger` credited → UI shows the success screen

---

## Phase 2 — Vudy (CRYPTO)

Not yet activated. When Vudy contract is signed:

```bash
supabase secrets set VUDY_API_BASE=https://sandbox-api.vudy.app   # or prod
supabase secrets set VUDY_API_KEY=<your-vudy-api-key>
supabase secrets set VUDY_WEBHOOK_SECRET=<vudy-webhook-secret>
supabase secrets set VUDY_TRES33_WALLET_POLYGON=<treasury-wallet-on-polygon>
supabase secrets set VUDY_TRES33_WALLET_TRON=<treasury-wallet-on-tron>
```

The treasury wallets are addresses controlled by Tres33 — either
self-custodied (multisig) or held under Monetae/Fireblocks custody.
They get registered in the `crypto_treasury_wallets` table via:

```sql
INSERT INTO crypto_treasury_wallets (address, chain, purpose, custody_provider)
VALUES
  ('0x...polygon...', 'polygon', 'fbo_inbound',  'monetae'),
  ('0x...polygon...', 'polygon', 'fbo_outbound', 'monetae'),
  ('TR...tron...',    'tron',    'fbo_inbound',  'monetae'),
  ('TR...tron...',    'tron',    'fbo_outbound', 'monetae');
```

Then deploy:

```bash
supabase functions deploy vudy-payment    # (to be written)
supabase functions deploy vudy-webhook    # (to be written)
```

---

## Phase 3 — Monetae (TOKENIZATION)

Not yet activated. When Monetae contract is signed:

```bash
supabase secrets set MONETAE_API_BASE=<their-api-host>
supabase secrets set MONETAE_API_KEY=<api-key>
supabase secrets set MONETAE_TENANT_ID=<your-tenant>
supabase secrets set MONETAE_WEBHOOK_SECRET=<webhook-hmac>
supabase secrets set MONETAE_RESOLVER_ADDRESS=<2-of-3-multisig-address>
```

Then flip the master switch in platform_config:

```sql
UPDATE platform_config SET value = 'true'  WHERE key = 'tokenization_enabled';
UPDATE platform_config SET value = 'monetae' WHERE key = 'tokenization_provider';
UPDATE platform_config SET value = 'polygon' WHERE key = 'tokenization_chain';
```

From that point forward, every new event auto-spawns a CTF contract,
every new position gets pending_mint → minted on-chain, and event
resolutions trigger on-chain redemption.

---

## Phase 3a — Smart wallet provisioning (Privy or Monetae-native)

Smart wallets get provisioned per user. If using Privy:

```bash
# Frontend (exposed to browser — Privy's app id is public)
VITE_PRIVY_APP_ID=<from-privy-dashboard>

# Edge function (Privy server SDK)
supabase secrets set PRIVY_APP_SECRET=<from-privy-dashboard>
```

If Monetae provides their own wallet stack, replace with their config.

---

## Quick deploy checklist (Phase 1 today)

```bash
cd C:\Users\KimAl\dev\b1n0

# 1. Apply DB migrations (introduces tables + RPCs)
supabase db push

# 2. Push edge function secrets (use your sandbox creds from Pagadito)
supabase secrets set REDBAJAS_API_BASE=https://sandbox-api.redbaja.com
supabase secrets set REDBAJAS_IFRAME_BASE=https://sandbox-payer.pagadito.com
supabase secrets set REDBAJAS_CLIENT_ID=019e0328-1a0e-732b-9fd4-6c01b3a24dbf
supabase secrets set REDBAJAS_CLIENT_SECRET=a8GXhg1Dpw1LxICnNM36nSYDy1QyvrK0s6OyHMET
supabase secrets set REDBAJAS_WEBHOOK_SECRET=<TBD-ask-Redbajas-team>

# 3. Deploy the edge functions
supabase functions deploy redbajas-payment
supabase functions deploy redbajas-webhook

# 4. Push the frontend build to Vercel
git add .
git commit -m "feat(payments): wire Pagadito card deposit via Redbajas + scaffolding for Vudy/Monetae"
git push
npx vercel build --prod
npx vercel deploy --prebuilt --prod

# 5. Test in sandbox
# - Open b1n0.com, sign in, Depositar → Tarjeta → $10 → Continuar a Pagadito
# - Use Pagadito sandbox test cards (request set from Redbajas)
# - Confirm webhook fires + balance updates
```

---

## Migrating credentials when b1n0 gets its own Pagadito contract

The sandbox creds Kim shared belong to his other operation (escoge2 /
lotescdos). When b1n0 has its own production Pagadito agreement:

1. Get new client_id + client_secret + webhook secret from Redbajas
2. Update Supabase secrets with prod values:
   ```bash
   supabase secrets set REDBAJAS_API_BASE=https://api.redbaja.com
   supabase secrets set REDBAJAS_IFRAME_BASE=https://payer.pagadito.com
   supabase secrets set REDBAJAS_CLIENT_ID=<prod-id>
   supabase secrets set REDBAJAS_CLIENT_SECRET=<prod-secret>
   supabase secrets set REDBAJAS_WEBHOOK_SECRET=<prod-webhook-secret>
   ```
3. Redeploy edge functions (they pick up new env on cold start)
4. Update the Pagadito webhook URL registration with Redbajas to point
   at the production Supabase project (if different from sandbox)
5. Re-test with a small live deposit before opening to all users

No code changes required — the edge function reads everything from env.

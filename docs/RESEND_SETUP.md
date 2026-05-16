# Resend email setup (resolution emails)

This document covers the one-time setup needed before the
`send-resolution-email` Edge Function will actually deliver mail.

Once wired, the system auto-sends a Spanish HTML email every time a
position resolves (win / loss) or an LP deposit returns. Templates
live in `supabase/functions/send-resolution-email/index.ts`.

---

## 1. Create the Resend account

1. Sign up at [resend.com](https://resend.com).
2. In **Domains**, click *Add Domain* and enter `b1n0.com`.
3. Resend will give you four DNS records to add at GoDaddy
   (where the b1n0.com zone lives):

   | Type   | Name                | Purpose                          |
   |--------|---------------------|----------------------------------|
   | MX     | `send`              | Bounce + reply routing           |
   | TXT    | `send`              | SPF (`v=spf1 include:_spf.resend.com ~all`) |
   | TXT    | `resend._domainkey` | DKIM public key                  |
   | TXT    | `_dmarc`            | DMARC policy (`v=DMARC1; p=none;`) |

   Exact values are shown in the Resend dashboard — copy them
   verbatim. Propagation usually takes 5–30 minutes; Resend will
   show a green "Verified" pill once it confirms.

4. Once verified, go to **API Keys** → *Create API Key*. Name it
   `b1n0-production`, scope **Sending access**. Copy the key (it
   starts with `re_`). You will not see it again.

---

## 2. Set Supabase Edge Function secrets

The edge function needs three env vars. Run these from the b1n0
repo root with the Supabase CLI logged in to the b1n0 project:

```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set RESEND_FROM="b1n0 <hola@b1n0.com>"
supabase secrets set APP_URL=https://www.b1n0.com
```

`RESEND_FROM` is the literal `From:` header. The local-part
(`hola@`) doesn't need to exist as a real inbox; replies are caught
by the MX record you added above. For replies to land somewhere
useful, also add a `Reply-To:` later (TODO if needed).

---

## 3. Deploy the edge function

```bash
supabase functions deploy send-resolution-email
```

The deploy URL will be:
`https://<project-ref>.supabase.co/functions/v1/send-resolution-email`

Copy that URL — you'll paste it into Postgres in the next step.

---

## 4. Wire the Postgres trigger

Run the migration that ships with this feature:

```bash
supabase db push
# or psql the migration file directly:
psql $SUPABASE_DB_URL -f supabase/migrations/20260516_resolution_email_triggers.sql
```

Then point the trigger at the deployed function and give it the
service-role key it needs to call the edge fn:

```sql
-- 1. URL (replace <project-ref>)
UPDATE platform_config
SET    value_text = 'https://<project-ref>.supabase.co/functions/v1/send-resolution-email'
WHERE  key = 'resolution_email_url';

-- 2. Bearer token — MUST be the LEGACY service_role JWT (eyJ... format),
--    NOT the new sb_secret_... key. Supabase's edge function gateway
--    requires a JWT in the Authorization header; the sb_secret_... format
--    is a different system and gets rejected upstream with
--    UNAUTHORIZED_INVALID_JWT_FORMAT.
--
--    Find it: Supabase Dashboard → Settings → API Keys →
--    "Legacy anon, service_role API keys" tab → reveal service_role.
UPDATE platform_config
SET    value_text = 'eyJhbGciOi...your_legacy_service_role_jwt...'
WHERE  key = 'resolution_email_token';
```

Both keys default to NULL after the migration — until you set them
the trigger no-ops with a NOTICE, so the rest of the resolution
flow keeps working even if Resend is offline or unconfigured.

---

## 5. Smoke test

The cleanest test is to resolve a real test event end-to-end:

1. Create a tiny test event in the admin panel (1¢ entries).
2. Take a $0.50 SÍ position from a second account whose email
   inbox you can check.
3. Resolve "SÍ ganó" in the admin panel.
4. Within ~10 seconds the test account should receive the
   **¡Lo sabías!** email.
5. Confirm Resend logged the send under **Logs**.

If the email never arrives, check pg_net's outbox:

```sql
SELECT created, status_code, content
FROM   net._http_response
WHERE  created > now() - interval '5 minutes'
ORDER  BY created DESC
LIMIT  20;
```

Common failures:

| status_code | Likely cause                                              |
|-------------|-----------------------------------------------------------|
| 401         | `resolution_email_token` is wrong / missing               |
| 500 `email_provider_not_configured` | `RESEND_API_KEY` secret not set on the function |
| 502         | Resend rejected the send — open the response body         |
| (no row)    | URL is NULL — set `resolution_email_url`                  |

---

## 6. Optional: throttle for now

If you want emails OFF while you test other flows, just NULL the
URL — no code change needed:

```sql
UPDATE platform_config SET value_text = NULL
WHERE key = 'resolution_email_url';
```

---

## What's NOT in here yet

- Per-user "email me about resolutions" opt-out toggle. The
  `notification_prefs` jsonb on `profiles` already exists for the
  in-app side; piping it to the email trigger would be a small
  addition once we know users actually want the opt-out.
- Deposit / withdrawal receipts. Same pattern, different trigger
  source, different templates.
- Weekly digest. Lower priority — punt until v2.

/**
 * Edge function: POST /functions/v1/redbajas-webhook
 *
 * Receives payment-settled / payment-failed callbacks from Redbajas
 * (Pagadito). On a successful settlement we:
 *   1. Verify the source — accepted methods are HMAC signature OR
 *      shared-secret header. Redbajas's manual doesn't specify the
 *      signature shape (TODO: confirm with their integrations team
 *      on the sales call), so this implementation accepts either:
 *        a) `x-redbajas-signature` header containing HMAC-SHA256(secret, body) hex
 *        b) `x-redbajas-secret` header == REDBAJAS_WEBHOOK_SECRET
 *           (fallback only; less secure, use only in sandbox)
 *   2. Persist the raw payload to vendor_webhooks (audit trail +
 *      idempotency via (provider, external_id) unique index)
 *   3. Look up the matching payment_transactions row by provider_tx_id
 *   4. Call process_card_deposit RPC which atomically:
 *      - marks the payment_transactions row as 'settled'
 *      - inserts a credit into balance_ledger
 *      - bumps profile saldo
 *
 * Env vars:
 *   REDBAJAS_WEBHOOK_SECRET    — HMAC shared secret (set by Redbajas)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-redbajas-signature, x-redbajas-secret',
}

interface PagaditoWebhookPayload {
  event?: string                // 'payment.settled' | 'payment.failed' | etc
  transaction_id?: string       // session token from setup_payer (matches provider_tx_id)
  status?: string               // 'approved' | 'declined' | etc
  amount?: number
  currency?: string
  authorization_code?: string
  card_last4?: string
  card_brand?: string
  customer_email?: string
  fee?: number
  settled_at?: string
  // Pagadito's actual payload shape will vary; this is our best guess
  // pending vendor confirmation. Extra fields are preserved in the
  // raw payload stored in vendor_webhooks.payload.
  [key: string]: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_misconfigured' }, 500)
  }
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const rawBody = await req.text()
  const signature = req.headers.get('x-redbajas-signature') ?? ''
  const sharedSecret = req.headers.get('x-redbajas-secret') ?? ''
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || ''

  // Verify origin. HMAC preferred; shared-secret allowed in sandbox.
  const webhookSecret = Deno.env.get('REDBAJAS_WEBHOOK_SECRET') || ''
  const verified = await verifyWebhook({ rawBody, signature, sharedSecret, webhookSecret })
  if (!verified.ok) {
    // Still log to vendor_webhooks for audit, but reject processing.
    await logWebhook(admin, {
      payload: safeParse(rawBody),
      signature,
      ip,
      status: 'failed',
      processError: `signature_failed: ${verified.reason}`,
    })
    return json({ error: 'signature_invalid', reason: verified.reason }, 401)
  }

  let parsed: PagaditoWebhookPayload
  try {
    parsed = JSON.parse(rawBody) as PagaditoWebhookPayload
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const externalId = String(parsed.transaction_id || '')
  if (!externalId) {
    return json({ error: 'missing_transaction_id' }, 400)
  }

  // Idempotent inbox. If we've already processed this exact (provider,
  // external_id), return 200 so Pagadito stops retrying.
  const { data: existing } = await admin
    .from('vendor_webhooks')
    .select('id, status')
    .eq('provider', 'redbajas')
    .eq('external_id', externalId)
    .maybeSingle()
  if (existing?.status === 'processed') {
    return json({ ok: true, dedup: true }, 200)
  }

  // Insert (or update) the vendor_webhooks row.
  const webhookId = await logWebhook(admin, {
    payload: parsed,
    signature,
    ip,
    status: 'processing',
    externalId,
    eventType: parsed.event || 'payment.unknown',
  })

  // Match the payment_transactions row.
  const { data: tx, error: txErr } = await admin
    .from('payment_transactions')
    .select('id, user_id, gross_amount, currency, status')
    .eq('provider', 'redbajas')
    .eq('provider_tx_id', externalId)
    .maybeSingle()

  if (txErr || !tx) {
    await admin
      .from('vendor_webhooks')
      .update({ status: 'failed', process_error: 'tx_row_not_found', processed_at: new Date().toISOString() })
      .eq('id', webhookId)
    return json({ error: 'transaction_not_found', external_id: externalId }, 404)
  }

  if (tx.status === 'settled') {
    // Already settled — likely a duplicate webhook delivery.
    await admin
      .from('vendor_webhooks')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', webhookId)
    return json({ ok: true, dedup: true }, 200)
  }

  // Branch on Pagadito's status field.
  const status = (parsed.status || '').toLowerCase()
  const isSuccess = status === 'approved' || status === 'success' || status === 'settled' || parsed.event === 'payment.settled'

  if (!isSuccess) {
    // Failed / declined / cancelled — mark the tx accordingly.
    await admin
      .from('payment_transactions')
      .update({
        status: 'failed',
        failure_reason: `pagadito_${status || 'unknown'}`,
        failed_at: new Date().toISOString(),
      })
      .eq('id', tx.id)
    await admin
      .from('vendor_webhooks')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', webhookId)
    return json({ ok: true, outcome: 'failed' }, 200)
  }

  // Success path — call the RPC that atomically credits the balance.
  const fee = typeof parsed.fee === 'number' ? parsed.fee : 0
  const grossAmount = typeof parsed.amount === 'number' ? parsed.amount : tx.gross_amount
  const netAmount = grossAmount - fee

  const { error: rpcErr } = await admin.rpc('process_card_deposit', {
    p_payment_tx_id: tx.id,
    p_user_id: tx.user_id,
    p_gross_amount: grossAmount,
    p_fee_amount: fee,
    p_net_amount: netAmount,
    p_provider: 'redbajas',
    p_provider_ref: externalId,
    p_card_last4: parsed.card_last4 ?? null,
    p_card_brand: parsed.card_brand ?? null,
    p_authorization_code: parsed.authorization_code ?? null,
  })

  if (rpcErr) {
    await admin
      .from('vendor_webhooks')
      .update({
        status: 'failed',
        process_error: `rpc_failed: ${rpcErr.message}`,
        processed_at: new Date().toISOString(),
      })
      .eq('id', webhookId)
    return json({ error: 'rpc_failed', detail: rpcErr.message }, 500)
  }

  await admin
    .from('vendor_webhooks')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('id', webhookId)

  return json({ ok: true, outcome: 'settled', amount: netAmount }, 200)
})

// ─────────────────────────────────────────────────────────────────────

async function verifyWebhook(args: {
  rawBody: string
  signature: string
  sharedSecret: string
  webhookSecret: string
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!args.webhookSecret) {
    return { ok: false, reason: 'webhook_secret_not_configured' }
  }
  // Method A: HMAC-SHA256 hex signature header
  if (args.signature) {
    const expected = await hmacHex(args.webhookSecret, args.rawBody)
    if (timingSafeEqual(expected, args.signature)) return { ok: true }
    return { ok: false, reason: 'hmac_mismatch' }
  }
  // Method B: shared-secret header (sandbox-friendly fallback)
  if (args.sharedSecret && timingSafeEqual(args.sharedSecret, args.webhookSecret)) {
    return { ok: true }
  }
  return { ok: false, reason: 'no_valid_signature' }
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return { raw: s } }
}

async function logWebhook(
  admin: ReturnType<typeof createClient>,
  args: {
    payload: unknown
    signature: string
    ip: string
    status: 'received' | 'processing' | 'processed' | 'failed' | 'duplicate'
    externalId?: string
    eventType?: string
    processError?: string
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from('vendor_webhooks')
    .upsert(
      {
        provider: 'redbajas',
        event_type: args.eventType || 'unknown',
        external_id: args.externalId || null,
        payload: args.payload as Record<string, unknown>,
        signature: args.signature,
        ip_address: args.ip,
        status: args.status,
        process_error: args.processError,
      },
      { onConflict: 'provider,external_id', ignoreDuplicates: false },
    )
    .select('id')
    .single()
  if (error) {
    console.error('[redbajas-webhook] vendor_webhooks upsert failed', error)
    return null
  }
  return data?.id ?? null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

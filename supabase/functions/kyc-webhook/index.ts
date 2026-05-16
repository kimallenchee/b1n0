/**
 * Edge function: POST /functions/v1/kyc-webhook
 *
 * Receives status updates from Didit when a session changes state.
 * Validates HMAC-SHA256 signature against DIDIT_WEBHOOK_SECRET,
 * checks timestamp freshness, then updates the matching row in
 * public.kyc_sessions. The trigger kyc_sessions_promote will
 * automatically promote profiles.tier when status becomes Approved.
 *
 * Env vars:
 *   DIDIT_WEBHOOK_SECRET — from Didit Console > Settings > Webhook Secret
 *
 * Request headers (set by Didit):
 *   x-signature-v2   — hex HMAC-SHA256 of the raw body
 *   x-timestamp      — unix seconds (reject if > 300s old)
 *
 * Response:  200 { received: true }
 *            401 { error: 'invalid_signature' | 'stale_timestamp' }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const signature = req.headers.get('x-signature-v2') ?? ''
  const timestamp = req.headers.get('x-timestamp') ?? ''
  const secret = Deno.env.get('DIDIT_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'webhook_not_configured' }, 500)

  // Read raw body (must hash exact bytes Didit sent)
  const rawBody = await req.text()

  // 1. Timestamp freshness check (Didit recommends 5 minutes)
  const now = Math.floor(Date.now() / 1000)
  const ts = parseInt(timestamp, 10)
  if (!ts || Math.abs(now - ts) > 300) {
    return json({ error: 'stale_timestamp' }, 401)
  }

  // 2. HMAC verify
  const expected = await hmacSha256Hex(secret, rawBody)
  if (!timingSafeEqual(expected, signature)) {
    return json({ error: 'invalid_signature' }, 401)
  }

  // 3. Parse payload
  let payload: {
    session_id: string
    status: string
    webhook_type?: string
    vendor_data?: string
    decision?: unknown
  }
  try { payload = JSON.parse(rawBody) } catch { return json({ error: 'invalid_json' }, 400) }

  if (!payload.session_id || !payload.status) {
    return json({ error: 'missing_fields' }, 400)
  }

  // 4. Update the matching kyc_sessions row
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await supabase
    .from('kyc_sessions')
    .update({
      status: payload.status,
      decision: payload.decision ?? null,
    })
    .eq('provider', 'didit')
    .eq('provider_session_id', payload.session_id)

  if (error) {
    console.error('kyc_sessions update failed', error)
    return json({ error: 'db_error' }, 500)
  }

  // The kyc_sessions_promote trigger handles profile.tier promotion.
  return json({ received: true }, 200)
})

// ── helpers ──────────────────────────────────────────────────
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

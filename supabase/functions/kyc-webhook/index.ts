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
 *   x-signature        — same as x-signature-v2 in current Didit
 *   x-signature-v2     — hex HMAC-SHA256, may include timestamp in the signing data
 *   x-signature-simple — hex HMAC-SHA256 of the raw body alone
 *   x-timestamp        — unix seconds (reject if > 300s old)
 *
 * We accept the webhook if EITHER the simple signature matches
 * `HMAC(secret, body)` OR the v2 signature matches the Stripe-style
 * `HMAC(secret, "${timestamp}.${body}")`. This is defensive because
 * Didit's signing algorithm has shifted between versions and we
 * don't want a future change on their side to silently break
 * tier promotions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-signature, x-signature-v2, x-signature-simple, x-timestamp',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })

  const sigV2     = req.headers.get('x-signature-v2') ?? req.headers.get('x-signature') ?? ''
  const sigSimple = req.headers.get('x-signature-simple') ?? ''
  const timestamp = req.headers.get('x-timestamp') ?? ''
  const secret    = Deno.env.get('DIDIT_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'webhook_not_configured' }, 500)

  const rawBody = await req.text()

  const now = Math.floor(Date.now() / 1000)
  const ts  = parseInt(timestamp, 10)
  if (!ts || Math.abs(now - ts) > 300) {
    return json({ error: 'stale_timestamp', sent: ts, server: now }, 401)
  }

  // Parse body once, used by both Simple and V2 verifiers.
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  // Per Didit docs (docs.didit.me/integration/webhooks):
  //   X-Signature-Simple = HMAC(secret, "${timestamp}:${session_id}:${status}:${webhook_type}")
  //   X-Signature-V2     = HMAC(secret, canonical_json) where canonical_json is
  //                        JSON.stringify(body, sort_keys=true, separators=(',',':'), ensure_ascii=false)
  //                        with floats-that-are-integers normalized to int.
  // We try both — Simple is dead reliable and middleware-safe; V2 is the
  // "recommended" one per Didit but requires careful canonicalization.
  const simpleCanonical = [
    String(parsed.timestamp ?? ''),
    String(parsed.session_id ?? ''),
    String(parsed.status ?? ''),
    String(parsed.webhook_type ?? ''),
  ].join(':')
  const v2Canonical = canonicalJsonForV2(parsed)

  const expectSimple = await hmacSha256Hex(secret, simpleCanonical)
  const expectV2     = await hmacSha256Hex(secret, v2Canonical)

  const okSimple = sigSimple && timingSafeEqual(expectSimple, sigSimple)
  const okV2     = sigV2     && timingSafeEqual(expectV2,     sigV2)

  if (!okSimple && !okV2) {
    // Temporary: return full diagnostic in response body. This is
    // visible in Didit's delivery log UI so we can debug signature
    // mismatches without needing Supabase function logs. REMOVE THIS
    // before any sensitive launch — leaking what we computed could
    // help an attacker reverse-engineer the secret if they can
    // observe our responses.
    console.error('invalid_signature', {
      sigV2_in:     sigV2.slice(0, 12),
      sigSimple_in: sigSimple.slice(0, 12),
      expectV2:     expectV2.slice(0, 12),
      expectSimple: expectSimple.slice(0, 12),
      ts,
    })
    return json({
      error:         'invalid_signature',
      _debug_diditv2:  sigV2.slice(0, 12),
      _debug_diditsimple: sigSimple.slice(0, 12),
      _debug_we_expect_v2:     expectV2.slice(0, 12),
      _debug_we_expect_simple: expectSimple.slice(0, 12),
      _debug_secret_len:       secret.length,
      _debug_body_len:         rawBody.length,
      _debug_ts:               ts,
    }, 401)
  }

  // Re-cast parsed body for downstream use (already JSON-validated above)
  const payload = parsed as {
    session_id?: string
    status?: string
    webhook_type?: string
    vendor_data?: string
    decision?: unknown
  }

  if (!payload.session_id || !payload.status) {
    return json({ error: 'missing_fields' }, 400)
  }

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

  return json({ received: true }, 200)
})

// Canonical JSON serialization that matches Didit's X-Signature-V2 algorithm.
// Mirrors their Python reference: json.dumps(data, sort_keys=True,
// separators=(",", ":"), ensure_ascii=False) with shorten_floats applied
// first (any float that is an integer becomes int — e.g. 1.0 → 1).
//
// JavaScript JSON.stringify already uses ascii-as-is (ensure_ascii=False)
// and no whitespace when you don't pass an indent arg. The trick parts:
//   - Keys must be sorted at every nesting level (we walk the object)
//   - Floats that are integers must be emitted without decimal (.0)
//     — JavaScript's JSON.stringify already does this (1.0 serializes as "1")
//     so we get this for free.
function canonicalJsonForV2(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(value as object).sort()) {
      sorted[k] = sortKeysDeep((value as Record<string, unknown>)[k])
    }
    return sorted
  }
  return value
}

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
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

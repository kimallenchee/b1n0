/**
 * Edge function: POST /functions/v1/kyc-create-session
 *
 * Creates a Didit verification session for the calling user and
 * stores it in public.kyc_sessions. Returns the verification_url
 * for the client to redirect to (or embed via iframe).
 *
 * Env vars (set via `supabase secrets set`):
 *   DIDIT_API_KEY
 *   DIDIT_WORKFLOW_ID_T2
 *   DIDIT_WORKFLOW_ID_T3
 *   APP_URL
 *
 * Request:    POST  with JSON body { target_tier: 2 | 3 }
 * Response:   200   { verification_url, session_id }
 *             400   { error }
 *             401   { error: 'unauthorized' }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DIDIT_API = 'https://verification.didit.me/v3/session/'

// CORS headers applied to EVERY response (including preflight + errors).
// Browsers refuse to read responses that lack these headers, even error responses.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

interface CreateBody { target_tier: 2 | 3 }

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })
  }

  // 1. Auth — extract user from JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: userData, error: authErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (authErr || !userData?.user) {
    return json({ error: 'unauthorized' }, 401)
  }
  const user = userData.user

  // 2. Validate body
  let body: CreateBody
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const targetTier = body.target_tier
  if (targetTier !== 2 && targetTier !== 3) {
    return json({ error: 'target_tier must be 2 or 3' }, 400)
  }

  // 3. Resolve workflow_id from env
  const workflowKey = targetTier === 2 ? 'DIDIT_WORKFLOW_ID_T2' : 'DIDIT_WORKFLOW_ID_T3'
  const workflowId = Deno.env.get(workflowKey)
  const apiKey = Deno.env.get('DIDIT_API_KEY')
  const appUrl = Deno.env.get('APP_URL') ?? 'https://www.b1n0.com'
  if (!apiKey || !workflowId) {
    return json({ error: 'kyc_provider_not_configured' }, 500)
  }

  // 4. Call Didit
  const diditRes = await fetch(DIDIT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      callback: `${appUrl}/perfil?kyc=complete`,
      vendor_data: user.id,
      metadata: { target_tier: targetTier, source: 'b1n0-web' },
      contact_details: user.email ? { email: user.email, email_lang: 'es' } : undefined,
    }),
  })

  if (!diditRes.ok) {
    const text = await diditRes.text()
    console.error('Didit session create failed', diditRes.status, text)
    return json({ error: 'provider_error', detail: text.slice(0, 200) }, 502)
  }
  const session = await diditRes.json() as {
    session_id: string
    verification_url: string
    status: string
  }

  // 5. Persist session row (idempotent via UNIQUE constraint)
  const { error: insErr } = await supabase
    .from('kyc_sessions')
    .insert({
      user_id: user.id,
      target_tier: targetTier,
      provider: 'didit',
      provider_session_id: session.session_id,
      verification_url: session.verification_url,
      status: session.status,
    })
  if (insErr) {
    console.error('kyc_sessions insert failed', insErr)
  }

  return json({
    verification_url: session.verification_url,
    session_id: session.session_id,
  }, 200)
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  })
}

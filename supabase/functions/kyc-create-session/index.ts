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
  const session = await diditRes.json() as Record<string, unknown>

  // Log the FULL response so we can see what Didit actually returns.
  // Their docs claim `verification_url` but in practice the field name
  // varies — could be `url`, `verification_link`, or embedded in `session_token`.
  console.log('Didit session response:', JSON.stringify(session))

  // Try several possible field names Didit might use for the URL.
  const verificationUrl =
    (session.verification_url as string | undefined) ??
    (session.url as string | undefined) ??
    (session.verification_link as string | undefined) ??
    (session.session_url as string | undefined) ??
    // Fallback: construct from session_id if Didit uses a predictable URL pattern
    (session.session_id ? `https://verify.didit.me/session/${session.session_id}` : undefined)

  if (!verificationUrl) {
    console.error('Didit response missing URL — full payload:', JSON.stringify(session))
    return json({
      error: 'didit_response_no_url',
      detail: 'Didit returned a session but no verification URL field could be found',
      didit_response_keys: Object.keys(session),
      didit_response: session,
    }, 502)
  }

  const sessionId = session.session_id as string
  const sessionStatus = (session.status as string) ?? 'Not Started'

  // 5. Persist session row (idempotent via UNIQUE constraint)
  const { error: insErr } = await supabase
    .from('kyc_sessions')
    .insert({
      user_id: user.id,
      target_tier: targetTier,
      provider: 'didit',
      provider_session_id: sessionId,
      verification_url: verificationUrl,
      status: sessionStatus,
    })
  if (insErr && insErr.code !== '23505') {
    // Ignore duplicate-key violations — that just means user clicked Retry
    // and Didit reused the same session. The row already exists.
    console.error('kyc_sessions insert failed', insErr)
  }

  return json({
    verification_url: verificationUrl,
    session_id: sessionId,
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

/**
 * Edge function: POST /functions/v1/beta-signup
 *
 * Records a beta-gate signup. Called from BetaGate.tsx when the user
 * submits their email at the landing page.
 *
 * Why an edge function (vs direct client insert): we want to capture the
 * IP address from request headers (x-forwarded-for / cf-connecting-ip),
 * which the browser can't set itself. The RPC `record_beta_signup` runs
 * SECURITY DEFINER so the service role can insert into the locked-down
 * beta_signups table.
 *
 * Request body: { email: string, referrer?: string }
 * Response:     { id: string, isReturning: boolean, visitCount: number }
 *               | { error: string }
 *
 * The function is fully public (no JWT required) — the email field is
 * the only PII we collect and it goes straight to the RPC which
 * validates format.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

interface SignupRequest {
  email?: string
  referrer?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: SignupRequest
  try {
    body = await req.json() as SignupRequest
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'invalid_email' }, 400)
  }

  // Capture IP from common forwarding headers. Vercel + Supabase Edge use
  // x-forwarded-for; Cloudflare adds cf-connecting-ip. The first value
  // in x-forwarded-for is the client IP (subsequent are proxies).
  const ipAddress =
    (req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '').slice(0, 64)

  const userAgent = (req.headers.get('user-agent') || '').slice(0, 512)
  const referrer  = (body.referrer || req.headers.get('referer') || '').slice(0, 512)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_misconfigured' }, 500)
  }
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await admin.rpc('record_beta_signup', {
    p_email:      email,
    p_ip_address: ipAddress || null,
    p_user_agent: userAgent || null,
    p_referrer:   referrer  || null,
  })
  if (error) {
    if (error.message?.includes('invalid_email')) {
      return json({ error: 'invalid_email' }, 400)
    }
    return json({ error: 'rpc_failed', detail: error.message }, 500)
  }
  // The RPC returns SETOF (id, is_returning, visit_count). Supabase
  // surfaces it as an array even when LIMIT 1; take the first row.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return json({ error: 'no_row_returned' }, 500)
  }
  return json({
    id:           row.id,
    isReturning:  Boolean(row.is_returning),
    visitCount:   Number(row.visit_count) || 1,
  }, 200)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

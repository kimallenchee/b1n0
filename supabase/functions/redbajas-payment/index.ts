/**
 * Edge function: POST /functions/v1/redbajas-payment
 *
 * Initiates a card-deposit flow via the Redbajas/Pagadito API. The
 * client never touches the OAuth client_secret — it lives in this
 * edge function's env. The flow:
 *
 *   1. Client (authenticated user) POSTs { amount, currency } here
 *   2. We obtain a Redbajas OAuth bearer (cached in memory per warm
 *      instance; the bearer is valid for ~1 year per their docs)
 *   3. We call POST {api}/api/payments with the user's profile data
 *      and the amount → receives a Pagadito session token
 *   4. We create a `payment_transactions` row in 'pending' state so
 *      the inbound webhook has somewhere to land
 *   5. We return { token, iframeUrl } to the client; the client
 *      renders the Pagadito iframe and the user completes the
 *      payment there
 *
 * Env vars required (set via `supabase secrets set ...`):
 *   REDBAJAS_API_BASE       — https://sandbox-api.redbaja.com or https://api.redbaja.com
 *   REDBAJAS_IFRAME_BASE    — https://sandbox-payer.pagadito.com or https://payer.pagadito.com
 *   REDBAJAS_CLIENT_ID
 *   REDBAJAS_CLIENT_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * The client_secret never leaves the function. The iframe URL +
 * session token returned to the client is what gets embedded in the
 * UI; the user enters their card data inside Pagadito's iframe
 * (PCI scope offloaded to them — our app never sees PAN data).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

// In-memory token cache. Redbajas tokens have a 1-year `expires_in`
// per the docs, but we re-fetch if we have <60s remaining to avoid
// races. Survives across requests within the same warm instance.
let cachedToken: { value: string; expiresAt: number } | null = null

interface PaymentRequest {
  amount: number          // gross amount in USD (or other currency)
  currency?: string       // default 'USD'
  description?: string    // shown in the Pagadito iframe; default 'Saldo b1n0'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // 1. Authenticate the caller. We require a valid Supabase JWT in
  //    the Authorization header — the user's identity drives which
  //    profile we attach to the payment + which balance the deposit
  //    eventually credits.
  const authHeader = req.headers.get('authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_misconfigured' }, 500)
  }

  // Use the user's JWT to load *their* profile (RLS-protected) —
  // this both validates the JWT and gives us the data we need to
  // pass to Pagadito's setup_payer call.
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ error: 'invalid_token' }, 401)
  const userId = userData.user.id

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('id, name, email, phone, country_code, address, city, state')
    .eq('id', userId)
    .single()
  if (profileErr || !profile) {
    return json({ error: 'profile_not_found' }, 404)
  }

  // 2. Parse + validate the body.
  let body: PaymentRequest
  try {
    body = await req.json() as PaymentRequest
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body.amount !== 'number' || body.amount <= 0 || body.amount > 5000) {
    return json({ error: 'invalid_amount', message: 'Amount must be > 0 and <= 5000' }, 400)
  }
  const currency = body.currency || 'USD'
  const description = body.description || `Saldo b1n0 ${currency}${body.amount.toFixed(2)}`

  // 3. Get Pagadito OAuth bearer (cached when fresh).
  const apiBase = Deno.env.get('REDBAJAS_API_BASE') || 'https://sandbox-api.redbaja.com'
  const iframeBase = Deno.env.get('REDBAJAS_IFRAME_BASE') || 'https://sandbox-payer.pagadito.com'
  const clientId = Deno.env.get('REDBAJAS_CLIENT_ID')
  const clientSecret = Deno.env.get('REDBAJAS_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ error: 'redbajas_not_configured' }, 500)
  }

  let bearer: string
  try {
    bearer = await getCachedBearer(apiBase, clientId, clientSecret)
  } catch (e) {
    return json({ error: 'pagadito_auth_failed', detail: String(e) }, 502)
  }

  // 4. Call setup_payer to get the session token. Country/state default
  //    to El Salvador if we don't have richer data on the profile.
  const setupBody = {
    domain: new URL(req.url).hostname,
    returnUrl: 'https://www.b1n0.com/wallet/return',
    name: (profile.name || 'Cliente').split(' ')[0],
    lastname: (profile.name || 'b1n0').split(' ').slice(1).join(' ') || 'Cliente',
    email: profile.email,
    address: profile.address || 'San Salvador',
    countryId: 222, // El Salvador per Pagadito's country catalog
    state: profile.state || 'San Salvador',
    city: profile.city || 'San Salvador',
    phone: profile.phone || '76701968',
    details: [{ quantity: 1, description, amount: body.amount }],
    currencyId: currency,
  }

  const setupRes = await fetch(`${apiBase}/api/payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(setupBody),
  })

  if (!setupRes.ok) {
    const text = await setupRes.text()
    return json({ error: 'pagadito_setup_failed', status: setupRes.status, detail: text }, 502)
  }

  const setupJson = await setupRes.json() as {
    status?: string
    data?: { token?: string }
  }
  const sessionToken = setupJson?.data?.token
  if (!sessionToken) {
    return json({ error: 'pagadito_no_token', response: setupJson }, 502)
  }

  // 5. Record a pending payment_transactions row so the inbound
  //    webhook has something to update when Pagadito confirms.
  //    Service-role client because the user shouldn't insert directly.
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: txRow, error: txErr } = await admin
    .from('payment_transactions')
    .insert({
      user_id: userId,
      direction: 'deposit',
      rail: 'card',
      provider: 'redbajas',
      gross_amount: body.amount,
      fee_amount: 0, // populated on webhook settlement
      net_amount: body.amount,
      currency,
      status: 'pending',
      provider_tx_id: sessionToken,
      initiated_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (txErr) {
    // Non-fatal: payment can still proceed; we just won't have a tx
    // row to attach the webhook to. Log and continue — manual
    // reconciliation handles the gap.
    console.error('[redbajas-payment] tx insert failed', txErr)
  }

  // 6. Return the bits the client needs to render the iframe.
  return json({
    sessionToken,
    iframeUrl: `${iframeBase}/?lang=es&token=${encodeURIComponent(sessionToken)}`,
    paymentTransactionId: txRow?.id,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }, 200)
})

async function getCachedBearer(
  apiBase: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt - now > 60) {
    return cachedToken.value
  }
  const res = await fetch(`${apiBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: '',
    }),
  })
  if (!res.ok) {
    throw new Error(`oauth failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('no access_token in response')
  cachedToken = {
    value: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  }
  return cachedToken.value
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

/**
 * reconciliation-alert
 *
 * Invoked by the `notify_reconciliation_critical` trigger via pg_net
 * when a row is inserted into `reconciliation_log` with
 * status = 'critical'. Forwards the row to Sentry as a captured
 * message, tagged 'reconciliation_drift' so it routes to whatever
 * alert channel the team has configured for that tag.
 *
 * Secrets (set via `supabase secrets set`):
 *   SENTRY_DSN                   — Sentry project DSN
 *   RECONCILIATION_ALERT_SECRET  — shared secret matching
 *                                  platform_config.reconciliation_alert_secret
 *
 * The shared secret keeps strangers from spamming Sentry through
 * this endpoint. The function is deployed without JWT verification
 * (`--no-verify-jwt`) so it can be called from inside a Postgres
 * trigger without juggling Supabase auth tokens.
 *
 * Body shape (from the trigger):
 *   {
 *     event: 'reconciliation_drift',
 *     severity: 'error',
 *     row: { id, run_at, ledger_sum, balance_sum, … status, notes }
 *   }
 */

interface AlertBody {
  event?: string
  severity?: 'error' | 'warning' | 'info'
  row?: Record<string, unknown>
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-alert-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ParsedDsn {
  host: string
  projectId: string
  publicKey: string
}

function parseDsn(dsn: string): ParsedDsn | null {
  // Format: https://<key>@<host>/<project>
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.replace(/^\//, '')
    return { host: u.host, projectId, publicKey: u.username }
  } catch {
    return null
  }
}

async function shipToSentry(dsn: string, body: AlertBody): Promise<{ ok: boolean; status: number }> {
  const parsed = parseDsn(dsn)
  if (!parsed) return { ok: false, status: 400 }

  const endpoint = `https://${parsed.host}/api/${parsed.projectId}/store/?sentry_version=7&sentry_key=${parsed.publicKey}&sentry_client=b1n0-recon-alert/1.0`

  const event = {
    message: `Reconciliation drift detected (${body.row?.status ?? 'critical'})`,
    level: body.severity ?? 'error',
    tags: {
      reconciliation_drift: 'true',
      status: String(body.row?.status ?? 'critical'),
      source: 'b1n0/reconciliation-alert',
    },
    extra: body.row ?? {},
    platform: 'javascript',
    sdk: { name: 'b1n0-recon-alert', version: '1.0' },
    timestamp: new Date().toISOString(),
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=b1n0-recon-alert/1.0`,
    },
    body: JSON.stringify(event),
  })

  return { ok: res.ok, status: res.status }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Auth: require shared secret in X-Alert-Secret header.
  const expectedSecret = Deno.env.get('RECONCILIATION_ALERT_SECRET')
  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'function misconfigured: RECONCILIATION_ALERT_SECRET not set' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  const provided = req.headers.get('x-alert-secret') ?? ''
  if (provided !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: AlertBody
  try {
    body = (await req.json()) as AlertBody
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sentryDsn = Deno.env.get('SENTRY_DSN')
  if (!sentryDsn) {
    return new Response(
      JSON.stringify({ error: 'function misconfigured: SENTRY_DSN not set', received: body }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const result = await shipToSentry(sentryDsn, body)

  return new Response(
    JSON.stringify({
      forwarded: result.ok,
      sentry_status: result.status,
      event: body.event ?? null,
    }),
    {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})

/**
 * Edge function: POST /functions/v1/send-resolution-email
 *
 * Sends a confirmation email to a user after their position resolves
 * (won, lost, or LP capital returned). Triggered by the
 * notifications_send_email Postgres trigger on AFTER INSERT for
 * type='resultado' or type='lp_resolution'.
 *
 * Env vars (set via `supabase secrets set`):
 *   RESEND_API_KEY     — from resend.com/api-keys
 *   RESEND_FROM        — verified sender, e.g. "b1n0 <hola@b1n0.com>"
 *   APP_URL            — for in-email links, e.g. https://www.b1n0.com
 *
 * Request body (JSON):
 *   {
 *     user_id: string,
 *     type:    'win' | 'loss' | 'lp_return',
 *     event_question: string,
 *     amount?: number,            // payout for win, recouped for LP
 *     entry?: number,             // entry for context
 *     event_id?: string,          // for deep link
 *   }
 *
 * Auth: requires service_role (call from Postgres via pg_net, or admin tooling).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API = 'https://api.resend.com/emails'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

interface ResolveEmailBody {
  user_id: string
  type: 'win' | 'loss' | 'lp_return'
  event_question: string
  amount?: number
  entry?: number
  event_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Service-role auth only — this function should not be callable from the browser.
  // Supabase's gateway already validates the JWT is signed by this project; we
  // additionally confirm the role claim is `service_role` so anon JWTs can't
  // reach this code path.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  let claimedRole = ''
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
    claimedRole = String(payload.role ?? '')
  } catch {
    return json({ error: 'invalid_jwt' }, 401)
  }
  if (claimedRole !== 'service_role') {
    return json({ error: 'service_role_required' }, 401)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromAddress = Deno.env.get('RESEND_FROM') ?? 'b1n0 <noreply@b1n0.com>'
  const appUrl = Deno.env.get('APP_URL') ?? 'https://www.b1n0.com'
  if (!apiKey) return json({ error: 'email_provider_not_configured' }, 500)

  let body: ResolveEmailBody
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  if (!body.user_id || !body.type || !body.event_question) {
    return json({ error: 'missing_required_fields' }, 400)
  }

  // Look up the user's email
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(body.user_id)
  if (userErr || !userData?.user?.email) {
    console.error('User email lookup failed', userErr)
    return json({ error: 'user_not_found' }, 404)
  }
  const toEmail = userData.user.email
  const userName = (userData.user.user_metadata?.name as string | undefined) ?? 'Hola'

  const { subject, html, text } = renderEmail(body, appUrl, userName.split(' ')[0])

  // Send via Resend
  const resendRes = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [toEmail],
      subject,
      html,
      text,
    }),
  })

  if (!resendRes.ok) {
    const text = await resendRes.text()
    console.error('Resend send failed', resendRes.status, text)
    return json({ error: 'send_failed', detail: text.slice(0, 200) }, 502)
  }

  return json({ sent: true, to: toEmail }, 200)
})

// ── Email templates ──────────────────────────────────────────
// Palette mirrors the b1n0 dark-mode UI so emails feel like an
// extension of the product, not a generic transactional message.
//
//   Background    #090b10  (= --b1n0-bg)
//   Card          #161920  (= --b1n0-card)
//   Surface       #111318  (= --b1n0-surface) — used inside cards for sub-panels
//   Border        rgba(255,255,255,0.08)
//   Text primary  #e2e4ed  (= --b1n0-text-1)
//   Text muted    #8b8fa3  (= --b1n0-muted)
//   Accent (SÍ)   #14b8a6  (= --b1n0-si)
//   Accent bg     rgba(20,184,166,0.14)
//   Loss/neutral  #f59e0b  (= --b1n0-no, amber — never red)
//
// Note: many email clients (Outlook desktop in particular) strip CSS
// variables. We inline literal hex values instead of var() refs.

const COLORS = {
  bg:        '#090b10',
  card:      '#161920',
  surface:   '#111318',
  border:    'rgba(255,255,255,0.08)',
  text1:     '#e2e4ed',
  muted:     '#8b8fa3',
  si:        '#14b8a6',
  siBg:      'rgba(20,184,166,0.14)',
  no:        '#f59e0b',
  noBg:      'rgba(245,158,11,0.12)',
}

function renderEmail(b: ResolveEmailBody, appUrl: string, firstName: string) {
  const amount = (b.amount ?? 0).toFixed(2)
  const entry = (b.entry ?? 0).toFixed(2)
  const portafolioUrl = `${appUrl}/portafolio`
  // Reserved for future use — keep computed in case we wire deep links
  // back into individual emails. (Currently we always send users to
  // their portafolio.)
  void (b.event_id ? `${appUrl}/eventos/${b.event_id}` : portafolioUrl)

  if (b.type === 'win') {
    return {
      subject: `¡Lo sabías! Cobraste $${amount}`,
      html: shell({
        title: '¡Lo sabías!',
        accent: COLORS.si,
        body: `
          <p style="font-size:16px;line-height:1.6;color:${COLORS.text1};margin:0 0 18px;">
            ${firstName}, tu voto salió.
          </p>
          <p style="font-size:14px;line-height:1.55;color:${COLORS.muted};margin:0 0 20px;">
            ${escapeHtml(b.event_question)}
          </p>
          <div style="background:${COLORS.siBg};border-left:3px solid ${COLORS.si};padding:18px 20px;border-radius:8px;margin:0 0 24px;">
            <p style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${COLORS.si};margin:0 0 6px;">Cobro</p>
            <p style="font-size:32px;font-weight:800;color:${COLORS.si};margin:0;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;">+$${amount}</p>
          </div>
          <p style="font-size:14px;line-height:1.55;color:${COLORS.muted};margin:0 0 26px;">
            Ya está en tu saldo. Podés hacer otro voto o retirar cuando quieras.
          </p>
          ${cta('Ver en tu portafolio', portafolioUrl)}
        `,
      }),
      text: `${firstName}, tu voto salió.\n\n${b.event_question}\n\nCobro: +$${amount}\n\nYa está en tu saldo. ${portafolioUrl}`,
    }
  }

  if (b.type === 'loss') {
    return {
      subject: 'Esta vez no',
      html: shell({
        title: 'Esta vez no',
        accent: COLORS.muted,
        body: `
          <p style="font-size:16px;line-height:1.6;color:${COLORS.text1};margin:0 0 18px;">
            ${firstName}, tu voto no salió esta vez.
          </p>
          <p style="font-size:14px;line-height:1.55;color:${COLORS.muted};margin:0 0 20px;">
            ${escapeHtml(b.event_question)}
          </p>
          <div style="background:${COLORS.surface};border:1px solid ${COLORS.border};padding:16px 20px;border-radius:8px;margin:0 0 24px;">
            <p style="font-size:11px;color:${COLORS.muted};margin:0 0 4px;">Entrada</p>
            <p style="font-size:18px;font-weight:700;color:${COLORS.text1};margin:0;font-variant-numeric:tabular-nums;">$${entry}</p>
          </div>
          <p style="font-size:14px;line-height:1.55;color:${COLORS.muted};margin:0 0 26px;">
            Hay nuevos votos todos los días. Seguí participando — los que más saben son los que más opinan.
          </p>
          ${cta('Ver votos activos', `${appUrl}/inicio`)}
        `,
      }),
      text: `${firstName}, esta vez no.\n\n${b.event_question}\n\nEntrada: $${entry}\n\nHay nuevos votos todos los días. ${appUrl}/inicio`,
    }
  }

  // lp_return
  return {
    subject: `Tu capital LP volvió: $${amount}`,
    html: shell({
      title: 'Capital devuelto',
      accent: COLORS.si,
      body: `
        <p style="font-size:16px;line-height:1.6;color:${COLORS.text1};margin:0 0 18px;">
          ${firstName}, el evento que respaldaste se resolvió.
        </p>
        <p style="font-size:14px;line-height:1.55;color:${COLORS.muted};margin:0 0 20px;">
          ${escapeHtml(b.event_question)}
        </p>
        <div style="background:${COLORS.siBg};border-left:3px solid ${COLORS.si};padding:18px 20px;border-radius:8px;margin:0 0 24px;">
          <p style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${COLORS.si};margin:0 0 6px;">Capital + ganancia</p>
          <p style="font-size:32px;font-weight:800;color:${COLORS.si};margin:0;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;">+$${amount}</p>
        </div>
        <p style="font-size:14px;line-height:1.55;color:${COLORS.muted};margin:0 0 26px;">
          Ya está acreditado en tu saldo. Podés respaldar otro evento como LP o retirar tu capital cuando quieras.
        </p>
        ${cta('Ver mi portafolio LP', portafolioUrl)}
      `,
    }),
    text: `${firstName}, tu capital LP volvió.\n\n${b.event_question}\n\nCapital + ganancia: +$${amount}\n\nYa está en tu saldo. ${portafolioUrl}`,
  }
}

function shell({ title, accent, body }: { title: string; accent: string; body: string }): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:${COLORS.text1};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:32px 16px;background:${COLORS.bg};">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:${COLORS.card};border-radius:14px;overflow:hidden;border:1px solid ${COLORS.border};">
        <tr><td style="padding:28px 32px 8px;">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:${accent};text-transform:uppercase;margin:0;">b1n0</p>
        </td></tr>
        <tr><td style="padding:4px 32px 0;">
          <h1 style="font-size:28px;font-weight:800;color:${COLORS.text1};margin:0 0 8px;letter-spacing:-0.7px;line-height:1.15;">${title}</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 32px;">
          ${body}
        </td></tr>
        <tr><td style="padding:18px 32px 24px;border-top:1px solid ${COLORS.border};">
          <p style="font-size:11px;color:${COLORS.muted};margin:0;line-height:1.7;">
            Tres33 SAS de CV · El Salvador · soporte@b1n0.com<br>
            Recibís este correo porque participás en b1n0. Cambiá tus preferencias en tu perfil.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function cta(label: string, href: string): string {
  // White text on the SÍ teal — same as the in-app CTA. Inline padding
  // is heavy because Gmail strips outer margin-on-link styling.
  return `<a href="${href}" style="display:inline-block;padding:13px 22px;background:${COLORS.si};color:#0a0c10;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:0.2px;">${label}</a>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

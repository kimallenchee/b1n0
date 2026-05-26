# Supabase Auth email templates

These are the 5 templates Supabase sends from `Project Settings → Authentication → Email Templates`. Each one below is fully on-brand: real b1n0 logo (PNG, Gmail/Outlook compatible), Inter font (Google Fonts `<link>` for Apple Mail + Gmail web, system fallback for Outlook), brand green `#06D47F`, dark-mode card on dark page, full Spanish copy per template type.

**How to use:** open https://supabase.com/dashboard/project/bebdvsdiqlruqzmkvmgy/auth/templates → click each template tab → paste the corresponding HTML below into the **Message (HTML)** field → also update the **Subject** field above the editor → click **Save**. Repeat for all 5.

The Supabase template variables (`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`) are evaluated by Supabase before sending — leave them as-is in the HTML.

---

## 1. Confirm signup

**Subject:** `Confirmá tu correo en b1n0`

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark">
  <title>Confirmá tu correo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body, td, p, h1, h2, a, span { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#090b10;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e2e4ed;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:36px 16px;background:#090b10;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:#161920;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:28px 32px 4px;">
          <img src="https://www.b1n0.com/brand/b1n0-logo-white.png" alt="b1n0" width="68" height="28" style="display:block;height:28px;width:auto;border:0;outline:0;text-decoration:none;">
        </td></tr>
        <tr><td style="padding:18px 32px 0;">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#06D47F;text-transform:uppercase;margin:0;">Bienvenido</p>
        </td></tr>
        <tr><td style="padding:4px 32px 0;">
          <h1 style="font-size:30px;font-weight:800;color:#e2e4ed;margin:0 0 8px;letter-spacing:-0.8px;line-height:1.12;">Confirmá tu correo</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 32px;">
          <p style="font-size:16px;line-height:1.6;color:#e2e4ed;margin:0 0 18px;">
            Estás a un clic de entrar a b1n0 — el mercado de opciones sobre eventos donde demostrás que sabés más que todos.
          </p>
          <p style="font-size:14px;line-height:1.55;color:#8b8fa3;margin:0 0 26px;">
            Confirmá tu cuenta para empezar a votar:
          </p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;background:#06D47F;color:#0a0c10;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:0.2px;">
            Confirmar cuenta
          </a>
          <p style="font-size:13px;color:#8b8fa3;margin:28px 0 0;line-height:1.55;">
            Si no creaste esta cuenta, podés ignorar este correo — nadie más recibirá nada.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 24px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="font-size:11px;color:#8b8fa3;margin:0;line-height:1.7;">
            Tres33 SAS de CV · El Salvador · <a href="mailto:soporte@b1n0.com" style="color:#8b8fa3;text-decoration:underline;">soporte@b1n0.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 2. Reset password

**Subject:** `Recuperá tu acceso a b1n0`

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark">
  <title>Recuperá tu contraseña</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body, td, p, h1, h2, a, span { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#090b10;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e2e4ed;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:36px 16px;background:#090b10;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:#161920;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:28px 32px 4px;">
          <img src="https://www.b1n0.com/brand/b1n0-logo-white.png" alt="b1n0" width="68" height="28" style="display:block;height:28px;width:auto;border:0;outline:0;text-decoration:none;">
        </td></tr>
        <tr><td style="padding:18px 32px 0;">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#06D47F;text-transform:uppercase;margin:0;">Recuperación</p>
        </td></tr>
        <tr><td style="padding:4px 32px 0;">
          <h1 style="font-size:30px;font-weight:800;color:#e2e4ed;margin:0 0 8px;letter-spacing:-0.8px;line-height:1.12;">Cambiá tu contraseña</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 32px;">
          <p style="font-size:16px;line-height:1.6;color:#e2e4ed;margin:0 0 18px;">
            Pediste recuperar el acceso a tu cuenta de b1n0. Hacé clic para crear una contraseña nueva:
          </p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;background:#06D47F;color:#0a0c10;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:0.2px;">
            Cambiar contraseña
          </a>
          <p style="font-size:13px;color:#8b8fa3;margin:28px 0 0;line-height:1.55;">
            El enlace expira en 1 hora. Si no pediste recuperar tu contraseña, ignorá este correo — tu cuenta sigue segura.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 24px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="font-size:11px;color:#8b8fa3;margin:0;line-height:1.7;">
            Tres33 SAS de CV · El Salvador · <a href="mailto:soporte@b1n0.com" style="color:#8b8fa3;text-decoration:underline;">soporte@b1n0.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 3. Magic link

**Subject:** `Tu enlace para entrar a b1n0`

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark">
  <title>Tu enlace de acceso</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body, td, p, h1, h2, a, span { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#090b10;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e2e4ed;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:36px 16px;background:#090b10;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:#161920;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:28px 32px 4px;">
          <img src="https://www.b1n0.com/brand/b1n0-logo-white.png" alt="b1n0" width="68" height="28" style="display:block;height:28px;width:auto;border:0;outline:0;text-decoration:none;">
        </td></tr>
        <tr><td style="padding:18px 32px 0;">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#06D47F;text-transform:uppercase;margin:0;">Tu enlace</p>
        </td></tr>
        <tr><td style="padding:4px 32px 0;">
          <h1 style="font-size:30px;font-weight:800;color:#e2e4ed;margin:0 0 8px;letter-spacing:-0.8px;line-height:1.12;">Iniciá sesión en b1n0</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 32px;">
          <p style="font-size:16px;line-height:1.6;color:#e2e4ed;margin:0 0 18px;">
            Hacé clic para entrar — sin contraseña, sin pasos:
          </p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;background:#06D47F;color:#0a0c10;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:0.2px;">
            Entrar a b1n0
          </a>
          <p style="font-size:13px;color:#8b8fa3;margin:28px 0 0;line-height:1.55;">
            El enlace expira en 1 hora y solo se puede usar una vez. Si no pediste este enlace, ignorá este correo.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 24px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="font-size:11px;color:#8b8fa3;margin:0;line-height:1.7;">
            Tres33 SAS de CV · El Salvador · <a href="mailto:soporte@b1n0.com" style="color:#8b8fa3;text-decoration:underline;">soporte@b1n0.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 4. Change email address

**Subject:** `Confirmá tu nuevo correo en b1n0`

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark">
  <title>Confirmá tu nuevo correo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body, td, p, h1, h2, a, span { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#090b10;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e2e4ed;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:36px 16px;background:#090b10;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:#161920;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:28px 32px 4px;">
          <img src="https://www.b1n0.com/brand/b1n0-logo-white.png" alt="b1n0" width="68" height="28" style="display:block;height:28px;width:auto;border:0;outline:0;text-decoration:none;">
        </td></tr>
        <tr><td style="padding:18px 32px 0;">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#06D47F;text-transform:uppercase;margin:0;">Cambio de correo</p>
        </td></tr>
        <tr><td style="padding:4px 32px 0;">
          <h1 style="font-size:30px;font-weight:800;color:#e2e4ed;margin:0 0 8px;letter-spacing:-0.8px;line-height:1.12;">Confirmá tu nuevo correo</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 32px;">
          <p style="font-size:16px;line-height:1.6;color:#e2e4ed;margin:0 0 18px;">
            Pediste cambiar el correo asociado a tu cuenta de b1n0 a:
          </p>
          <div style="background:#111318;border:1px solid rgba(255,255,255,0.08);padding:14px 18px;border-radius:10px;margin:0 0 22px;">
            <p style="font-size:14px;font-weight:600;color:#e2e4ed;margin:0;word-break:break-all;">{{ .NewEmail }}</p>
          </div>
          <p style="font-size:14px;line-height:1.55;color:#8b8fa3;margin:0 0 26px;">
            Confirmá el cambio para que este correo se vuelva tu nuevo acceso:
          </p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;background:#06D47F;color:#0a0c10;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:0.2px;">
            Confirmar cambio
          </a>
          <p style="font-size:13px;color:#8b8fa3;margin:28px 0 0;line-height:1.55;">
            Si no pediste este cambio, ignorá este correo y revisá la seguridad de tu cuenta.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 24px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="font-size:11px;color:#8b8fa3;margin:0;line-height:1.7;">
            Tres33 SAS de CV · El Salvador · <a href="mailto:soporte@b1n0.com" style="color:#8b8fa3;text-decoration:underline;">soporte@b1n0.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 5. Reauthentication (code-based, not link)

**Subject:** `Tu código de verificación b1n0: {{ .Token }}`

Note: this template uses `{{ .Token }}` (a 6-digit code) instead of a `{{ .ConfirmationURL }}`. The user types the code into the app, so the email shows the code prominently in a copyable box.

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark">
  <title>Tu código de verificación</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body, td, p, h1, h2, a, span { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#090b10;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e2e4ed;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:36px 16px;background:#090b10;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:#161920;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:28px 32px 4px;">
          <img src="https://www.b1n0.com/brand/b1n0-logo-white.png" alt="b1n0" width="68" height="28" style="display:block;height:28px;width:auto;border:0;outline:0;text-decoration:none;">
        </td></tr>
        <tr><td style="padding:18px 32px 0;">
          <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#06D47F;text-transform:uppercase;margin:0;">Verificación</p>
        </td></tr>
        <tr><td style="padding:4px 32px 0;">
          <h1 style="font-size:30px;font-weight:800;color:#e2e4ed;margin:0 0 8px;letter-spacing:-0.8px;line-height:1.12;">Confirmá que sos vos</h1>
        </td></tr>
        <tr><td style="padding:14px 32px 32px;">
          <p style="font-size:16px;line-height:1.6;color:#e2e4ed;margin:0 0 22px;">
            Para una acción sensible en tu cuenta, ingresá este código en b1n0:
          </p>
          <div style="background:rgba(6,212,127,0.12);border:1px solid #06D47F;padding:22px 20px;border-radius:14px;margin:0 0 22px;text-align:center;">
            <p style="font-size:40px;font-weight:800;color:#06D47F;margin:0;letter-spacing:6px;font-variant-numeric:tabular-nums;font-family:'Inter',monospace;">{{ .Token }}</p>
          </div>
          <p style="font-size:13px;color:#8b8fa3;margin:0 0 18px;line-height:1.55;">
            El código expira en 5 minutos.
          </p>
          <p style="font-size:13px;color:#8b8fa3;margin:0;line-height:1.55;">
            Si no estabas intentando hacer una acción en b1n0, ignorá este correo y revisá la seguridad de tu cuenta.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 24px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="font-size:11px;color:#8b8fa3;margin:0;line-height:1.7;">
            Tres33 SAS de CV · El Salvador · <a href="mailto:soporte@b1n0.com" style="color:#8b8fa3;text-decoration:underline;">soporte@b1n0.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## Testing checklist after pasting

For each template:
1. Click **Save** in the Supabase editor
2. From a fresh email (or use `+test@gmail.com` aliases), trigger the flow:
   - Confirm signup → sign up a new account on b1n0.com
   - Reset password → click "forgot password" on login
   - Magic link → if you have magic-link enabled, use it
   - Change email → from /perfil, change the email
   - Reauthentication → trigger an MFA-style sensitive action
3. Open the email in Gmail web (best preview), Apple Mail (validates Inter), and Outlook (validates fallback)
4. Visually check: logo loads, font is Inter (not Times/Arial fallback), green is vibrant brand green, dark background renders correctly

If the logo doesn't show: Gmail blocks remote images for new senders. Check `Always display images from <your-sender-email>` in Gmail's image-blocking notice.

"""
build_confianza_pdf.py

Generates the investor/regulator-facing trust pack PDF that mirrors
the /confianza page content. The PDF is the artifact you attach to an
email; /confianza is the link you drop in chat. Same content, two
surfaces — keep them in sync when editing either.

Output: public/docs/b1n0-confianza.pdf

Run from repo root:
  python scripts/build_confianza_pdf.py

Dependencies:
  pip install reportlab --break-system-packages

Design choices:
  - Helvetica family (ships with reportlab) — no font installation
    needed, looks clean, prints crisply. We sacrifice the Syne/DM Sans
    brand identity for portability; the cover does the brand work.
  - 8.5" x 11" US Letter (standard for investor decks; EU recipients
    have no issue printing).
  - Two-tone palette: white background, b1n0-teal #14b8a6 for accents,
    near-black #111827 for body. High contrast, low ink usage.
  - Anchor-friendly: each section starts on its own page so links
    from elsewhere can deep-link by page number.
"""

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pathlib import Path
import datetime

# ── Palette (mirrors b1n0 light-mode tokens) ─────────────────
TEAL = HexColor("#14b8a6")         # primary accent
INK = HexColor("#111827")          # body text
MUTED = HexColor("#6b7280")        # secondary text
BORDER = HexColor("#e5e7eb")       # hairlines + dividers
AMBER = HexColor("#d97706")        # risk callout
LIGHT_BG = HexColor("#f9fafb")     # callout backgrounds

# ── Typography ────────────────────────────────────────────────
FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_OBLIQUE = "Helvetica-Oblique"

# ── Page geometry ─────────────────────────────────────────────
PAGE_W, PAGE_H = LETTER
MARGIN_X = 0.75 * inch
MARGIN_TOP = 0.85 * inch
MARGIN_BOTTOM = 0.85 * inch
CONTENT_W = PAGE_W - 2 * MARGIN_X


def draw_page_header(c, page_label):
    """Tight header strip — page label left, brand right."""
    y = PAGE_H - 0.45 * inch
    c.setFont(FONT_BOLD, 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, y, page_label.upper())
    c.setFont(FONT_BOLD, 8)
    c.setFillColor(TEAL)
    c.drawRightString(PAGE_W - MARGIN_X, y, "b1n0 · CONFIANZA")
    # Hairline rule below the header
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(MARGIN_X, y - 6, PAGE_W - MARGIN_X, y - 6)


def draw_page_footer(c, page_num, total):
    """Footer with Tres33 + page numbers."""
    y = 0.45 * inch
    c.setFont(FONT_REGULAR, 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, y, "Tres33 SAS de CV · El Salvador · b1n0.com")
    c.drawRightString(PAGE_W - MARGIN_X, y, f"{page_num} / {total}")


def section_title(c, y, text):
    """Section heading — small kicker + big title."""
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(TEAL)
    c.drawString(MARGIN_X, y, "SECCIÓN")
    y -= 24
    c.setFont(FONT_BOLD, 26)
    c.setFillColor(INK)
    c.drawString(MARGIN_X, y, text)
    return y - 28


def body_paragraph(c, y, text, max_width=None, leading=14, font_size=10.5, color=None):
    """Draw a paragraph with naive word-wrapping."""
    if max_width is None:
        max_width = CONTENT_W
    if color is None:
        color = INK
    c.setFont(FONT_REGULAR, font_size)
    c.setFillColor(color)
    words = text.split()
    lines = []
    line = []
    for w in words:
        test = " ".join(line + [w])
        if c.stringWidth(test, FONT_REGULAR, font_size) <= max_width:
            line.append(w)
        else:
            lines.append(" ".join(line))
            line = [w]
    if line:
        lines.append(" ".join(line))
    for ln in lines:
        c.drawString(MARGIN_X, y, ln)
        y -= leading
    return y


def bullet(c, y, text, leading=14, font_size=10.5):
    """Indented bullet line with teal square marker."""
    c.setFillColor(TEAL)
    c.rect(MARGIN_X + 2, y + 2, 4, 4, fill=1, stroke=0)
    c.setFont(FONT_REGULAR, font_size)
    c.setFillColor(INK)
    indent_x = MARGIN_X + 16
    max_w = CONTENT_W - 16
    words = text.split()
    lines = []
    line = []
    for w in words:
        test = " ".join(line + [w])
        if c.stringWidth(test, FONT_REGULAR, font_size) <= max_w:
            line.append(w)
        else:
            lines.append(" ".join(line))
            line = [w]
    if line:
        lines.append(" ".join(line))
    for i, ln in enumerate(lines):
        c.drawString(indent_x if i == 0 else indent_x, y, ln)
        y -= leading
    return y - 4


def callout_box(c, y, title, body, color=TEAL):
    """Rounded-rect callout with a colored left bar.

    Heading uses INK (high contrast on the light background); the
    accent color lives in the left bar only. Previously the heading
    was colored, which produced teal-on-teal-tint and amber-on-amber
    contrast failures.
    """
    box_h = 70
    box_y = y - box_h + 4
    # left accent bar (the only colored element — keeps brand presence)
    c.setFillColor(color)
    c.rect(MARGIN_X, box_y, 3, box_h, fill=1, stroke=0)
    # background
    c.setFillColor(LIGHT_BG)
    c.rect(MARGIN_X + 3, box_y, CONTENT_W - 3, box_h, fill=1, stroke=0)
    # title — INK for contrast, not the accent color
    c.setFont(FONT_BOLD, 10.5)
    c.setFillColor(INK)
    c.drawString(MARGIN_X + 16, y - 14, title)
    # body
    c.setFont(FONT_REGULAR, 9.5)
    c.setFillColor(INK)
    body_y = y - 32
    words = body.split()
    line = []
    max_w = CONTENT_W - 24
    for w in words:
        test = " ".join(line + [w])
        if c.stringWidth(test, FONT_REGULAR, 9.5) <= max_w:
            line.append(w)
        else:
            c.drawString(MARGIN_X + 16, body_y, " ".join(line))
            body_y -= 12
            line = [w]
    if line:
        c.drawString(MARGIN_X + 16, body_y, " ".join(line))
    return box_y - 10


# ── Page 1: Cover ─────────────────────────────────────────────
def page_cover(c):
    # Full teal band at the bottom for brand presence
    c.setFillColor(TEAL)
    c.rect(0, 0, PAGE_W, 1.6 * inch, fill=1, stroke=0)

    # Big unmistakable text wordmark — we use text instead of the PNG
    # because the brand mark reads as "BNB" at small sizes when scanned
    # by anyone who hasn't seen the wordmark before. Big bold text is
    # the safest path to "this is from b1n0" first-glance recognition.
    c.setFont(FONT_BOLD, 72)
    c.setFillColor(INK)
    c.drawString(MARGIN_X, PAGE_H - 1.7 * inch, "b1n0")
    # subtle teal stop after the wordmark
    c.setFont(FONT_BOLD, 72)
    c.setFillColor(TEAL)
    wm_w = c.stringWidth("b1n0", FONT_BOLD, 72)
    c.drawString(MARGIN_X + wm_w, PAGE_H - 1.7 * inch, ".")

    # Hero block — moved up to close the dead vertical gap
    y = PAGE_H - 2.7 * inch
    c.setFont(FONT_BOLD, 11)
    c.setFillColor(TEAL)
    c.drawString(MARGIN_X, y, "CONFIANZA · TRUST PACK · MAYO 2026")
    y -= 36
    c.setFont(FONT_BOLD, 38)
    c.setFillColor(INK)
    c.drawString(MARGIN_X, y, "Cómo opera b1n0.")
    y -= 44
    c.setFont(FONT_REGULAR, 13)
    c.setFillColor(MUTED)
    intro = (
        "Documento de referencia para inversionistas, marcas patrocinadoras, "
        "reguladores y socios técnicos. Resume entidad, modelo, flujo de fondos, "
        "postura de seguridad y vías de contacto."
    )
    y = body_paragraph(c, y, intro, font_size=12, leading=17, color=MUTED)

    # Filler block — what the reader will find inside, fills the void
    y -= 30
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(INK)
    c.drawString(MARGIN_X, y, "EN ESTE DOCUMENTO")
    y -= 18
    toc_items = [
        ("01", "Entidad y modelo"),
        ("02", "Flujo de fondos"),
        ("03", "Postura de seguridad"),
        ("04", "Verificación pública por terceros"),
        ("05", "Socios técnicos"),
        ("06", "Privacidad y riesgo"),
        ("07", "Contacto directo"),
    ]
    for num, label in toc_items:
        c.setFont(FONT_BOLD, 10)
        c.setFillColor(TEAL)
        c.drawString(MARGIN_X, y, num)
        c.setFont(FONT_REGULAR, 10.5)
        c.setFillColor(INK)
        c.drawString(MARGIN_X + 26, y, label)
        y -= 16

    # Bottom band content (over teal)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont(FONT_BOLD, 12)
    c.drawString(MARGIN_X, 0.95 * inch, "Tres33 SAS de CV")
    c.setFont(FONT_REGULAR, 10)
    c.drawString(MARGIN_X, 0.75 * inch, "Registrada en El Salvador · marca b1n0")
    c.drawString(MARGIN_X, 0.55 * inch, "www.b1n0.com · hola@b1n0.com")
    c.setFont(FONT_REGULAR, 9)
    c.drawRightString(
        PAGE_W - MARGIN_X,
        0.55 * inch,
        f"Versión {datetime.date.today().isoformat()}",
    )


# ── Content pages ─────────────────────────────────────────────
def page_entidad_modelo(c):
    draw_page_header(c, "Entidad · Modelo")
    y = PAGE_H - MARGIN_TOP

    y = section_title(c, y, "Entidad")
    y = body_paragraph(
        c, y,
        "b1n0 es una marca operada por Tres33 SAS de CV, una sociedad anónima "
        "de capital variable registrada en la República de El Salvador. Toda "
        "la propiedad intelectual del software, los activos de marca y los "
        "acuerdos comerciales son propiedad de Tres33.",
    )
    y -= 8
    y = body_paragraph(
        c, y,
        "La tokenización de contratos y activos digitales es operada por un "
        "proveedor licenciado bajo el marco regulatorio CNAD (Comisión "
        "Nacional de Activos Digitales) de El Salvador. Tres33 se apoya en "
        "este proveedor para la capa de cumplimiento de activos digitales.",
    )

    y -= 24
    y = section_title(c, y, "Modelo")
    y = body_paragraph(
        c, y,
        "b1n0 es un mercado de opciones sobre eventos. Los usuarios toman "
        "posiciones (SÍ o NO) sobre preguntas binarias con fecha de "
        "resolución conocida. El precio de entrada refleja el consenso del "
        "mercado y se mueve por oferta y demanda.",
    )
    y -= 8
    y = body_paragraph(
        c, y,
        "b1n0 opera un mercado de cobro fijo respaldado por LPs: capital de "
        "proveedores de liquidez respalda los pagos prometidos a los ganadores, "
        "y a cambio captura un porcentaje de las comisiones del mercado. Cada "
        "usuario ve su cobro al entrar — queda bloqueado en ese instante, no "
        "flota como en un parimutuel. b1n0 no es una casa de apuestas, no es "
        "un casino y no ofrece servicios de inversión.",
    )
    y -= 16
    callout_box(
        c, y,
        "Comisiones",
        "Comisión de compra 1–5% por nivel KYC · spread AMM ~1–2% · comisión "
        "de salida anticipada 2% · skim de resolución 5%. Detalle completo "
        "en /documentacion y /terminos.",
    )


def page_flujo(c):
    draw_page_header(c, "Flujo de fondos")
    y = PAGE_H - MARGIN_TOP
    y = section_title(c, y, "Flujo de fondos")
    y = body_paragraph(
        c, y,
        "Cada movimiento de dinero queda registrado en un libro mayor "
        "(balance_ledger) que sirve como fuente de verdad para saldos, "
        "comisiones, pagos a ganadores, retornos de LP y comisión de "
        "plataforma. Los saldos visibles al usuario son una caché derivada "
        "del ledger, no una variable manipulable aparte.",
    )
    y -= 12
    y = body_paragraph(
        c, y,
        "Las reglas contables están documentadas en LEDGER_INVARIANTS.md "
        "del repositorio: cada crédito tiene su débito correspondiente, la "
        "suma de los saldos cuadra con el total de fondos gestionados, y "
        "ningún pago se ejecuta sin la verificación previa de fondos "
        "disponibles. Toda función que mueve dinero corre dentro de una "
        "transacción Postgres con verificación de balance al inicio y "
        "rollback automático en caso de fallo.",
    )

    y -= 20
    # Step-by-step money flow drawn with shapes. Renamed from "CICLO"
    # to "PASOS" — these are sequential, not cyclic, and "CICLO"
    # mislabeled the relationship.
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, y, "PASOS DE UN LLAMADO")
    y -= 14
    steps = [
        ("Depósito", "Usuario fondea su cuenta"),
        ("Llamado", "Toma posición SÍ/NO con comisión"),
        ("Ledger", "Movimiento queda registrado en balance_ledger"),
        ("Resolución", "Evento se resuelve, skim de 5% al treasury"),
        ("Cobro", "Ganadores reciben pago pro-rata"),
        ("LP Return", "LPs reciben capital + comisiones acumuladas"),
    ]
    box_h = 38
    box_w = (CONTENT_W - 20) / 2
    col_gap = 20
    for i, (title, sub) in enumerate(steps):
        col = i % 2
        row = i // 2
        x = MARGIN_X + col * (box_w + col_gap)
        by = y - row * (box_h + 14)
        c.setFillColor(LIGHT_BG)
        c.rect(x, by - box_h, box_w, box_h, fill=1, stroke=0)
        c.setFillColor(TEAL)
        c.rect(x, by - box_h, 3, box_h, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 10.5)
        c.setFillColor(INK)
        c.drawString(x + 10, by - 14, f"{i+1}. {title}")
        c.setFont(FONT_REGULAR, 9)
        c.setFillColor(MUTED)
        c.drawString(x + 10, by - 27, sub)

    # Closing paragraph after the grid to fill the bottom void with
    # substance rather than dead whitespace.
    closing_y = y - 3 * (box_h + 14) - 40
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, closing_y, "GARANTÍAS TRANSACCIONALES")
    closing_y -= 14
    body_paragraph(
        c, closing_y,
        "Cada paso corre dentro de una transacción Postgres con verificación "
        "de balance al inicio y rollback automático en caso de fallo. Los "
        "saldos visibles en la aplicación son una caché derivada del "
        "balance_ledger; no existe una ruta donde el cliente pueda modificar "
        "el saldo sin pasar por una función SECURITY DEFINER que valida el "
        "estado completo de la transacción antes de comprometer.",
        font_size=10.5, leading=14,
    )


def page_seguridad(c):
    draw_page_header(c, "Seguridad")
    y = PAGE_H - MARGIN_TOP
    y = section_title(c, y, "Seguridad")
    y = body_paragraph(
        c, y,
        "La arquitectura aplica defensa en profundidad a nivel de base de "
        "datos, no solo en la capa de aplicación.",
    )
    y -= 10
    bullets = [
        "Row-Level Security (RLS) en las tablas sensibles (perfiles, posiciones, "
        "comentarios, ledger). Los permisos de lectura y escritura los enforza "
        "Postgres, no el cliente.",
        "Funciones SECURITY DEFINER para operaciones privilegiadas (resolución "
        "de eventos, ajustes de saldo, configuración de plataforma). Cada una "
        "verifica explícitamente el rol del invocador.",
        "Claim de admin almacenado en auth.users.app_metadata, no en columnas "
        "que el cliente pueda manipular.",
        "KYC delegado a Didit (proveedor europeo). Los documentos de identidad "
        "nunca tocan la infraestructura de b1n0; se transmiten directo del "
        "usuario a Didit.",
        "Webhooks firmados con HMAC-SHA256 y ventana de frescura de 5 minutos, "
        "aceptando ambos formatos de firma publicados por Didit.",
        "HTTPS forzado en toda la superficie con HSTS preload, CSP estricta, "
        "X-Frame-Options DENY y Permissions-Policy que deshabilita cámara, "
        "micrófono, geolocalización y pagos del navegador.",
        "Sin contraseñas almacenadas por b1n0; la autenticación corre sobre "
        "Supabase Auth con hashing bcrypt gestionado por la plataforma.",
        "Reconocimiento de riesgo capturado server-side con timestamp inmutable "
        "antes del primer depósito y del primer llamado — audit trail para "
        "inquérito regulatorio.",
    ]
    for b in bullets:
        y = bullet(c, y, b)

    # Closing callout — fills the bottom void and reinforces the
    # "verify don't trust us" framing.
    y -= 10
    callout_box(
        c, y,
        "Verificá vos mismo",
        "Esta postura no es una declaración: cualquier persona puede correr "
        "los escáneres públicos contra b1n0.com en vivo. Ver página siguiente "
        "para los enlaces directos a securityheaders.com, Qualys SSL Labs y "
        "Mozilla Observatory.",
    )


def page_verificacion(c):
    draw_page_header(c, "Verificación pública")
    y = PAGE_H - MARGIN_TOP
    y = section_title(c, y, "Verificá vos mismo")
    y = body_paragraph(
        c, y,
        "Los siguientes escáneres re-evalúan b1n0.com en vivo cuando los "
        "abrís. Son terceros independientes; no podemos influir en su "
        "calificación.",
    )
    y -= 12

    scans = [
        ("HTTP Security Headers", "securityheaders.com",
         "https://securityheaders.com/?q=https%3A%2F%2Fwww.b1n0.com"),
        ("TLS / SSL", "Qualys SSL Labs",
         "https://www.ssllabs.com/ssltest/analyze.html?d=www.b1n0.com"),
        ("Postura general web", "Mozilla Observatory",
         "https://observatory.mozilla.org/analyze/www.b1n0.com"),
    ]
    for label, provider, url in scans:
        c.setFillColor(LIGHT_BG)
        c.rect(MARGIN_X, y - 50, CONTENT_W, 50, fill=1, stroke=0)
        c.setFillColor(TEAL)
        c.rect(MARGIN_X, y - 50, 3, 50, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 9)
        c.setFillColor(MUTED)
        c.drawString(MARGIN_X + 14, y - 14, provider.upper())
        c.setFont(FONT_BOLD, 13)
        c.setFillColor(INK)
        c.drawString(MARGIN_X + 14, y - 30, label)
        # URL in INK at 8.5pt — was MUTED 9pt and barely visible.
        c.setFont(FONT_REGULAR, 8.5)
        c.setFillColor(INK)
        c.drawString(MARGIN_X + 14, y - 44, url)
        y -= 60

    y -= 4
    callout_box(
        c, y,
        "Reportar una vulnerabilidad",
        "security@b1n0.com · política completa en https://www.b1n0.com/.well-known/security.txt · "
        "tiempo de respuesta máximo 5 días hábiles.",
    )


def page_socios(c):
    draw_page_header(c, "Socios técnicos")
    y = PAGE_H - MARGIN_TOP
    y = section_title(c, y, "Socios técnicos")
    y = body_paragraph(
        c, y,
        "Apoyarse en proveedores que ya pasaron auditorías es parte de la "
        "estrategia de seguridad. Los nombres importan:",
    )
    y -= 10
    partners = [
        ("Supabase", "Base de datos Postgres gestionada, autenticación, Storage y Edge "
                     "Functions. SOC 2 Type II reportado por el proveedor."),
        ("Vercel", "Hosting del frontend, CDN global y TLS automático con renovación "
                   "gestionada por el proveedor."),
        ("Didit", "Verificación de identidad (KYC), captura de documentos, prueba de "
                  "vida y screening AML/PEP para el Nivel 3."),
        ("Resend", "Envío de correos transaccionales (resolución de eventos, "
                   "recuperación de cuenta)."),
        ("Sentry", "Monitoreo de errores en producción con sampling configurable, "
                   "sin captura de PII en payloads."),
    ]
    for name, desc in partners:
        # Add a small teal accent dot before the partner name for
        # consistency with the bullet-list visual language elsewhere
        # in the doc.
        c.setFillColor(TEAL)
        c.rect(MARGIN_X, y + 1, 4, 11, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 11.5)
        c.setFillColor(INK)
        c.drawString(MARGIN_X + 12, y + 1, name)
        y -= 16
        y = body_paragraph(c, y - 2, desc, font_size=10, leading=13, color=MUTED)
        y -= 8

    # Closing block — what "trusting a partner" actually buys us.
    y -= 12
    callout_box(
        c, y,
        "Por qué importan los socios auditados",
        "Cada uno de estos proveedores ha pasado por auditorías independientes "
        "(SOC 2, ISO 27001 o equivalentes) que ya validan capas que b1n0 no "
        "puede auditar internamente: infraestructura de centros de datos, "
        "manejo de claves criptográficas, controles de acceso físico. Apoyarse "
        "en ellos transfiere parte de la carga regulatoria a entidades con "
        "historial verificable.",
    )


def page_privacidad_riesgo(c):
    draw_page_header(c, "Privacidad · Riesgo")
    y = PAGE_H - MARGIN_TOP
    y = section_title(c, y, "Privacidad")
    y = body_paragraph(
        c, y,
        "Cada usuario controla la visibilidad de su perfil público desde "
        "/perfil → Privacidad: nivel KYC, total cobrado, tasa de acierto, "
        "total de llamados, nombre real, fecha de ingreso, avatar y "
        "actividad reciente se pueden ocultar individualmente. La aplicación "
        "respeta estas preferencias en el servidor — no solo en el cliente — "
        "mediante funciones SECURITY DEFINER que filtran los campos antes de "
        "salir de la base.",
    )
    y -= 12
    y = body_paragraph(
        c, y,
        "Política completa de privacidad en /privacidad. Términos en /terminos.",
        color=MUTED,
    )

    y -= 28
    y = section_title(c, y, "Riesgo")
    callout_box(
        c, y,
        "Advertencia obligatoria",
        "Los llamados implican riesgo de pérdida del capital. No hay retornos "
        "garantizados, no es una inversión, no es un instrumento financiero, "
        "no es una casa de apuestas. b1n0 es un juego de opinión social con "
        "dinero real. Cada participante es responsable de cumplir las leyes "
        "y obligaciones fiscales de su jurisdicción. El acceso es para "
        "mayores de 18 años.",
        color=AMBER,
    )


def page_contacto(c):
    draw_page_header(c, "Contacto")
    y = PAGE_H - MARGIN_TOP
    y = section_title(c, y, "Contacto")
    y = body_paragraph(
        c, y,
        "Cada tipo de consulta tiene una dirección dedicada para que llegue "
        "a la persona correcta sin filtros intermedios.",
    )
    y -= 14
    contacts = [
        ("Soporte general", "soporte@b1n0.com"),
        ("Seguridad y vulnerabilidades", "security@b1n0.com"),
        ("Asuntos legales y licencias", "legal@b1n0.com"),
        ("Prensa e inversionistas", "hola@b1n0.com"),
    ]
    for label, addr in contacts:
        c.setFont(FONT_BOLD, 10.5)
        c.setFillColor(INK)
        c.drawString(MARGIN_X, y, label)
        c.setFont(FONT_REGULAR, 10.5)
        c.setFillColor(TEAL)
        c.drawString(MARGIN_X + 3 * inch, y, addr)
        y -= 22

    # Add a "what to expect" block so the page doesn't end in dead space
    y -= 20
    callout_box(
        c, y,
        "Tiempos de respuesta",
        "Reportes de seguridad: hasta 5 días hábiles para un primer acuse. "
        "Consultas legales o de prensa: hasta 3 días hábiles. Soporte de "
        "usuario: hasta 24 horas. Mantener estos tiempos forma parte de la "
        "política operativa de Tres33.",
    )

    # Closing brand band anchored to the bottom of the page (above the
    # standard page footer). This anchors the document visually instead
    # of leaving it stranded mid-page.
    band_h = 1.0 * inch
    band_y = 0.75 * inch
    c.setFillColor(TEAL)
    c.rect(0, band_y, PAGE_W, band_h, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont(FONT_BOLD, 14)
    c.drawString(MARGIN_X, band_y + 0.58 * inch, "Más información: www.b1n0.com/confianza")
    c.setFont(FONT_REGULAR, 10)
    c.drawString(MARGIN_X, band_y + 0.32 * inch,
                 "Esta página se mantiene en sincronía con este documento.")


def build():
    out = Path("public/docs/b1n0-confianza.pdf")
    out.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out), pagesize=LETTER)
    c.setTitle("b1n0 · Confianza & Trust Pack")
    c.setAuthor("Tres33 SAS de CV")
    c.setSubject("Investor & partner trust documentation for b1n0")
    c.setKeywords(["b1n0", "Tres33", "El Salvador", "CNAD", "compliance", "trust"])

    pages = [
        page_cover,
        page_entidad_modelo,
        page_flujo,
        page_seguridad,
        page_verificacion,
        page_socios,
        page_privacidad_riesgo,
        page_contacto,
    ]
    total = len(pages)
    for i, draw in enumerate(pages):
        draw(c)
        if i > 0:  # cover has no footer
            draw_page_footer(c, i + 1, total)
        c.showPage()
    c.save()
    print(f"✓ wrote {out} ({out.stat().st_size:,} bytes, {total} pages)")


if __name__ == "__main__":
    build()

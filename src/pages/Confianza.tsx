/**
 * Confianza ("Trust") — public-facing page at /confianza.
 *
 * The page anyone (investor, sponsor brand, regulator, journalist,
 * curious user) can read to understand:
 *   - Who runs b1n0
 *   - How money flows
 *   - What security posture is in place
 *   - Which partners we depend on
 *   - How to report a vulnerability or get help
 *
 * Anchors map 1:1 with sections so we can deep-link from email
 * ("read https://www.b1n0.com/confianza#seguridad"). Each section
 * intentionally short — this page exists to make the answer
 * pointable, not to replace /documentacion (the full mechanics) or
 * /legal (terms + privacy).
 *
 * Public scan grades link out to third-party scanners that re-run
 * live on every click — so anyone reading this can verify the claim
 * themselves rather than trust a screenshot we'd have to keep fresh.
 *
 * NOT routed inside the auth shell — /confianza is a marketing-grade
 * page reachable without login.
 */

import { Footer } from '../components/layout/Footer'
import { usePageMeta } from '../hooks/usePageMeta'

const F_BODY = 'var(--font-body)'
const F_DISPLAY = 'var(--font-display)'

export function Confianza() {
  usePageMeta({
    title: 'Confianza · b1n0',
    description:
      'Cómo funciona b1n0: entidad, modelo, seguridad, socios y cómo reportar una vulnerabilidad.',
  })

  return (
    <div
      className="feed-scroll"
      style={{
        padding: '24px 16px',
        maxWidth: 760,
        margin: '0 auto',
        fontFamily: F_BODY,
      }}
    >
      {/* ── Hero ───────────────────────────────────────────────── */}
      <header style={{ marginBottom: 'var(--space-7)' }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: 'var(--b1n0-si)',
            margin: 0,
            marginBottom: 8,
          }}
        >
          Confianza · Trust
        </p>
        <h1
          style={{
            fontFamily: F_DISPLAY,
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: '-1px',
            color: 'var(--b1n0-text-1)',
            margin: 0,
            lineHeight: 1.1,
            marginBottom: 14,
          }}
        >
          Cómo opera b1n0.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: 'var(--b1n0-muted)',
            margin: 0,
            lineHeight: 1.6,
            maxWidth: 640,
          }}
        >
          Esta página existe para que cualquier persona —usuario,
          inversionista, marca patrocinadora, regulador o investigador—
          pueda entender en cinco minutos quién está detrás de b1n0,
          cómo se mueve el dinero, qué medidas de seguridad operan y
          cómo reportar un problema.
        </p>

        {/* PDF version of this page for offline / email distribution.
            Generated from scripts/build_confianza_pdf.py. The link
            uses `download` so the browser saves with a clean filename
            instead of opening inline. Kept brand-side (teal pill)
            because partners hand it around in emails. */}
        <a
          href="/docs/b1n0-confianza.pdf"
          download="b1n0-confianza.pdf"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 18,
            padding: '10px 18px',
            background: 'var(--b1n0-si)',
            color: 'var(--b1n0-on-accent)',
            borderRadius: 'var(--radius-pill)',
            fontFamily: F_BODY,
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            letterSpacing: '0.3px',
          }}
        >
          Descargar PDF · 8 páginas
        </a>
      </header>

      {/* ── Entidad ────────────────────────────────────────────── */}
      <Section id="entidad" title="Entidad">
        <p>
          b1n0 es una marca operada por <strong>Tres33 SAS de CV</strong>,
          una sociedad anónima de capital variable registrada en la
          República de El Salvador. Toda la propiedad intelectual del
          software, los activos de marca y los acuerdos comerciales son
          propiedad de Tres33.
        </p>
        <p>
          La tokenización de contratos y activos digitales es operada por
          un proveedor licenciado bajo el marco regulatorio CNAD
          (Comisión Nacional de Activos Digitales) de El Salvador. Tres33
          se apoya en este proveedor para la capa de cumplimiento de
          activos digitales.
        </p>
      </Section>

      {/* ── Modelo ─────────────────────────────────────────────── */}
      <Section id="modelo" title="Modelo">
        <p>
          b1n0 es un mercado de opciones sobre eventos. Los usuarios
          toman posiciones (SÍ o NO) sobre preguntas binarias con fecha
          de resolución conocida. El precio de entrada refleja el
          consenso del mercado y se mueve en función de la oferta y la
          demanda.
        </p>
        <p>
          El modelo de liquidez es <em>LP-backstopped</em>: capital de
          proveedores de liquidez (LPs) respalda los pagos prometidos
          a los ganadores, y a cambio captura un porcentaje de las
          comisiones del mercado. b1n0 no es una casa de apuestas, no
          es un casino y no ofrece servicios de inversión.
        </p>
        <p>
          La estructura de comisiones, los límites por nivel de KYC y
          las reglas de resolución están documentadas en{' '}
          <ExternalLink to="/documentacion">/documentacion</ExternalLink>.
          Los términos legales completos viven en{' '}
          <ExternalLink to="/terminos">/terminos</ExternalLink>.
        </p>
      </Section>

      {/* ── Flujo de fondos ────────────────────────────────────── */}
      <Section id="fondos" title="Flujo de fondos">
        <p>
          Cada movimiento de dinero queda registrado en un libro mayor
          (<em>balance_ledger</em>) que sirve como fuente de verdad para
          saldos, comisiones, pagos a ganadores, retornos de LP y
          comisión de plataforma. Los saldos visibles al usuario son
          una caché derivada del ledger, no una variable manipulable
          aparte.
        </p>
        <p>
          Las reglas contables están documentadas en{' '}
          <code style={codeStyle}>LEDGER_INVARIANTS.md</code> del
          repositorio: cada crédito tiene su débito correspondiente,
          la suma de los saldos cuadra con el total de fondos
          gestionados, y ningún pago se ejecuta sin la verificación
          previa de fondos disponibles.
        </p>
      </Section>

      {/* ── Seguridad ──────────────────────────────────────────── */}
      <Section id="seguridad" title="Seguridad">
        <p>
          La arquitectura aplica defensa en profundidad a nivel de base
          de datos, no solo en la capa de aplicación:
        </p>
        <ul style={ulStyle}>
          <li>
            <strong>Row-Level Security (RLS)</strong> en las tablas
            sensibles (perfiles, posiciones, comentarios, ledger). Los
            permisos de lectura/escritura los enforza Postgres, no el
            cliente.
          </li>
          <li>
            <strong>Funciones <code style={codeStyle}>SECURITY DEFINER</code></strong>{' '}
            para operaciones privilegiadas (resolución de eventos,
            ajustes de saldo, configuración de plataforma). Cada una
            verifica explícitamente el rol del invocador mediante el
            helper <code style={codeStyle}>is_admin(auth.uid())</code>.
          </li>
          <li>
            <strong>Claim de admin</strong> almacenado en{' '}
            <code style={codeStyle}>auth.users.app_metadata</code>, no
            en columnas que el cliente pueda manipular.
          </li>
          <li>
            <strong>KYC delegado</strong> a Didit (proveedor europeo
            especializado). Los documentos de identidad nunca tocan la
            infraestructura de b1n0; se transmiten directo del usuario
            a Didit.
          </li>
          <li>
            <strong>Webhooks firmados</strong> con HMAC-SHA256 y
            verificación de frescura (ventana de 5 minutos), aceptando
            ambos formatos de firma publicados por Didit.
          </li>
          <li>
            <strong>HTTPS forzado</strong> en toda la superficie con
            HSTS, CSP estricta, X-Frame-Options DENY y{' '}
            <code style={codeStyle}>Permissions-Policy</code> que
            deshabilita cámara, micrófono, geolocalización y pagos del
            navegador.
          </li>
          <li>
            <strong>Sin contraseñas</strong> almacenadas por b1n0; la
            autenticación corre sobre Supabase Auth con hashing
            bcrypt manejado por la plataforma.
          </li>
        </ul>
      </Section>

      {/* ── Verificá vos mismo ─────────────────────────────────── */}
      <Section id="verificacion" title="Verificá vos mismo">
        <p style={{ marginBottom: 14 }}>
          No te pedimos que nos creas. Estos escáneres públicos
          re-evalúan b1n0.com en vivo cada vez que hacés clic:
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <ScanCard
            label="HTTP Security Headers"
            provider="securityheaders.com"
            href="https://securityheaders.com/?q=https%3A%2F%2Fwww.b1n0.com&followRedirects=on"
          />
          <ScanCard
            label="TLS / SSL"
            provider="Qualys SSL Labs"
            href="https://www.ssllabs.com/ssltest/analyze.html?d=www.b1n0.com&hideResults=on"
          />
          <ScanCard
            label="Postura general"
            provider="Mozilla Observatory"
            href="https://observatory.mozilla.org/analyze/www.b1n0.com"
          />
        </div>
        <p style={{ fontSize: 13, color: 'var(--b1n0-muted)', margin: 0 }}>
          Si encontrás algo que no cuadra, mandá un correo a{' '}
          <a href="mailto:security@b1n0.com" style={inlineLink}>
            security@b1n0.com
          </a>{' '}
          o consultá nuestra política completa en{' '}
          <a
            href="/.well-known/security.txt"
            style={inlineLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            /.well-known/security.txt
          </a>
          .
        </p>
      </Section>

      {/* ── Socios técnicos ────────────────────────────────────── */}
      <Section id="socios" title="Socios técnicos">
        <p>
          Apoyarse en proveedores que ya pasaron auditorías es parte de
          la estrategia de seguridad. Los nombres importan:
        </p>
        <ul style={ulStyle}>
          <li>
            <strong>Supabase</strong> — base de datos Postgres
            gestionada, autenticación, Storage y Edge Functions. SOC 2
            Type II reportado por el proveedor.
          </li>
          <li>
            <strong>Vercel</strong> — hosting del frontend, CDN global y
            TLS automático con renovación gestionada.
          </li>
          <li>
            <strong>Didit</strong> — verificación de identidad (KYC),
            captura de documentos, prueba de vida y screening AML/PEP
            para el Nivel 3.
          </li>
          <li>
            <strong>Resend</strong> — envío de correos transaccionales
            (resolución de eventos, recuperación de cuenta).
          </li>
          <li>
            <strong>Sentry</strong> — monitoreo de errores en producción
            con sampling, sin captura de PII en payloads.
          </li>
        </ul>
      </Section>

      {/* ── Privacidad ─────────────────────────────────────────── */}
      <Section id="privacidad" title="Privacidad">
        <p>
          Cada usuario controla la visibilidad de su perfil público
          desde <code style={codeStyle}>/perfil</code> → Privacidad:
          nivel KYC, total cobrado, tasa de acierto, total de llamados,
          nombre real, fecha de ingreso, avatar y actividad reciente
          (llamados y comentarios) se pueden ocultar individualmente.
          La aplicación respeta estas preferencias en el servidor —no
          solo en el cliente—, mediante funciones{' '}
          <code style={codeStyle}>SECURITY DEFINER</code> que filtran
          los campos antes de salir de la base.
        </p>
        <p>
          Política completa de privacidad en{' '}
          <ExternalLink to="/privacidad">/privacidad</ExternalLink>.
        </p>
      </Section>

      {/* ── Riesgo ─────────────────────────────────────────────── */}
      <Section id="riesgo" title="Riesgo y responsabilidad del usuario">
        <p>
          Los llamados implican riesgo de pérdida del capital. No hay
          retornos garantizados, no es una inversión, no es un
          instrumento financiero, no es una casa de apuestas. b1n0 es un
          juego de opinión social con dinero real. Cada participante es
          responsable de cumplir las leyes y obligaciones fiscales de
          su jurisdicción. El acceso es para mayores de 18 años.
        </p>
      </Section>

      {/* ── Contacto ───────────────────────────────────────────── */}
      <Section id="contacto" title="Contacto">
        <ul style={ulStyle}>
          <li>
            <strong>Soporte general:</strong>{' '}
            <a href="mailto:soporte@b1n0.com" style={inlineLink}>
              soporte@b1n0.com
            </a>
          </li>
          <li>
            <strong>Seguridad / vulnerabilidades:</strong>{' '}
            <a href="mailto:security@b1n0.com" style={inlineLink}>
              security@b1n0.com
            </a>
          </li>
          <li>
            <strong>Asuntos legales / licencias:</strong>{' '}
            <a href="mailto:legal@b1n0.com" style={inlineLink}>
              legal@b1n0.com
            </a>
          </li>
          <li>
            <strong>Prensa / inversionistas:</strong>{' '}
            <a href="mailto:hola@b1n0.com" style={inlineLink}>
              hola@b1n0.com
            </a>
          </li>
        </ul>
      </Section>

      <Footer />
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────
function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      style={{
        marginBottom: 'var(--space-8)',
        scrollMarginTop: 80, // accounts for fixed TopBar on anchor jumps
      }}
    >
      <h2
        style={{
          fontFamily: F_DISPLAY,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.5px',
          color: 'var(--b1n0-text-1)',
          margin: 0,
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          fontSize: 15,
          color: 'var(--b1n0-text-1)',
          lineHeight: 1.7,
        }}
      >
        {children}
      </div>
    </section>
  )
}

// ── Public-scan link card ─────────────────────────────────────
function ScanCard({
  label,
  provider,
  href,
}: {
  label: string
  provider: string
  href: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 14px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--b1n0-si)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--b1n0-border)'
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          color: 'var(--b1n0-muted)',
          margin: 0,
          marginBottom: 4,
        }}
      >
        {provider}
      </p>
      <p
        style={{
          fontFamily: F_DISPLAY,
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--b1n0-text-1)',
          margin: 0,
        }}
      >
        {label} ↗
      </p>
    </a>
  )
}

// Internal route link rendered as a plain anchor so the Trust page
// remains marketing-grade and copy-pasteable without needing to
// pull in react-router primitives for inline references.
function ExternalLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a href={to} style={inlineLink}>
      {children}
    </a>
  )
}

const inlineLink: React.CSSProperties = {
  color: 'var(--b1n0-si)',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
}

const ulStyle: React.CSSProperties = {
  paddingLeft: 18,
  margin: '0 0 14px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.88em',
  background: 'var(--b1n0-surface)',
  padding: '1px 6px',
  borderRadius: 4,
  border: '1px solid var(--b1n0-border)',
}

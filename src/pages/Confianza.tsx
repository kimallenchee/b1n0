/**
 * /confianza — public trust page.
 *
 * Mirrors the canonical /documentacion layout via DocPageShell so all
 * footer-linked informational pages share the same visual chrome:
 * back link → header (eyebrow + H1 + intro + last updated) → body
 * (sticky TOC on desktop / accordion on mobile) → Footer.
 *
 * Content covers: entity, model, money flow, security posture, public
 * scan grades, partners, privacy, risk, contact. Plus a download
 * button for the offline PDF version (scripts/build_confianza_pdf.py).
 *
 * Anchors are deep-linkable: /confianza#seguridad etc.
 */

import { usePageMeta } from '../hooks/usePageMeta'
import { DocPageShell, DocParagraph, DocBullets, DocCallout, type DocPageSection } from '../components/DocPageShell'

const F = 'var(--font-body)'
const D = 'var(--font-display)'

const inlineLink: React.CSSProperties = {
  color: 'var(--b1n0-si)',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.88em',
  background: 'var(--b1n0-surface)',
  padding: '1px 6px',
  borderRadius: 4,
  border: '1px solid var(--b1n0-border)',
}

// ── Public-scan link card (renders inside the verificación section) ──
function ScanCard({ label, provider, href }: { label: string; provider: string; href: string }) {
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
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-si)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--b1n0-border)' }}
    >
      <p style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--b1n0-muted)', margin: 0, marginBottom: 4 }}>
        {provider}
      </p>
      <p style={{ fontFamily: D, fontSize: 15, fontWeight: 700, color: 'var(--b1n0-text-1)', margin: 0 }}>
        {label} ↗
      </p>
    </a>
  )
}

const CONFIANZA_SECTIONS: DocPageSection[] = [
  {
    id: 'entidad',
    eyebrow: 'SECCIÓN 01',
    title: 'Entidad',
    children: (
      <>
        <DocParagraph>
          b1n0 es una marca operada por <strong>Tres33 SAS de CV</strong>, una sociedad anónima de capital variable registrada en la República de El Salvador. Toda la propiedad intelectual del software, los activos de marca y los acuerdos comerciales son propiedad de Tres33.
        </DocParagraph>
        <DocParagraph>
          La tokenización de contratos y activos digitales es operada por un proveedor licenciado bajo el marco regulatorio CNAD (Comisión Nacional de Activos Digitales) de El Salvador. Tres33 se apoya en este proveedor para la capa de cumplimiento de activos digitales.
        </DocParagraph>
      </>
    ),
  },
  {
    id: 'modelo',
    eyebrow: 'SECCIÓN 02',
    title: 'Modelo',
    children: (
      <>
        <DocParagraph>
          b1n0 es un mercado de opciones sobre eventos. Los usuarios toman posiciones (SÍ o NO) sobre preguntas binarias con fecha de resolución conocida. El precio de entrada refleja el consenso del mercado y se mueve en función de la oferta y la demanda.
        </DocParagraph>
        <DocParagraph>
          b1n0 opera un <em>mercado de cobro fijo respaldado por LPs</em>: capital de proveedores de liquidez (LPs) respalda los pagos prometidos a los ganadores, y a cambio captura un porcentaje de las comisiones del mercado. Cada usuario ve su cobro al entrar — queda bloqueado en ese instante, no flota como en un parimutuel. b1n0 no es una casa de apuestas, no es un casino y no ofrece servicios de inversión.
        </DocParagraph>
        <DocParagraph>
          La estructura de comisiones, los límites por nivel de KYC y las reglas de resolución están documentadas en{' '}
          <a href="/documentacion" style={inlineLink}>/documentacion</a>. Los términos legales completos viven en{' '}
          <a href="/terminos" style={inlineLink}>/terminos</a>.
        </DocParagraph>
      </>
    ),
  },
  {
    id: 'fondos',
    eyebrow: 'SECCIÓN 03',
    title: 'Flujo de fondos',
    children: (
      <>
        <DocParagraph>
          Cada movimiento de dinero queda registrado en un libro mayor (<em>balance_ledger</em>) que sirve como fuente de verdad para saldos, comisiones, pagos a ganadores, retornos de LP y comisión de plataforma. Los saldos visibles al usuario son una caché derivada del ledger, no una variable manipulable aparte.
        </DocParagraph>
        <DocParagraph>
          Las reglas contables están documentadas en <code style={codeStyle}>LEDGER_INVARIANTS.md</code> del repositorio: cada crédito tiene su débito correspondiente, la suma de los saldos cuadra con el total de fondos gestionados, y ningún pago se ejecuta sin la verificación previa de fondos disponibles.
        </DocParagraph>
      </>
    ),
  },
  {
    id: 'seguridad',
    eyebrow: 'SECCIÓN 04',
    title: 'Seguridad',
    children: (
      <>
        <DocParagraph>
          La arquitectura aplica defensa en profundidad a nivel de base de datos, no solo en la capa de aplicación:
        </DocParagraph>
        <DocBullets
          items={[
            <><strong>Row-Level Security (RLS)</strong> en las tablas sensibles (perfiles, posiciones, comentarios, ledger). Los permisos de lectura y escritura los enforza Postgres, no el cliente.</>,
            <><strong>Funciones <code style={codeStyle}>SECURITY DEFINER</code></strong> para operaciones privilegiadas (resolución de eventos, ajustes de saldo, configuración de plataforma). Cada una verifica explícitamente el rol del invocador mediante <code style={codeStyle}>is_admin(auth.uid())</code>.</>,
            <><strong>Claim de admin</strong> almacenado en <code style={codeStyle}>auth.users.app_metadata</code>, no en columnas que el cliente pueda manipular.</>,
            <><strong>KYC delegado</strong> a Didit (proveedor europeo especializado). Los documentos de identidad nunca tocan la infraestructura de b1n0; se transmiten directo del usuario a Didit.</>,
            <><strong>Webhooks firmados</strong> con HMAC-SHA256 y verificación de frescura (ventana de 5 minutos), aceptando ambos formatos de firma publicados por Didit.</>,
            <><strong>HTTPS forzado</strong> en toda la superficie con HSTS, CSP estricta, X-Frame-Options DENY y <code style={codeStyle}>Permissions-Policy</code> que deshabilita cámara, micrófono, geolocalización y pagos del navegador.</>,
            <><strong>Sin contraseñas</strong> almacenadas por b1n0; la autenticación corre sobre Supabase Auth con hashing bcrypt manejado por la plataforma.</>,
            <><strong>Reconocimiento de riesgo</strong> capturado server-side con timestamp inmutable antes del primer depósito — audit trail para inquérito regulatorio.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'verificacion',
    eyebrow: 'SECCIÓN 05',
    title: 'Verificá vos mismo',
    children: (
      <>
        <DocParagraph>
          No te pedimos que nos creas. Estos escáneres públicos re-evalúan b1n0.com en vivo cada vez que hacés clic:
        </DocParagraph>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            margin: '8px 0 18px',
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
        <DocCallout title="Reportar una vulnerabilidad" tone="info">
          Mandá un correo a <a href="mailto:security@b1n0.com" style={inlineLink}>security@b1n0.com</a>{' '}
          o consultá la política completa en{' '}
          <a href="/.well-known/security.txt" target="_blank" rel="noopener noreferrer" style={inlineLink}>
            /.well-known/security.txt
          </a>. Tiempo de respuesta máximo: 5 días hábiles.
        </DocCallout>
      </>
    ),
  },
  {
    id: 'socios',
    eyebrow: 'SECCIÓN 06',
    title: 'Socios técnicos',
    children: (
      <>
        <DocParagraph>
          Apoyarse en proveedores que ya pasaron auditorías es parte de la estrategia de seguridad. Los nombres importan:
        </DocParagraph>
        <DocBullets
          items={[
            <><strong>Supabase</strong> — base de datos Postgres gestionada, autenticación, Storage y Edge Functions. SOC 2 Type II reportado por el proveedor.</>,
            <><strong>Vercel</strong> — hosting del frontend, CDN global y TLS automático con renovación gestionada.</>,
            <><strong>Didit</strong> — verificación de identidad (KYC), captura de documentos, prueba de vida y screening AML/PEP para el Nivel 3.</>,
            <><strong>Resend</strong> — envío de correos transaccionales (resolución de eventos, recuperación de cuenta).</>,
            <><strong>Sentry</strong> — monitoreo de errores en producción con sampling, sin captura de PII en payloads.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'privacidad',
    eyebrow: 'SECCIÓN 07',
    title: 'Privacidad',
    children: (
      <DocParagraph>
        Cada usuario controla la visibilidad de su perfil público desde <code style={codeStyle}>/perfil</code> → Privacidad: nivel KYC, total cobrado, tasa de acierto, total de votos, nombre real, fecha de ingreso, avatar y actividad reciente (votos y comentarios) se pueden ocultar individualmente. La aplicación respeta estas preferencias en el servidor — no solo en el cliente — mediante funciones <code style={codeStyle}>SECURITY DEFINER</code> que filtran los campos antes de salir de la base. Política completa en{' '}
        <a href="/privacidad" style={inlineLink}>/privacidad</a>.
      </DocParagraph>
    ),
  },
  {
    id: 'riesgo',
    eyebrow: 'SECCIÓN 08',
    title: 'Riesgo y responsabilidad del usuario',
    children: (
      <DocCallout title="Advertencia obligatoria" tone="warn">
        Los votos implican riesgo de pérdida del capital. No hay retornos garantizados, no es una inversión, no es un instrumento financiero, no es una casa de apuestas. b1n0 es un juego de opinión social con dinero real. Cada participante es responsable de cumplir las leyes y obligaciones fiscales de su jurisdicción. El acceso es para mayores de 18 años.
      </DocCallout>
    ),
  },
  {
    id: 'contacto',
    eyebrow: 'SECCIÓN 09',
    title: 'Contacto',
    children: (
      <DocBullets
        items={[
          <><strong>Soporte general:</strong> <a href="mailto:soporte@b1n0.com" style={inlineLink}>soporte@b1n0.com</a></>,
          <><strong>Seguridad / vulnerabilidades:</strong> <a href="mailto:security@b1n0.com" style={inlineLink}>security@b1n0.com</a></>,
          <><strong>Asuntos legales / licencias:</strong> <a href="mailto:legal@b1n0.com" style={inlineLink}>legal@b1n0.com</a></>,
          <><strong>Prensa / inversionistas:</strong> <a href="mailto:hola@b1n0.com" style={inlineLink}>hola@b1n0.com</a></>,
        ]}
      />
    ),
  },
]

export function Confianza() {
  usePageMeta({
    title: 'Confianza · b1n0',
    description: 'Cómo funciona b1n0: entidad, modelo, seguridad, socios y cómo reportar una vulnerabilidad.',
  })

  return (
    <>
      <DocPageShell
        pageEyebrow="CONFIANZA · TRUST"
        pageTitle="Cómo opera b1n0."
        intro="Esta página existe para que cualquier persona — usuario, inversionista, marca patrocinadora, regulador o investigador — pueda entender en cinco minutos quién está detrás de b1n0, cómo se mueve el dinero, qué medidas de seguridad operan y cómo reportar un problema."
        lastUpdated="20 de mayo de 2026"
        sections={CONFIANZA_SECTIONS}
      />
      {/* PDF download — rendered as a floating action button so it
          doesn't disturb the doc shell layout. Visible on all pages
          but contextual to /confianza only via this component. */}
      <a
        href="/docs/b1n0-confianza.pdf"
        download="b1n0-confianza.pdf"
        style={{
          position: 'fixed',
          bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          right: 24,
          padding: '10px 18px',
          background: 'var(--b1n0-si)',
          color: 'var(--b1n0-on-accent)',
          borderRadius: 'var(--radius-pill)',
          fontFamily: F,
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          zIndex: 50,
          letterSpacing: '0.3px',
        }}
      >
        ↓ Descargar PDF · 9 páginas
      </a>
    </>
  )
}

export default Confianza

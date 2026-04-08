/**
 * Legal shell pages — Terms of Service & Privacy Policy.
 *
 * Content is PLACEHOLDER. Replace with lawyer-reviewed copy before launch.
 * The layout is shared; only the body text differs.
 */

import { useNavigate } from 'react-router-dom'

const F = '"DM Sans", sans-serif'
const D = '"Syne", sans-serif'

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--color-bg)',
        color: 'var(--b1n0-text-1)',
        fontFamily: F,
        fontSize: '14px',
        lineHeight: 1.7,
        padding: '24px 20px 64px',
        maxWidth: '720px',
        margin: '0 auto',
      }}
    >
      <button
        onClick={() => navigate(-1)}
        aria-label="Volver"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--b1n0-muted)',
          fontFamily: F,
          fontSize: '13px',
          cursor: 'pointer',
          padding: '8px 0',
          marginBottom: '16px',
        }}
      >
        ← Volver
      </button>

      <h1
        style={{
          fontFamily: D,
          fontWeight: 800,
          fontSize: '28px',
          letterSpacing: '-0.5px',
          marginBottom: '8px',
        }}
      >
        {title}
      </h1>

      <p style={{ color: 'var(--b1n0-muted)', fontSize: '12px', marginBottom: '32px' }}>
        Última actualización: [FECHA — insertar antes de lanzamiento]
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>{children}</div>
    </div>
  )
}

function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <section>
      <h2
        style={{
          fontFamily: D,
          fontWeight: 700,
          fontSize: '18px',
          marginBottom: '8px',
          letterSpacing: '-0.3px',
        }}
      >
        {heading}
      </h2>
      <p style={{ color: 'var(--b1n0-text-2, #d6d3d1)' }}>{body}</p>
    </section>
  )
}

// ── Terms of Service ─────────────────────────────────────────────────────────

export function TermsPage() {
  return (
    <LegalShell title="Términos y Condiciones">
      <Section
        heading="1. Aceptación"
        body="Al crear una cuenta o usar la plataforma b1n0, aceptás estos Términos y Condiciones. Si no estás de acuerdo, no uses la plataforma. [PLACEHOLDER — el abogado debe expandir esta sección con jurisdicción aplicable, capacidad legal, y modificaciones.]"
      />
      <Section
        heading="2. Descripción del servicio"
        body="b1n0 es una plataforma de opinión patrocinada donde marcas financian pools y los usuarios participan haciendo llamados sobre eventos. b1n0 NO es un servicio de apuestas, casino, ni instrumento financiero. [PLACEHOLDER — describir el modelo de patrocinio, aclarar que no es gambling.]"
      />
      <Section
        heading="3. Elegibilidad"
        body="Debés tener al menos 18 años y residir en Guatemala, El Salvador u Honduras. b1n0 se reserva el derecho de solicitar verificación de identidad (DPI u otro documento oficial) para cumplir con regulaciones locales. [PLACEHOLDER — requisitos de verificación por nivel.]"
      />
      <Section
        heading="4. Cuentas y seguridad"
        body="Sos responsable de mantener la seguridad de tu cuenta. No compartás tus credenciales. b1n0 puede suspender cuentas que muestren actividad sospechosa. [PLACEHOLDER — política de cuentas múltiples, responsabilidad del usuario.]"
      />
      <Section
        heading="5. Participación y cobros"
        body="Los montos de entrada y cobros están sujetos a los límites de tu nivel de verificación. b1n0 cobra una comisión por transacción que se muestra antes de confirmar cada participación. Los cobros se procesan según los métodos de pago disponibles. [PLACEHOLDER — tiempos de procesamiento, comisiones, límites por nivel.]"
      />
      <Section
        heading="6. Conducta prohibida"
        body="Queda prohibido: uso de bots o automatización, manipulación de mercados, cuentas múltiples, actividad fraudulenta, y cualquier intento de explotar vulnerabilidades del sistema. [PLACEHOLDER — lista completa de conductas prohibidas y consecuencias.]"
      />
      <Section
        heading="7. Propiedad intelectual"
        body="Todo el contenido de b1n0 (marca, diseño, código) es propiedad de b1n0 o sus licenciantes. [PLACEHOLDER — derechos del usuario sobre su contenido, licencias.]"
      />
      <Section
        heading="8. Limitación de responsabilidad"
        body="b1n0 se proporciona 'tal cual'. No garantizamos disponibilidad ininterrumpida ni resultados específicos. [PLACEHOLDER — el abogado debe redactar cláusula completa de limitación de responsabilidad conforme a la legislación local.]"
      />
      <Section
        heading="9. Resolución de disputas"
        body="Cualquier disputa se resolverá primero mediante negociación directa. Si no se llega a un acuerdo, se someterá a arbitraje conforme a las leyes de [JURISDICCIÓN]. [PLACEHOLDER — mecanismo de resolución, jurisdicción, arbitraje.]"
      />
      <Section
        heading="10. Contacto"
        body="Para preguntas sobre estos términos: soporte@b1n0.app [PLACEHOLDER — email real, dirección física si aplica.]"
      />
    </LegalShell>
  )
}

// ── Privacy Policy ───────────────────────────────────────────────────────────

export function PrivacyPage() {
  return (
    <LegalShell title="Política de Privacidad">
      <Section
        heading="1. Información que recopilamos"
        body="Recopilamos: número de teléfono, nombre, correo electrónico, documento de identidad (para verificación), historial de participaciones, y datos de uso de la plataforma. [PLACEHOLDER — detallar cada categoría de datos, base legal para el procesamiento.]"
      />
      <Section
        heading="2. Cómo usamos tu información"
        body="Usamos tu información para: operar la plataforma, verificar tu identidad, procesar cobros, prevenir fraude, y mejorar el servicio. [PLACEHOLDER — base legal para cada uso, interés legítimo vs. consentimiento.]"
      />
      <Section
        heading="3. Compartir información"
        body="No vendemos tu información personal. Podemos compartir datos con: procesadores de pago (para cobros), proveedores de verificación de identidad (KYC), y autoridades cuando la ley lo requiera. [PLACEHOLDER — lista de terceros, acuerdos de procesamiento de datos.]"
      />
      <Section
        heading="4. Seguridad"
        body="Implementamos medidas técnicas y organizativas para proteger tu información, incluyendo cifrado en tránsito y en reposo. [PLACEHOLDER — medidas específicas, plan de respuesta a incidentes.]"
      />
      <Section
        heading="5. Retención de datos"
        body="Conservamos tu información mientras tu cuenta esté activa. Después del cierre de cuenta, retenemos ciertos datos según lo requiera la ley. [PLACEHOLDER — períodos específicos por tipo de dato.]"
      />
      <Section
        heading="6. Tus derechos"
        body="Tenés derecho a: acceder a tu información, corregirla, solicitar su eliminación, y oponerte a ciertos usos. Para ejercer estos derechos, contactanos a privacidad@b1n0.app. [PLACEHOLDER — derechos específicos según legislación de GT/SV/HN, proceso para ejercerlos.]"
      />
      <Section
        heading="7. Cookies y seguimiento"
        body="Usamos cookies esenciales para el funcionamiento de la plataforma. No usamos cookies de publicidad de terceros. [PLACEHOLDER — lista de cookies, opciones de control.]"
      />
      <Section
        heading="8. Menores de edad"
        body="b1n0 no está dirigido a menores de 18 años. No recopilamos intencionalmente información de menores. [PLACEHOLDER — procedimiento si se detecta un menor.]"
      />
      <Section
        heading="9. Cambios a esta política"
        body="Podemos actualizar esta política. Te notificaremos sobre cambios significativos por correo o notificación en la app. [PLACEHOLDER — mecanismo de notificación, período de aviso.]"
      />
      <Section
        heading="10. Contacto"
        body="Para preguntas de privacidad: privacidad@b1n0.app [PLACEHOLDER — DPO si aplica, dirección.]"
      />
    </LegalShell>
  )
}

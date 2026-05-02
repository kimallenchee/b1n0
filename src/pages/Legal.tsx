/**
 * Legal shell pages — Terms of Service & Privacy Policy.
 *
 * v1 draft — substantive enough to pre-launch beta. Lawyer review
 * required before public launch and before real money flows. Sections
 * marked with [PENDIENTE] need explicit legal sign-off because they
 * involve jurisdiction-specific regulation (gambling, AML, FX) or
 * vendor-specific terms (PSP, KYC provider) that aren't selected yet.
 *
 * Update both `Última actualización` dates when shipping changes.
 */

import { useNavigate } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'

const F = 'var(--font-body)'
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
          marginBottom: '8px', fontVariantNumeric: 'tabular-nums'}}
      >
        {title}
      </h1>

      <p style={{ color: 'var(--b1n0-muted)', fontSize: '12px', marginBottom: '32px' }}>
        Última actualización: 30 de abril de 2026
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
          letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums'}}
      >
        {heading}
      </h2>
      <p style={{ color: 'var(--b1n0-text-2, #d6d3d1)' }}>{body}</p>
    </section>
  )
}

// ── Terms of Service ─────────────────────────────────────────────────────────

export function TermsPage() {
  usePageMeta({
    title: 'Términos · b1n0',
    description: 'Términos y Condiciones de uso de b1n0 — la plataforma de opinión patrocinada.',
  })
  return (
    <LegalShell title="Términos y Condiciones">
      <Section
        heading="1. Aceptación de los términos"
        body="Al registrarte o usar b1n0, aceptás estos Términos y Condiciones y nuestra Política de Privacidad. Si no estás de acuerdo, no uses la plataforma. Estos términos constituyen un acuerdo legal entre vos y b1n0. Si los aceptás en nombre de una organización, declarás tener autoridad para hacerlo. b1n0 puede modificar estos términos; los cambios entran en vigor cuando se publican en esta página y te notificamos por correo o dentro de la app. El uso continuado de la plataforma después de los cambios implica aceptación de los nuevos términos."
      />
      <Section
        heading="2. Qué es b1n0"
        body="b1n0 es una plataforma de opinión social donde proveedores de liquidez (LPs) financian pools de premios y los usuarios participan opinando sobre eventos del mundo real (deportes, política, economía, cultura). Los participantes ponen dinero respaldando una posición; al resolverse el evento, los que acertaron cobran una porción del pool proporcional a su entrada. b1n0 NO es una casa de apuestas, no es un casino, no es un instrumento financiero, y no ofrece servicios de inversión, asesoría financiera, ni intermediación de valores. b1n0 es un servicio de información y entretenimiento social."
      />
      <Section
        heading="3. Elegibilidad"
        body="Para usar b1n0 debés: (a) tener al menos 18 años, o la mayoría de edad legal en tu jurisdicción, lo que sea mayor; (b) residir en uno de los países atendidos (Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica, Panamá, Belice); (c) no estar restringido o prohibido de usar servicios financieros bajo la legislación aplicable; (d) tener capacidad legal para celebrar contratos vinculantes. Reservamos el derecho de rechazar el servicio o terminar cuentas a discreción nuestra cuando la elegibilidad no pueda ser verificada o se demuestre falsa."
      />
      <Section
        heading="4. Verificación de identidad (KYC)"
        body="Para cumplir con regulaciones de prevención de lavado de dinero (AML) y conocer a tu cliente (KYC), b1n0 opera con tres niveles de verificación: Nivel 1 requiere número de teléfono verificado y permite participar hasta $50 por evento; Nivel 2 requiere foto de tu DPI o documento oficial y permite hasta $250 por evento; Nivel 3 requiere KYC completo (verificación de identidad, dirección, y origen de fondos) y permite hasta $1,000 por evento. Podemos solicitar documentación adicional en cualquier momento si detectamos actividad sospechosa o por requerimiento regulatorio. La negativa a proporcionar la información solicitada puede resultar en suspensión de la cuenta."
      />
      <Section
        heading="5. Cuentas, seguridad y responsabilidad"
        body="Una cuenta por persona. La creación o uso de cuentas múltiples está prohibido y resultará en cierre de todas las cuentas asociadas y posible confiscación de saldos. Sos responsable de mantener la confidencialidad de tu contraseña y de toda actividad realizada bajo tu cuenta. Notificanos inmediatamente sobre cualquier acceso no autorizado escribiendo a soporte@b1n0.com. b1n0 implementa autenticación segura y cifrado, pero no garantiza que la plataforma sea inmune a ataques. No asumimos responsabilidad por pérdidas derivadas de credenciales comprometidas por culpa del usuario."
      />
      <Section
        heading="6. Cómo funciona la plataforma"
        body="(a) Depositás fondos a tu saldo mediante los métodos de pago habilitados. (b) Elegís un evento y un lado (SÍ/NO o una opción específica) y el monto que querés poner. La plataforma muestra antes de confirmar: la comisión que cobramos, el precio del contrato (basado en un mercado automatizado, AMM), los contratos que recibís, y el cobro estimado si tu llamado resulta correcto. (c) Cuando el evento se resuelve, si tu llamado fue correcto, recibís el pago automáticamente menos un porcentaje de resolución (skim) que va a la tesorería de la plataforma. Si fue incorrecto, perdés tu entrada que queda en el pool para los ganadores. (d) También podés vender tu posición antes de la resolución a precio del mercado actual menos comisión de venta y spread."
      />
      <Section
        heading="7. Comisiones y tarifas"
        body="b1n0 cobra: (a) una comisión por transacción de compra (variable, entre 1% y 5% según condiciones del mercado, mostrada antes de confirmar); (b) un spread de mercado capturado por el AMM (entre 1% y 2% típicamente); (c) una comisión por venta anticipada del 2%; (d) un porcentaje de resolución del 5% sobre el cobro de los ganadores. Las tarifas se actualizan en la página de configuración de la plataforma y pueden cambiar con aviso previo de 30 días."
      />
      <Section
        heading="8. Depósitos y retiros"
        body="Los depósitos se procesan a través de proveedores de pago externos. Los retiros están sujetos a verificación KYC al menos de Nivel 2 y a un período de procesamiento de hasta 5 días hábiles. Reservamos el derecho de retrasar o rechazar retiros si detectamos actividad sospechosa hasta resolver la investigación. Los depósitos mínimos y montos máximos pueden cambiar; los actuales se muestran en la página de Depósito. b1n0 no cobra comisión por depósito ni retiro propio, aunque tu banco o procesador de pagos puede aplicar cargos. [PENDIENTE: lista del proveedor de pagos seleccionado y sus términos asociados.]"
      />
      <Section
        heading="9. Liquidez y patrocinio (LPs)"
        body="Los pools que respaldan los pagos a ganadores son financiados por proveedores de liquidez (LPs). Los LPs depositan capital en eventos específicos a cambio de un porcentaje de las comisiones generadas. b1n0 no garantiza retornos a LPs ni a usuarios; los LPs pueden perder parte o la totalidad de su capital comprometido si los pagos a ganadores exceden los fondos disponibles del pool. Los términos específicos para LPs se acuerdan por separado entre cada LP y b1n0."
      />
      <Section
        heading="10. Conductas prohibidas"
        body="Está terminantemente prohibido: (a) crear o usar cuentas múltiples; (b) usar bots, scripts, herramientas automatizadas o cualquier sistema para manipular precios, volúmenes, o el sistema de ranking; (c) coordinar con otros usuarios para manipular mercados (collusion); (d) participar en eventos sobre los que tenés información privilegiada o no pública (insider trading); (e) usar la plataforma para lavado de dinero o financiar actividades ilegales; (f) intentar acceder, escanear o explotar vulnerabilidades del sistema; (g) suplantar a otra persona o representar falsamente tu identidad; (h) publicar contenido (en comentarios, perfiles) que sea ilegal, difamatorio, abusivo, de odio, sexualmente explícito, o que infrinja derechos de terceros. Las violaciones resultan en suspensión inmediata, posible confiscación de saldo, y reporte a autoridades cuando corresponda."
      />
      <Section
        heading="11. Contenido del usuario"
        body="Vos retenés la propiedad del contenido que publicás (comentarios, foto de perfil, opiniones). Al publicar contenido, otorgás a b1n0 una licencia mundial, no exclusiva, libre de regalías, para usar, mostrar, y distribuir ese contenido en relación con la operación de la plataforma. Podemos remover cualquier contenido que viole estos términos sin aviso previo. No revisamos preventivamente todo el contenido publicado; los usuarios son responsables de su propio contenido."
      />
      <Section
        heading="12. Propiedad intelectual de b1n0"
        body="La marca b1n0, el logo, el diseño de la plataforma, el código, los algoritmos de pricing, la documentación, y todos los elementos creativos son propiedad de b1n0 o sus licenciantes y están protegidos por leyes de propiedad intelectual. No podés copiar, modificar, distribuir, vender, ni hacer ingeniería inversa de la plataforma sin autorización escrita previa."
      />
      <Section
        heading="13. Suspensión y terminación"
        body="Podemos suspender o cerrar tu cuenta sin aviso previo si: (a) violás estos términos; (b) detectamos actividad fraudulenta o sospechosa; (c) por requerimiento legal o regulatorio; (d) por inactividad prolongada (más de 24 meses sin uso). Vos podés cerrar tu cuenta en cualquier momento desde la sección de Perfil. Al cierre de cuenta, tu saldo disponible (después de retenciones legales y períodos de validación) será reembolsado al método de pago que tenemos en archivo, salvo confiscación por violación de términos."
      />
      <Section
        heading="14. Sin garantías; limitación de responsabilidad"
        body="b1n0 se proporciona 'tal cual' y 'según disponibilidad', sin garantías de ningún tipo, ya sean expresas o implícitas, incluyendo (pero no limitadas a) garantías de comerciabilidad, idoneidad para un propósito particular, o no infracción. No garantizamos que la plataforma sea ininterrumpida, libre de errores, o segura. En la máxima medida permitida por la ley aplicable, la responsabilidad total de b1n0 hacia vos por cualquier reclamación derivada del uso de la plataforma se limita al monto que has depositado en los 12 meses anteriores al evento que da lugar a la reclamación. b1n0 no es responsable por daños indirectos, incidentales, consecuentes, o punitivos. [PENDIENTE: ajuste de cláusula según jurisdicción del usuario; algunas no permiten estas limitaciones.]"
      />
      <Section
        heading="15. Indemnización"
        body="Aceptás indemnizar y mantener indemne a b1n0, sus directores, empleados y agentes, frente a cualquier reclamación, pérdida, responsabilidad, daño, costo o gasto (incluyendo honorarios razonables de abogados) que surja de tu violación de estos términos, tu uso indebido de la plataforma, o tu violación de derechos de terceros."
      />
      <Section
        heading="16. Resolución de disputas y ley aplicable"
        body="Estos Términos se rigen por las leyes de la República de Guatemala. Cualquier controversia derivada de o relacionada con estos términos se intentará resolver primero mediante negociación de buena fe entre las partes durante 30 días. Si no se llega a un acuerdo, la disputa se someterá a arbitraje conforme a las reglas del Centro de Arbitraje y Conciliación de la Cámara de Comercio de Guatemala (CRECIG), con sede en la Ciudad de Guatemala. El arbitraje se llevará en español. La decisión del árbitro será final y vinculante. [PENDIENTE: confirmar competencia con abogado local; usuarios fuera de GT pueden tener derechos adicionales bajo su jurisdicción de residencia.]"
      />
      <Section
        heading="17. Disposiciones generales"
        body="Si alguna disposición de estos términos es declarada inválida o inejecutable, el resto continúa en pleno vigor. La omisión por parte de b1n0 de hacer cumplir cualquier derecho bajo estos términos no constituye renuncia a ese derecho. Estos términos constituyen el acuerdo completo entre vos y b1n0 con respecto al uso de la plataforma. No podés ceder estos términos sin nuestro consentimiento escrito; b1n0 puede ceder estos términos en cualquier momento."
      />
      <Section
        heading="18. Contacto"
        body="Para preguntas sobre estos Términos y Condiciones: soporte@b1n0.com. Para reportes de seguridad o vulnerabilidades: seguridad@b1n0.com. Para asuntos legales: legal@b1n0.com. [PENDIENTE: dirección física una vez que la entidad legal esté constituida.]"
      />
    </LegalShell>
  )
}

// ── Privacy Policy ───────────────────────────────────────────────────────────

export function PrivacyPage() {
  usePageMeta({
    title: 'Privacidad · b1n0',
    description: 'Política de Privacidad de b1n0 — cómo manejamos tus datos.',
  })
  return (
    <LegalShell title="Política de Privacidad">
      <Section
        heading="1. Quiénes somos"
        body="b1n0 es la plataforma de opinión social descrita en nuestros Términos y Condiciones. En esta política, 'b1n0', 'nosotros', o 'la plataforma' se refieren a la entidad operadora de b1n0.com. Esta política explica qué información recopilamos, por qué, cómo la usamos, con quién la compartimos, y qué derechos tenés sobre ella. Aplica a todos los usuarios de la plataforma."
      />
      <Section
        heading="2. Información que recopilamos"
        body="Recopilamos las siguientes categorías de datos: (a) Información de cuenta: nombre, apellidos, fecha de nacimiento, número de teléfono, correo electrónico, dirección, país de residencia, foto de perfil opcional, contraseña hasheada. (b) Información de verificación (KYC): foto de DPI o documento oficial, foto de selfie para verificación facial, comprobante de domicilio, declaración de origen de fondos (solo Niveles 2 y 3). (c) Información financiera: saldo de la cuenta, historial de depósitos y retiros, método de pago seleccionado (los datos de tarjetas son procesados directamente por nuestro proveedor de pagos y no se almacenan en nuestros servidores). (d) Información de actividad: eventos en los que participás, montos, lados elegidos, comentarios publicados, posiciones compradas y vendidas, dispositivo y navegador, dirección IP, fecha y hora de cada acción. (e) Información social: lista de amigos en la plataforma, solicitudes de amistad."
      />
      <Section
        heading="3. Cómo usamos tu información"
        body="Usamos tu información para: (a) operar la plataforma — autenticarte, mostrar tu saldo, procesar tus participaciones, calcular tus cobros, recordar tus preferencias; (b) cumplir obligaciones legales y regulatorias — verificar tu identidad (KYC), prevenir lavado de dinero (AML), reportar a autoridades cuando la ley lo requiera; (c) prevenir fraude y abuso — detectar cuentas múltiples, bots, manipulación de mercados, y otros usos prohibidos; (d) procesar pagos — enviar y recibir fondos a través de nuestro proveedor de pagos; (e) comunicarnos con vos — enviar confirmaciones, notificaciones de resolución de eventos, alertas de seguridad, y (con tu consentimiento) novedades y promociones; (f) mejorar el servicio — analizar el uso de la plataforma para encontrar y arreglar problemas, diseñar nuevas funciones; (g) defender derechos legales en caso de disputas."
      />
      <Section
        heading="4. Base legal para el tratamiento"
        body="Tratamos tu información personal con las siguientes bases legales: (a) ejecución de contrato — para operar tu cuenta, procesar tus participaciones, y prestar el servicio acordado; (b) cumplimiento de obligaciones legales — para KYC, AML, retención de registros financieros, y respuesta a requerimientos de autoridades; (c) interés legítimo — para prevenir fraude, mejorar el servicio, defender derechos legales; (d) consentimiento — para comunicaciones promocionales, cookies no esenciales, y otros usos donde lo solicitemos explícitamente. Podés retirar tu consentimiento en cualquier momento; esto no afecta la legalidad del tratamiento previo."
      />
      <Section
        heading="5. Con quién compartimos tu información"
        body="No vendemos tu información personal. Compartimos datos solo con las siguientes categorías de terceros y solo en la medida necesaria: (a) Supabase (base de datos y autenticación) — almacena los datos de tu cuenta y actividad bajo acuerdo de procesamiento de datos. (b) Sentry (monitoreo de errores) — recibe reportes técnicos cuando hay errores en la app; pueden incluir tu identificador de usuario pero no datos sensibles. (c) Vercel (hosting del frontend) — sirve la aplicación; no almacena datos personales más allá de logs estándar de servidor web. (d) [PENDIENTE: proveedor de pagos a seleccionar] — procesa los depósitos y retiros, recibiendo nombre, monto, e información de pago. (e) [PENDIENTE: proveedor de KYC a seleccionar] — recibe los documentos de verificación. (f) Autoridades — cuando una orden judicial, requerimiento de autoridad competente, o ley aplicable nos obligue. (g) Sucesores legales — en caso de fusión, adquisición, o reestructuración de b1n0, tu información puede transferirse al sucesor sujeta a esta misma política. Cualquier nuevo tercero será notificado mediante actualización de esta política."
      />
      <Section
        heading="6. Transferencias internacionales"
        body="Algunos de nuestros proveedores (Supabase, Sentry, Vercel) operan servidores en Estados Unidos y otras jurisdicciones fuera de Centroamérica. Tu información puede ser transferida y procesada fuera de tu país de residencia. Implementamos salvaguardas contractuales con estos proveedores para proteger tus datos conforme a estándares internacionales (cláusulas contractuales tipo de la Comisión Europea o equivalentes)."
      />
      <Section
        heading="7. Retención de datos"
        body="Conservamos tu información: (a) mientras tu cuenta esté activa; (b) por un período adicional de 5 años después del cierre de cuenta para cumplir con obligaciones de prevención de lavado de dinero y retención de registros financieros aplicable en Centroamérica; (c) registros de transacciones financieras se retienen por el período exigido por la ley local (generalmente 10 años); (d) datos de KYC pueden retenerse por períodos distintos según los requerimientos del regulador. Después de los períodos legales aplicables, los datos se eliminan o se anonimizan de forma irreversible."
      />
      <Section
        heading="8. Tus derechos"
        body="Tenés derecho a: (a) acceder a tu información personal y obtener una copia; (b) corregir datos inexactos o incompletos; (c) solicitar la eliminación de tu información, sujeto a las obligaciones legales de retención mencionadas arriba; (d) oponerte a ciertos tratamientos basados en interés legítimo; (e) restringir el procesamiento mientras se resuelve una disputa; (f) portabilidad — recibir tus datos en formato estructurado y legible por máquina; (g) retirar consentimiento previamente otorgado; (h) presentar una queja ante la autoridad de protección de datos competente en tu jurisdicción. Para ejercer cualquiera de estos derechos, escribinos a privacidad@b1n0.com con tu identificador de usuario y prueba de identidad. Respondemos dentro de 30 días."
      />
      <Section
        heading="9. Seguridad"
        body="Implementamos medidas técnicas y organizativas razonables para proteger tu información, incluyendo: cifrado en tránsito (TLS 1.2+) en todas las comunicaciones con la plataforma; cifrado en reposo de la base de datos; control de acceso basado en roles para empleados con acceso a datos personales; autenticación de dos factores para acceso administrativo; reconciliación contable diaria automática para detectar drift en saldos; monitoreo de errores en tiempo real con Sentry; auditoría de accesos administrativos. A pesar de estas medidas, ningún sistema es 100% seguro. Si detectás un comportamiento sospechoso en tu cuenta, notificanos inmediatamente. Notificaremos a usuarios afectados y a las autoridades competentes en caso de una brecha de seguridad significativa, conforme a las leyes aplicables."
      />
      <Section
        heading="10. Cookies y tecnologías similares"
        body="Usamos cookies esenciales para el funcionamiento de la plataforma — específicamente, una cookie de autenticación que mantiene tu sesión iniciada y una cookie de preferencias que recuerda tu tema (claro/oscuro) y otras configuraciones. No usamos cookies de publicidad de terceros, pixeles de seguimiento publicitario, ni cookies para retargeting. Usamos almacenamiento local (localStorage) del navegador para algunas preferencias del usuario. Podés borrar las cookies y el almacenamiento local desde la configuración de tu navegador, pero esto cerrará tu sesión y requerirá iniciar sesión nuevamente."
      />
      <Section
        heading="11. Menores de edad"
        body="b1n0 no está dirigido a menores de 18 años. No recopilamos intencionalmente información personal de menores. Si descubrimos que hemos recopilado información de un menor sin verificación de consentimiento parental válido, eliminaremos esa información lo más rápido posible. Si sos padre/madre o tutor y creés que un menor ha proporcionado información personal a b1n0, contactanos a privacidad@b1n0.com."
      />
      <Section
        heading="12. Comunicaciones de marketing"
        body="Podemos enviarte comunicaciones promocionales por correo electrónico o notificaciones push si has dado tu consentimiento. Podés cancelar la suscripción en cualquier momento haciendo clic en el enlace de cancelación al final de cualquier correo, ajustando tus preferencias en tu Perfil, o escribiéndonos. Las comunicaciones operacionales (confirmación de depósito, resolución de eventos, alertas de seguridad) no son opcionales mientras tengas una cuenta activa."
      />
      <Section
        heading="13. Cambios a esta política"
        body="Podemos actualizar esta Política de Privacidad. Cuando los cambios sean significativos, te notificaremos por correo electrónico o mediante un aviso destacado en la plataforma al menos 30 días antes de que los cambios entren en vigor. La fecha de 'Última actualización' al inicio de esta página indica cuándo fue revisada por última vez. El uso continuado de la plataforma después de la fecha de entrada en vigor de los cambios constituye aceptación de la política actualizada."
      />
      <Section
        heading="14. Contacto"
        body="Para preguntas, ejercer tus derechos, o reportar inquietudes sobre privacidad, escribinos a privacidad@b1n0.com. Para asuntos generales de soporte: soporte@b1n0.com. Para reportes de seguridad: seguridad@b1n0.com. [PENDIENTE: nombre del Delegado de Protección de Datos (DPO) y dirección física una vez que la entidad legal esté constituida.]"
      />
    </LegalShell>
  )
}

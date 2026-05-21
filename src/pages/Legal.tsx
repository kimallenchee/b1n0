/**
 * Legal shell pages — Terms of Service & Privacy Policy.
 *
 * v1 draft — substantive enough to pre-launch beta. Lawyer review
 * required before public launch and before real money flows. Sections
 * marked with [PENDIENTE] need explicit legal sign-off because they
 * involve jurisdiction-specific regulation (gambling, AML, FX) or
 * vendor-specific terms (PSP, KYC provider) that aren't selected yet.
 *
 * Visual chrome (back link → header → TOC/accordion → footer) lives in
 * DocPageShell so these pages stay in lockstep with /documentacion and
 * /confianza. Update both "lastUpdated" dates when shipping changes.
 */

import { usePageMeta } from '../hooks/usePageMeta'
import { DocPageShell, DocParagraph, type DocPageSection } from '../components/DocPageShell'

const LAST_UPDATED = '30 de abril de 2026'

// ── Terms content ──────────────────────────────────────────────────────
const TERMS_SECTIONS: DocPageSection[] = [
  {
    id: 'aceptacion',
    eyebrow: 'SECCIÓN 01',
    title: '1. Aceptación de los términos',
    children: (
      <DocParagraph>
        Al registrarte o usar b1n0, aceptás estos Términos y Condiciones y nuestra Política de Privacidad. Si no estás de acuerdo, no uses la plataforma. Estos términos constituyen un acuerdo legal entre vos y b1n0. Si los aceptás en nombre de una organización, declarás tener autoridad para hacerlo. b1n0 puede modificar estos términos; los cambios entran en vigor cuando se publican en esta página y te notificamos por correo o dentro de la app. El uso continuado de la plataforma después de los cambios implica aceptación de los nuevos términos.
      </DocParagraph>
    ),
  },
  {
    id: 'que-es',
    eyebrow: 'SECCIÓN 02',
    title: '2. Qué es b1n0',
    children: (
      <DocParagraph>
        b1n0 es una plataforma de opinión social donde proveedores de liquidez (LPs) financian pools de premios y los usuarios participan opinando sobre eventos del mundo real (deportes, política, economía, cultura). Los participantes ponen dinero respaldando una posición; al resolverse el evento, los que acertaron cobran una porción del pool proporcional a su entrada. b1n0 NO es una casa de apuestas, no es un casino, no es un instrumento financiero, y no ofrece servicios de inversión, asesoría financiera, ni intermediación de valores. b1n0 es un servicio de información y entretenimiento social.
      </DocParagraph>
    ),
  },
  {
    id: 'elegibilidad',
    eyebrow: 'SECCIÓN 03',
    title: '3. Elegibilidad',
    children: (
      <DocParagraph>
        Para usar b1n0 debés: (a) tener al menos 18 años, o la mayoría de edad legal en tu jurisdicción, lo que sea mayor; (b) residir en uno de los países atendidos (Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica, Panamá, Belice); (c) no estar restringido o prohibido de usar servicios financieros bajo la legislación aplicable; (d) tener capacidad legal para celebrar contratos vinculantes. Reservamos el derecho de rechazar el servicio o terminar cuentas a discreción nuestra cuando la elegibilidad no pueda ser verificada o se demuestre falsa.
      </DocParagraph>
    ),
  },
  {
    id: 'kyc',
    eyebrow: 'SECCIÓN 04',
    title: '4. Verificación de identidad (KYC)',
    children: (
      <DocParagraph>
        Para cumplir con regulaciones de prevención de lavado de dinero (AML) y conocer a tu cliente (KYC), b1n0 opera con tres niveles de verificación: Nivel 1 requiere número de teléfono verificado y permite participar hasta $50 por evento; Nivel 2 requiere foto de tu DPI o documento oficial y permite hasta $250 por evento; Nivel 3 requiere KYC completo (verificación de identidad, dirección, y origen de fondos) y permite hasta $1,000 por evento. Podemos solicitar documentación adicional en cualquier momento si detectamos actividad sospechosa o por requerimiento regulatorio. La negativa a proporcionar la información solicitada puede resultar en suspensión de la cuenta.
      </DocParagraph>
    ),
  },
  {
    id: 'cuentas',
    eyebrow: 'SECCIÓN 05',
    title: '5. Cuentas, seguridad y responsabilidad',
    children: (
      <DocParagraph>
        Una cuenta por persona. La creación o uso de cuentas múltiples está prohibido y resultará en cierre de todas las cuentas asociadas y posible confiscación de saldos. Sos responsable de mantener la confidencialidad de tu contraseña y de toda actividad realizada bajo tu cuenta. Notificanos inmediatamente sobre cualquier acceso no autorizado escribiendo a soporte@b1n0.com. b1n0 implementa autenticación segura y cifrado, pero no garantiza que la plataforma sea inmune a ataques. No asumimos responsabilidad por pérdidas derivadas de credenciales comprometidas por culpa del usuario.
      </DocParagraph>
    ),
  },
  {
    id: 'funcionamiento',
    eyebrow: 'SECCIÓN 06',
    title: '6. Cómo funciona la plataforma',
    children: (
      <DocParagraph>
        (a) Depositás fondos a tu saldo mediante los métodos de pago habilitados. (b) Elegís un evento y un lado (SÍ/NO o una opción específica) y el monto que querés poner. La plataforma muestra antes de confirmar: la comisión que cobramos, el precio del contrato (basado en un mercado automatizado, AMM), los contratos que recibís, y el cobro estimado si tu voto resulta correcto. (c) Cuando el evento se resuelve, si tu voto fue correcto, recibís el pago automáticamente menos un porcentaje de resolución (skim) que va a la tesorería de la plataforma. Si fue incorrecto, perdés tu entrada que queda en el pool para los ganadores. (d) También podés vender tu posición antes de la resolución a precio del mercado actual menos comisión de venta y spread.
      </DocParagraph>
    ),
  },
  {
    id: 'comisiones',
    eyebrow: 'SECCIÓN 07',
    title: '7. Comisiones y tarifas',
    children: (
      <DocParagraph>
        b1n0 cobra: (a) una comisión por transacción de compra (variable, entre 1% y 5% según condiciones del mercado, mostrada antes de confirmar); (b) un spread de mercado capturado por el AMM (entre 1% y 2% típicamente); (c) una comisión por venta anticipada del 2%; (d) un porcentaje de resolución del 5% sobre el cobro de los ganadores. Las tarifas se actualizan en la página de configuración de la plataforma y pueden cambiar con aviso previo de 30 días.
      </DocParagraph>
    ),
  },
  {
    id: 'depositos',
    eyebrow: 'SECCIÓN 08',
    title: '8. Depósitos y retiros',
    children: (
      <DocParagraph>
        Los depósitos se procesan a través de proveedores de pago externos. Los retiros están sujetos a verificación KYC al menos de Nivel 2 y a un período de procesamiento de hasta 5 días hábiles. Reservamos el derecho de retrasar o rechazar retiros si detectamos actividad sospechosa hasta resolver la investigación. Los depósitos mínimos y montos máximos pueden cambiar; los actuales se muestran en la página de Depósito. b1n0 no cobra comisión por depósito ni retiro propio, aunque tu banco o procesador de pagos puede aplicar cargos.
      </DocParagraph>
    ),
  },
  {
    id: 'liquidez',
    eyebrow: 'SECCIÓN 09',
    title: '9. Liquidez y patrocinio (LPs)',
    children: (
      <DocParagraph>
        Los pools que respaldan los pagos a ganadores son financiados por proveedores de liquidez (LPs). Los LPs depositan capital en eventos específicos a cambio de un porcentaje de las comisiones generadas. b1n0 no garantiza retornos a LPs ni a usuarios; los LPs pueden perder parte o la totalidad de su capital comprometido si los pagos a ganadores exceden los fondos disponibles del pool. Los términos específicos para LPs se acuerdan por separado entre cada LP y b1n0.
      </DocParagraph>
    ),
  },
  {
    id: 'conductas',
    eyebrow: 'SECCIÓN 10',
    title: '10. Conductas prohibidas',
    children: (
      <DocParagraph>
        Está terminantemente prohibido: (a) crear o usar cuentas múltiples; (b) usar bots, scripts, herramientas automatizadas o cualquier sistema para manipular precios, volúmenes, o el sistema de ranking; (c) coordinar con otros usuarios para manipular mercados (collusion); (d) participar en eventos sobre los que tenés información privilegiada o no pública (insider trading); (e) usar la plataforma para lavado de dinero o financiar actividades ilegales; (f) intentar acceder, escanear o explotar vulnerabilidades del sistema; (g) suplantar a otra persona o representar falsamente tu identidad; (h) publicar contenido (en comentarios, perfiles) que sea ilegal, difamatorio, abusivo, de odio, sexualmente explícito, o que infrinja derechos de terceros. Las violaciones resultan en suspensión inmediata, posible confiscación de saldo, y reporte a autoridades cuando corresponda.
      </DocParagraph>
    ),
  },
  {
    id: 'contenido',
    eyebrow: 'SECCIÓN 11',
    title: '11. Contenido del usuario',
    children: (
      <DocParagraph>
        Vos retenés la propiedad del contenido que publicás (comentarios, foto de perfil, opiniones). Al publicar contenido, otorgás a b1n0 una licencia mundial, no exclusiva, libre de regalías, para usar, mostrar, y distribuir ese contenido en relación con la operación de la plataforma. Podemos remover cualquier contenido que viole estos términos sin aviso previo. No revisamos preventivamente todo el contenido publicado; los usuarios son responsables de su propio contenido.
      </DocParagraph>
    ),
  },
  {
    id: 'ip-b1n0',
    eyebrow: 'SECCIÓN 12',
    title: '12. Propiedad intelectual de b1n0',
    children: (
      <DocParagraph>
        La marca b1n0, el logo, el diseño de la plataforma, el código, los algoritmos de pricing, la documentación, y todos los elementos creativos son propiedad de b1n0 o sus licenciantes y están protegidos por leyes de propiedad intelectual. No podés copiar, modificar, distribuir, vender, ni hacer ingeniería inversa de la plataforma sin autorización escrita previa.
      </DocParagraph>
    ),
  },
  {
    id: 'suspension',
    eyebrow: 'SECCIÓN 13',
    title: '13. Suspensión y terminación',
    children: (
      <DocParagraph>
        Podemos suspender o cerrar tu cuenta sin aviso previo si: (a) violás estos términos; (b) detectamos actividad fraudulenta o sospechosa; (c) por requerimiento legal o regulatorio; (d) por inactividad prolongada (más de 24 meses sin uso). Vos podés cerrar tu cuenta en cualquier momento desde la sección de Perfil. Al cierre de cuenta, tu saldo disponible (después de retenciones legales y períodos de validación) será reembolsado al método de pago que tenemos en archivo, salvo confiscación por violación de términos.
      </DocParagraph>
    ),
  },
  {
    id: 'garantias',
    eyebrow: 'SECCIÓN 14',
    title: '14. Sin garantías; limitación de responsabilidad',
    children: (
      <DocParagraph>
        b1n0 se proporciona &quot;tal cual&quot; y &quot;según disponibilidad&quot;, sin garantías de ningún tipo, ya sean expresas o implícitas, incluyendo (pero no limitadas a) garantías de comerciabilidad, idoneidad para un propósito particular, o no infracción. No garantizamos que la plataforma sea ininterrumpida, libre de errores, o segura. En la máxima medida permitida por la ley aplicable, la responsabilidad total de b1n0 hacia vos por cualquier reclamación derivada del uso de la plataforma se limita al monto que has depositado en los 12 meses anteriores al evento que da lugar a la reclamación. b1n0 no es responsable por daños indirectos, incidentales, consecuentes, o punitivos.
      </DocParagraph>
    ),
  },
  {
    id: 'indemnizacion',
    eyebrow: 'SECCIÓN 15',
    title: '15. Indemnización',
    children: (
      <DocParagraph>
        Aceptás indemnizar y mantener indemne a b1n0, sus directores, empleados y agentes, frente a cualquier reclamación, pérdida, responsabilidad, daño, costo o gasto (incluyendo honorarios razonables de abogados) que surja de tu violación de estos términos, tu uso indebido de la plataforma, o tu violación de derechos de terceros.
      </DocParagraph>
    ),
  },
  {
    id: 'disputas',
    eyebrow: 'SECCIÓN 16',
    title: '16. Resolución de disputas y ley aplicable',
    children: (
      <DocParagraph>
        Estos Términos se rigen por las leyes de la República de Guatemala. Cualquier controversia derivada de o relacionada con estos términos se intentará resolver primero mediante negociación de buena fe entre las partes durante 30 días. Si no se llega a un acuerdo, la disputa se someterá a arbitraje conforme a las reglas del Centro de Arbitraje y Conciliación de la Cámara de Comercio de Guatemala (CRECIG), con sede en la Ciudad de Guatemala. El arbitraje se llevará en español. La decisión del árbitro será final y vinculante.
      </DocParagraph>
    ),
  },
  {
    id: 'generales',
    eyebrow: 'SECCIÓN 17',
    title: '17. Disposiciones generales',
    children: (
      <DocParagraph>
        Si alguna disposición de estos términos es declarada inválida o inejecutable, el resto continúa en pleno vigor. La omisión por parte de b1n0 de hacer cumplir cualquier derecho bajo estos términos no constituye renuncia a ese derecho. Estos términos constituyen el acuerdo completo entre vos y b1n0 con respecto al uso de la plataforma. No podés ceder estos términos sin nuestro consentimiento escrito; b1n0 puede ceder estos términos en cualquier momento.
      </DocParagraph>
    ),
  },
  {
    id: 'contacto',
    eyebrow: 'SECCIÓN 18',
    title: '18. Contacto',
    children: (
      <DocParagraph>
        Para preguntas sobre estos Términos y Condiciones: soporte@b1n0.com. Para reportes de seguridad o vulnerabilidades: security@b1n0.com. Para asuntos legales: legal@b1n0.com.
      </DocParagraph>
    ),
  },
]

// ── Privacy content ────────────────────────────────────────────────────
const PRIVACY_SECTIONS: DocPageSection[] = [
  {
    id: 'quienes',
    eyebrow: 'SECCIÓN 01',
    title: '1. Quiénes somos',
    children: (
      <DocParagraph>
        b1n0 es la plataforma de opinión social descrita en nuestros Términos y Condiciones. En esta política, &quot;b1n0&quot;, &quot;nosotros&quot;, o &quot;la plataforma&quot; se refieren a la entidad operadora de b1n0.com. Esta política explica qué información recopilamos, por qué, cómo la usamos, con quién la compartimos, y qué derechos tenés sobre ella. Aplica a todos los usuarios de la plataforma.
      </DocParagraph>
    ),
  },
  {
    id: 'recopilamos',
    eyebrow: 'SECCIÓN 02',
    title: '2. Información que recopilamos',
    children: (
      <DocParagraph>
        Recopilamos las siguientes categorías de datos: (a) Información de cuenta: nombre, apellidos, fecha de nacimiento, número de teléfono, correo electrónico, dirección, país de residencia, foto de perfil opcional, contraseña hasheada. (b) Información de verificación (KYC): foto de DPI o documento oficial, foto de selfie para verificación facial, comprobante de domicilio, declaración de origen de fondos (solo Niveles 2 y 3). (c) Información financiera: saldo de la cuenta, historial de depósitos y retiros, método de pago seleccionado (los datos de tarjetas son procesados directamente por nuestro proveedor de pagos y no se almacenan en nuestros servidores). (d) Información de actividad: eventos en los que participás, montos, lados elegidos, comentarios publicados, posiciones compradas y vendidas, dispositivo y navegador, dirección IP, fecha y hora de cada acción. (e) Información social: lista de amigos en la plataforma, solicitudes de amistad.
      </DocParagraph>
    ),
  },
  {
    id: 'uso',
    eyebrow: 'SECCIÓN 03',
    title: '3. Cómo usamos tu información',
    children: (
      <DocParagraph>
        Usamos tu información para: (a) operar la plataforma — autenticarte, mostrar tu saldo, procesar tus participaciones, calcular tus cobros, recordar tus preferencias; (b) cumplir obligaciones legales y regulatorias — verificar tu identidad (KYC), prevenir lavado de dinero (AML), reportar a autoridades cuando la ley lo requiera; (c) prevenir fraude y abuso — detectar cuentas múltiples, bots, manipulación de mercados, y otros usos prohibidos; (d) procesar pagos — enviar y recibir fondos a través de nuestro proveedor de pagos; (e) comunicarnos con vos — enviar confirmaciones, notificaciones de resolución de eventos, alertas de seguridad, y (con tu consentimiento) novedades y promociones; (f) mejorar el servicio — analizar el uso de la plataforma para encontrar y arreglar problemas, diseñar nuevas funciones; (g) defender derechos legales en caso de disputas.
      </DocParagraph>
    ),
  },
  {
    id: 'base-legal',
    eyebrow: 'SECCIÓN 04',
    title: '4. Base legal para el tratamiento',
    children: (
      <DocParagraph>
        Tratamos tu información personal con las siguientes bases legales: (a) ejecución de contrato — para operar tu cuenta, procesar tus participaciones, y prestar el servicio acordado; (b) cumplimiento de obligaciones legales — para KYC, AML, retención de registros financieros, y respuesta a requerimientos de autoridades; (c) interés legítimo — para prevenir fraude, mejorar el servicio, defender derechos legales; (d) consentimiento — para comunicaciones promocionales, cookies no esenciales, y otros usos donde lo solicitemos explícitamente. Podés retirar tu consentimiento en cualquier momento; esto no afecta la legalidad del tratamiento previo.
      </DocParagraph>
    ),
  },
  {
    id: 'compartir',
    eyebrow: 'SECCIÓN 05',
    title: '5. Con quién compartimos tu información',
    children: (
      <DocParagraph>
        No vendemos tu información personal. Compartimos datos solo con las siguientes categorías de terceros y solo en la medida necesaria: (a) Supabase (base de datos y autenticación) — almacena los datos de tu cuenta y actividad bajo acuerdo de procesamiento de datos. (b) Sentry (monitoreo de errores) — recibe reportes técnicos cuando hay errores en la app; pueden incluir tu identificador de usuario pero no datos sensibles. (c) Vercel (hosting del frontend) — sirve la aplicación; no almacena datos personales más allá de logs estándar de servidor web. (d) Didit (proveedor de KYC) — recibe los documentos de verificación para confirmar tu identidad. (e) Resend (correos transaccionales) — envía notificaciones operativas. (f) Autoridades — cuando una orden judicial, requerimiento de autoridad competente, o ley aplicable nos obligue. (g) Sucesores legales — en caso de fusión, adquisición, o reestructuración de b1n0, tu información puede transferirse al sucesor sujeta a esta misma política. Cualquier nuevo tercero será notificado mediante actualización de esta política.
      </DocParagraph>
    ),
  },
  {
    id: 'transferencias',
    eyebrow: 'SECCIÓN 06',
    title: '6. Transferencias internacionales',
    children: (
      <DocParagraph>
        Algunos de nuestros proveedores (Supabase, Sentry, Vercel) operan servidores en Estados Unidos y otras jurisdicciones fuera de Centroamérica. Tu información puede ser transferida y procesada fuera de tu país de residencia. Implementamos salvaguardas contractuales con estos proveedores para proteger tus datos conforme a estándares internacionales (cláusulas contractuales tipo de la Comisión Europea o equivalentes).
      </DocParagraph>
    ),
  },
  {
    id: 'retencion',
    eyebrow: 'SECCIÓN 07',
    title: '7. Retención de datos',
    children: (
      <DocParagraph>
        Conservamos tu información: (a) mientras tu cuenta esté activa; (b) por un período adicional de 5 años después del cierre de cuenta para cumplir con obligaciones de prevención de lavado de dinero y retención de registros financieros aplicable en Centroamérica; (c) registros de transacciones financieras se retienen por el período exigido por la ley local (generalmente 10 años); (d) datos de KYC pueden retenerse por períodos distintos según los requerimientos del regulador. Después de los períodos legales aplicables, los datos se eliminan o se anonimizan de forma irreversible.
      </DocParagraph>
    ),
  },
  {
    id: 'derechos',
    eyebrow: 'SECCIÓN 08',
    title: '8. Tus derechos',
    children: (
      <DocParagraph>
        Tenés derecho a: (a) acceder a tu información personal y obtener una copia; (b) corregir datos inexactos o incompletos; (c) solicitar la eliminación de tu información, sujeto a las obligaciones legales de retención mencionadas arriba; (d) oponerte a ciertos tratamientos basados en interés legítimo; (e) restringir el procesamiento mientras se resuelve una disputa; (f) portabilidad — recibir tus datos en formato estructurado y legible por máquina; (g) retirar consentimiento previamente otorgado; (h) presentar una queja ante la autoridad de protección de datos competente en tu jurisdicción. Para ejercer cualquiera de estos derechos, escribinos a soporte@b1n0.com con tu identificador de usuario y prueba de identidad. Respondemos dentro de 30 días.
      </DocParagraph>
    ),
  },
  {
    id: 'seguridad',
    eyebrow: 'SECCIÓN 09',
    title: '9. Seguridad',
    children: (
      <DocParagraph>
        Implementamos medidas técnicas y organizativas razonables para proteger tu información, incluyendo: cifrado en tránsito (TLS 1.2+) en todas las comunicaciones con la plataforma; cifrado en reposo de la base de datos; Row-Level Security en Postgres para datos sensibles; control de acceso basado en roles para empleados con acceso a datos personales; reconciliación contable diaria automática para detectar drift en saldos; monitoreo de errores en tiempo real con Sentry; auditoría de accesos administrativos. A pesar de estas medidas, ningún sistema es 100% seguro. Si detectás un comportamiento sospechoso en tu cuenta, notificanos inmediatamente. Notificaremos a usuarios afectados y a las autoridades competentes en caso de una brecha de seguridad significativa, conforme a las leyes aplicables.
      </DocParagraph>
    ),
  },
  {
    id: 'cookies',
    eyebrow: 'SECCIÓN 10',
    title: '10. Cookies y tecnologías similares',
    children: (
      <DocParagraph>
        Usamos cookies esenciales para el funcionamiento de la plataforma — específicamente, una cookie de autenticación que mantiene tu sesión iniciada y una cookie de preferencias que recuerda tu tema (claro/oscuro) y otras configuraciones. No usamos cookies de publicidad de terceros, pixeles de seguimiento publicitario, ni cookies para retargeting. Usamos almacenamiento local (localStorage) del navegador para algunas preferencias del usuario. Podés borrar las cookies y el almacenamiento local desde la configuración de tu navegador, pero esto cerrará tu sesión y requerirá iniciar sesión nuevamente.
      </DocParagraph>
    ),
  },
  {
    id: 'menores',
    eyebrow: 'SECCIÓN 11',
    title: '11. Menores de edad',
    children: (
      <DocParagraph>
        b1n0 no está dirigido a menores de 18 años. No recopilamos intencionalmente información personal de menores. Si descubrimos que hemos recopilado información de un menor sin verificación de consentimiento parental válido, eliminaremos esa información lo más rápido posible. Si sos padre/madre o tutor y creés que un menor ha proporcionado información personal a b1n0, contactanos a soporte@b1n0.com.
      </DocParagraph>
    ),
  },
  {
    id: 'marketing',
    eyebrow: 'SECCIÓN 12',
    title: '12. Comunicaciones de marketing',
    children: (
      <DocParagraph>
        Podemos enviarte comunicaciones promocionales por correo electrónico o notificaciones push si has dado tu consentimiento. Podés cancelar la suscripción en cualquier momento haciendo clic en el enlace de cancelación al final de cualquier correo, ajustando tus preferencias en tu Perfil, o escribiéndonos. Las comunicaciones operacionales (confirmación de depósito, resolución de eventos, alertas de seguridad) no son opcionales mientras tengas una cuenta activa.
      </DocParagraph>
    ),
  },
  {
    id: 'cambios',
    eyebrow: 'SECCIÓN 13',
    title: '13. Cambios a esta política',
    children: (
      <DocParagraph>
        Podemos actualizar esta Política de Privacidad. Cuando los cambios sean significativos, te notificaremos por correo electrónico o mediante un aviso destacado en la plataforma al menos 30 días antes de que los cambios entren en vigor. La fecha de &quot;Última actualización&quot; al inicio de esta página indica cuándo fue revisada por última vez. El uso continuado de la plataforma después de la fecha de entrada en vigor de los cambios constituye aceptación de la política actualizada.
      </DocParagraph>
    ),
  },
  {
    id: 'contacto',
    eyebrow: 'SECCIÓN 14',
    title: '14. Contacto',
    children: (
      <DocParagraph>
        Para preguntas, ejercer tus derechos, o reportar inquietudes sobre privacidad: soporte@b1n0.com. Para asuntos generales de soporte: soporte@b1n0.com. Para reportes de seguridad: security@b1n0.com.
      </DocParagraph>
    ),
  },
]

// ── Pages ──────────────────────────────────────────────────────────────

export function TermsPage() {
  usePageMeta({
    title: 'Términos · b1n0',
    description: 'Términos y Condiciones de uso de b1n0 — la plataforma de opinión patrocinada.',
  })
  return (
    <DocPageShell
      pageEyebrow="TÉRMINOS Y CONDICIONES"
      pageTitle="Términos y Condiciones."
      intro="Las reglas del juego — qué es b1n0, qué no es, qué podés y no podés hacer, cómo manejamos depósitos, retiros, disputas y propiedad intelectual. Sin letra chica."
      lastUpdated={LAST_UPDATED}
      sections={TERMS_SECTIONS}
    />
  )
}

export function PrivacyPage() {
  usePageMeta({
    title: 'Privacidad · b1n0',
    description: 'Política de Privacidad de b1n0 — cómo manejamos tus datos.',
  })
  return (
    <DocPageShell
      pageEyebrow="POLÍTICA DE PRIVACIDAD"
      pageTitle="Política de Privacidad."
      intro="Qué datos recopilamos, por qué, con quién los compartimos, dónde se guardan, cuánto tiempo, y cómo podés ejercer tus derechos sobre ellos."
      lastUpdated={LAST_UPDATED}
      sections={PRIVACY_SECTIONS}
    />
  )
}

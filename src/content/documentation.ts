/**
 * Documentación de b1n0 — fuente única de verdad para el copy de /documentacion.
 *
 * Editar el copy acá NO requiere tocar el componente Documentacion.tsx.
 * El componente lee este árbol y renderiza cada bloque según su tipo.
 *
 * Reglas de tono:
 *   - Voseo centroamericano (hacés, sabés, llamado, cobrás).
 *   - Sin lenguaje de casino o apuestas (ver brandbook + CLAUDE.md).
 *   - Honesto sobre comisiones y riesgos. Esa es la diferencia.
 */

export type DocBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'callout'; tone?: 'info' | 'warn' | 'positive'; title?: string; body: string }
  | { kind: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | { kind: 'glossary'; items: { term: string; def: string }[] }
  | { kind: 'divider' }
  | { kind: 'deepLink'; label: string; href: string }
  | { kind: 'noEs'; items: string[] }   // "Esto NO es" — bulleted negative framing

export interface DocSection {
  id: string                      // anchor + nav key
  eyebrow: string                 // small green label above the title
  title: string                   // section heading
  blocks: DocBlock[]
}

export const DOC_LAST_UPDATED = '15 de mayo de 2026'

export const DOC_SECTIONS: DocSection[] = [
  // ────────────────────────────────────────────────────────────────
  // 1. ¿Qué es b1n0?
  // ────────────────────────────────────────────────────────────────
  {
    id: 'que-es-b1n0',
    eyebrow: '01',
    title: '¿Qué es b1n0?',
    blocks: [
      {
        kind: 'paragraph',
        text: 'b1n0 es una plataforma de opinión social donde demostrás que sabés más que todos. Hacés tu llamado sobre eventos reales — fútbol, política, economía, cultura — y cobrás si tenés razón.',
      },
      {
        kind: 'paragraph',
        text: 'Diseñado en Centroamérica, para Centroamérica. Operado por Tres33 SAS de CV. Atendemos a hispanohablantes de Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica, Panamá y Belice como un solo mercado.',
      },
      {
        kind: 'callout',
        tone: 'positive',
        title: 'En una frase',
        body: 'Un mercado de convicciones. No es casino. No es bolsa. No es una app de apuestas. Es el lugar donde tus opiniones cuestan — y donde se demuestran.',
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 2. Cómo funcionan los llamados
  // ────────────────────────────────────────────────────────────────
  {
    id: 'como-funcionan',
    eyebrow: '02',
    title: 'Cómo funcionan los llamados',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Cada evento en b1n0 tiene dos lados: SÍ y NO. Cuando hacés tu llamado, comprás "contratos" en uno de los lados. Cada contrato vale exactamente $1 si tu lado gana — y $0 si no.',
      },
      {
        kind: 'paragraph',
        text: 'El precio de cada contrato refleja lo que el mercado cree en ese momento. Si SÍ está a 62%, un contrato SÍ cuesta aproximadamente $0.62. Si NO está a 38%, un contrato NO cuesta $0.38. Cuanto más impopular tu lado, más barato el contrato — y más cobrás si tenés razón.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Ejemplo concreto',
        body: 'María pone $50 en NO al precio $0.38. Su entrada compra ~131 contratos. Si NO gana, cobra $131 — 2.6× su entrada (+162% retorno). Si NO pierde, cobra $0. Esa es la trampa, esa es la oportunidad.',
      },
      {
        kind: 'paragraph',
        text: 'El precio se mueve mientras la gente opina. Si más gente compra SÍ, el precio SÍ sube. Tu posición tiene un "valor actual" en tiempo real que vas viendo en tu portafolio — eso es lo que alguien más pagaría hoy por tus contratos si quisieras vender antes de la resolución.',
      },
      {
        kind: 'paragraph',
        text: 'Cuando el evento se resuelve, los ganadores cobran $1 × contratos automáticamente en su saldo. Los perdedores no pagan nada extra — perdieron lo que pusieron, no más.',
      },
      { kind: 'deepLink', label: 'Ver llamados activos', href: '/inicio' },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 3. Niveles de verificación (KYC)
  // ────────────────────────────────────────────────────────────────
  {
    id: 'niveles',
    eyebrow: '03',
    title: 'Niveles de verificación',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Para operar en b1n0 verificamos tu identidad por niveles. Cada nivel desbloquea un límite más alto por evento. Empezás en Nivel 1 y subís cuando quieras.',
      },
      {
        kind: 'table',
        headers: ['Nivel', 'Lo que necesitás', 'Máximo por evento'],
        rows: [
          ['Nivel 1', 'Tu número de teléfono', '$50'],
          ['Nivel 2', 'Teléfono + DPI / cédula', '$250'],
          ['Nivel 3', 'Verificación completa con foto', '$1,000'],
        ],
      },
      {
        kind: 'paragraph',
        text: 'Pedimos esta información para cumplir con regulación antilavado (AML/KYC) y prevenir fraude. Tus datos están encriptados y no se comparten con terceros excepto cuando la ley lo exige.',
      },
      { kind: 'deepLink', label: 'Verificá tu cuenta', href: '/perfil' },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 4. Comisiones y costos — la sección crítica
  // ────────────────────────────────────────────────────────────────
  {
    id: 'comisiones',
    eyebrow: '04',
    title: 'Comisiones y costos',
    blocks: [
      {
        kind: 'paragraph',
        text: 'b1n0 cobra cuatro tipos de comisión a lo largo del ciclo de vida de un evento. Las publicamos todas, sin letra chica.',
      },
      {
        kind: 'table',
        headers: ['Comisión', 'Tasa', 'Cuándo se cobra'],
        rows: [
          ['Comisión de compra', '1–5%', 'Cada vez que hacés un llamado.'],
          ['Comisión de salida', '2%', 'Si vendés tu posición antes de la resolución.'],
          ['Spread (margen)', '1–2%', 'Capturado en el precio que pagás al comprar.'],
          ['Skim de resolución', '5%', 'Sobre lo que cobrás cuando ganás.'],
        ],
        caption: 'Tasa total efectiva: ~8% combinado sobre el dinero que pasa por la plataforma.',
      },
      {
        kind: 'callout',
        tone: 'positive',
        title: 'Las primeras 10 entradas en cada evento nuevo son sin comisión',
        body: 'Llamado "maker rebate". Premia a quien se anima primero a opinar cuando un evento recién aparece. Esto baja el costo de entrada y mejora la liquidez para todos.',
      },
      {
        kind: 'paragraph',
        text: 'Lo que b1n0 NO hace: no movemos las cuotas a favor nuestro, no hay "ventaja de la casa" oculta en el precio, y no cobramos comisión a los que pierden. Los precios son los del mercado en vivo. Lo único que ganamos sale de las comisiones públicas de arriba.',
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 5. Liquidity Providers
  // ────────────────────────────────────────────────────────────────
  {
    id: 'lps',
    eyebrow: '05',
    title: 'Liquidity Providers (LPs)',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Cada evento en b1n0 tiene un "pool" que garantiza los pagos a los ganadores. Ese pool no se llena solo: lo respaldan Liquidity Providers — personas o empresas que depositan capital específicamente para sostener uno o varios eventos.',
      },
      {
        kind: 'paragraph',
        text: 'Cuando los usuarios hacen sus llamados, el dinero que entra y el capital LP se combinan para formar el pool. Cuando el evento se resuelve, los ganadores cobran de ese pool. El LP recupera su capital original más una participación de las comisiones generadas durante el evento y un margen por variancia.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: '¿Por qué necesitamos LPs?',
        body: 'Sin LPs, un evento tendría que esperar a que entren suficientes usuarios antes de poder pagar al lado ganador. Con LPs, los pagos están garantizados desde el primer minuto. Hacés tu llamado con la tranquilidad de que vas a cobrar si tenés razón.',
      },
      {
        kind: 'paragraph',
        text: 'Ser LP implica riesgo: en eventos donde el lado impopular gana, el LP puede recibir menos de lo que aportó. A cambio, los LPs ganan en eventos donde el mercado predijo bien — que es la mayoría. Si te interesa ser LP, escribinos a soporte@b1n0.com.',
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 6. Resolución de eventos
  // ────────────────────────────────────────────────────────────────
  {
    id: 'resolucion',
    eyebrow: '06',
    title: 'Resolución de eventos',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Cada evento tiene una fuente oficial de verdad publicada antes de que la gente empiece a opinar. Si no hay una fuente confiable, el evento no se publica.',
      },
      {
        kind: 'table',
        headers: ['Categoría', 'Fuente de verdad'],
        rows: [
          ['Fútbol nacional', 'Resultado oficial de la liga correspondiente (FEDEFUT, FESFUT, FENAFUTH, etc.).'],
          ['Fútbol internacional', 'CONCACAF, CONMEBOL o FIFA, según el torneo.'],
          ['Economía / dólar', 'Tipo de cambio publicado por el banco central del país en cuestión.'],
          ['Política', 'Resultado oficial del tribunal electoral correspondiente.'],
          ['Cultura / entretenimiento', 'Anuncio oficial del organizador (Academia, festival, ranking, etc.).'],
        ],
      },
      {
        kind: 'paragraph',
        text: 'Cuando un evento se resuelve, los pagos se procesan en menos de 24 horas y entran directamente a tu saldo. No tenés que reclamar nada — pasa automáticamente.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        title: 'Eventos anulados',
        body: 'Si un evento se vuelve imposible de resolver (suspensión indefinida, fuente oficial inaccesible, ambigüedad legítima), lo anulamos y devolvemos a cada participante su entrada original. Comunicamos la anulación por notificación y por correo. No se cobra comisión adicional en anulaciones.',
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 7. Custodia y seguridad
  // ────────────────────────────────────────────────────────────────
  {
    id: 'seguridad',
    eyebrow: '07',
    title: 'Custodia y seguridad',
    blocks: [
      {
        kind: 'paragraph',
        text: 'b1n0 opera como custodio regulado: tu saldo se mantiene en cuentas segregadas con instituciones financieras reguladas en Centroamérica. Eso significa que tus fondos no se mezclan con el capital operativo de Tres33, y no podemos disponer de ellos para gastos de la empresa.',
      },
      {
        kind: 'bullets',
        items: [
          'Saldo en moneda USD para evitar fricción cambiaria entre países.',
          'Sesiones con expiración automática para protegerte si dejás la app abierta en un dispositivo compartido.',
          'Cambio de contraseña en cualquier momento desde tu perfil.',
          'Notificaciones inmediatas de cualquier movimiento sospechoso.',
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        title: '¿Y si pierdo acceso a mi cuenta?',
        body: 'Podemos restaurar acceso usando tu correo y tu verificación KYC. Nunca te vamos a pedir tu contraseña — si alguien dice ser de b1n0 y te la pide, no es de b1n0.',
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 8. Glosario
  // ────────────────────────────────────────────────────────────────
  {
    id: 'glosario',
    eyebrow: '08',
    title: 'Glosario',
    blocks: [
      {
        kind: 'glossary',
        items: [
          { term: 'Llamado', def: 'La posición que hacés cuando comprás contratos en un evento. "Hice mi llamado por SÍ en el clásico."' },
          { term: 'Convicción', def: 'La intuición o conocimiento que respalda tu llamado. Lo que querés demostrar al hacerlo.' },
          { term: 'Contrato', def: 'Cada unidad que comprás dentro de un llamado. Vale $1 si tu lado gana, $0 si no.' },
          { term: 'Cobro', def: 'Lo que recibís cuando tu lado gana. Equivale a contratos × $1, menos el skim de resolución.' },
          { term: 'Pool', def: 'El dinero total disponible para pagar al lado ganador. Suma de aportes de usuarios y de LPs.' },
          { term: 'LP (Liquidity Provider)', def: 'Persona o empresa que respalda el pool de un evento. Gana comisiones a cambio del riesgo que asume.' },
          { term: 'Spread', def: 'La pequeña diferencia entre el precio medio del mercado y el precio que pagás al comprar. Forma parte del 1–2% que cobramos.' },
          { term: 'Skim de resolución', def: 'El 5% que b1n0 retiene de cada pago a ganadores. Los perdedores no pagan nada extra.' },
          { term: 'Mid price', def: 'El precio "justo" del mercado en este momento, basado en lo que la gente cree. Se mueve en tiempo real.' },
          { term: 'Resolución', def: 'El momento en que se publica el resultado oficial del evento y se pagan los ganadores.' },
          { term: 'Anulación', def: 'Cuando un evento no se puede resolver de forma confiable y devolvemos las entradas a todos los participantes.' },
          { term: 'KYC', def: 'Verificación de identidad. Te pedimos información progresiva según el nivel que querés desbloquear.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 9. Esto NO es
  // ────────────────────────────────────────────────────────────────
  {
    id: 'no-es',
    eyebrow: '09',
    title: 'Esto NO es',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Es importante ser explícitos sobre lo que b1n0 no es. La regulación, la cultura y el sentido común exigen claridad.',
      },
      {
        kind: 'noEs',
        items: [
          'NO es una casa de apuestas. No fijamos cuotas, no ofrecemos handicap, no hay un bookmaker del otro lado.',
          'NO es un casino. No hay juegos de azar puro, ni tragamonedas, ni ruleta, ni nada parecido.',
          'NO es bolsa de valores. No operamos con acciones, bonos, ni derivados financieros.',
          'NO es asesoría financiera. Nada en b1n0 es una recomendación de inversión.',
          'NO es una red de intermediación bursátil. No somos casa de bolsa ni operamos como tal.',
          'NO es garantía de retorno. Tus llamados pueden ganar o perder — esa es la naturaleza del producto.',
        ],
      },
      {
        kind: 'paragraph',
        text: 'Operamos como un servicio de información y entretenimiento social donde los participantes ponen dinero respaldando una opinión sobre un evento real. Cuando el evento se resuelve, quienes acertaron cobran una porción proporcional del pool. Esa es toda la mecánica.',
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────
  // 10. Contacto y soporte
  // ────────────────────────────────────────────────────────────────
  {
    id: 'contacto',
    eyebrow: '10',
    title: 'Contacto y soporte',
    blocks: [
      {
        kind: 'paragraph',
        text: '¿Algo no anda? ¿Tenés una pregunta que no encontraste acá? Escribinos.',
      },
      {
        kind: 'bullets',
        items: [
          'Correo: soporte@b1n0.com',
          'Respondemos en menos de 24 horas hábiles.',
          'Para temas urgentes con tu saldo o tu cuenta, marcalo en el asunto: [URGENTE].',
          'Tres33 SAS de CV · Ciudad de Guatemala, Guatemala',
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        title: '¿Buscás convertirte en LP o partner?',
        body: 'Si querés respaldar pools con capital, integrar b1n0 con tu medio de comunicación, o hablar de una colaboración comercial, escribinos a kim@b1n0.com directamente.',
      },
    ],
  },
]

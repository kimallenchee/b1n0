import { useEffect } from 'react'

/* ═══════════════════════════════════════════════════════════════
   /sponsor — Public LP capital explainer
   ───────────────────────────────────────────────────────────────
   What a prospective sponsor reads BEFORE depositing capital.
   Walks through what LP capital does, the four outcome scenarios
   with worked numbers, and an FAQ. Brand-faithful, dark-mode
   locked. Standalone route outside the app chrome (mirrors
   /prensa-libre's setup).

   The actual T&C language lives in lp_consent_versions.terms_md
   and is fetched + rendered on the consent modal at deposit time.
   This page is the marketing-fronted, plain-language educational
   walkthrough — designed so a sponsor finishes reading it and
   knows whether they want to engage at all.
   ═══════════════════════════════════════════════════════════════ */

const F = 'var(--font-body)'
const D = 'var(--font-display)'

interface Scenario {
  key: string
  title: string
  outcome: string
  result: string
  resultColor: string
  flow: { label: string; amount: string; note?: string }[]
  takeaway: string
}

const SCENARIOS: Scenario[] = [
  {
    key: 'balanced',
    title: 'Mercado balanceado',
    outcome: 'Apuestas casi parejas YES/NO. El lado favorito gana.',
    result: 'LP cobra +0%',
    resultColor: 'var(--b1n0-muted)',
    flow: [
      { label: 'LP capital comprometido', amount: '$5,000' },
      { label: 'Apuestas YES (125 usuarios × $20)', amount: '$2,500' },
      { label: 'Apuestas NO (125 usuarios × $20)', amount: '$2,500' },
      { label: 'YES gana — claim total', amount: '$4,750', note: 'tras 5% comisión entrada' },
      { label: 'bet_pool cubre el claim', amount: '$4,750' },
      { label: 'LP capital devuelto', amount: '$5,000' },
      { label: 'Resultado neto del LP', amount: '$0', note: 'tiempo de capital comprometido sin retorno' },
    ],
    takeaway: 'Mercados parejos no generan retorno para el LP. El skim de resolución va a la plataforma. El LP es esencialmente liquidez pasiva en este caso.',
  },
  {
    key: 'favorite_wins',
    title: 'Mercado lopsided — favorito gana',
    outcome: '160 apuestan YES (favorito), 90 apuestan NO. El favorito gana.',
    result: 'LP pierde $699',
    resultColor: 'var(--b1n0-no)',
    flow: [
      { label: 'LP capital comprometido', amount: '$5,000' },
      { label: 'Apuestas YES (160 × $20)', amount: '$3,200' },
      { label: 'Apuestas NO (90 × $20)', amount: '$1,800' },
      { label: 'bet_pool (neto de comisiones)', amount: '$4,750' },
      { label: 'YES gana — claim total', amount: '$5,449', note: '5,736 contratos × $1 menos 5% skim' },
      { label: 'Faltante que cubre el LP', amount: '$699.20', note: '$5,449 − $4,750' },
      { label: 'LP capital devuelto', amount: '$4,300.80', note: '$5,000 − $699.20' },
    ],
    takeaway: 'El peor escenario para el LP: la multitud tenía razón Y se concentró en el lado correcto. El bet_pool no cubre el monto total que se debe pagar a ganadores y el LP completa la diferencia. Pérdida real, no virtual.',
  },
  {
    key: 'underdog_wins',
    title: 'Mercado lopsided — underdog gana',
    outcome: '160 apuestan YES (favorito), 90 apuestan NO. El underdog gana.',
    result: 'LP gana +$1,112',
    resultColor: 'var(--b1n0-si)',
    flow: [
      { label: 'LP capital comprometido', amount: '$5,000' },
      { label: 'Apuestas YES (perdedor)', amount: '$3,200' },
      { label: 'Apuestas NO (ganador, 90 × $20)', amount: '$1,800' },
      { label: 'bet_pool (neto)', amount: '$4,750' },
      { label: 'NO gana — claim total', amount: '$3,456', note: '3,638 contratos × $1 menos 5% skim' },
      { label: 'bet_pool excede el claim', amount: '$1,294' },
      { label: 'Excedente queda al LP', amount: '$1,112' },
      { label: 'LP capital devuelto', amount: '$6,112', note: '$5,000 + $1,112 ganancia' },
    ],
    takeaway: 'El mejor escenario para el LP: la multitud apostó al lado equivocado y perdió. Las apuestas perdedoras quedan en el pool y el LP se las queda como retorno por haber asumido el riesgo. Aquí el modelo paga.',
  },
  {
    key: 'void',
    title: 'Evento anulado',
    outcome: 'El evento se anula (fuente de verdad ambigua, error, regulatorio).',
    result: 'LP recupera principal',
    resultColor: 'var(--b1n0-gold)',
    flow: [
      { label: 'LP capital comprometido', amount: '$5,000' },
      { label: 'Apuestas hasta el momento', amount: '$X' },
      { label: 'Reembolso a apostadores', amount: '$X', note: 'al monto bruto, sin comisiones retenidas' },
      { label: 'LP capital devuelto', amount: '$5,000', note: 'principal completo, sin margen' },
      { label: 'Resultado neto del LP', amount: '$0', note: 'tiempo de capital comprometido sin retorno' },
    ],
    takeaway: 'En anulaciones el LP recupera su principal completo pero no obtiene margen. Esto protege al LP de errores operativos de la plataforma sin penalizar a los apostadores con pérdidas.',
  },
]

export function Sponsor() {
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme')
    document.title = 'b1n0 — Capital LP'
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev)
    }
  }, [])

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--b1n0-bg)',
      color: 'var(--b1n0-text-1)',
      fontFamily: F,
    }}>
      {/* Top accent stripe */}
      <div style={{ height: 4, background: 'var(--b1n0-si)' }} />

      {/* Header */}
      <header style={{
        maxWidth: 1100, margin: '0 auto', padding: '20px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--b1n0-border)',
      }}>
        <a href="/inicio" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/b1n0-logov2.png" alt="b1n0" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
        </a>
        <div style={{ fontSize: 11, color: 'var(--b1n0-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          Capital LP · Para patrocinadores
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 24px 32px' }}>
        <p style={{
          fontSize: 11, color: 'var(--b1n0-si)', textTransform: 'uppercase',
          letterSpacing: '0.16em', fontWeight: 700, marginBottom: 18,
        }}>
          Cómo funciona el capital LP
        </p>
        <h1 style={{
          fontFamily: D, fontWeight: 800, fontSize: 'clamp(40px, 6vw, 64px)',
          lineHeight: 1.05, letterSpacing: '-0.03em', margin: 0, marginBottom: 18,
        }}>
          Eres el <span style={{ color: 'var(--b1n0-si)' }}>market maker</span>. Tu capital hace posible el upside.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--b1n0-text-2)', maxWidth: 720, margin: '24px 0 0' }}>
          En b1n0, los premios no salen solo del bolsillo de los apostadores — el capital LP financia el upside. A cambio, capturás el excedente cuando la multitud se equivoca y absorbés la diferencia cuando aciertan en bloque. Es el papel de market maker, en el modelo Polymarket / Kalshi.
        </p>

        {/* Quick stats */}
        <div style={{
          marginTop: 36,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
        }}>
          {[
            ['~5–10×', 'Volumen por dólar de LP capital recomendado'],
            ['1–5%', 'Comisión de entrada (admin lo calibra)'],
            ['5%', 'Skim de resolución sobre cobros ganadores'],
            ['0%', 'Comisión en la primer 10 entradas (maker rebate)'],
          ].map(([num, label]) => (
            <div key={String(label)} style={{
              background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)',
              borderRadius: 'var(--radius-lg)', padding: '16px 18px',
            }}>
              <div style={{ fontFamily: D, fontWeight: 800, fontSize: 22, color: 'var(--b1n0-si)' }}>{num}</div>
              <div style={{ fontSize: 12, color: 'var(--b1n0-muted)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Scenarios */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 48px' }}>
        <p style={{ fontSize: 11, color: 'var(--b1n0-si)', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12 }}>
          Los cuatro escenarios
        </p>
        <h2 style={{ fontFamily: D, fontWeight: 800, fontSize: 'clamp(28px, 4vw, 40px)', margin: '0 0 12px', lineHeight: 1.15 }}>
          Cómo gana o pierde el LP — con números
        </h2>
        <p style={{ fontSize: 15, color: 'var(--b1n0-text-2)', maxWidth: 720, lineHeight: 1.55, marginBottom: 32 }}>
          Ejemplo común: un LP compromete <strong>$5,000</strong> en un evento que arranca 50/50. 250 usuarios apuestan $20 promedio. Esto es lo que pasa en cada uno de los cuatro desenlaces.
        </p>

        <div style={{ display: 'grid', gap: 16 }}>
          {SCENARIOS.map((s) => (
            <div key={s.key} style={{
              background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)',
              borderLeft: `3px solid ${s.resultColor}`,
              borderRadius: 'var(--radius-lg)', padding: '24px 28px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <h3 style={{ fontFamily: D, fontWeight: 800, fontSize: 20, margin: 0, color: 'var(--b1n0-text-1)' }}>{s.title}</h3>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.resultColor, letterSpacing: '0.02em' }}>{s.result}</div>
              </div>
              <p style={{ fontSize: 14, color: 'var(--b1n0-text-2)', margin: '0 0 16px', lineHeight: 1.5 }}>{s.outcome}</p>

              <div style={{ background: 'var(--b1n0-bg)', border: '1px solid var(--b1n0-border)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: 16 }}>
                {s.flow.map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i === s.flow.length - 1 ? 'none' : '1px dashed var(--b1n0-border)' }}>
                    <div style={{ fontSize: 13, color: 'var(--b1n0-text-2)' }}>
                      {row.label}
                      {row.note && <span style={{ color: 'var(--b1n0-muted)', fontSize: 11, marginLeft: 6 }}>· {row.note}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--b1n0-text-1)', fontVariantNumeric: 'tabular-nums' }}>{row.amount}</div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 13, color: 'var(--b1n0-muted)', lineHeight: 1.5, fontStyle: 'italic', margin: 0 }}>
                {s.takeaway}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Risk acknowledgement summary */}
      <section style={{
        background: 'var(--b1n0-card)', borderTop: '1px solid var(--b1n0-border)',
        borderBottom: '1px solid var(--b1n0-border)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
          <p style={{ fontSize: 11, color: 'var(--b1n0-no)', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700, marginBottom: 12 }}>
            Lo que tenés que aceptar
          </p>
          <h2 style={{ fontFamily: D, fontWeight: 800, fontSize: 28, margin: '0 0 20px', color: 'var(--b1n0-text-1)' }}>
            Antes de depositar capital LP
          </h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {[
              ['Tu capital está en riesgo.', 'En escenarios donde la multitud se concentra en el lado correcto, el bet_pool no cubre el claim total y vos completás la diferencia. La pérdida es real.'],
              ['Los retornos no son garantizados.', 'El return_pct configurado al depósito es un techo, no un piso. El retorno real depende del flujo de apuestas en el evento.'],
              ['El capital queda comprometido hasta resolución.', 'No podés retirar capital LP de un evento abierto. Solo se libera al resolverse o anularse el evento.'],
              ['En anulaciones recibís principal sin margen.', 'Si un evento se anula, recuperás $5,000 de $5,000, pero no ganás nada por el tiempo que tu capital estuvo comprometido.'],
            ].map(([title, body]) => (
              <div key={title} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'start' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--b1n0-no)', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: D, fontWeight: 700, fontSize: 15, color: 'var(--b1n0-text-1)', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'var(--b1n0-text-2)', lineHeight: 1.55 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{
          background: 'var(--b1n0-si)', color: 'var(--b1n0-on-accent)',
          borderRadius: 'var(--radius-lg)', padding: '32px 36px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 8 }}>Próximo paso</div>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: 22, lineHeight: 1.3 }}>
            Hablamos antes de cualquier depósito.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 12, opacity: 0.85 }}>
            Cada relación de patrocinio en b1n0 empieza con una conversación de 30 minutos donde repasamos los cuatro escenarios con tu equipo, definimos qué eventos te interesan financiar, y firmamos los términos. No aceptamos depósitos sin esa conversación.
          </div>
          <div style={{ fontSize: 13, marginTop: 20, opacity: 0.7 }}>
            Contacto: <strong>kim@b1n0.com</strong>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--b1n0-border)', padding: '28px 24px', textAlign: 'center' }}>
        <a href="/inicio" style={{ display: 'inline-block', textDecoration: 'none' }}>
          <img src="/b1n0-logov2.png" alt="b1n0" style={{ height: 22, width: 'auto', objectFit: 'contain', opacity: 0.7 }} />
        </a>
        <div style={{ fontSize: 11, color: 'var(--b1n0-muted)', marginTop: 12 }}>
          b1n0.com · Capital LP — para patrocinadores
        </div>
      </footer>
    </div>
  )
}

export default Sponsor

import { useEffect } from 'react'

/* ═══════════════════════════════════════════════════════════════
   /prensa-libre — Public partnership pitch one-pager
   ───────────────────────────────────────────────────────────────
   Brand-faithful single-page deck for the Prensa Libre / Guatevisión
   conversation. Lives outside the auth/layout chrome so it can be
   shared as a standalone link (b1n0.com/prensa-libre) without
   exposing the rest of the app.

   Mirrors the palette + type system from index.css (mint --b1n0-si,
   coral --b1n0-no, gold --b1n0-gold, Geist/Inter). Confidencial.
   ═══════════════════════════════════════════════════════════════ */

const F  = 'var(--font-body)'
const D  = 'var(--font-display)'

type Deal = {
  medio: string; cat: string; mercado: 'Kalshi' | 'Polymarket' | 'Ambos';
  excl: string; recibe: string; flujo: string; fecha: string;
}

const DEALS: Deal[] = [
  { medio: 'CNN',           cat: 'Cable + digital',     mercado: 'Kalshi',     excl: 'Exclusivo',              recibe: 'Harry Enten al aire · cobertura TV/digital/redes',  flujo: 'Trueque',         fecha: 'Dic 2025' },
  { medio: 'CNBC',          cat: 'Cable financiero',    mercado: 'Kalshi',     excl: 'Exclusivo · multianual', recibe: 'Ticker al aire · integración Squawk Box',           flujo: 'No revelado',     fecha: 'Activo 2026' },
  { medio: 'Dow Jones / WSJ', cat: 'Prensa financiera', mercado: 'Polymarket', excl: 'Exclusivo',              recibe: 'Calendario de resultados · módulos en home',        flujo: 'No revelado',     fecha: 'Ene 2026' },
  { medio: 'Yahoo Finance', cat: 'Portal retail',       mercado: 'Polymarket', excl: 'Por categoría',          recibe: 'Datos integrados · adyacencia cripto',              flujo: 'No revelado',     fecha: 'Nov 2025' },
  { medio: 'Substack',      cat: 'Newsletters',         mercado: 'Polymarket', excl: 'No exclusivo',           recibe: 'Widgets embebidos · monetización writers',          flujo: 'No revelado',     fecha: 'Q1 2026' },
  { medio: 'NHL',           cat: 'Liga deportiva',      mercado: 'Ambos',      excl: 'Doble licencia',         recibe: 'Licencia de datos · activaciones marketing',        flujo: 'Tarifa pagada',   fecha: 'Oct 2025' },
  { medio: 'Golden Globes', cat: 'Entrega de premios',  mercado: 'Polymarket', excl: 'Patrocinio puntual',     recibe: 'Segmento patrocinado de probabilidades',            flujo: 'Patrocinio',      fecha: 'Ene 2026' },
]

const STEPS = [
  { n: '01', title: 'Leés el evento', body: 'Pregunta concreta con fecha de cierre y fuente de verdad pública. Comentarios y datos en vivo.' },
  { n: '02', title: 'Hacés tu llamado', body: 'Elegís SÍ o NO (o una de varias opciones), monto desde $1. El precio se ajusta con cada voto.' },
  { n: '03', title: 'Esperás la resolución', body: 'Cuando ocurre el hecho público, el verificador independiente confirma. Resuelve SÍ o NO.' },
  { n: '04', title: 'Cobrás si tuviste razón', body: 'El pool se reparte proporcional entre los que acertaron. Crédito directo a tu saldo.' },
]

const CNN_POINTS = [
  ['Estructura',   'Exclusivo en cable + digital'],
  ['Compensación', 'Trueque (sin pago directo)'],
  ['Marca al aire','Harry Enten como rostro de los datos'],
  ['Producto',     'API en tiempo real con datos de mercado'],
  ['Distribución', 'TV, digital, redes — full-stack media'],
  ['Resultado',    'Kalshi se posicionó como "mercado oficial de predicción de la elección 2024"'],
]

const PL_POINTS = [
  ['Estructura',   'Exclusivo para eventos guatemaltecos en b1n0'],
  ['Compensación', 'Trueque · cross-promo bidireccional (v1)'],
  ['Marca al aire','Editor PL/Guatevisión como rostro de la verificación'],
  ['Producto',     'Feed de eventos GT verificados + módulos en PL'],
  ['Distribución', 'Prensa Libre digital, Guatevisión TV, redes'],
  ['Resultado',    'PL/Guatevisión = "el medio de referencia" para opinión digital en GT'],
]

const TERMS = [
  ['Alcance',      'Verificación exclusiva de todos los eventos b1n0 con país=GT durante 90 días.'],
  ['Volumen',      '8–12 eventos guatemaltecos. Política, deportes, cultura, sociedad.'],
  ['Verificación', 'Resolución dentro de 24h del hecho público. Fuente: cobertura editorial de PL/Guatevisión.'],
  ['Contexto',     'Cada evento enlaza al artículo PL correspondiente como "lectura para tomar posición".'],
  ['Branding',     'Sello "Verificado por Prensa Libre" visible en cada evento GT. Logo en home.'],
  ['Tráfico',      'b1n0 → PL: clicks medibles desde eventos a artículos. PL → b1n0: widget embebible en cobertura.'],
  ['Compensación', 'Trueque: sin pago directo en v1. Si el piloto convierte, contrato evoluciona a revenue share o licencia.'],
  ['Exclusividad', 'PL/Guatevisión es el único verificador de eventos GT durante el piloto.'],
]

// Mercado pill color
function mercadoColor(m: Deal['mercado']) {
  if (m === 'Kalshi')     return 'var(--b1n0-si)'
  if (m === 'Polymarket') return 'var(--b1n0-gold)'
  return 'var(--badge-geopolitica-text)' // Ambos = purple
}

export function PrensaLibre() {
  // Force dark theme on this page regardless of user preference — the
  // pitch is designed in the dark palette and switching to light would
  // break the carefully tuned contrast.
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme')
    document.title = 'b1n0 × Prensa Libre — Verificación Independiente'
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
      {/* ── Top accent stripe ───────────────────────────────────── */}
      <div style={{ height: 4, background: 'var(--b1n0-si)' }} />

      {/* ── Header bar ──────────────────────────────────────────── */}
      <header style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--b1n0-border)',
      }}>
        <a href="/inicio" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/b1n0-logov2.png" alt="b1n0" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
        </a>
        <div style={{ fontSize: 11, color: 'var(--b1n0-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          Confidencial · Para Prensa Libre / Guatevisión
        </div>
      </header>

      {/* ═════════════════════════════════════════════════════════
         HERO — what is b1n0
         ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 48, alignItems: 'start' }}>
          <div>
            <p style={{
              fontSize: 11, color: 'var(--b1n0-si)', textTransform: 'uppercase',
              letterSpacing: '0.16em', fontWeight: 700, marginBottom: 18,
            }}>
              Una propuesta de partnership
            </p>
            <h1 style={{
              fontFamily: D, fontWeight: 800, fontSize: 'clamp(48px, 7vw, 80px)',
              lineHeight: 1.0, letterSpacing: '-0.03em', margin: 0, marginBottom: 18,
              fontVariantNumeric: 'tabular-nums',
            }}>
              La plataforma de<br />
              <span style={{ color: 'var(--b1n0-si)' }}>opinión</span> de<br />
              Centroamérica.
            </h1>
            <p style={{
              fontSize: 18, lineHeight: 1.55, color: 'var(--b1n0-text-2)',
              maxWidth: 540, margin: '24px 0 0',
            }}>
              No es apostar. Es <strong style={{ color: 'var(--b1n0-text-1)' }}>hacer tu llamado</strong>.
              Predicciones sociales para los 7 países de la región — política, fútbol,
              cultura. <strong style={{ color: 'var(--b1n0-text-1)' }}>Producto en producción en b1n0.com</strong>.
            </p>

            {/* Stat grid */}
            <div style={{
              marginTop: 36,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              maxWidth: 540,
            }}>
              {[
                ['18–35',        'Audiencia objetivo'],
                ['7 países',     'Cobertura CentAm'],
                ['USD',          'Una sola moneda'],
                ['Mobile-first', 'PWA + responsive'],
              ].map(([num, label]) => (
                <div key={String(label)} style={{
                  background: 'var(--b1n0-card)',
                  border: '1px solid var(--b1n0-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 18px',
                }}>
                  <div style={{ fontFamily: D, fontWeight: 800, fontSize: 22, color: 'var(--b1n0-si)', letterSpacing: '-0.02em' }}>{num}</div>
                  <div style={{ fontSize: 12, color: 'var(--b1n0-muted)', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Mock event card — recreates the live EventCard */}
          <div style={{ position: 'relative' }}>
            <MockEventCard />
            <p style={{
              marginTop: 14, fontSize: 12, color: 'var(--b1n0-muted)',
              fontStyle: 'italic', textAlign: 'center',
            }}>
              Producto en producción · b1n0.com
            </p>
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════
         CÓMO FUNCIONA
         ───────────────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--b1n0-card)',
        borderTop: '1px solid var(--b1n0-border)',
        borderBottom: '1px solid var(--b1n0-border)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
          <SectionHeader
            eyebrow="Cómo funciona"
            title="Cuatro pasos. Cero gambling."
            sub="Pool parimutuel transparente. El precio se mueve con cada voto."
          />
          <div style={{
            marginTop: 40,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}>
            {STEPS.map((s, i) => {
              const accents = ['var(--badge-geopolitica-text)', 'var(--b1n0-si)', 'var(--b1n0-gold)', 'var(--b1n0-mint)']
              const acc = accents[i % accents.length]
              return (
                <div key={s.n} style={{
                  background: 'var(--b1n0-bg)',
                  border: '1px solid var(--b1n0-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px 20px 22px',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{ height: 3, background: acc, position: 'absolute', top: 0, left: 0, right: 0 }} />
                  <div style={{ fontFamily: D, fontWeight: 800, fontSize: 28, color: acc, letterSpacing: '-0.02em' }}>{s.n}</div>
                  <div style={{ fontFamily: D, fontWeight: 700, fontSize: 16, color: 'var(--b1n0-text-1)', marginTop: 12 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--b1n0-text-2)', lineHeight: 1.55, marginTop: 8 }}>{s.body}</div>
                </div>
              )
            })}
          </div>
          <p style={{
            marginTop: 32, fontSize: 12, color: 'var(--b1n0-muted)',
            fontStyle: 'italic',
          }}>
            Economía: fee de transacción 1–5% · spread dinámico 1–2% · skim de resolución 5%  =  ~8% take total a la plataforma
          </p>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════
         ESTO YA ESTÁ PASANDO — proven model table
         ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px 40px' }}>
        <SectionHeader
          eyebrow="Esto ya está pasando"
          title="Polymarket y Kalshi cerraron con todos los grandes medios de EE.UU."
          sub="Los acuerdos firmados en los últimos 6 meses. Ningún medio latinoamericano ha tomado la silla todavía."
        />

        <div style={{
          marginTop: 36,
          background: 'var(--b1n0-card)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1.4fr 1.1fr 1.4fr 2.6fr 1.1fr',
            gap: 12,
            padding: '14px 20px',
            background: 'var(--b1n0-surface)',
            borderBottom: '1px solid var(--b1n0-border)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--b1n0-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            <div>Medio</div><div>Categoría</div><div>Mercado</div><div>Exclusividad</div><div>Lo que recibe</div><div>Flujo $</div>
          </div>
          {DEALS.map((d, i) => (
            <div key={d.medio} style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1.4fr 1.1fr 1.4fr 2.6fr 1.1fr',
              gap: 12,
              padding: '16px 20px',
              borderBottom: i === DEALS.length - 1 ? 'none' : '1px solid var(--b1n0-border)',
              alignItems: 'center',
              borderLeft: `3px solid ${mercadoColor(d.mercado)}`,
              marginLeft: -3, // absorb the left accent without shifting content
              paddingLeft: 17, // compensate
            }}>
              <div style={{ fontWeight: 700, color: 'var(--b1n0-text-1)', fontSize: 14 }}>{d.medio}</div>
              <div style={{ color: 'var(--b1n0-muted)', fontSize: 12, fontStyle: 'italic' }}>{d.cat}</div>
              <div style={{ color: mercadoColor(d.mercado), fontWeight: 700, fontSize: 12 }}>{d.mercado}</div>
              <div style={{ color: 'var(--b1n0-text-2)', fontSize: 12 }}>{d.excl}</div>
              <div style={{ color: 'var(--b1n0-text-2)', fontSize: 12, lineHeight: 1.45 }}>{d.recibe}</div>
              <div style={{ color: 'var(--b1n0-text-2)', fontSize: 12 }}>{d.flujo}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 24,
          padding: '18px 22px',
          border: '1px solid var(--b1n0-si-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--b1n0-si-bg)',
          fontSize: 15,
          color: 'var(--b1n0-text-1)',
          lineHeight: 1.5,
        }}>
          La pregunta no es <em>si</em> este modelo llega a Centroamérica. Es{' '}
          <strong style={{ color: 'var(--b1n0-si)' }}>qué medio guatemalteco lo tomará primero</strong>.
        </div>
        <p style={{ marginTop: 12, fontSize: 11, color: 'var(--b1n0-muted)', fontStyle: 'italic' }}>
          Fuentes: comunicados oficiales y reportes de prensa, dic 2025 – abr 2026.
        </p>
      </section>

      {/* ═════════════════════════════════════════════════════════
         CÓMO SE VERÍA — side-by-side mapping
         ───────────────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--b1n0-card)',
        borderTop: '1px solid var(--b1n0-border)',
        borderBottom: '1px solid var(--b1n0-border)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px' }}>
          <SectionHeader
            eyebrow="Cómo se vería"
            title="Mismo playbook que CNN × Kalshi — adaptado al ecosistema guatemalteco."
            sub="Lado a lado: la estructura validada en EE.UU. y la propuesta concreta para PL/Guatevisión."
          />

          <div style={{
            marginTop: 40,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 20,
          }}>
            <ComparisonColumn
              eyebrow="Referencia · CNN × Kalshi"
              points={CNN_POINTS}
              accent="var(--b1n0-muted)"
              accentText="var(--b1n0-muted)"
              valueColor="var(--b1n0-text-2)"
              borderActive={false}
            />
            <ComparisonColumn
              eyebrow="Propuesta · b1n0 × Prensa Libre"
              points={PL_POINTS}
              accent="var(--b1n0-si)"
              accentText="var(--b1n0-si)"
              valueColor="var(--b1n0-text-1)"
              borderActive={true}
            />
          </div>

          {/* Bottom value props */}
          <div style={{
            marginTop: 32,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 16,
          }}>
            <div style={{
              padding: '20px 24px',
              border: '1px solid var(--b1n0-border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--b1n0-bg)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--b1n0-si)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                Lo que gana Prensa Libre / Guatevisión
              </div>
              <div style={{ fontSize: 13, color: 'var(--b1n0-text-2)', lineHeight: 1.6 }}>
                Audiencia 18–35 nativa digital · tráfico bidireccional a sus artículos · nuevo SKU comercial vendible a anunciantes · status como verificador autoritativo de la conversación pública GT.
              </div>
            </div>
            <div style={{
              padding: '20px 24px',
              border: '1px solid var(--b1n0-border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--b1n0-bg)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--b1n0-gold)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                Lo que gana b1n0
              </div>
              <div style={{ fontSize: 13, color: 'var(--b1n0-text-2)', lineHeight: 1.6 }}>
                Credibilidad institucional para eventos GT · contexto editorial profesional · entrada al ecosistema de medios CentAm · diferenciación frente a Polymarket/Kalshi en la región.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════
         LA PROPUESTA — pilot terms + verified card mockup + CTA
         ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px 48px' }}>
        <SectionHeader
          eyebrow="La propuesta"
          title="Piloto de 90 días. Sin pago. Inspirado en CNN × Kalshi."
          sub="Trueque bidireccional. Cero compromisos financieros para PL en v1. Si convierte, contrato evoluciona a revenue share."
        />

        <div style={{
          marginTop: 40,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}>
          {/* Left — terms */}
          <div style={{
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderLeft: '3px solid #C8102E', // Prensa Libre red
            borderRadius: 'var(--radius-lg)',
            padding: '24px 28px',
          }}>
            <div style={{ fontFamily: D, fontWeight: 800, fontSize: 20, marginBottom: 18 }}>Términos del piloto</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 14, columnGap: 16 }}>
              {TERMS.map(([k, v]) => (
                <FragmentRow key={k} k={k} v={v} />
              ))}
            </div>
          </div>

          {/* Right — verified mockup + CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              background: 'var(--b1n0-card)',
              border: '1px solid var(--b1n0-border)',
              borderTop: '3px solid #C8102E',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 22px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--b1n0-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Cómo se verá</div>
              <div style={{ fontFamily: D, fontWeight: 800, fontSize: 17, marginTop: 8, marginBottom: 14, lineHeight: 1.25 }}>
                Bukele anuncia tercer mandato 2026
              </div>
              <div style={{
                border: '1px solid #C8102E',
                background: 'rgba(200,16,46,0.10)',
                color: '#FCA5A5',
                fontWeight: 700,
                fontSize: 12,
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                letterSpacing: '0.10em',
              }}>
                ✓  VERIFICADO POR PRENSA LIBRE
              </div>
              <div style={{ fontSize: 11, color: 'var(--b1n0-muted)', fontStyle: 'italic', marginTop: 12 }}>
                Resolución pública · fuente editorial citada · auditoría on-chain.
              </div>
            </div>

            {/* CTA */}
            <div style={{
              background: 'var(--b1n0-si)',
              color: 'var(--b1n0-on-accent)',
              borderRadius: 'var(--radius-lg)',
              padding: '22px 24px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.7 }}>Próximo paso</div>
              <div style={{ fontFamily: D, fontWeight: 800, fontSize: 18, marginTop: 8, lineHeight: 1.3 }}>
                Reunión de 30 minutos con su equipo comercial y editorial para firmar el piloto.
              </div>
            </div>
          </div>
        </div>

        <p style={{
          marginTop: 32, fontSize: 12, color: 'var(--b1n0-no)',
          fontStyle: 'italic', fontWeight: 600,
        }}>
          La ventana es ahora — antes de que otro medio CentAm tome la silla. El modelo lleva 6 meses cerrándose en EE.UU.
        </p>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--b1n0-border)',
        padding: '28px 24px',
        textAlign: 'center',
      }}>
        <a href="/inicio" style={{ display: 'inline-block', textDecoration: 'none' }}>
          <img src="/b1n0-logov2.png" alt="b1n0" style={{ height: 22, width: 'auto', objectFit: 'contain', opacity: 0.7 }} />
        </a>
        <div style={{ fontSize: 11, color: 'var(--b1n0-muted)', marginTop: 12 }}>
          b1n0.com · Confidencial — para conversación con Prensa Libre / Guatevisión
        </div>
      </footer>
    </div>
  )
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function SectionHeader ({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <>
      <p style={{
        fontSize: 11, color: 'var(--b1n0-si)', textTransform: 'uppercase',
        letterSpacing: '0.16em', fontWeight: 700, margin: 0,
      }}>{eyebrow}</p>
      <h2 style={{
        fontFamily: D, fontWeight: 800, fontSize: 'clamp(28px, 4vw, 40px)',
        lineHeight: 1.15, letterSpacing: '-0.02em',
        color: 'var(--b1n0-text-1)', margin: '12px 0 0',
      }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: 'var(--b1n0-text-2)', lineHeight: 1.55, marginTop: 12, maxWidth: 760 }}>{sub}</p>}
    </>
  )
}

function ComparisonColumn ({
  eyebrow, points, accent, accentText, valueColor, borderActive,
}: {
  eyebrow: string; points: string[][]; accent: string; accentText: string;
  valueColor: string; borderActive: boolean;
}) {
  return (
    <div style={{
      background: 'var(--b1n0-bg)',
      border: borderActive ? `1px solid ${accent}` : '1px solid var(--b1n0-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <div style={{ height: borderActive ? 4 : 2, background: accent }} />
      <div style={{ padding: '24px 26px' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: accentText,
          letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18,
        }}>{eyebrow}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 14, columnGap: 14 }}>
          {points.map(([k, v]) => (
            <FragmentRow key={k} k={k} v={v} valueColor={valueColor} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FragmentRow ({ k, v, valueColor }: { k: string; v: string; valueColor?: string }) {
  return (
    <>
      <div style={{
        fontSize: 10, color: 'var(--b1n0-muted)', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>{k}</div>
      <div style={{ fontSize: 13, color: valueColor ?? 'var(--b1n0-text-1)', lineHeight: 1.45 }}>{v}</div>
    </>
  )
}

/* ─── Mock event card — recreates the shape of the real EventCard ── */
function MockEventCard () {
  return (
    <div style={{
      background: 'var(--b1n0-card)',
      border: '1px solid var(--b1n0-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      {/* Top split-bar (mimics the real card stripe) */}
      <div style={{ display: 'flex', height: 4 }}>
        <div style={{ flex: 36, background: 'var(--b1n0-si)' }} />
        <div style={{ flex: 64, background: 'var(--b1n0-no)' }} />
      </div>

      {/* Hero block */}
      <div style={{
        background: '#1a1714',
        padding: '24px 24px 22px',
      }}>
        <div style={{ fontSize: 10, color: 'var(--b1n0-si)', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          El Salvador
        </div>
        <div style={{ fontFamily: D, fontWeight: 800, fontSize: 22, marginTop: 8, color: 'var(--b1n0-text-1)' }}>
          Nayib Bukele
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 22px' }}>
        <div style={{
          fontSize: 10, color: 'var(--b1n0-muted)',
          letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700,
        }}>
          Política · SV
        </div>
        <div style={{
          fontFamily: D, fontWeight: 700, fontSize: 17,
          color: 'var(--b1n0-text-1)', marginTop: 8, lineHeight: 1.3,
        }}>
          Bukele anuncia que busca un tercer mandato en 2026
        </div>

        {/* SI / NO buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          <div style={{
            border: '1px solid var(--b1n0-si-border)',
            background: 'var(--b1n0-si-bg)',
            color: 'var(--b1n0-si)',
            fontWeight: 700,
            fontSize: 14,
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}>
            SÍ  0.36
          </div>
          <div style={{
            border: '1px solid var(--b1n0-no-border)',
            background: 'var(--b1n0-no-bg)',
            color: 'var(--b1n0-no)',
            fontWeight: 700,
            fontSize: 14,
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}>
            NO  0.66
          </div>
        </div>

        {/* Pool + days */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 11, color: 'var(--b1n0-muted)' }}>
          <span>$500.00 pool</span>
          <span>302d</span>
        </div>
      </div>
    </div>
  )
}

export default PrensaLibre

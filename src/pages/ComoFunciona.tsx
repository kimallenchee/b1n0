import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle,
  CaretDown,
  ChartLineUp,
  ShieldCheck,
} from '@phosphor-icons/react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useInView } from '../hooks/useInView'
import { SplitBar } from '../components/feed/SplitBar'
import { AnimatedNumber } from '../components/AnimatedNumber'

/**
 * ComoFunciona — the "how it works" route.
 *
 * Replaces the modal-based onboarding with a real, indexable, scrollable
 * page that reads as an interactive tutorial. Every major surface in
 * the page enters via fade + translateY, triggered by IntersectionObserver
 * so animations only fire once and only when the user is actually
 * looking at them.
 *
 * Key motion principles:
 *   - Stagger within sections (heading 0ms → body 120ms → illustration 240ms)
 *   - Hero auto-cycles a SplitBar so motion is visible the moment the
 *     page loads
 *   - Number tickers use AnimatedNumber and only start counting when
 *     they enter view (otherwise users miss the count-up animation)
 *   - Sections breathe — generous space between them and tight rhythm
 *     within them
 *
 * The page uses .feed-scroll for the dock-clearance bottom padding
 * baked into index.css.
 */

const F = 'var(--font-body)'
const D = 'var(--font-display)'
const HERO = 'var(--font-hero)'
const NUM = 'var(--font-num)'

export function ComoFunciona() {
  const navigate = useNavigate()
  usePageMeta({
    title: '¿Cómo funciona? · b1n0',
    description:
      'b1n0 es una plataforma de opinión patrocinada. Hacé tu llamado, mirá cuánto cobrás si tenés razón, y cobrá automáticamente al resolverse.',
  })

  return (
    <div
      className="feed-scroll"
      style={{
        height: '100%',
        scrollBehavior: 'smooth',
      }}
    >
      <Hero />
      <StepCall />
      <StepEntry />
      <StepCobro />
      <PoolMechanics />
      <Tiers />
      <Faq />
      <FinalCta onClick={() => navigate('/inicio')} />
    </div>
  )
}

/* ─── HERO ────────────────────────────────────────────────────────────────
   The first thing the user sees. Massive Syne headline + auto-cycling
   SplitBar so the page is in motion within ~1.5 seconds of loading. */
function Hero() {
  // Auto-cycle SÍ percentage so the bar is alive without user input.
  // 4-second beat lines up with the SplitBar's 0.8s cubic transition,
  // leaving 3.2s of "settled" state between movements — long enough
  // to read a number, short enough to feel alive.
  const [yesPct, setYesPct] = useState(50)
  useEffect(() => {
    const presets = [62, 38, 71, 44, 55, 48, 67, 33]
    let i = 0
    const tick = () => {
      setYesPct(presets[i % presets.length])
      i += 1
    }
    tick()
    const t = setInterval(tick, 4000)
    return () => clearInterval(t)
  }, [])
  return (
    <section
      style={{
        padding: 'var(--space-10) var(--space-6) var(--space-9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--space-5)',
      }}
    >
      <Reveal delay={0}>
        <p
          style={{
            fontFamily: F,
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
            color: 'var(--b1n0-muted)',
          }}
        >
          ¿Cómo funciona?
        </p>
      </Reveal>
      <Reveal delay={120}>
        <h1
          style={{
            fontFamily: HERO,
            fontWeight: 800,
            fontSize: 'clamp(36px, 8vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--b1n0-text-1)',
            maxWidth: 720,
          }}
        >
          Predicciones que importan.
        </h1>
      </Reveal>
      <Reveal delay={240}>
        <p
          style={{
            fontFamily: F,
            fontSize: 'var(--text-md)',
            color: 'var(--b1n0-text-2)',
            maxWidth: 540,
            lineHeight: 1.5,
          }}
        >
          Tu opinión es tu posición. Llamás un lado, cobrás si tenés razón. Sin
          casino, sin cuotas raras.
        </p>
      </Reveal>
      <Reveal delay={400}>
        <div style={{ width: '100%', maxWidth: 480, marginTop: 'var(--space-3)' }}>
          <SplitBar yesPercent={yesPct} noPercent={100 - yesPct} />
          <p
            style={{
              fontFamily: F,
              fontSize: 'var(--text-2xs)',
              color: 'var(--b1n0-muted)',
              marginTop: 'var(--space-3)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase',
            }}
          >
            La barra se mueve cuando alguien llama
          </p>
        </div>
      </Reveal>
    </section>
  )
}

/* ─── 01 · ELEGÍ TU LLAMADO ─────────────────────────────────────────────── */
function StepCall() {
  return (
    <Section number="01" title="Elegí tu llamado" altBg>
      <SectionBody>
        Cada evento es una pregunta — sí o no. Mirá qué dice la gente, formá tu
        opinión, llamá un lado. Tu opinión es tu posición.
      </SectionBody>
      <Reveal delay={240}>
        {/* Demo card — visual analog of an EventCard */}
        <div
          style={{
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderLeft: '3px solid var(--b1n0-si)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <span
              style={{
                fontFamily: F,
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: 'var(--tracking-caps)',
                color: 'var(--badge-deportes-text, var(--b1n0-muted))',
                background: 'var(--badge-deportes-bg, var(--b1n0-surface))',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              DEP
            </span>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--b1n0-si)',
                animation: 'pulse 2s infinite',
              }}
            />
            <span
              style={{
                fontFamily: F,
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--b1n0-si)',
                letterSpacing: 'var(--tracking-caps)',
              }}
            >
              EN VIVO
            </span>
          </div>
          <h3
            style={{
              fontFamily: HERO,
              fontWeight: 800,
              fontSize: 'var(--text-lg)',
              lineHeight: 1.2,
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--b1n0-text-1)',
            }}
          >
            ¿Comunicaciones gana el clásico?
          </h3>
          <SplitBar yesPercent={62} noPercent={38} />
          <p
            style={{
              fontFamily: F,
              fontSize: 'var(--text-xs)',
              color: 'var(--b1n0-muted)',
            }}
          >
            $200 pool · termina en 3h 42m
          </p>
        </div>
      </Reveal>
    </Section>
  )
}

/* ─── 02 · PARTICIPÁ ────────────────────────────────────────────────────── */
function StepEntry() {
  // Trigger the AnimatedNumbers only when the section is in view —
  // otherwise the user misses the count-up.
  const { ref, inView } = useInView<HTMLDivElement>()
  const entry = inView ? 5 : 0
  const cobro = inView ? 15.62 : 0
  return (
    <Section number="02" title="Participá">
      <SectionBody>
        Desde $1. Vas a ver exactamente cuánto colectás si tenés razón. Sin
        sorpresas.
      </SectionBody>
      <Reveal delay={240}>
        <div
          ref={ref}
          style={{
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span
              style={{
                fontFamily: F,
                fontSize: 'var(--text-2xs)',
                fontWeight: 700,
                color: 'var(--b1n0-muted)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-caps)',
              }}
            >
              Tu entrada
            </span>
            <span
              style={{
                fontFamily: F,
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--b1n0-si)',
              }}
            >
              SÍ seleccionado
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-4) 0' }}>
            <span style={{ fontFamily: NUM, fontSize: 'var(--text-md)', color: 'var(--b1n0-muted)', fontVariantNumeric: 'tabular-nums' }}>$</span>
            <AnimatedNumber
              value={entry}
              decimals={0}
              duration={1100}
              style={{
                fontFamily: D,
                fontWeight: 800,
                fontSize: 'var(--text-2xl)',
                color: 'var(--b1n0-text-1)',
                letterSpacing: 'var(--tracking-tight)',
                lineHeight: 1,
              }}
            />
          </div>
          {/* Math breakdown — fades in line by line */}
          <Stagger>
            <Row label="Tu entrada" value="$5.00" />
            <Row label="Comisión (2.5%)" value="−$0.13" muted />
            <Row label="Precio actual" value="$0.32" muted />
            <Row label="Contratos comprados" value="15.62" />
          </Stagger>
          <div
            style={{
              background: 'var(--b1n0-si-bg)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4) var(--space-5)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: F, fontSize: 'var(--text-sm)', color: 'var(--b1n0-text-2)' }}>
              Si tenés razón, colectás
            </span>
            <AnimatedNumber
              value={cobro}
              prefix="$"
              decimals={2}
              duration={1400}
              style={{
                fontFamily: D,
                fontWeight: 800,
                fontSize: 'var(--text-lg)',
                color: 'var(--b1n0-si)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            />
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: F, fontSize: 'var(--text-sm)', color: 'var(--b1n0-muted)' }}>{label}</span>
      <span
        style={{
          fontFamily: NUM,
          fontSize: 'var(--text-sm)',
          fontWeight: muted ? 500 : 600,
          color: muted ? 'var(--b1n0-text-2)' : 'var(--b1n0-text-1)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  )
}

/* ─── 03 · COBRÁ ────────────────────────────────────────────────────────── */
function StepCobro() {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <Section number="03" title="Cobrá" altBg>
      <SectionBody>
        Cuando se resuelve el evento, si acertaste el cobro va directo a tu
        saldo. Inmediato — sin esperar.
      </SectionBody>
      <Reveal delay={240}>
        <div
          ref={ref}
          style={{
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-4)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--b1n0-si-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: inView ? 'scale(1)' : 'scale(0.6)',
              opacity: inView ? 1 : 0,
              transition: 'transform 0.6s var(--ease-out), opacity 0.4s var(--ease-out)',
            }}
          >
            <CheckCircle size={32} weight="fill" color="var(--b1n0-si)" />
          </div>
          <p
            style={{
              fontFamily: D,
              fontWeight: 800,
              fontSize: 'var(--text-lg)',
              color: 'var(--b1n0-text-1)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            ¡Lo sabías!
          </p>
          <p
            style={{
              fontFamily: F,
              fontSize: 'var(--text-2xs)',
              color: 'var(--b1n0-muted)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-caps)',
            }}
          >
            Colectás
          </p>
          <AnimatedNumber
            value={inView ? 15.62 : 0}
            prefix="$"
            decimals={2}
            duration={1400}
            style={{
              fontFamily: D,
              fontWeight: 800,
              fontSize: 'var(--text-2xl)',
              color: 'var(--b1n0-si)',
              letterSpacing: 'var(--tracking-tight)',
              lineHeight: 1,
            }}
          />
        </div>
      </Reveal>
    </Section>
  )
}

/* ─── 04 · POOL MECHANICS ───────────────────────────────────────────────── */
function PoolMechanics() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const yesPool = inView ? 124 : 0
  const noPool = inView ? 76 : 0
  return (
    <Section number="04" title="El pool decide el cobro" icon={<ChartLineUp size={28} weight="fill" color="var(--b1n0-si)" />}>
      <SectionBody>
        Cada llamado entra al pool. Cuanta más gente está del lado correcto,
        menos cobra cada uno. Cuanta menos gente, más cobra. Por eso el cobro
        siempre cambia — el pool está vivo.
      </SectionBody>
      <Reveal delay={240}>
        <div
          ref={ref}
          style={{
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-4)',
          }}
        >
          <PoolColumn label="SÍ" amount={yesPool} accent="var(--b1n0-si)" />
          <PoolColumn label="NO" amount={noPool} accent="var(--b1n0-no)" />
        </div>
      </Reveal>
    </Section>
  )
}

function PoolColumn({ label, amount, accent }: { label: string; amount: number; accent: string }) {
  // Bar height proportional to amount, capped so visually-identical pools
  // don't both stretch the card. The base 60px floor keeps the small side
  // visible even when one pool dominates.
  const heightPx = 60 + amount * 0.6
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span
        style={{
          fontFamily: F,
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          color: accent,
          letterSpacing: 'var(--tracking-caps)',
        }}
      >
        {label}
      </span>
      <div
        style={{
          width: '100%',
          height: 160,
          background: 'var(--b1n0-surface)',
          borderRadius: 'var(--radius-md)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: heightPx,
            background: `linear-gradient(180deg, ${accent}33, ${accent}66)`,
            borderTop: `2px solid ${accent}`,
            transition: 'height 1.4s var(--ease-out)',
          }}
        />
      </div>
      <AnimatedNumber
        value={amount}
        prefix="$"
        decimals={0}
        duration={1400}
        style={{
          fontFamily: D,
          fontWeight: 800,
          fontSize: 'var(--text-lg)',
          color: 'var(--b1n0-text-1)',
          letterSpacing: 'var(--tracking-tight)',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    </div>
  )
}

/* ─── 05 · NIVELES ──────────────────────────────────────────────────────── */
function Tiers() {
  const tiers = [
    { name: 'Nivel 1', max: 50, req: 'Teléfono', color: 'var(--b1n0-muted)' },
    { name: 'Nivel 2', max: 250, req: 'Teléfono + DPI', color: 'var(--b1n0-si)' },
    { name: 'Nivel 3', max: 1000, req: 'KYC completo', color: '#FFD474' },
  ]
  return (
    <Section number="05" title="Subí de nivel para llamar más" altBg icon={<ShieldCheck size={28} weight="fill" color="var(--b1n0-indigo, #6366f1)" />}>
      <SectionBody>
        Empezás en Nivel 1 con un máximo de $50 por evento. Verificá tu cuenta
        en 2 minutos para subir y poder llamar más.
      </SectionBody>
      <Reveal delay={240}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={300 + i * 120}>
              <div
                style={{
                  background: 'var(--b1n0-card)',
                  border: '1px solid var(--b1n0-border)',
                  borderTop: `2px solid ${t.color}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                <span
                  style={{
                    fontFamily: F,
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 700,
                    color: t.color,
                    letterSpacing: 'var(--tracking-caps)',
                    textTransform: 'uppercase',
                  }}
                >
                  {t.name}
                </span>
                <p
                  style={{
                    fontFamily: D,
                    fontWeight: 800,
                    fontSize: 'var(--text-xl)',
                    color: 'var(--b1n0-text-1)',
                    letterSpacing: 'var(--tracking-tight)',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}
                >
                  ${t.max}
                </p>
                <span style={{ fontFamily: F, fontSize: 'var(--text-2xs)', color: 'var(--b1n0-muted)' }}>
                  máx. por evento
                </span>
                <span style={{ fontFamily: F, fontSize: 'var(--text-xs)', color: 'var(--b1n0-text-2)', marginTop: 'var(--space-2)' }}>
                  {t.req}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>
    </Section>
  )
}

/* ─── FAQ ───────────────────────────────────────────────────────────────── */
function Faq() {
  const items = [
    {
      q: '¿Es esto apuestas?',
      a: 'No. b1n0 es una plataforma de opinión patrocinada. Los pools los financian patrocinadores y proveedores de liquidez (LPs), no la casa contra vos. Vos opinás, demostrás conocimiento, cobrás cuando tenés razón.',
    },
    {
      q: '¿De dónde sale el dinero?',
      a: 'De patrocinadores y LPs que ponen capital para hacer interesante el evento. Cuando ganás, el cobro sale del pool — no es plata que perdió nadie del otro lado.',
    },
    {
      q: '¿Qué pasa si pierdo?',
      a: 'Tu entrada queda en el pool y se reparte entre los que acertaron. Nunca perdés más de lo que pusiste. Y siempre hay otro llamado mañana.',
    },
    {
      q: '¿Cuánto cobra b1n0?',
      a: 'Una comisión chica al participar (entre 1% y 5% según la liquidez del evento) y un 5% al resolver. Sin sorpresas, sin comisiones ocultas.',
    },
    {
      q: '¿Cuánto demora cobrar?',
      a: 'Apenas se resuelve el evento, tu cobro va directo a tu saldo. Podés retirarlo cuando quieras siguiendo el proceso de retiro.',
    },
    {
      q: '¿Por qué USD y no quetzales?',
      a: 'Para que sea consistente en toda Centroamérica — un usuario en Guatemala, El Salvador y Honduras ven los mismos números. Vos no tenés que pensar en tasas de cambio.',
    },
  ]
  return (
    <Section title="Preguntas frecuentes" altBg dense>
      <Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {items.map((item, i) => (
            <FaqRow key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </Reveal>
    </Section>
  )
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        background: 'var(--b1n0-card)',
        border: '1px solid var(--b1n0-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'border-color var(--duration-base) var(--ease-out)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: 'var(--space-5) var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          fontFamily: F,
          fontWeight: 600,
          fontSize: 'var(--text-base)',
          color: 'var(--b1n0-text-1)',
        }}
      >
        <span>{q}</span>
        <CaretDown
          size={16}
          weight="bold"
          color="var(--b1n0-muted)"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform var(--duration-base) var(--ease-out)',
            flexShrink: 0,
          }}
        />
      </button>
      <div
        style={{
          maxHeight: open ? 320 : 0,
          opacity: open ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height var(--duration-slow) var(--ease-out), opacity var(--duration-base) var(--ease-out)',
        }}
      >
        <p
          style={{
            fontFamily: F,
            fontSize: 'var(--text-sm)',
            color: 'var(--b1n0-text-2)',
            lineHeight: 1.6,
            padding: '0 var(--space-6) var(--space-5)',
          }}
        >
          {a}
        </p>
      </div>
    </div>
  )
}

/* ─── FINAL CTA ─────────────────────────────────────────────────────────── */
function FinalCta({ onClick }: { onClick: () => void }) {
  return (
    <section
      style={{
        padding: 'var(--space-9) var(--space-6) var(--space-10)',
        textAlign: 'center',
      }}
    >
      <Reveal>
        <h2
          style={{
            fontFamily: HERO,
            fontWeight: 800,
            fontSize: 'clamp(28px, 6vw, 44px)',
            lineHeight: 1.1,
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--b1n0-text-1)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Listo para tu primer llamado.
        </h2>
      </Reveal>
      <Reveal delay={120}>
        <p
          style={{
            fontFamily: F,
            fontSize: 'var(--text-md)',
            color: 'var(--b1n0-text-2)',
            marginBottom: 'var(--space-7)',
            maxWidth: 420,
            margin: '0 auto var(--space-7)',
            lineHeight: 1.5,
          }}
        >
          Mirá las preguntas activas, elegí un lado, hacé tu llamado.
        </p>
      </Reveal>
      <Reveal delay={240}>
        <button
          onClick={onClick}
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-5) var(--space-8)',
            fontSize: 'var(--text-base)',
            letterSpacing: 'var(--tracking-tight)',
          }}
        >
          Empezá a llamar
          <ArrowRight size={16} weight="bold" />
        </button>
      </Reveal>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Section primitives — shared shell so every section has the same rhythm.
   ═══════════════════════════════════════════════════════════════════════ */

function Section({
  number,
  title,
  icon,
  altBg,
  dense,
  children,
}: {
  number?: string
  title: string
  icon?: ReactNode
  altBg?: boolean
  dense?: boolean
  children: ReactNode
}) {
  return (
    <section
      style={{
        padding: dense
          ? 'var(--space-9) var(--space-6)'
          : 'var(--space-10) var(--space-6)',
        background: altBg ? 'var(--b1n0-card)' : 'transparent',
        borderTop: altBg ? '1px solid var(--b1n0-border)' : 'none',
        borderBottom: altBg ? '1px solid var(--b1n0-border)' : 'none',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Reveal>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {number && (
              <span
                style={{
                  fontFamily: NUM,
                  fontWeight: 800,
                  fontSize: 'var(--text-lg)',
                  color: 'var(--b1n0-muted)',
                  letterSpacing: 'var(--tracking-tight)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {number}
              </span>
            )}
            {icon}
            <h2
              style={{
                fontFamily: HERO,
                fontWeight: 800,
                fontSize: 'clamp(28px, 5vw, 40px)',
                lineHeight: 1.1,
                letterSpacing: 'var(--tracking-tight)',
                color: 'var(--b1n0-text-1)',
              }}
            >
              {title}
            </h2>
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  )
}

function SectionBody({ children }: { children: ReactNode }) {
  return (
    <Reveal delay={120}>
      <p
        style={{
          fontFamily: F,
          fontSize: 'var(--text-md)',
          color: 'var(--b1n0-text-2)',
          lineHeight: 1.6,
          maxWidth: 540,
        }}
      >
        {children}
      </p>
    </Reveal>
  )
}

/**
 * Reveal — wraps children in a fade-up that triggers when the wrapper
 * enters the viewport. `delay` lets you stagger siblings inside a parent
 * Reveal so a heading + body + illustration each enter at different
 * times, reading as a deliberate composition rather than "all at once".
 */
function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode
  delay?: number
  style?: CSSProperties
}) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.6s var(--ease-out) ${delay}ms, transform 0.6s var(--ease-out) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Stagger — wraps a list of children and applies progressive fade-up
 * delays so each child appears 80ms after the previous one. Used inside
 * the math breakdown so the rows reveal sequentially instead of as a
 * block.
 */
function Stagger({ children }: { children: ReactNode }) {
  const arr = Array.isArray(children) ? children : [children]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {arr.map((child, i) => (
        <Reveal key={i} delay={i * 80}>
          {child}
        </Reveal>
      ))}
    </div>
  )
}

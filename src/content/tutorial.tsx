/**
 * Tour de "Cómo Jugar" — pasos del modal carousel.
 *
 * Cada paso tiene: title, body, illustration (componente React), y
 * un ctaLabel opcional (default: "Siguiente", "Listo" en el último).
 *
 * Las ilustraciones son SVG inline diseñados para verse como b1n0,
 * no como otras plataformas internacionales. Usan los tokens de marca (--b1n0-si verde,
 * --b1n0-no ámbar, --b1n0-card, etc.) y el split bar característico
 * de la plataforma. NO son screenshots de la app real — son mockups
 * estilizados que no se rompen cuando el UI cambia.
 *
 * Tono (mismo que documentation.ts):
 *   - Voseo centroamericano.
 *   - Una idea por paso.
 *   - Lenguaje de "llamado", no de "apuesta".
 */

/* eslint-disable react-refresh/only-export-components */
// Disabled because this file intentionally exports SVG components
// alongside data — the steps reference the components by value,
// not by import, so they need to live together.

import type { ReactNode } from 'react'
import { useTheme } from '../context/ThemeContext'

export interface TutorialStep {
  id: string
  title: string
  body: string
  illustration: ReactNode
  /** Label override for the primary CTA. Default: "Siguiente" / "Listo". */
  ctaLabel?: string
}

// ── Step 1 illustration: an event card with the split bar mid-action.
// ────────────────────────────────────────────────────────────────────
// Mirrors b1n0's EventCard chrome: dark card, category eyebrow,
// question headline, two-tone split bar with USD prices. Designed to
// feel like the real product without literally copying any one event.
function Step1Card() {
  return (
    <svg viewBox="0 0 320 200" width="320" height="200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tarjeta de un voto">
      {/* Card surface */}
      <rect x="20" y="14" width="280" height="172" rx="16" fill="var(--b1n0-surface)" stroke="var(--b1n0-border)" />
      {/* Side accent (categoría) */}
      <rect x="20" y="14" width="3" height="172" rx="2" fill="var(--b1n0-si)" />
      {/* Category eyebrow */}
      <text x="38" y="40" fontFamily="var(--font-body)" fontSize="9" fontWeight="700" letterSpacing="1.2" fill="var(--b1n0-muted)">CULTURA · GT</text>
      {/* Question headline */}
      <text x="38" y="68" fontFamily="var(--font-display)" fontSize="15" fontWeight="700" fill="var(--b1n0-text-1)">¿Argentina gana el Mundial 2026?</text>
      {/* Split bar */}
      <g transform="translate(38, 96)">
        <rect width="244" height="34" rx="8" fill="var(--b1n0-card)" />
        <rect width="146" height="34" rx="8" fill="var(--b1n0-si)" opacity="0.85" />
        <text x="20" y="22" fontFamily="var(--font-num, var(--font-body))" fontSize="13" fontWeight="700" fill="var(--b1n0-on-accent)">SÍ 0.60</text>
        <text x="164" y="22" fontFamily="var(--font-num, var(--font-body))" fontSize="13" fontWeight="700" fill="var(--b1n0-text-1)">NO 0.40</text>
      </g>
      {/* Pool + closing note */}
      <text x="38" y="158" fontFamily="var(--font-body)" fontSize="10" fill="var(--b1n0-muted)">$1,500 pool · cierra en 12 días</text>
      {/* Subtle live dot */}
      <circle cx="290" cy="32" r="4" fill="var(--b1n0-si)" />
      <circle cx="290" cy="32" r="7" fill="var(--b1n0-si)" opacity="0.25" />
    </svg>
  )
}

// ── Step 2 illustration: the cobro celebration (won position).
// ────────────────────────────────────────────────────────────────────
// Big +$ number, "Cobro" label, confetti-ish flecks in brand colors
// (verde/ámbar/cream). Doesn't literally use confetti; uses subtle
// radiating dashes for an editorial feel.
function Step2Cobro() {
  return (
    <svg viewBox="0 0 320 200" width="320" height="200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cobro de un voto ganado">
      {/* Radiating flecks (decorative) */}
      <g stroke="var(--b1n0-si)" strokeWidth="2" strokeLinecap="round" opacity="0.5">
        <line x1="40" y1="40" x2="50" y2="32" />
        <line x1="280" y1="50" x2="270" y2="42" />
        <line x1="55" y1="140" x2="65" y2="148" />
        <line x1="270" y1="160" x2="260" y2="168" />
      </g>
      <g stroke="var(--b1n0-no)" strokeWidth="2" strokeLinecap="round" opacity="0.6">
        <line x1="80" y1="30" x2="86" y2="22" />
        <line x1="250" y1="34" x2="244" y2="26" />
        <line x1="36" y1="100" x2="28" y2="100" />
      </g>
      {/* Card surface */}
      <rect x="40" y="50" width="240" height="116" rx="14" fill="var(--b1n0-surface)" stroke="var(--b1n0-si)" strokeWidth="1.5" />
      {/* Eyebrow */}
      <text x="58" y="78" fontFamily="var(--font-body)" fontSize="10" fontWeight="700" letterSpacing="1.4" fill="var(--b1n0-si)">¡LO SABÍAS!</text>
      {/* Big cobro number */}
      <text x="58" y="120" fontFamily="var(--font-display)" fontSize="36" fontWeight="800" fill="var(--b1n0-si)" letterSpacing="-1">
        +$157.50
      </text>
      {/* Sub-line */}
      <text x="58" y="148" fontFamily="var(--font-body)" fontSize="11" fill="var(--b1n0-muted)">Ya está en tu saldo</text>
    </svg>
  )
}

// ── Step 3 illustration: salida anticipada (sell before resolution).
// ────────────────────────────────────────────────────────────────────
// Position row with entry vs current price, then a "Vender ahora"
// pill. Shows the user they don't have to wait until resolution.
function Step3Salida() {
  return (
    <svg viewBox="0 0 320 200" width="320" height="200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Salida anticipada de una posición">
      {/* Position card */}
      <rect x="30" y="30" width="260" height="140" rx="14" fill="var(--b1n0-surface)" stroke="var(--b1n0-border)" />
      {/* Side pill (SÍ) */}
      <rect x="46" y="48" width="28" height="18" rx="9" fill="var(--b1n0-si-bg, rgba(20,184,166,0.15))" />
      <text x="60" y="61" textAnchor="middle" fontFamily="var(--font-body)" fontSize="9" fontWeight="700" fill="var(--b1n0-si)">SÍ</text>
      {/* Event mini-title */}
      <text x="84" y="61" fontFamily="var(--font-display)" fontSize="11" fontWeight="700" fill="var(--b1n0-text-1)">El Papa pisa Centroamérica</text>
      {/* Entry → current row */}
      <text x="46" y="100" fontFamily="var(--font-body)" fontSize="9" fontWeight="600" letterSpacing="0.8" fill="var(--b1n0-muted)">ENTRADA</text>
      <text x="46" y="118" fontFamily="var(--font-num, var(--font-body))" fontSize="18" fontWeight="800" fill="var(--b1n0-text-1)" letterSpacing="-0.5">0.31</text>
      {/* Arrow */}
      <path d="M 120 110 L 140 110 M 134 104 L 140 110 L 134 116" stroke="var(--b1n0-muted)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x="156" y="100" fontFamily="var(--font-body)" fontSize="9" fontWeight="600" letterSpacing="0.8" fill="var(--b1n0-muted)">ACTUAL</text>
      <text x="156" y="118" fontFamily="var(--font-num, var(--font-body))" fontSize="18" fontWeight="800" fill="var(--b1n0-si)" letterSpacing="-0.5">0.41</text>
      {/* Vender pill */}
      <rect x="222" y="100" width="56" height="26" rx="13" fill="var(--b1n0-si)" />
      <text x="250" y="117" textAnchor="middle" fontFamily="var(--font-body)" fontSize="10" fontWeight="700" fill="var(--b1n0-on-accent)">Vender</text>
      {/* P&L */}
      <text x="46" y="148" fontFamily="var(--font-body)" fontSize="9" fontWeight="600" letterSpacing="0.8" fill="var(--b1n0-muted)">P&amp;L</text>
      <text x="84" y="148" fontFamily="var(--font-num, var(--font-body))" fontSize="11" fontWeight="700" fill="var(--b1n0-si)">+$32.50</text>
    </svg>
  )
}

// ── Step 4 illustration: final screen — real b1n0 wordmark.
// ────────────────────────────────────────────────────────────────────
// Uses the actual brand asset (/brand/b1n0-logo-*.svg) instead of a
// drawn glyph. The wordmark sits inside concentric rings that subtly
// pulse outward — echoes the live-dot animation on EventCards so the
// motion vocabulary stays consistent. Theme-aware: white wordmark on
// dark mode, fullcolor on light.
function Step4Listo() {
  const { resolved } = useTheme()
  const logoSrc =
    resolved === 'light' ? '/brand/b1n0-logo-fullcolor.svg' : '/brand/b1n0-logo-white.svg'

  return (
    <div
      style={{
        position: 'relative',
        width: 200,
        height: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label="Listo para hacer tu primer voto"
      role="img"
    >
      {/* Concentric pulse rings — three sizes, staggered animation.
          Same easing/timing pattern as the LiveDot on event cards
          so the motion language stays consistent across the product. */}
      <style>{`
        @keyframes b1n0LogoPulse {
          0%, 100% { transform: scale(1);    opacity: 0.25; }
          50%      { transform: scale(1.08); opacity: 0.45; }
        }
      `}</style>

      <span
        style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          border: '1px solid var(--b1n0-si)',
          opacity: 0.12,
          animation: 'b1n0LogoPulse 3.2s ease-in-out infinite',
          animationDelay: '0.8s',
        }}
      />
      <span
        style={{
          position: 'absolute',
          width: 160,
          height: 160,
          borderRadius: '50%',
          border: '1.5px solid var(--b1n0-si)',
          opacity: 0.22,
          animation: 'b1n0LogoPulse 3.2s ease-in-out infinite',
          animationDelay: '0.4s',
        }}
      />
      <span
        style={{
          position: 'absolute',
          width: 124,
          height: 124,
          borderRadius: '50%',
          background: 'var(--b1n0-si)',
          opacity: 0.18,
          filter: 'blur(8px)',
        }}
      />

      {/* The actual brand asset, sized so the wordmark feels weighty
          but doesn't fill the rings — leaves breathing room. */}
      <img
        src={logoSrc}
        alt="b1n0"
        style={{
          height: 56,
          width: 'auto',
          position: 'relative',
          zIndex: 1,
          // Subtle drop shadow tied to brand-green for a glow effect
          // that reads in both themes.
          filter: 'drop-shadow(0 0 24px rgba(20, 184, 166, 0.35))',
        }}
      />
    </div>
  )
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'llamado',
    title: 'Hacé tu voto',
    body:
      'Cada tarjeta es un evento real del mundo. Tocá el lado SÍ o NO según lo que creas — el precio te dice cuánto vale ese voto ahora mismo.',
    illustration: <Step1Card />,
  },
  {
    id: 'cobro',
    title: 'Cobrás si tenés razón',
    body:
      'Si tu lado gana cuando el evento se resuelve, cobrás. Lo que cobrás depende del precio al que entraste — más barato entraste, más cobrás.',
    illustration: <Step2Cobro />,
  },
  {
    id: 'salida',
    title: 'Salí cuando quieras',
    body:
      'No tenés que esperar al final. Si tu lado se mueve a tu favor, podés vender tu posición antes de la resolución y cobrar la ganancia (o cortar pérdidas).',
    illustration: <Step3Salida />,
  },
  {
    id: 'listo',
    title: 'Demostrá que sabés.',
    body:
      'Ya sabés lo esencial. Hacé tu primer voto y mostrá que entendés tu mundo mejor que todos.',
    illustration: <Step4Listo />,
    ctaLabel: 'Empezar',
  },
]

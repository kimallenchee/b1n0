/**
 * AppTour — illustrated modal carousel for "Cómo Jugar".
 *
 * Replaces the earlier react-joyride implementation. Polymarket-style
 * sequence of full-screen modal slides; each step is a brand-aligned
 * illustration + title + body + single CTA. Last step closes back to
 * Inicio (no signup redirect).
 *
 * Why this design vs Joyride:
 *   - Doesn't depend on real UI elements being in the DOM (no fragility)
 *   - Polished illustrations match brand instead of pointing at chrome
 *   - Works for logged-out users too (Joyride needed the user already
 *     navigated to a page with the targeted elements)
 *   - Easier to maintain — edit the SVGs + copy in tutorial.ts
 *
 * Steps and copy live in src/content/tutorial.ts. This component owns
 * only the carousel mechanics (step index, transitions, backdrop).
 */

import { useEffect, useState } from 'react'
import { useTour } from '../context/TourContext'
import { TUTORIAL_STEPS } from '../content/tutorial'

const F_BODY    = 'var(--font-body)'
const F_DISPLAY = 'var(--font-display)'

export function AppTour() {
  const { running, stopTour } = useTour()
  const [stepIndex, setStepIndex] = useState(0)

  // Reset to step 1 every time the tour opens, so a user who closed
  // mid-tour comes back to the start instead of where they left off.
  useEffect(() => {
    if (running) setStepIndex(0)
  }, [running])

  // Lock body scroll while the modal is open. Restore on close.
  useEffect(() => {
    if (!running) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [running])

  if (!running) return null

  const step = TUTORIAL_STEPS[stepIndex]
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1

  function next() {
    if (isLast) {
      stopTour()
      return
    }
    setStepIndex((i) => i + 1)
  }

  function close() {
    stopTour()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cómo jugar"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        // Fade in the overlay itself for a softer entrance.
        animation: 'b1n0TourFade 200ms ease-out',
      }}
    >
      <style>{`
        @keyframes b1n0TourFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes b1n0TourSlide {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--b1n0-card)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: 'var(--radius-2xl, 20px)',
          padding: '24px',
          position: 'relative',
          // Re-key animation on stepIndex so each slide re-animates.
          animation: 'b1n0TourSlide 220ms ease-out',
        }}
        key={stepIndex}
      >
        {/* Close button (X) — top-right corner. */}
        <button
          onClick={close}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            border: 'none',
            background: 'transparent',
            color: 'var(--b1n0-muted)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            borderRadius: '50%',
          }}
        >
          ×
        </button>

        {/* Illustration — fixed 200px height to keep cards uniform
            even when the underlying SVG aspect differs slightly. */}
        <div
          style={{
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            marginTop: 4,
          }}
        >
          {step.illustration}
        </div>

        {/* Eyebrow with step number — small, brand-green accent so
            users feel the progression without a heavy dots row. */}
        <p
          style={{
            fontFamily: F_BODY,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: 'var(--b1n0-si)',
            margin: 0,
            marginBottom: 4,
          }}
        >
          {stepIndex + 1} de {TUTORIAL_STEPS.length}
        </p>

        {/* Title — display font, tight tracking. */}
        <h2
          style={{
            fontFamily: F_DISPLAY,
            fontWeight: 800,
            fontSize: 22,
            color: 'var(--b1n0-text-1)',
            margin: 0,
            marginBottom: 8,
            letterSpacing: '-0.5px',
          }}
        >
          {step.title}
        </h2>

        {/* Body copy. */}
        <p
          style={{
            fontFamily: F_BODY,
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--b1n0-muted)',
            margin: 0,
            marginBottom: 20,
          }}
        >
          {step.body}
        </p>

        {/* Progress dots — passive indicator above the CTA. */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {TUTORIAL_STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === stepIndex ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === stepIndex ? 'var(--b1n0-si)' : 'var(--b1n0-border)',
                transition: 'width 200ms ease-out, background 200ms ease-out',
              }}
            />
          ))}
        </div>

        {/* Primary CTA — same green pill across all steps, label
            changes on last step ("Listo" instead of "Siguiente"). */}
        <button
          onClick={next}
          style={{
            width: '100%',
            padding: '14px',
            background: 'var(--b1n0-si)',
            color: 'var(--b1n0-on-accent)',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            fontFamily: F_BODY,
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          {step.ctaLabel ?? (isLast ? 'Listo' : 'Siguiente')}
        </button>

        {/* Secondary "Saltar" — text link below CTA, only on
            non-final steps. Skipping closes the tour outright. */}
        {!isLast && (
          <button
            onClick={close}
            style={{
              display: 'block',
              margin: '12px auto 0',
              background: 'transparent',
              border: 'none',
              color: 'var(--b1n0-muted)',
              fontFamily: F_BODY,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Saltar
          </button>
        )}
      </div>
    </div>
  )
}

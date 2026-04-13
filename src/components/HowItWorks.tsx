import { useState } from 'react'

const F = '"DM Sans", sans-serif'
const D = '"Syne", sans-serif'

interface HowItWorksProps {
  open: boolean
  onClose: () => void
}

const steps = [
  {
    number: 1,
    title: 'Elegí tu llamado',
    description: 'Explorá las preguntas del momento — deportes, política, economía. Elegí un lado: SÍ o NO. Tu opinión es tu posición.',
    accent: 'var(--b1n0-si)',
    accentBg: 'var(--b1n0-si-bg)',
    illustration: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 20px', background: 'var(--b1n0-card)', borderRadius: '14px', border: '1px solid var(--b1n0-border)' }}>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: '15px', color: 'var(--b1n0-text-1)', lineHeight: 1.3 }}>
          ¿Trump impone aranceles a CA?
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--b1n0-si-bg)', border: '2px solid var(--b1n0-si)', textAlign: 'center', cursor: 'default' }}>
            <span style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-si)' }}>SÍ</span>
            <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-2)', marginLeft: '6px' }}>0.32</span>
          </div>
          <div style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--b1n0-card)', border: '1px solid var(--b1n0-border)', textAlign: 'center', cursor: 'default' }}>
            <span style={{ fontFamily: D, fontWeight: 700, fontSize: '16px', color: 'var(--b1n0-text-2)' }}>NO</span>
            <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-2)', marginLeft: '6px' }}>0.70</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>GEOPOLÍTICA</span>
          <span style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-muted)' }}>Q2,055 pool</span>
        </div>
      </div>
    ),
  },
  {
    number: 2,
    title: 'Participá',
    description: 'Elegí cuánto querés poner — desde Q10. Vas a ver exactamente cuánto colectás si tenés razón. Sin sorpresas.',
    accent: 'var(--b1n0-gold)',
    accentBg: 'rgba(255,212,116,0.12)',
    illustration: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 20px', background: 'var(--b1n0-card)', borderRadius: '14px', border: '1px solid var(--b1n0-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tu entrada</span>
          <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-si)', fontWeight: 600 }}>SÍ seleccionado</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', justifyContent: 'center', padding: '8px 0' }}>
          <span style={{ fontFamily: F, fontSize: '18px', color: 'var(--b1n0-text-2)' }}>Q</span>
          <span style={{ fontFamily: D, fontWeight: 800, fontSize: '42px', color: 'var(--b1n0-text-1)', letterSpacing: '-2px' }}>50</span>
        </div>
        <div style={{ background: 'var(--b1n0-si-bg)', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-text-2)' }}>Si tenés razón, colectás</span>
          <span style={{ fontFamily: D, fontWeight: 700, fontSize: '18px', color: 'var(--b1n0-si)' }}>Q156.25</span>
        </div>
        <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--b1n0-si)', textAlign: 'center', cursor: 'default' }}>
          <span style={{ fontFamily: F, fontWeight: 700, fontSize: '13px', color: 'var(--b1n0-bg)' }}>Confirmar llamado →</span>
        </div>
      </div>
    ),
  },
  {
    number: 3,
    title: 'Cobrá',
    description: 'Cuando se resuelve el evento, si acertaste colectás automáticamente. Si no fue, seguís participando — siempre hay otro llamado.',
    accent: 'var(--b1n0-si)',
    accentBg: 'var(--b1n0-si-bg)',
    illustration: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 20px', background: 'var(--b1n0-card)', borderRadius: '14px', border: '1px solid var(--b1n0-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--b1n0-si)' }} />
          <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-si)', fontWeight: 600 }}>Resuelto — ¡Lo sabías!</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
          <div>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-text-2)', marginBottom: '2px' }}>Tu llamado: SÍ</p>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-text-2)' }}>Entrada: Q50</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: F, fontSize: '10px', color: 'var(--b1n0-text-2)', marginBottom: '2px' }}>Colectás</p>
            <p style={{ fontFamily: D, fontWeight: 800, fontSize: '28px', color: 'var(--b1n0-si)', letterSpacing: '-1px' }}>Q156.25</p>
          </div>
        </div>
        <div style={{ background: 'var(--b1n0-si-bg)', borderRadius: '8px', padding: '8px 12px', textAlign: 'center' }}>
          <span style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-si)', fontWeight: 600 }}>Acreditado a tu saldo automáticamente</span>
        </div>
      </div>
    ),
  },
]

export function HowItWorks({ open, onClose }: HowItWorksProps) {
  const [step, setStep] = useState(0)

  if (!open) return null

  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          width: '100%',
          maxWidth: '380px',
          background: 'var(--b1n0-surface)',
          border: '1px solid var(--b1n0-border)',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'var(--b1n0-card)',
            border: '1px solid var(--b1n0-border)',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--b1n0-text-2)',
            fontSize: '16px',
            zIndex: 2,
          }}
        >
          ✕
        </button>

        {/* Step indicator dots */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', padding: '16px 0 8px' }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? '20px' : '6px',
                height: '6px',
                borderRadius: '3px',
                background: i === step ? current.accent : 'var(--b1n0-border)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '8px 24px 24px' }}>
          {/* Illustration */}
          <div style={{ marginBottom: '16px' }}>
            {current.illustration}
          </div>

          {/* Step number + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{
              fontFamily: D,
              fontWeight: 800,
              fontSize: '14px',
              color: current.accent,
              background: current.accentBg,
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {current.number}
            </span>
            <h3 style={{ fontFamily: D, fontWeight: 800, fontSize: '20px', color: 'var(--b1n0-text-1)', margin: 0 }}>
              {current.title}
            </h3>
          </div>

          {/* Description */}
          <p style={{ fontFamily: F, fontSize: '13px', color: 'var(--b1n0-text-2)', lineHeight: 1.6, marginBottom: '20px' }}>
            {current.description}
          </p>

          {/* Action button */}
          <button
            onClick={() => {
              if (isLast) {
                setStep(0)
                onClose()
              } else {
                setStep(step + 1)
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: current.accent,
              color: 'var(--b1n0-bg)',
              fontFamily: F,
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {isLast ? '¡A participar!' : 'Siguiente →'}
          </button>

          {/* Back link on steps 2+ */}
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                width: '100%',
                padding: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--b1n0-text-2)',
                fontFamily: F,
                fontSize: '12px',
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              ← Atrás
            </button>
          )}
        </div>
      </div>
    </>
  )
}

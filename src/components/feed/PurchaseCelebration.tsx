import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const F = '"DM Sans", sans-serif'
const D = '"DM Sans", sans-serif'

interface PurchaseCelebrationProps {
  side: string
  amount: number
  cobro: number
  currency: string
  onDone: () => void
}

function displaySide(s: string): string {
  if (s === 'yes') return 'SÍ'
  if (s === 'no') return 'NO'
  if (s.includes('::')) {
    const [label, dir] = s.split('::')
    return `${label} — ${dir === 'yes' ? 'SÍ' : 'NO'}`
  }
  return s
}

// Simple particle burst — lightweight, no dependencies
function Particles() {
  const [particles] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 60,
      y: 40 + (Math.random() - 0.5) * 30,
      size: 4 + Math.random() * 6,
      color: ['var(--b1n0-surface)', '#4ade80', '#FFD474', '#C4B5FD', 'var(--b1n0-text-2)'][Math.floor(Math.random() * 5)],
      delay: Math.random() * 0.3,
      angle: Math.random() * 360,
      distance: 80 + Math.random() * 120,
    }))
  )

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180
        const tx = Math.cos(rad) * p.distance
        const ty = Math.sin(rad) * p.distance
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              borderRadius: p.size > 7 ? '2px' : '50%',
              background: p.color,
              opacity: 0,
              animation: `celebBurst 0.8s ${p.delay}s ease-out forwards`,
              // CSS custom properties for the animation
              '--tx': `${tx}px`,
              '--ty': `${ty}px`,
            } as React.CSSProperties}
          />
        )
      })}
      <style>{`
        @keyframes celebBurst {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          70% { opacity: 0.8; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.3); }
        }
        @keyframes celebFadeIn {
          from { opacity: 0; transform: scale(0.9) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes celebCheckPop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebPulseRing {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes celebCobroCount {
          0% { transform: scale(0.8); opacity: 0; }
          40% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export function PurchaseCelebration({ side, amount, cobro, currency, onDone }: PurchaseCelebrationProps) {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 50)
    const t2 = setTimeout(() => setPhase('exit'), 2800)
    const t3 = setTimeout(onDone, 3200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  const multiplier = amount > 0 ? (cobro / amount) : 0

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: phase === 'exit' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.5)',
        transition: 'background 0.4s ease',
        pointerEvents: phase === 'exit' ? 'none' : 'auto',
      }}
      onClick={() => { setPhase('exit'); setTimeout(onDone, 400) }}
    >
      {/* Card */}
      <div
        style={{
          position: 'relative',
          background: 'var(--b1n0-card)',
          borderRadius: '24px',
          padding: '36px 32px 32px',
          maxWidth: '340px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(255,255,255,0.1)',
          opacity: phase === 'exit' ? 0 : 1,
          transform: phase === 'enter' ? 'scale(0.9) translateY(12px)' : phase === 'exit' ? 'scale(0.95) translateY(-8px)' : 'scale(1) translateY(0)',
          transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <Particles />

        {/* Checkmark circle */}
        <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 20px' }}>
          {/* Pulse ring */}
          <div
            style={{
              position: 'absolute', inset: -8,
              borderRadius: '50%', border: '2px solid #1C1917',
              animation: 'celebPulseRing 1s 0.2s ease-out forwards',
              opacity: 0,
            }}
          />
          {/* Circle bg */}
          <div
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--b1n0-text-1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'celebCheckPop 0.5s 0.1s ease-out forwards',
              opacity: 0,
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <p style={{
          fontFamily: D, fontWeight: 800, fontSize: '22px', color: 'var(--b1n0-text-1)',
          marginBottom: '4px', letterSpacing: '-0.5px',
          animation: 'celebFadeIn 0.4s 0.2s ease-out forwards',
          opacity: 0,
        }}>
          Posición confirmada
        </p>

        {/* Side badge */}
        <div style={{
          display: 'inline-block',
          padding: '4px 14px', borderRadius: '8px',
          background: 'var(--b1n0-surface)',
          fontFamily: F, fontWeight: 700, fontSize: '13px', color: 'var(--b1n0-text-1)',
          marginBottom: '20px',
          animation: 'celebFadeIn 0.4s 0.3s ease-out forwards',
          opacity: 0,
        }}>
          {displaySide(side)}
        </div>

        {/* Cobro — the hero number */}
        <div style={{
          animation: 'celebCobroCount 0.5s 0.4s ease-out forwards',
          opacity: 0,
        }}>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Si tenés razón cobrás
          </p>
          <p style={{
            fontFamily: D, fontWeight: 800, fontSize: '38px', color: 'var(--b1n0-text-1)',
            letterSpacing: '-2px', lineHeight: 1,
            marginBottom: '4px',
          }}>
            {currency}{cobro.toFixed(2)}
          </p>
          {multiplier > 1 && (
            <p style={{ fontFamily: F, fontSize: '13px', fontWeight: 600, color: '#4ade80' }}>
              {multiplier.toFixed(1)}x tu entrada
            </p>
          )}
        </div>

        {/* Entry summary */}
        <div style={{
          marginTop: '20px', padding: '12px 16px', borderRadius: '10px',
          background: 'var(--b1n0-bg)',
          animation: 'celebFadeIn 0.4s 0.5s ease-out forwards',
          opacity: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: F, fontSize: '12px', color: 'var(--b1n0-muted)' }}>Entrada</span>
            <span style={{ fontFamily: F, fontSize: '12px', fontWeight: 600, color: 'var(--b1n0-text-1)' }}>{currency}{amount.toFixed(2)}</span>
          </div>
        </div>

        {/* Tap to dismiss hint */}
        <p style={{
          fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)', marginTop: '16px',
          animation: 'celebFadeIn 0.3s 0.8s ease-out forwards',
          opacity: 0,
        }}>
          Toca para cerrar
        </p>
      </div>
    </div>,
    document.body
  )
}

import { useState } from 'react'

interface BetCardsProps {
  siPrice: number   // 0-1
  noPrice: number   // 0-1
  onSelect: (direction: 'si' | 'no') => void
  selected?: 'si' | 'no' | null
}

const F = '"DM Sans", sans-serif'

/**
 * BetCards — Tinted card pair for event detail / betting modal.
 * Shows SÍ and NO as side-by-side cards with price, payout, and sentiment bar.
 */
export function BetCards({ siPrice, noPrice, onSelect, selected = null }: BetCardsProps) {
  const [hovering, setHovering] = useState<'si' | 'no' | null>(null)

  const siPayout = siPrice > 0 ? (1 / siPrice).toFixed(2) : '—'
  const noPayout = noPrice > 0 ? (1 / noPrice).toFixed(2) : '—'
  const siPct = Math.round(siPrice * 100)

  const siActive = selected === 'si' || hovering === 'si'
  const noActive = selected === 'no' || hovering === 'no'

  return (
    <div>
      {/* Card pair */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* SÍ card */}
        <button
          onClick={() => onSelect('si')}
          onMouseEnter={() => setHovering('si')}
          onMouseLeave={() => setHovering(null)}
          style={{
            flex: 1, borderRadius: '12px', padding: '14px', textAlign: 'center',
            background: siActive ? 'var(--color-si-bg)' : 'var(--color-surface)',
            border: `1.5px solid ${siActive ? 'var(--color-si)' : 'var(--color-border)'}`,
            cursor: 'pointer', transition: 'all 0.18s ease',
            transform: selected === 'si' ? 'scale(0.97)' : 'none',
          }}
        >
          <p style={{ fontFamily: F, fontSize: '18px', fontWeight: 500, color: 'var(--color-si)', marginBottom: '4px' }}>
            SÍ
          </p>
          <p style={{ fontFamily: F, fontSize: '24px', fontWeight: 500, color: 'var(--color-si-dark)', letterSpacing: '-0.5px', marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>
            {siPrice.toFixed(2)}
          </p>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--color-si)', opacity: 0.8 }}>
            Payout Q{siPayout} por Q1
          </p>
        </button>

        {/* NO card */}
        <button
          onClick={() => onSelect('no')}
          onMouseEnter={() => setHovering('no')}
          onMouseLeave={() => setHovering(null)}
          style={{
            flex: 1, borderRadius: '12px', padding: '14px', textAlign: 'center',
            background: noActive ? 'var(--color-no-bg)' : 'var(--color-surface)',
            border: `1.5px solid ${noActive ? 'var(--color-no)' : 'var(--color-border)'}`,
            cursor: 'pointer', transition: 'all 0.18s ease',
            transform: selected === 'no' ? 'scale(0.97)' : 'none',
          }}
        >
          <p style={{ fontFamily: F, fontSize: '18px', fontWeight: 500, color: 'var(--color-no)', marginBottom: '4px' }}>
            NO
          </p>
          <p style={{ fontFamily: F, fontSize: '24px', fontWeight: 500, color: 'var(--color-no-dark)', letterSpacing: '-0.5px', marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>
            {noPrice.toFixed(2)}
          </p>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--color-no)', opacity: 0.8 }}>
            Payout Q{noPayout} por Q1
          </p>
        </button>
      </div>

      {/* Thin sentiment bar */}
      <div className="sentiment-bar">
        <div className="sent-si" style={{ width: `${siPct}%` }} />
        <div className="sent-no" />
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { midPctToAsk } from '../../lib/pricing'
import { AnimatedNumber } from '../AnimatedNumber'

interface SplitBarProps {
  yesPercent: number
  noPercent: number
  yesLabel?: string
  noLabel?: string
  compact?: boolean
  onClickSi?: () => void
  onClickNo?: () => void
}

/**
 * Tug-of-War Bar — signature b1n0 UI element.
 *
 * SÍ fills from left (teal), NO fills from right (amber). Each side
 * is independently hoverable and clickable.
 *
 * Motion design:
 *   - Bar width transitions via CSS (0.8s cubic) — defined in
 *     index.css under .tow-si / .tow-no.
 *   - Prices tween on a separate (slightly faster) curve via
 *     AnimatedNumber so the eye sees the bar reflow and the number
 *     update *together* but with the number leading slightly. Reads
 *     as live, not as a refresh.
 *
 * Why two animations instead of one: when the market reprices, the
 * number changing is the *information* — the bar sliding is the
 * confirmation. Faster number + slower bar gives a sense of cause
 * (pool moves) and effect (bar follows).
 */
export function SplitBar({
  yesPercent, noPercent, yesLabel = 'SÍ', noLabel = 'NO',
  compact = false, onClickSi, onClickNo,
}: SplitBarProps) {
  const [yesW, setYesW] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setYesW(yesPercent), 60)
    return () => clearTimeout(t)
  }, [yesPercent])

  const yesPrice = midPctToAsk(yesPercent)
  const noPrice = midPctToAsk(noPercent)

  return (
    <div
      className={`tow-container${compact ? ' tow-compact' : ''}`}
      style={{ margin: compact ? '6px 0 2px' : '10px 0 4px' }}
    >
      <div
        className="tow-si"
        style={{ width: `${Math.max(yesW, 10)}%` }}
        onClick={(e) => { e.stopPropagation(); onClickSi?.() }}
      >
        <span className="tow-label">{yesLabel}</span>
        <AnimatedNumber
          value={yesPrice}
          decimals={2}
          duration={500}
          className="tow-price"
        />
      </div>
      <div
        className="tow-no"
        onClick={(e) => { e.stopPropagation(); onClickNo?.() }}
      >
        <AnimatedNumber
          value={noPrice}
          decimals={2}
          duration={500}
          className="tow-price"
        />
        <span className="tow-label">{noLabel}</span>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { midPctToAsk } from '../../lib/pricing'

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
 * Tug-of-War Bar — signature b1n0 UI element
 * SÍ fills from left (green), NO fills from right (red)
 * Each side is independently hoverable and clickable.
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

  const yesPrice = midPctToAsk(yesPercent).toFixed(2)
  const noPrice = midPctToAsk(noPercent).toFixed(2)

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
        <span className="tow-price">{yesPrice}</span>
      </div>
      <div
        className="tow-no"
        onClick={(e) => { e.stopPropagation(); onClickNo?.() }}
      >
        <span className="tow-price">{noPrice}</span>
        <span className="tow-label">{noLabel}</span>
      </div>
    </div>
  )
}

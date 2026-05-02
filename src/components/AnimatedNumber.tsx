import { useEffect, useRef, useState } from 'react'

/**
 * AnimatedNumber — counts up/down to a target value over `duration` ms.
 *
 * When the `value` prop changes, the displayed number tweens from the old
 * value to the new one using a cubic-out easing curve (the standard premium
 * money-feel — opinion.trade and Robinhood both ease the same way). On the
 * very first render the value displays instantly so we don't make the user
 * wait for their balance to "appear" on page load.
 *
 * Usage:
 *   <AnimatedNumber value={balance} prefix="$" decimals={2} />
 *
 * Props:
 *   value     — the target number
 *   prefix    — optional leading string (e.g. "$")
 *   suffix    — optional trailing string (e.g. " USD")
 *   decimals  — fractional digits in output (default 2)
 *   duration  — tween duration in ms (default 600)
 *   className — passthrough for styling
 *   style     — passthrough for styling
 */
interface AnimatedNumberProps {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  className?: string
  style?: React.CSSProperties
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  duration = 600,
  className,
  style,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      setDisplay(value)
      fromRef.current = value
      return
    }

    const from = fromRef.current
    const to = value
    if (from === to) return

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    startRef.current = null

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const t = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(t)
      const current = from + (to - from) * eased
      setDisplay(current)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return (
    <span
      className={className}
      style={{
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {prefix}
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  )
}

import { useEffect, useRef, useState } from 'react'

/**
 * usePullToRefresh — native iOS-style pull-to-refresh on a scroll container.
 *
 * Usage:
 *   const scrollRef = useRef<HTMLDivElement>(null)
 *   const { pullDistance, isRefreshing } = usePullToRefresh(scrollRef, async () => {
 *     await refetchEvents()
 *   })
 *
 *   <div ref={scrollRef} className="feed-scroll">
 *     <PullIndicator distance={pullDistance} refreshing={isRefreshing} />
 *     ...feed content...
 *   </div>
 *
 * Behavior:
 *   - Activates only when the scroll container is at scrollTop=0
 *     (so it never hijacks regular vertical scrolling)
 *   - Tracks touchstart Y, calculates downward delta via 0.55x rubber-band
 *     resistance — feels less "loose" than the raw drag distance
 *   - Triggers `onRefresh` when released past `threshold` px
 *   - Throttles re-pull until any in-flight refresh resolves
 *   - Only listens on touch devices (skips mouse so desktop scrolling
 *     stays normal)
 */
export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown> | void,
  options: { threshold?: number; resistance?: number } = {}
) {
  const { threshold = 64, resistance = 0.55 } = options
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const armed = useRef(false)
  const refreshingRef = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      // Only arm when at the top of the scroll container
      if (el.scrollTop > 0) {
        armed.current = false
        return
      }
      armed.current = true
      startY.current = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current || startY.current === null) return
      // If the user scrolled away from the top mid-drag, disarm.
      if (el.scrollTop > 0) {
        armed.current = false
        startY.current = null
        setPullDistance(0)
        return
      }
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        setPullDistance(0)
        return
      }
      // Rubber-band resistance — pulling 100px shows ~55px movement.
      // Capped at threshold * 1.6 so very long pulls don't get silly.
      const eased = Math.min(delta * resistance, threshold * 1.6)
      setPullDistance(eased)
      // Prevent the page from rubber-banding behind our overlay
      if (eased > 4 && e.cancelable) {
        e.preventDefault()
      }
    }

    const onTouchEnd = async () => {
      if (!armed.current) return
      const distance = pullDistanceRef.current
      armed.current = false
      startY.current = null

      if (distance >= threshold && !refreshingRef.current) {
        refreshingRef.current = true
        setIsRefreshing(true)
        // Snap pull distance down to threshold for the spinner to sit at
        setPullDistance(threshold)
        try {
          await onRefresh()
        } finally {
          refreshingRef.current = false
          setIsRefreshing(false)
          setPullDistance(0)
        }
      } else {
        setPullDistance(0)
      }
    }

    // Need passive:false on touchmove so we can preventDefault during pull.
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, onRefresh, threshold, resistance])

  // Mirror pullDistance into a ref so the touchend handler can read the
  // latest value without re-binding the listener on every render.
  const pullDistanceRef = useRef(0)
  useEffect(() => { pullDistanceRef.current = pullDistance }, [pullDistance])

  return { pullDistance, isRefreshing, threshold }
}

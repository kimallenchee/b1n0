import { useEffect, useRef, useState } from 'react'

/**
 * useInView — fires once when the referenced element enters the
 * viewport at >= `threshold` visibility. The "once" is intentional:
 * we use this to trigger fade-up reveal animations, and you don't
 * want them to play backwards when the user scrolls back up.
 *
 * Usage:
 *   const { ref, inView } = useInView<HTMLDivElement>()
 *   <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? 'none' : 'translateY(24px)' }} />
 *
 * Options:
 *   threshold     — fraction of element visible to trigger (0–1, default 0.25)
 *   rootMargin    — CSS-style offset that expands/shrinks the trigger
 *                   zone (e.g. '0px 0px -10% 0px' to fire slightly before
 *                   the element fully enters)
 *
 * Cheap. No external deps, just IntersectionObserver.
 */
export function useInView<T extends HTMLElement = HTMLElement>({
  threshold = 0.25,
  rootMargin = '0px 0px -10% 0px',
}: { threshold?: number; rootMargin?: string } = {}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Fallback for older browsers — show immediately so content is
      // never permanently hidden if the API isn't available.
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return { ref, inView }
}

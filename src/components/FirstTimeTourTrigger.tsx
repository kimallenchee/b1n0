/**
 * FirstTimeTourTrigger — silent component that auto-opens the Cómo
 * Jugar tour the first time a user lands on /inicio after logging in.
 *
 * Persistence: localStorage flag `b1n0-has-seen-tour-v1`. Set by
 * AppTour when the user finishes or skips the tour. If we ever need
 * cross-device persistence, we'll migrate to a DB column.
 *
 * Why a separate component (not just a useEffect inside App.tsx):
 *   - Keeps the App tree clean
 *   - Easier to disable/replace later (e.g., if onboarding moves to
 *     an entirely different flow)
 *   - The 1500ms delay lives in one place
 *
 * Edge cases:
 *   - User clears localStorage → tour re-triggers next login (fine)
 *   - User uses different device → tour shows once per device (fine)
 *   - User clicks ? icon → manual trigger always works, no flag check
 *   - User signs out and back in same browser → flag persists, no re-tour
 */

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTour } from '../context/TourContext'

const SEEN_FLAG = 'b1n0-has-seen-tour-v1'

export function FirstTimeTourTrigger() {
  const { session, loading } = useAuth()
  const { startTour } = useTour()
  const location = useLocation()

  useEffect(() => {
    // Wait for auth check to complete and a real session to exist.
    if (loading || !session) return
    // Only auto-open on /inicio so the tour's targets (if any) are
    // sure to be mounted and the user is in the "main feed" context.
    if (location.pathname !== '/inicio') return
    // Skip if user has already seen (or dismissed) the tour.
    try {
      if (localStorage.getItem(SEEN_FLAG)) return
    } catch {
      return // localStorage blocked — don't auto-open
    }

    // Small delay gives the page chrome time to render before the
    // overlay drops in, avoiding a jarring instant blackout.
    const t = setTimeout(() => startTour(), 1500)
    return () => clearTimeout(t)
  }, [session, loading, location.pathname, startTour])

  return null
}

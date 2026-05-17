/**
 * TourContext — global on/off switch for the Cómo Jugar walkthrough.
 *
 * Lives at the app root (above Routes) so TopBar and any other
 * surface can call `startTour()`. The actual Joyride mount lives
 * in <AppTour />, which subscribes to this context.
 *
 * Why a context (not local state in TopBar): the tour may be
 * triggered from multiple places later (HowItWorks modal, onboarding
 * flow, an empty-state CTA), and we want a single source of truth
 * for "is the tour running right now".
 */

import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface TourContextValue {
  running: boolean
  startTour: () => void
  stopTour: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false)

  const startTour = useCallback(() => setRunning(true), [])
  const stopTour = useCallback(() => setRunning(false), [])

  return (
    <TourContext.Provider value={{ running, startTour, stopTour }}>
      {children}
    </TourContext.Provider>
  )
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>')
  return ctx
}

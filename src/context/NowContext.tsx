import { createContext, useContext, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export const MOCK_START = new Date('2026-03-04T14:00:00').getTime()

const NowContext = createContext(MOCK_START)

export function NowProvider({ children }: { children: ReactNode }) {
  const realStart = useRef(Date.now())
  const [now, setNow] = useState(MOCK_START)

  useEffect(() => {
    const id = setInterval(() => {
      setNow(MOCK_START + (Date.now() - realStart.current))
    }, 30000)
    return () => clearInterval(id)
  }, [])

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>
}

export function useNow() {
  return useContext(NowContext)
}

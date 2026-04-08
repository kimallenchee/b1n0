import { createContext, useContext, useState, useCallback } from 'react'

interface AuthModalContextType {
  isOpen: boolean
  openAuth: (tab?: 'login' | 'signup') => void
  closeAuth: () => void
  initialTab: 'login' | 'signup'
}

const AuthModalContext = createContext<AuthModalContextType>({
  isOpen: false,
  openAuth: () => {},
  closeAuth: () => {},
  initialTab: 'login',
})

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialTab, setInitialTab] = useState<'login' | 'signup'>('login')

  const openAuth = useCallback((tab?: 'login' | 'signup') => {
    setInitialTab(tab || 'login')
    setIsOpen(true)
  }, [])

  const closeAuth = useCallback(() => setIsOpen(false), [])

  return (
    <AuthModalContext.Provider value={{ isOpen, openAuth, closeAuth, initialTab }}>
      {children}
    </AuthModalContext.Provider>
  )
}

export const useAuthModal = () => useContext(AuthModalContext)

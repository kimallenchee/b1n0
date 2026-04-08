import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: React.ReactNode
  requireAdmin?: boolean
}

/**
 * Wraps a route that requires authentication (and optionally admin role).
 * Redirects to /inicio if not authorized.
 */
export function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: '"DM Sans", sans-serif',
          color: '#5e5a54',
          fontSize: '14px',
        }}
      >
        Cargando...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/inicio" replace />
  }

  if (requireAdmin && !profile?.isAdmin) {
    return <Navigate to="/inicio" replace />
  }

  return <>{children}</>
}

import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: React.ReactNode
  requireAdmin?: boolean
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  fontFamily: '"DM Sans", sans-serif',
  color: 'var(--b1n0-muted)',
  fontSize: '14px',
}

/**
 * Wraps a route that requires authentication (and optionally admin role).
 *
 * Admin gating is now server-verified via `check_admin_status` (RPC) on
 * every mount — the client-side `profile.isAdmin` flag is used only for
 * the initial optimistic render so the page doesn't flash a redirect on
 * a happy-path admin nav. If the RPC says the user is not an admin, we
 * redirect to / regardless of what the cached profile says.
 *
 * Redirects to /inicio if not authenticated, to / if not admin.
 */
export function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const { session, profile, loading, isAdminVerified, verifyAdminStatus } = useAuth()
  const location = useLocation()
  const [verifying, setVerifying] = useState(requireAdmin)
  const [verifiedThisMount, setVerifiedThisMount] = useState(false)

  // Re-verify admin status on every mount of an admin-protected route.
  useEffect(() => {
    if (!requireAdmin) return
    if (!session) return
    let cancelled = false
    setVerifying(true)
    verifyAdminStatus()
      .catch(() => false)
      .finally(() => {
        if (!cancelled) {
          setVerifying(false)
          setVerifiedThisMount(true)
        }
      })
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireAdmin, session?.user?.id, location.pathname])

  if (loading) {
    return <div style={loadingStyle}>Cargando...</div>
  }

  if (!session) {
    return <Navigate to="/inicio" replace />
  }

  if (requireAdmin) {
    // Block on first verification — we don't trust the cached profile flag
    // for the very first render of an admin route in this session.
    if (verifying || (!verifiedThisMount && isAdminVerified === null)) {
      return <div style={loadingStyle}>Verificando permisos...</div>
    }

    // Server said no → redirect immediately, ignore stale profile flag.
    if (isAdminVerified === false) {
      return <Navigate to="/" replace />
    }

    // Belt and suspenders: also reject if the cached profile flag is off.
    if (isAdminVerified !== true && !profile?.isAdmin) {
      return <Navigate to="/" replace />
    }
  }

  return <>{children}</>
}

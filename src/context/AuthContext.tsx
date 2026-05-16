import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { logger, setMonitoringUser } from '../lib/logger'

export interface Profile {
  id: string
  name: string
  username: string
  firstName: string
  lastName: string
  dob: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  country: string
  balance: number
  tier: 1 | 2 | 3
  currency: string
  totalPredictions: number
  correctPredictions: number
  totalCobrado: number
  isAdmin: boolean
  mustChangePassword: boolean
  avatarUrl: string | null
  /**
   * True when the user was auto-promoted to Tier 3 by hitting the
   * cumulative deposit threshold but hasn't yet completed the Didit
   * T3 verification (which runs AML/PEP screening). Cleared by the
   * kyc_session_promote_tier trigger on Didit T3 approval.
   */
  needsAmlReview: boolean
}

export interface SignupMeta {
  firstName: string
  lastName: string
  username: string
  dob: string
  address: { line1: string; line2: string; city: string; state: string; country: string }
  phone: string
  phoneCountryCode: string
}

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /**
   * Server-verified admin status. `null` = not yet checked. The cached
   * value reflects the most recent `verifyAdminStatus()` call. Always
   * call `verifyAdminStatus()` before gating sensitive UI — the cached
   * value can be stale if a separate session changed the flag.
   */
  isAdminVerified: boolean | null
  /**
   * Re-check admin status against the server. Returns the fresh value
   * and updates the cache. Calls `check_admin_status` RPC which is
   * SECURITY DEFINER and reads the live `profiles.is_admin` row.
   */
  verifyAdminStatus: () => Promise<boolean>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, meta: SignupMeta) => Promise<string | null>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  resetPassword: (email: string) => Promise<{ tempPassword: string } | { error: string }>
  changePassword: (newPassword: string) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    name: row.name as string,
    username: (row.username as string) ?? '',
    firstName: (row.first_name as string) ?? '',
    lastName: (row.last_name as string) ?? '',
    dob: (row.dob as string) ?? '',
    phone: (row.phone as string) ?? '',
    addressLine1: (row.address_line1 as string) ?? '',
    addressLine2: (row.address_line2 as string) ?? '',
    city: (row.city as string) ?? '',
    state: (row.state as string) ?? '',
    country: (row.country as string) ?? 'GT',
    balance: row.balance as number,
    tier: row.tier as 1 | 2 | 3,
    currency: row.currency as string,
    totalPredictions: row.total_predictions as number,
    correctPredictions: row.correct_predictions as number,
    totalCobrado: row.total_cobrado as number,
    isAdmin: (row.is_admin as boolean) ?? false,
    mustChangePassword: (row.must_change_password as boolean) ?? false,
    avatarUrl: (row.avatar_url as string) ?? null,
    needsAmlReview: (row.needs_aml_review as boolean) ?? false,
  }
}


/**
 * Read the admin claim from the JWT's app_metadata. Server-controlled,
 * tamper-proof (Supabase signs the JWT), and synchronous — no RPC.
 * Migration 20260507_admin_claim_to_app_metadata copies profiles.is_admin
 * into auth.users.raw_app_meta_data.is_admin and keeps them in sync via
 * trigger. Reading from the JWT instead of profiles.is_admin closes the
 * cosmetic leak where any user could SELECT their own profile and read
 * the admin flag — even though the buttons wouldn't have worked, the
 * surface area was visible.
 */
function isAdminFromSession (s: Session | null): boolean {
  const claim = s?.user?.app_metadata?.is_admin
  return claim === true || claim === 'true'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdminVerified, setIsAdminVerified] = useState<boolean | null>(null)

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      logger.error('AuthContext: fetchProfile failed', { user_id: userId, error: error.message })
      return
    }
    if (data) {
      const p = rowToProfile(data as unknown as Record<string, unknown>)
      // Override DB is_admin with the JWT app_metadata claim.
      // The JWT is signed by Supabase and trustworthy; the DB row is
      // user-readable via RLS. Migration 20260507 keeps the two in sync
      // via trigger. JWT wins if they ever diverge.
      p.isAdmin = isAdminFromSession(session)
      setProfile(p)
    }
  }

  async function refreshProfile() {
    if (session?.user?.id) await fetchProfile(session.user.id)
  }

  // Server-verified admin check. The cached value avoids spamming the RPC
  // on every render, but ProtectedRoute re-runs this on every admin-route
  // mount so a flipped flag kicks the user out on next navigation.
  const verifyAdminStatus = useCallback(async (): Promise<boolean> => {
    if (!session?.user?.id) {
      setIsAdminVerified(false)
      return false
    }
    try {
      const { data, error } = await supabase.rpc('check_admin_status')
      if (error) {
        logger.error('check_admin_status RPC failed', { error: error.message })
        setIsAdminVerified(false)
        return false
      }
      const result = (data ?? {}) as { is_admin?: boolean; authenticated?: boolean }
      const verified = Boolean(result.is_admin && result.authenticated)
      setIsAdminVerified(verified)
      return verified
    } catch (err) {
      logger.error('check_admin_status threw', { error: err })
      setIsAdminVerified(false)
      return false
    }
  }, [session?.user?.id])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s?.user) fetchProfile(s.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) {
        fetchProfile(s.user.id)
        setMonitoringUser({ id: s.user.id, email: s.user.email })
      } else {
        setProfile(null)
        setIsAdminVerified(null)
        setMonitoringUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Realtime: sync balance/stats whenever the profile row changes in DB
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return

    const channel = supabase
      .channel(`profile-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        (payload) => {
          const p = rowToProfile(payload.new as Record<string, unknown>)
          // Same JWT override as fetchProfile — realtime updates would
          // otherwise restore the DB's is_admin and overwrite the claim.
          p.isAdmin = isAdminFromSession(session)
          setProfile(p)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  async function signUp(email: string, password: string, meta: SignupMeta): Promise<string | null> {
    const displayName = `${meta.firstName} ${meta.lastName}`.trim()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: displayName,
          first_name: meta.firstName,
          last_name: meta.lastName,
          username: meta.username,
          dob: meta.dob,
          phone: meta.phone,
          phone_country_code: meta.phoneCountryCode,
          address_line1: meta.address.line1,
          address_line2: meta.address.line2,
          city: meta.address.city,
          state: meta.address.state,
          country: meta.address.country,
        },
      },
    })
    return error ? error.message : null
  }

  async function resetPassword(email: string): Promise<{ tempPassword: string } | { error: string }> {
    const { data, error } = await supabase.rpc('reset_user_password', { p_email: email })
    if (error) return { error: error.message }
    const result = data as { ok: boolean; temp?: string }
    if (result?.temp) return { tempPassword: result.temp }
    // Don't reveal whether the email exists
    return { tempPassword: '' }
  }

  async function changePassword(newPassword: string): Promise<string | null> {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return error.message
    // Clear the flag
    const uid = session?.user?.id
    if (uid) {
      await supabase.from('profiles').update({ must_change_password: false }).eq('id', uid)
      await fetchProfile(uid)
    }
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        isAdminVerified,
        verifyAdminStatus,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        resetPassword,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

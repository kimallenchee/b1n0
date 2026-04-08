import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { setMonitoringUser } from '../lib/logger'

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
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(rowToProfile(data as Record<string, unknown>))
  }

  async function refreshProfile() {
    if (session?.user?.id) await fetchProfile(session.user.id)
  }

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
          setProfile(rowToProfile(payload.new as Record<string, unknown>))
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
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signOut, refreshProfile, resetPassword, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

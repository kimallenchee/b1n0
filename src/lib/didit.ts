/**
 * Didit KYC — thin client wrapper.
 *
 * The actual Didit API call lives in the kyc-create-session edge
 * function (Didit API key never touches the browser). This module
 * just hits the edge function and returns the verification_url.
 *
 * To enable: set `VITE_KYC_PROVIDER=didit` in the client env, and
 * configure the Didit secrets on the edge function side via
 * `supabase secrets set ...` (see CLAUDE.md for the full list).
 *
 * When the flag is unset or `manual`, KYCSheet falls back to its
 * existing manual flow.
 */

import { supabase } from './supabase'

export type KycProvider = 'didit' | 'manual'

export function activeKycProvider(): KycProvider {
  const v = import.meta.env.VITE_KYC_PROVIDER as string | undefined
  return v === 'didit' ? 'didit' : 'manual'
}

export interface KycSessionResult {
  verificationUrl: string
  sessionId: string
}

/**
 * Start a Didit verification session for the current user.
 * Throws on auth failure or provider error — caller should
 * surface the error to the user.
 */
export async function startDiditSession(targetTier: 2 | 3): Promise<KycSessionResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('No active session')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kyc-create-session`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ target_tier: targetTier }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`KYC session creation failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json() as { verification_url: string; session_id: string }
  return { verificationUrl: data.verification_url, sessionId: data.session_id }
}

/**
 * Subscribe to realtime updates on the user's most recent KYC
 * session. Fires `onApproved` when status flips to 'Approved'.
 * Returns an unsubscribe function.
 */
export function subscribeToKycSession(userId: string, onApproved: () => void): () => void {
  const channel = supabase
    .channel(`kyc-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'kyc_sessions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newRow = payload.new as { status?: string }
        if (newRow.status === 'Approved') onApproved()
      },
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

/**
 * Returns the most recent kyc_session row for the current user,
 * regardless of status. Useful for showing "tu verificación está
 * en revisión" hints in KYCSheet.
 */
export async function getLatestKycSession(userId: string) {
  const { data, error } = await supabase
    .from('kyc_sessions')
    .select('id, target_tier, status, verification_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data as null | {
    id: string
    target_tier: 2 | 3
    status: string
    verification_url: string | null
    created_at: string
  }
}

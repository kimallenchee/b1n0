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

  // supabase.functions.invoke wires up both the apikey AND Authorization
  // headers correctly. Hand-rolled fetch() was missing the apikey header
  // which made the Supabase gateway reject with UNAUTHORIZED_NO_AUTH_HEADER.
  const { data, error } = await supabase.functions.invoke('kyc-create-session', {
    body: { target_tier: targetTier },
  })
  if (error) {
    // FunctionsHttpError carries the response body — try to extract it
    let detail = error.message ?? 'unknown'
    try {
      const ctx = (error as { context?: { body?: unknown } }).context
      if (ctx?.body) {
        const bodyText = typeof ctx.body === 'string' ? ctx.body : JSON.stringify(ctx.body)
        detail = `${error.message} — ${bodyText}`
      }
    } catch { /* noop */ }
    throw new Error(`KYC session creation failed: ${detail}`)
  }
  const result = data as { verification_url?: string; session_id?: string; error?: string; detail?: string }
  if (result?.error) {
    throw new Error(`Didit error: ${result.error}${result.detail ? ' — ' + result.detail : ''}`)
  }
  if (!result?.verification_url) {
    throw new Error(`KYC session response missing verification_url. Response: ${JSON.stringify(result).slice(0, 300)}`)
  }
  return { verificationUrl: result.verification_url, sessionId: result.session_id! }
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

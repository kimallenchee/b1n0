/**
 * Structured RPC helper.
 *
 * Wraps `supabase.rpc()` with logging that captures rpc name, user id,
 * duration, and success/failure for every call. Goal: make post-mortems
 * trivial. Every admin panel + RPC-calling client should funnel through
 * this so we get consistent observability across the app.
 *
 * Usage:
 *   import { callRpc } from '@/lib/rpc'
 *   const { data, error } = await callRpc('execute_purchase', {
 *     p_event_id, p_user_id, p_side, p_gross
 *   })
 *
 * The return shape mirrors supabase.rpc — `{ data, error }` — so you
 * can drop it in for an existing call without restructuring.
 */

import { supabase } from './supabase'
import { logger } from './logger'
import type { Database } from '../types/database'

type Functions = Database['public']['Functions']
type FunctionName = keyof Functions

type ArgsOf<N extends FunctionName> = Functions[N]['Args']
type ReturnOf<N extends FunctionName> = Functions[N]['Returns']

interface CallRpcResult<T> {
  data: T | null
  error: { message: string; code?: string; details?: string } | null
}

/**
 * Call a Supabase RPC with structured logging.
 *
 * - Logs an `info` entry on success with duration_ms.
 * - Logs an `error` entry on failure with duration_ms + error.
 * - Returns the same shape supabase.rpc returns so callers can keep
 *   their existing destructuring.
 */
export async function callRpc<N extends FunctionName>(
  name: N,
  args?: ArgsOf<N>
): Promise<CallRpcResult<ReturnOf<N>>> {
  const start = performance.now()
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null

  try {
    // The Supabase client's rpc generic infers from Database, so this is
    // already typed end-to-end. We cast args to satisfy the overload —
    // it allows undefined for no-arg RPCs.
    const result = await supabase.rpc(name, (args ?? undefined) as ArgsOf<N>)
    const duration = Math.round(performance.now() - start)

    if (result.error) {
      logger.error('rpc failed', {
        rpc: name,
        user_id: userId,
        duration_ms: duration,
        error: result.error.message,
        code: result.error.code,
        details: result.error.details,
      })
      return { data: null, error: result.error }
    }

    logger.info('rpc ok', {
      rpc: name,
      user_id: userId,
      duration_ms: duration,
    })
    return {
      data: result.data as ReturnOf<N>,
      error: null,
    }
  } catch (err) {
    const duration = Math.round(performance.now() - start)
    const message = err instanceof Error ? err.message : 'rpc threw unexpectedly'
    logger.error('rpc threw', {
      rpc: name,
      user_id: userId,
      duration_ms: duration,
      error: err,
    })
    return {
      data: null,
      error: { message },
    }
  }
}

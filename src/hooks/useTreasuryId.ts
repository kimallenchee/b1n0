/**
 * useTreasuryId — fetches the treasury account UUID from platform_config.
 *
 * The treasury UUID used to be hardcoded as
 * '00000000-0000-0000-0000-000000000001' in RevenuePanel and TreasuryPanel.
 * It now lives in `platform_config.value_text` keyed by 'treasury_account_id'
 * so it can be rotated without a deploy.
 *
 * Cached at module-level so navigating between admin panels doesn't
 * re-fetch on every mount. The cache is invalidated on:
 *   - Sign-out / sign-in (handled implicitly — admin panels remount)
 *   - Manual `refresh()` from a component that needs a fresh fetch
 *
 * Returns `{ treasuryId, loading, error, refresh }`.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

const FALLBACK_TREASURY_ID = '00000000-0000-0000-0000-000000000001'

let cachedId: string | null = null
let inflight: Promise<string | null> | null = null

async function fetchTreasuryId(): Promise<string | null> {
  if (cachedId) return cachedId
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('platform_config')
        .select('value_text')
        .eq('key', 'treasury_account_id')
        .maybeSingle()

      if (error) {
        logger.error('useTreasuryId: failed to load treasury_account_id', {
          error: error.message,
        })
        return null
      }

      const id = data?.value_text ?? null
      if (id) {
        cachedId = id
      } else {
        logger.warn('useTreasuryId: treasury_account_id not seeded — using fallback', {
          fallback: FALLBACK_TREASURY_ID,
        })
      }
      return id
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export interface UseTreasuryIdResult {
  /** The treasury account UUID, or null while loading. */
  treasuryId: string | null
  /** True while the first fetch is in flight. */
  loading: boolean
  /** Error message if the fetch failed (we still fall back). */
  error: string | null
  /** Force a re-read from platform_config (bypasses cache). */
  refresh: () => Promise<void>
}

/**
 * Get the treasury account ID. Falls back to the well-known UUID if
 * the config row is missing — keeps existing data consistent for
 * legacy ledger entries.
 */
export function useTreasuryId(): UseTreasuryIdResult {
  const [treasuryId, setTreasuryId] = useState<string | null>(cachedId)
  const [loading, setLoading] = useState<boolean>(cachedId === null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    cachedId = null
    setLoading(true)
    setError(null)
    try {
      const id = await fetchTreasuryId()
      setTreasuryId(id ?? FALLBACK_TREASURY_ID)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      setError(msg)
      setTreasuryId(FALLBACK_TREASURY_ID)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (cachedId) {
      setTreasuryId(cachedId)
      setLoading(false)
      return
    }
    let cancelled = false
    fetchTreasuryId()
      .then((id) => {
        if (cancelled) return
        setTreasuryId(id ?? FALLBACK_TREASURY_ID)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'unknown error'
        setError(msg)
        setTreasuryId(FALLBACK_TREASURY_ID)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { treasuryId, loading, error, refresh }
}

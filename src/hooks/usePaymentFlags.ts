/**
 * usePaymentFlags — reads the payment-rail feature flags from
 * platform_config and returns a typed object the UI can branch on.
 *
 * Each flag corresponds to a (rail, direction) pair. False = the UI
 * should show a "Próximamente" badge instead of letting the user
 * click through to a flow that would fail server-side (because the
 * vendor secrets aren't set yet).
 *
 * Flags change rarely (a contract gets signed, admin flips a switch).
 * We don't subscribe to realtime — a page refresh is acceptable. The
 * cost is one cheap SELECT on mount.
 *
 * Treats all values not-found / errored as `false` (safe default —
 * nothing in the UI lights up if the table is misconfigured).
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PaymentFlags {
  cardDeposits: boolean
  cardWithdrawals: boolean
  bankDeposits: boolean
  bankWithdrawals: boolean
  cryptoDeposits: boolean
  cryptoWithdrawals: boolean
  /** True while the initial fetch is still in flight; UI should show shimmer / skeleton. */
  loading: boolean
}

const DEFAULTS: PaymentFlags = {
  cardDeposits: false,
  cardWithdrawals: false,
  bankDeposits: false,
  bankWithdrawals: false,
  cryptoDeposits: false,
  cryptoWithdrawals: false,
  loading: true,
}

const FLAG_KEYS = [
  'card_deposits_enabled',
  'card_withdrawals_enabled',
  'bank_deposits_enabled',
  'bank_withdrawals_enabled',
  'crypto_deposits_enabled',
  'crypto_withdrawals_enabled',
] as const

export function usePaymentFlags(): PaymentFlags {
  const [flags, setFlags] = useState<PaymentFlags>(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('platform_config')
        .select('key, value')
        .in('key', [...FLAG_KEYS])
      if (cancelled) return
      if (error || !data) {
        setFlags({ ...DEFAULTS, loading: false })
        return
      }
      const map = new Map(data.map((r) => [r.key, r.value === 'true']))
      setFlags({
        cardDeposits:       map.get('card_deposits_enabled')       ?? false,
        cardWithdrawals:    map.get('card_withdrawals_enabled')    ?? false,
        bankDeposits:       map.get('bank_deposits_enabled')       ?? false,
        bankWithdrawals:    map.get('bank_withdrawals_enabled')    ?? false,
        cryptoDeposits:     map.get('crypto_deposits_enabled')     ?? false,
        cryptoWithdrawals:  map.get('crypto_withdrawals_enabled')  ?? false,
        loading: false,
      })
    }
    load()
    return () => { cancelled = true }
  }, [])

  return flags
}

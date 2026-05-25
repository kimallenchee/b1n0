/**
 * Payment-rail abstraction.
 *
 * Every cash-in / cash-out vendor (Redbajas for cards, Vudy for crypto,
 * eventually Wompi / Hugo / etc.) implements this interface. The rest
 * of b1n0 talks to a `PaymentRail` — never to a vendor SDK directly.
 *
 * Why: swapping vendors (or running multiple in parallel — e.g. cards
 * via Redbajas in SV, Wompi in GT) becomes a registration change, not
 * a refactor. The webhook handlers, ledger writes, and UI surfaces all
 * stay vendor-agnostic.
 *
 * Each vendor's implementation lives in src/lib/payments/<vendor>.ts.
 * Stubs throw NotImplemented until the corresponding vendor is signed
 * and credentials are in env. This file intentionally has no runtime
 * dependencies on any vendor — adding a new rail doesn't bloat the
 * bundle for users on a different rail.
 *
 * See docs/payments-architecture.md for the full design.
 */

/**
 * Common shape for the result of a quoted operation. Returned by
 * `quoteDeposit` and `quoteWithdrawal` so the UI can show "you'll
 * receive $X" before the user confirms.
 */
export interface RailQuote {
  /** Gross amount the user enters / sees. */
  grossAmount: number
  /** Provider + b1n0 fees combined. */
  feeAmount: number
  /** Network fees (crypto only). Always 0 for fiat rails. */
  networkFee: number
  /** What the user actually receives (or sends, for withdrawals). */
  netAmount: number
  currency: string
  /** Human-readable summary of the fee breakdown for UI display. */
  feeBreakdown: string
}

/**
 * Initiation context — what the rail needs to know to start a transfer.
 * Vendor-specific extras go in `metadata`.
 */
export interface DepositInitContext {
  userId: string
  amount: number
  currency: string
  /** Server-side request id for correlation in webhooks + logs. */
  idempotencyKey: string
  /** For crypto rails: which chain + token the user picked. */
  chain?: string
  token?: string
  metadata?: Record<string, unknown>
}

export interface WithdrawalInitContext {
  userId: string
  amount: number
  currency: string
  idempotencyKey: string
  /** Where the money is going — varies by rail. */
  destination: WithdrawalDestination
  metadata?: Record<string, unknown>
}

/**
 * Where a withdrawal lands. Discriminated union so the rail knows which
 * payout path to invoke.
 */
export type WithdrawalDestination =
  | { kind: 'card'; paymentMethodId: string }
  | { kind: 'bank'; paymentMethodId: string }
  | { kind: 'crypto'; address: string; chain: string; token: string }

/**
 * Result of initiating a deposit. The shape depends on the rail:
 *   - Cards return an iframe URL the UI mounts
 *   - Crypto returns a deposit address + QR
 *   - Bank transfer might return wire instructions
 */
export type DepositInitResult =
  | { kind: 'iframe'; url: string; sessionToken: string; expiresAt: string }
  | { kind: 'address'; address: string; chain: string; token: string; expiresAt: string }
  | { kind: 'instructions'; html: string }

export interface WithdrawalInitResult {
  /** Provider's tx id — same value goes into payment_transactions.provider_tx_id */
  providerTxId: string
  /** When we expect the funds to land at the destination. Estimate only. */
  estimatedSettleAt?: string
  /** True if vendor will fire a webhook on settlement (we should wait), false if not (poll). */
  webhookExpected: boolean
}

/**
 * Webhook verification result. Vendor implementations parse the raw
 * payload + signature and return either a typed event or a verification
 * failure that the inbound handler will reject.
 */
export type WebhookVerification =
  | {
      ok: true
      eventType: string
      /** Idempotency: same external_id = same event, dedup at vendor_webhooks table. */
      externalId: string
      /** Decoded payload, vendor-specific. */
      data: unknown
    }
  | { ok: false; reason: string }

/**
 * The core interface every payment rail implements.
 */
export interface PaymentRail {
  /** Short id used in payment_methods.provider, vendor_webhooks.provider, etc. */
  readonly providerName: string

  /** Which rail this serves — for routing in the UI. */
  readonly railKind: 'card' | 'bank' | 'crypto'

  /**
   * Tell the UI what a deposit / withdrawal would cost the user without
   * actually moving money. Used to render confirmation screens.
   */
  quoteDeposit(amount: number, currency: string): Promise<RailQuote>
  quoteWithdrawal(amount: number, currency: string, destination?: WithdrawalDestination): Promise<RailQuote>

  /**
   * Start a deposit. The rail returns whatever the UI needs to complete
   * the user's side of the flow (iframe, QR code, wire instructions).
   */
  initiateDeposit(ctx: DepositInitContext): Promise<DepositInitResult>

  /**
   * Start a withdrawal. Returns the provider tx id and an estimated
   * settle time; actual settlement comes via webhook (`webhookExpected:
   * true`) or polling (`webhookExpected: false`).
   */
  initiateWithdrawal(ctx: WithdrawalInitContext): Promise<WithdrawalInitResult>

  /**
   * Verify an inbound webhook. Vendor implementations do the signature
   * dance; the inbound handler in supabase/functions/payment-webhook
   * stores the raw payload first, then calls this for processing.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookVerification
}

/**
 * Rail registry — maps providerName to its implementation. The
 * top-level handler picks the right rail at runtime based on either
 * the user's choice (deposit UI) or the payment_method/payment_tx row
 * (webhook handler).
 *
 * Implementations register themselves here when their module loads.
 */
const registry = new Map<string, PaymentRail>()

export function registerRail(rail: PaymentRail): void {
  if (registry.has(rail.providerName)) {
    // Replace rather than warn — useful for tests + hot reload.
  }
  registry.set(rail.providerName, rail)
}

export function getRail(providerName: string): PaymentRail {
  const rail = registry.get(providerName)
  if (!rail) {
    throw new Error(
      `[payments] No rail registered for "${providerName}". ` +
        `Registered rails: ${Array.from(registry.keys()).join(', ') || '(none)'}`,
    )
  }
  return rail
}

export function listRails(filter?: { railKind?: PaymentRail['railKind'] }): PaymentRail[] {
  const all = Array.from(registry.values())
  if (!filter?.railKind) return all
  return all.filter((r) => r.railKind === filter.railKind)
}

/**
 * Sentinel error class for stub rails — lets the UI distinguish
 * "vendor not yet integrated" from "vendor errored out" so we can
 * show a clean "próximamente" message instead of a stack trace.
 */
export class RailNotImplementedError extends Error {
  constructor(public readonly providerName: string, public readonly capability: string) {
    super(`[payments] ${providerName}: ${capability} not yet implemented`)
    this.name = 'RailNotImplementedError'
  }
}

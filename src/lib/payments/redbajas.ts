/**
 * Redbajas / Pagadito rail — card payments for Central America.
 *
 * Status: STUB — interface registered, methods throw RailNotImplementedError
 * until vendor credentials land in env.
 *
 * Integration notes (per uploads/REDBAJAS Payment Services API Integration
 * Manual Mar26.pdf):
 *
 *   - OAuth2 client_credentials at POST {host}/oauth/token
 *   - Setup payer at POST {host}/api/payments
 *   - User completes payment in iframe at sandbox-payer.pagadito.com or
 *     payer.pagadito.com
 *   - Sandbox: https://sandbox-api.redbaja.com/
 *   - Production: https://api.redbaja.com/
 *
 * Wiring when ready:
 *   1. Add VITE_REDBAJAS_CLIENT_ID + VITE_REDBAJAS_CLIENT_SECRET to env
 *   2. Implement quoteDeposit (return processor fee from rate card)
 *   3. Implement initiateDeposit → call /oauth/token → /api/payments → return iframe URL
 *   4. Implement verifyWebhook (Pagadito sends a signature header — verify HMAC)
 *   5. Withdrawals: confirm with Redbajas if Pagadito supports payouts;
 *      if not, queue for manual ACH/wire from FBO account.
 *
 * Edge function lives at supabase/functions/redbajas-webhook/index.ts.
 */

import {
  registerRail,
  RailNotImplementedError,
  type DepositInitContext,
  type DepositInitResult,
  type PaymentRail,
  type RailQuote,
  type WebhookVerification,
  type WithdrawalInitContext,
  type WithdrawalInitResult,
} from './rails'

class RedbajasRail implements PaymentRail {
  readonly providerName = 'redbajas'
  readonly railKind = 'card' as const

  async quoteDeposit(amount: number, currency: string): Promise<RailQuote> {
    // Placeholder fee model — replace with actual rate-card on integration.
    // Typical CA card processor: 2.9% + $0.30.
    const feeAmount = Math.max(0.3, amount * 0.029)
    return {
      grossAmount: amount,
      feeAmount,
      networkFee: 0,
      netAmount: amount - feeAmount,
      currency,
      feeBreakdown: `Tarifa de procesamiento: ${currency} ${feeAmount.toFixed(2)}`,
    }
  }

  async quoteWithdrawal(amount: number, currency: string): Promise<RailQuote> {
    // Payouts to card / bank typically cost more than acquiring. Placeholder.
    const feeAmount = Math.max(0.5, amount * 0.015)
    return {
      grossAmount: amount,
      feeAmount,
      networkFee: 0,
      netAmount: amount - feeAmount,
      currency,
      feeBreakdown: `Tarifa de retiro: ${currency} ${feeAmount.toFixed(2)}`,
    }
  }

  async initiateDeposit(_ctx: DepositInitContext): Promise<DepositInitResult> {
    throw new RailNotImplementedError(this.providerName, 'initiateDeposit')
  }

  async initiateWithdrawal(_ctx: WithdrawalInitContext): Promise<WithdrawalInitResult> {
    throw new RailNotImplementedError(this.providerName, 'initiateWithdrawal')
  }

  verifyWebhook(_rawBody: string, _headers: Record<string, string>): WebhookVerification {
    return { ok: false, reason: 'redbajas verifyWebhook not yet implemented' }
  }
}

registerRail(new RedbajasRail())

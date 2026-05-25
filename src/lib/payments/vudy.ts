/**
 * Vudy rail — crypto / stablecoin payments via fiat ↔ crypto API.
 *
 * Status: STUB — interface registered, methods throw RailNotImplementedError
 * until vendor credentials land in env.
 *
 * Integration notes (per landing.vudy.app):
 *
 *   - Payments API: fiat ↔ crypto end-to-end ramps
 *   - Send API: $0.30 per transfer + network fees
 *   - Supports 14+ chains; b1n0 should restrict to low-fee chains for UX:
 *     Polygon (USDC) and Tron (USDT) are the obvious picks for CA users
 *   - Vudy is NOT a custodian — Tres33 needs a treasury wallet
 *     (via Monetae custody or Fireblocks direct) at the receiving end
 *
 * Wiring when ready:
 *   1. Add VITE_VUDY_API_KEY + VITE_VUDY_WEBHOOK_SECRET to env
 *   2. Ensure crypto_treasury_wallets has fbo_inbound + fbo_outbound rows
 *      for each (chain, token) pair we support
 *   3. Implement initiateDeposit → call Vudy "create deposit address" → return address + QR
 *   4. Implement initiateWithdrawal → call Vudy Send API → return tx hash
 *   5. Implement verifyWebhook (HMAC on raw body, secret rotation supported)
 *
 * Edge function lives at supabase/functions/vudy-webhook/index.ts.
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

class VudyRail implements PaymentRail {
  readonly providerName = 'vudy'
  readonly railKind = 'crypto' as const

  async quoteDeposit(amount: number, currency: string): Promise<RailQuote> {
    // Crypto deposits: Vudy typically charges 0.25–0.5% on the routing,
    // plus the inbound network fee is paid by the sender (the user's
    // wallet) so it's $0 from b1n0's perspective.
    const feeAmount = amount * 0.005
    return {
      grossAmount: amount,
      feeAmount,
      networkFee: 0,
      netAmount: amount - feeAmount,
      currency,
      feeBreakdown: `Comisión Vudy: ${currency} ${feeAmount.toFixed(2)}`,
    }
  }

  async quoteWithdrawal(amount: number, currency: string): Promise<RailQuote> {
    // Send: $0.30 fixed + network fee. Polygon ~$0.01, Tron ~$1.
    // Placeholder uses Polygon-style fee — actual chain comes from destination.
    const vudyFee = 0.3
    const networkFee = 0.05
    return {
      grossAmount: amount,
      feeAmount: vudyFee,
      networkFee,
      netAmount: amount - vudyFee - networkFee,
      currency,
      feeBreakdown:
        `Comisión Vudy: ${currency} ${vudyFee.toFixed(2)} · ` +
        `Comisión de red: ${currency} ${networkFee.toFixed(2)}`,
    }
  }

  async initiateDeposit(_ctx: DepositInitContext): Promise<DepositInitResult> {
    throw new RailNotImplementedError(this.providerName, 'initiateDeposit')
  }

  async initiateWithdrawal(_ctx: WithdrawalInitContext): Promise<WithdrawalInitResult> {
    throw new RailNotImplementedError(this.providerName, 'initiateWithdrawal')
  }

  verifyWebhook(_rawBody: string, _headers: Record<string, string>): WebhookVerification {
    return { ok: false, reason: 'vudy verifyWebhook not yet implemented' }
  }
}

registerRail(new VudyRail())

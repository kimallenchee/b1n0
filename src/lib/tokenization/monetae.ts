/**
 * Monetae tokenization provider — primary candidate for b1n0's
 * tokenization layer.
 *
 * Status: STUB — interface registered, methods throw
 * TokenizationNotImplementedError until vendor contract is signed and
 * the CTF (or equivalent) implementation is delivered.
 *
 * Integration notes (per monetae.io):
 *
 *   - Salvadoran legal entity: FINTECH AMERICAS, S.A. de C.V.
 *   - Licenses: CNAD PSAD + BCR PSB, supervised by SSF
 *   - Custody: Fireblocks MPC + cold storage
 *   - KYC stack: Sumsub (potential bridge with our Didit)
 *   - KYT: Chainalysis
 *
 * Open vendor questions (see docs/payments-architecture.md §7) — confirm
 * on sales call BEFORE wiring this implementation:
 *
 *   1. Do they natively support binary outcome / conditional tokens
 *      (CTF), or only RWA (real estate, debt, equity, carbon)?
 *   2. Per-event cost — flat per deploy or per-mint?
 *   3. KYC bridging from Didit?
 *   4. Smart wallet provisioning — their own or partner with Privy?
 *   5. Resolver authority model (we want 2-of-3 multisig)
 *   6. Time-to-first-tokenized-event from signing?
 *
 * Wiring when ready:
 *   1. Add VITE_MONETAE_API_KEY + VITE_MONETAE_TENANT_ID to env
 *   2. Provision Tres33 treasury wallets in crypto_treasury_wallets table
 *   3. Implement deployEventTokens → call Monetae API to spawn CTF + record event_tokens row
 *   4. Implement mintOutcomeTokens → Monetae mint API
 *   5. Implement resolveEvent → Monetae resolve API (requires Tres33 multisig signer)
 *   6. Implement redeem → Monetae redeem API (b1n0 calls on behalf of user)
 *   7. Wire setActiveProvider(new MonetaeProvider()) in main.tsx
 *
 * Edge function lives at supabase/functions/monetae-webhook/index.ts
 * (event resolution notifications, mint confirmations, etc.).
 */

import {
  TokenizationNotImplementedError,
  type DeployEventTokensParams,
  type DeployEventTokensResult,
  type MintParams,
  type MintResult,
  type RedeemParams,
  type RedeemResult,
  type ResolveParams,
  type ResolveResult,
  type TokenizationProvider,
} from './provider'

export class MonetaeProvider implements TokenizationProvider {
  readonly providerName = 'monetae'

  async deployEventTokens(_params: DeployEventTokensParams): Promise<DeployEventTokensResult> {
    throw new TokenizationNotImplementedError(this.providerName, 'deployEventTokens')
  }

  async mintOutcomeTokens(_params: MintParams): Promise<MintResult> {
    throw new TokenizationNotImplementedError(this.providerName, 'mintOutcomeTokens')
  }

  async resolveEvent(_params: ResolveParams): Promise<ResolveResult> {
    throw new TokenizationNotImplementedError(this.providerName, 'resolveEvent')
  }

  async redeem(_params: RedeemParams): Promise<RedeemResult> {
    throw new TokenizationNotImplementedError(this.providerName, 'redeem')
  }

  async getTokenBalance(_walletAddress: string, _tokenId: string): Promise<number> {
    throw new TokenizationNotImplementedError(this.providerName, 'getTokenBalance')
  }
}

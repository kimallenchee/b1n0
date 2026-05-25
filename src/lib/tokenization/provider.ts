/**
 * Tokenization-provider abstraction.
 *
 * The provider (Monetae as primary candidate; Tohkn or Tokeny as
 * alternatives) is responsible for:
 *
 *   1. Deploying a per-event token contract (CTF or equivalent) when a
 *      new event is created
 *   2. Minting outcome tokens to a user's wallet when they take a
 *      position, locking USDC collateral in the contract
 *   3. Burning losing tokens / enabling redemption of winning tokens
 *      when an event resolves
 *
 * b1n0 talks to a `TokenizationProvider` — never to a vendor SDK
 * directly. This isolates the rest of the codebase from whichever
 * vendor we sign and from the smart-contract specifics.
 *
 * See docs/payments-architecture.md §4.5 for the position lifecycle.
 */

export interface DeployEventTokensParams {
  eventId: string
  question: string
  /** 'binary' = YES/NO. 'open' = multi-option (each option gets its own pair). */
  eventKind: 'binary' | 'open'
  /** For open events: the option labels (each spawns YES/NO). */
  optionLabels?: string[]
  collateralToken: 'USDC' | 'USDT'
  chain: string
  /** Address(es) authorized to call resolve() — multisig recommended. */
  resolverAddress: string
  /** Optional: an explicit oracle. NULL = resolver address is the oracle. */
  oracleAddress?: string
}

export interface DeployEventTokensResult {
  contractAddress: string
  conditionId: string
  /** For binary events. */
  yesTokenId?: string
  noTokenId?: string
  /** For open events. */
  optionTokenIds?: string[]
  /** Transaction hash of the deployment. */
  deployTxHash: string
}

export interface MintParams {
  eventId: string
  walletAddress: string
  /** 'yes' / 'no' for binary; option label for open events. */
  side: string
  /** Number of outcome tokens to mint (= USDC amount for fixed-payout markets). */
  tokenAmount: number
  /** USDC collateral being locked (= tokenAmount for $1 fixed-payout tokens). */
  collateralUsdc: number
  /** Internal correlation id — passed back in the mint event for matching. */
  idempotencyKey: string
}

export interface MintResult {
  txHash: string
  /** Block confirmation time if available; otherwise estimated. */
  confirmedAt?: string
}

export interface ResolveParams {
  eventId: string
  /** Winning side for binary; winning option label for open. */
  winningSide: string
}

export interface ResolveResult {
  txHash: string
  /** True when the resolver tx mined; false when it's been broadcast but not confirmed. */
  confirmed: boolean
}

export interface RedeemParams {
  eventId: string
  walletAddress: string
  /** Which token id to redeem (winning side). */
  tokenId: string
  amount: number
}

export interface RedeemResult {
  txHash: string
  /** USDC actually received by the wallet. */
  usdcReceived: number
}

/**
 * The interface every tokenization vendor implements.
 */
export interface TokenizationProvider {
  readonly providerName: string

  /**
   * Spawn the on-chain artifacts for a newly-created event. Called by
   * AdminPage / event-create RPC immediately after a new event row is
   * inserted in the events table.
   */
  deployEventTokens(params: DeployEventTokensParams): Promise<DeployEventTokensResult>

  /**
   * Mint outcome tokens to a user's wallet when they take a position.
   * Called from the buy-flow RPC after the user's balance has been
   * debited and the position row created (onchain_status='pending_mint').
   *
   * On success the position row flips to onchain_status='minted' with
   * the mint_tx_hash recorded.
   */
  mintOutcomeTokens(params: MintParams): Promise<MintResult>

  /**
   * Trigger event resolution on-chain. Called from settle_event() once
   * the off-chain resolution has been determined.
   *
   * Only authorized resolvers (the multisig) can successfully call this
   * on the contract. The provider's API typically queues the
   * transaction and a co-signer (Monetae's key) approves before broadcast.
   */
  resolveEvent(params: ResolveParams): Promise<ResolveResult>

  /**
   * Redeem a winning position for USDC. Called by b1n0 on behalf of the
   * user (gas paid by paymaster) when their event settles in their
   * favor — converts the on-chain YES tokens into USDC in the user's
   * wallet, which the user can then withdraw via the Vudy rail.
   */
  redeem(params: RedeemParams): Promise<RedeemResult>

  /**
   * Read the on-chain balance of a wallet for a specific event token.
   * Used for reconciliation between Postgres positions and on-chain
   * state — these should always agree.
   */
  getTokenBalance(walletAddress: string, tokenId: string): Promise<number>
}

let activeProvider: TokenizationProvider | null = null

export function setActiveProvider(provider: TokenizationProvider): void {
  activeProvider = provider
}

export function getActiveProvider(): TokenizationProvider {
  if (!activeProvider) {
    throw new TokenizationNotConfiguredError()
  }
  return activeProvider
}

export function hasActiveProvider(): boolean {
  return activeProvider !== null
}

export class TokenizationNotConfiguredError extends Error {
  constructor() {
    super(
      '[tokenization] No active TokenizationProvider. ' +
        'Tokenization is in Phase 0 (scaffolding) — vendor (Monetae) not yet wired.',
    )
    this.name = 'TokenizationNotConfiguredError'
  }
}

export class TokenizationNotImplementedError extends Error {
  constructor(public readonly providerName: string, public readonly capability: string) {
    super(`[tokenization] ${providerName}: ${capability} not yet implemented`)
    this.name = 'TokenizationNotImplementedError'
  }
}

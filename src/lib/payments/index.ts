/**
 * Payment + tokenization bootstrap.
 *
 * Importing this file once at app startup registers every vendor stub
 * so the rest of the codebase can call `getRail('redbajas')` or
 * `getActiveProvider()` without needing to know which vendors exist.
 *
 * Order of imports matters only when two vendors are registered for
 * the same providerName (last-wins). We don't have that today.
 */

// Side-effect imports — each file calls registerRail() on load.
import './redbajas'
import './vudy'

// Re-exports for ergonomic consumption.
export {
  getRail,
  listRails,
  RailNotImplementedError,
  type PaymentRail,
  type RailQuote,
  type DepositInitContext,
  type WithdrawalInitContext,
  type DepositInitResult,
  type WithdrawalInitResult,
  type WithdrawalDestination,
  type WebhookVerification,
} from './rails'

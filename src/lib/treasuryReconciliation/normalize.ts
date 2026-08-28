/**
 * Deterministic normalization: raw Horizon records → LedgerPosting[].
 *
 * Every function here is pure (no network, no Date.now() outside of what's
 * passed in) so the mapping from ledger activity to postings is fully
 * reproducible and unit-testable without touching the network. Nothing in
 * this file makes a prediction or estimate — every posting is a direct,
 * traceable transformation of a specific Horizon record, recorded in
 * `provenance`.
 */

import type { Horizon } from '@stellar/stellar-sdk';
import type { LedgerPosting, TreasuryAsset } from '../../types/treasury';
import { NATIVE_ASSET } from '../../types/treasury';

type OperationRecord = Horizon.ServerApi.OperationRecord;
type TransactionRecord = Horizon.ServerApi.TransactionRecord;
type TradeRecord = Horizon.ServerApi.TradeRecord;
type EffectRecord = Horizon.ServerApi.EffectRecord;

// ─── Asset helpers ──────────────────────────────────────────────────────────────

export function assetFromParts(
  assetType: string | undefined,
  assetCode: string | undefined,
  assetIssuer: string | undefined
): TreasuryAsset {
  if (!assetType || assetType === 'native') return NATIVE_ASSET;
  if (assetType === 'liquidity_pool_shares') {
    return { kind: 'liquidity_pool', code: assetCode || 'LP', decimals: 7 };
  }
  const code = assetCode || 'UNKNOWN';
  const issuer = assetIssuer;
  return {
    kind: 'credit',
    code: issuer ? `${code}:${issuer}` : code,
    issuer,
    decimals: 7,
  };
}

function negate(amount: string): string {
  if (amount.startsWith('-')) return amount.slice(1);
  if (amount === '0' || Number(amount) === 0) return amount;
  return `-${amount}`;
}

let postingSequence = 0;
function postingId(prefix: string): string {
  postingSequence += 1;
  return `${prefix}-${postingSequence.toString(36)}`;
}

/** Resets the internal id sequence; call between independent test runs so ids are deterministic. */
export function resetPostingIdSequence(): void {
  postingSequence = 0;
}

// ─── Operations → postings (payments, path payments, claimable balances, contract transfers, account changes) ──

export function normalizeOperations(
  accountId: string,
  operations: OperationRecord[]
): LedgerPosting[] {
  const postings: LedgerPosting[] = [];

  for (const op of operations) {
    const base = {
      txHash: op.transaction_hash,
      operationId: op.id,
      timestamp: op.created_at,
      successful: op.transaction_successful !== false,
      // ledger isn't on the operation record; callers that need it (grouping
      // by ledger) should join against a fetched transaction. Default to 0
      // rather than making it required, since most postings key on timestamp.
      ledger: 0,
    };

    if (op.type === 'payment') {
      const isOutgoing = op.from === accountId;
      const asset = assetFromParts(op.asset_type, op.asset_code, op.asset_issuer);
      postings.push({
        id: postingId('pay'),
        ...base,
        kind: 'payment',
        asset,
        amount: isOutgoing ? negate(op.amount) : op.amount,
        counterparty: isOutgoing ? op.to : op.from,
        provenance: { sourceType: 'operation', sourceId: op.id },
      });
      continue;
    }

    if (op.type === 'path_payment_strict_receive' || op.type === 'path_payment_strict_send') {
      const isOutgoing = op.from === accountId;
      const asset = assetFromParts(op.asset_type, op.asset_code, op.asset_issuer);
      postings.push({
        id: postingId('ppay'),
        ...base,
        kind: 'path_payment',
        asset,
        amount: isOutgoing ? negate(op.amount) : op.amount,
        counterparty: isOutgoing ? op.to : op.from,
        provenance: { sourceType: 'operation', sourceId: op.id },
      });
      continue;
    }

    if (op.type === 'create_claimable_balance') {
      const [assetCode, issuer] = op.asset === 'native' ? ['XLM', undefined] : op.asset.split(':');
      postings.push({
        id: postingId('cbc'),
        ...base,
        kind: 'claimable_balance_create',
        asset: op.asset === 'native' ? NATIVE_ASSET : { kind: 'credit', code: `${assetCode}:${issuer}`, issuer, decimals: 7 },
        amount: negate(op.amount),
        counterparty: op.claimants?.[0]?.destination,
        provenance: { sourceType: 'operation', sourceId: op.id },
      });
      continue;
    }

    if (op.type === 'claim_claimable_balance') {
      // Horizon doesn't echo the claimed amount/asset on the operation
      // itself; the actual balance delta is recovered from the paired
      // account_credited effect (see normalizeEffects). Emit a
      // zero-amount marker posting so the claim is still visible/traceable
      // even when effects aren't available, and flag it for review.
      postings.push({
        id: postingId('cbcl'),
        ...base,
        kind: 'claimable_balance_claim',
        asset: NATIVE_ASSET,
        amount: '0',
        provenance: { sourceType: 'operation', sourceId: op.id },
        needsReview: true,
        reviewReason: 'Claimed amount/asset resolved from account_credited effects, not yet joined.',
      });
      continue;
    }

    if (
      op.type === 'begin_sponsoring_future_reserves' ||
      op.type === 'end_sponsoring_future_reserves' ||
      op.type === 'revoke_sponsorship'
    ) {
      postings.push({
        id: postingId('spon'),
        ...base,
        kind: 'sponsorship',
        asset: NATIVE_ASSET,
        amount: '0',
        counterparty:
          op.type === 'begin_sponsoring_future_reserves'
            ? op.sponsored_id
            : op.type === 'end_sponsoring_future_reserves'
              ? op.begin_sponsor
              : op.account_id,
        provenance: { sourceType: 'operation', sourceId: op.id },
      });
      continue;
    }

    if (op.type === 'invoke_host_function') {
      const changes = op.asset_balance_changes || [];
      if (changes.length === 0) continue;
      for (const change of changes) {
        if (change.type !== 'transfer' && change.type !== 'mint' && change.type !== 'burn' && change.type !== 'clawback') {
          continue;
        }
        const involvesAccount = change.from === accountId || change.to === accountId;
        if (!involvesAccount) continue;
        const isOutgoing = change.from === accountId;
        const asset = assetFromParts(change.asset_type, change.asset_code, change.asset_issuer);
        postings.push({
          id: postingId('ctr'),
          ...base,
          kind: 'contract_transfer',
          asset,
          amount: isOutgoing ? negate(change.amount) : change.amount,
          counterparty: isOutgoing ? change.to : change.from,
          provenance: { sourceType: 'operation', sourceId: op.id, note: `balance-change:${change.type}` },
        });
      }
      continue;
    }

    if (
      op.type === 'create_account' ||
      op.type === 'account_merge' ||
      op.type === 'set_options' ||
      op.type === 'change_trust' ||
      op.type === 'allow_trust' ||
      op.type === 'set_trust_line_flags'
    ) {
      const amount =
        op.type === 'create_account'
          ? op.account === accountId
            ? op.starting_balance
            : negate(op.starting_balance)
          : '0';
      postings.push({
        id: postingId('acct'),
        ...base,
        kind: 'account_change',
        asset: NATIVE_ASSET,
        amount,
        counterparty: op.type === 'create_account' ? (op.account === accountId ? op.funder : op.account) : undefined,
        provenance: { sourceType: 'operation', sourceId: op.id, note: op.type },
      });
      continue;
    }
    // Any other operation type (offers, data entries, etc.) does not itself
    // move a traceable asset balance for reconciliation purposes and is
    // intentionally not turned into a posting.
  }

  return postings;
}

// ─── Transactions → fee postings ────────────────────────────────────────────────

export function normalizeTransactionFees(
  accountId: string,
  transactions: TransactionRecord[]
): LedgerPosting[] {
  const postings: LedgerPosting[] = [];
  for (const tx of transactions) {
    if (tx.source_account !== accountId) continue;
    const feeCharged = String(tx.fee_charged ?? '0');
    if (feeCharged === '0') continue;
    // fee_charged is in stroops (integer); convert to the 7-decimal amount format.
    const decimalFee = (Number(feeCharged) / 10_000_000).toFixed(7);
    postings.push({
      id: postingId('fee'),
      txHash: tx.hash,
      // `TransactionRecord.ledger` is overridden by the Horizon SDK's
      // ServerApi variant into a `CallFunction<LedgerRecord>` (a fetch
      // helper); the actual ledger sequence number lives at `ledger_attr`.
      ledger: tx.ledger_attr,
      timestamp: tx.created_at,
      kind: 'fee',
      asset: NATIVE_ASSET,
      amount: negate(decimalFee),
      successful: tx.successful,
      memo: tx.memo,
      provenance: { sourceType: 'transaction-fee', sourceId: tx.hash },
      needsReview: !tx.successful,
      reviewReason: !tx.successful ? 'Fee charged on a failed transaction.' : undefined,
    });
  }
  return postings;
}

// ─── Trades → postings ──────────────────────────────────────────────────────────

export function normalizeTrades(accountId: string, trades: TradeRecord[]): LedgerPosting[] {
  const postings: LedgerPosting[] = [];
  for (const trade of trades) {
    const accountIsBase = trade.base_account === accountId;
    const accountIsCounter = trade.counter_account === accountId;
    if (!accountIsBase && !accountIsCounter) continue;

    const soldSide = accountIsBase
      ? { amount: trade.base_amount, type: trade.base_asset_type, code: trade.base_asset_code, issuer: trade.base_asset_issuer }
      : { amount: trade.counter_amount, type: trade.counter_asset_type, code: trade.counter_asset_code, issuer: trade.counter_asset_issuer };
    const boughtSide = accountIsBase
      ? { amount: trade.counter_amount, type: trade.counter_asset_type, code: trade.counter_asset_code, issuer: trade.counter_asset_issuer }
      : { amount: trade.base_amount, type: trade.base_asset_type, code: trade.base_asset_code, issuer: trade.base_asset_issuer };

    // base_is_seller tells us whether the base side SOLD the base asset; use
    // it to decide which side of this account's trade is the outflow.
    const accountSold = accountIsBase ? trade.base_is_seller : !trade.base_is_seller;
    const timestamp = trade.ledger_close_time;
    const counterparty = accountIsBase ? trade.counter_account : trade.base_account;

    postings.push({
      id: postingId('trd'),
      txHash: trade.id.split('-')[0] || trade.id,
      operationId: trade.id,
      ledger: 0,
      timestamp,
      kind: 'trade',
      asset: assetFromParts(soldSide.type, soldSide.code, soldSide.issuer),
      amount: accountSold ? negate(soldSide.amount) : boughtSide.amount,
      counterparty,
      successful: true,
      provenance: { sourceType: 'trade', sourceId: trade.id },
    });
    postings.push({
      id: postingId('trd'),
      txHash: trade.id.split('-')[0] || trade.id,
      operationId: trade.id,
      ledger: 0,
      timestamp,
      kind: 'trade',
      asset: assetFromParts(boughtSide.type, boughtSide.code, boughtSide.issuer),
      amount: accountSold ? boughtSide.amount : negate(soldSide.amount),
      counterparty,
      successful: true,
      provenance: { sourceType: 'trade', sourceId: trade.id },
    });
  }
  return postings;
}

// ─── Effects → sponsorship / claim postings ─────────────────────────────────────

const SPONSORSHIP_EFFECT_TYPES = new Set([
  'account_sponsorship_created',
  'account_sponsorship_updated',
  'account_sponsorship_removed',
  'trustline_sponsorship_created',
  'trustline_sponsorship_updated',
  'trustline_sponsorship_removed',
  'data_sponsorship_created',
  'data_sponsorship_updated',
  'data_sponsorship_removed',
  'claimable_balance_sponsorship_created',
  'claimable_balance_sponsorship_updated',
  'claimable_balance_sponsorship_removed',
  'signer_sponsorship_created',
  'signer_sponsorship_updated',
  'signer_sponsorship_removed',
]);

export interface EffectRecordLike extends Record<string, unknown> {
  id: string;
  type: string;
  account: string;
  created_at: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  sponsor?: string;
  new_sponsor?: string;
  former_sponsor?: string;
}

export function normalizeEffects(accountId: string, effects: EffectRecord[]): LedgerPosting[] {
  const postings: LedgerPosting[] = [];
  for (const raw of effects) {
    const effect = raw as unknown as EffectRecordLike;
    if (effect.account !== accountId) continue;

    if (SPONSORSHIP_EFFECT_TYPES.has(effect.type)) {
      postings.push({
        id: postingId('sponeff'),
        txHash: effect.id.split('-')[0] || effect.id,
        ledger: 0,
        timestamp: effect.created_at,
        kind: 'sponsorship',
        asset: NATIVE_ASSET,
        amount: '0',
        counterparty: effect.sponsor || effect.new_sponsor || effect.former_sponsor,
        successful: true,
        provenance: { sourceType: 'effect', sourceId: effect.id, note: effect.type },
      });
      continue;
    }

    if (effect.type === 'claimable_balance_claimed' && typeof effect.amount === 'string') {
      postings.push({
        id: postingId('cbclaimed'),
        txHash: effect.id.split('-')[0] || effect.id,
        ledger: 0,
        timestamp: effect.created_at,
        kind: 'claimable_balance_claim',
        asset: assetFromParts(effect.asset_type, effect.asset_code, effect.asset_issuer),
        amount: effect.amount,
        successful: true,
        provenance: { sourceType: 'effect', sourceId: effect.id },
      });
    }
  }
  return postings;
}

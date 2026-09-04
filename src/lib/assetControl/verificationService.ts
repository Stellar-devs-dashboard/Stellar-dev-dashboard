/**
 * Verification Service — Dry-run summaries, offline envelopes,
 * and post-operation verification.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getServer, NETWORKS, type NetworkName } from '../stellar';
import type {
  OperationEnvelope,
  OperationSummary,
  OperationType,
  AssetIdentifier,
} from '../../types/assetControl';
import { ASSET_CONTROL_SCHEMA_VERSION } from '../../types/assetControl';

// ─── Dry-Run Summary Builder ─────────────────────────────────────────────────

/**
 * Inspect a transaction XDR and produce a human-readable summary with
 * warnings for the review step.
 */
export function buildDryRunSummary(
  xdr: string,
  networkPassphrase: string,
): OperationSummary {
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    xdr,
    networkPassphrase,
  ) as StellarSdk.Transaction;

  const ops = tx.operations;
  if (ops.length === 0) {
    return {
      type: 'payment',
      description: 'Empty transaction — no operations.',
      warnings: ['Transaction has no operations.'],
      fields: {},
    };
  }

  const op = ops[0];
  const type = mapOperationType(op.type);
  const warnings: string[] = [];
  const fields: Record<string, string> = {};

  fields['Source Account'] = redactMiddle(tx.source);
  fields['Operations'] = String(ops.length);
  fields['Fee'] = `${(parseInt(tx.fee, 10) / 10_000_000).toFixed(7)} XLM`;

  if (tx.timeBounds) {
    fields['Time Bounds'] = `${tx.timeBounds.minTime} — ${tx.timeBounds.maxTime}`;
  }

  // Specific operation introspection
  switch (op.type) {
    case 'setOptions': {
      const setOp = op as StellarSdk.Operation.SetOptions;
      if (setOp.masterWeight === 0) {
        warnings.push(
          '⚠ IRREVERSIBLE: Setting master weight to 0 permanently locks this account.',
        );
      }
      if ((setOp as any).setFlags !== undefined) {
        fields['Set Flags'] = String((setOp as any).setFlags);
      }
      if ((setOp as any).clearFlags !== undefined) {
        fields['Clear Flags'] = String((setOp as any).clearFlags);
      }
      break;
    }

    case 'payment': {
      const payOp = op as StellarSdk.Operation.Payment;
      fields['Destination'] = redactMiddle(payOp.destination);
      fields['Amount'] = payOp.amount;
      fields['Asset'] = payOp.asset.isNative()
        ? 'XLM'
        : `${payOp.asset.code}:${redactMiddle(payOp.asset.issuer)}`;
      break;
    }

    case 'setTrustLineFlags': {
      const trustOp = op as StellarSdk.Operation.SetTrustLineFlags;
      fields['Trustor'] = redactMiddle(trustOp.trustor);
      fields['Asset'] = trustOp.asset.isNative()
        ? 'XLM'
        : `${trustOp.asset.code}:${redactMiddle(trustOp.asset.issuer)}`;
      break;
    }

    case 'clawback': {
      const clawOp = op as StellarSdk.Operation.Clawback;
      fields['From'] = redactMiddle(clawOp.from);
      fields['Amount'] = clawOp.amount;
      fields['Asset'] = clawOp.asset.isNative()
        ? 'XLM'
        : `${clawOp.asset.code}:${redactMiddle(clawOp.asset.issuer)}`;
      warnings.push('Clawback will remove tokens from the target account.');
      break;
    }

    default:
      fields['Operation Type'] = op.type;
  }

  return {
    type,
    description: buildDescription(type, fields),
    warnings,
    fields,
  };
}

// ─── Offline Envelope ────────────────────────────────────────────────────────

/**
 * Package an unsigned transaction into a portable envelope for offline
 * or hardware wallet signing.
 */
export function buildOperationEnvelope(
  xdr: string,
  networkPassphrase: string,
  requiredSigners: string[],
): OperationEnvelope {
  const summary = buildDryRunSummary(xdr, networkPassphrase);
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    xdr,
    networkPassphrase,
  ) as StellarSdk.Transaction;

  return {
    schemaVersion: ASSET_CONTROL_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    xdr,
    summary,
    requiredSigners: requiredSigners.map(redactMiddle),
    networkPassphrase,
    sourceAccount: redactMiddle(tx.source),
  };
}

// ─── Post-Operation Verification ─────────────────────────────────────────────

export interface VerificationResult {
  verified: boolean;
  txHash: string;
  ledger: number;
  operationResults: string[];
  error?: string;
}

/**
 * Verify a submitted transaction was included in a ledger and inspect
 * its result codes.
 */
export async function verifyTransaction(
  txHash: string,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<VerificationResult> {
  const server = getServer(network);

  try {
    const txRecord = await server.transactions().transaction(txHash).call();

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const successful = (txRecord as any).successful ?? false;
    const ledger = (txRecord as any).ledger ?? 0;

    // Extract operation result codes
    const resultXdr = (txRecord as any).result_xdr ?? '';
    let operationResults: string[] = [];
    try {
      const resultMeta = (txRecord as any).result_meta_xdr;
      if (resultMeta) {
        operationResults = ['Result XDR present — decode for details'];
      }
    } catch {
      // Result decoding is best-effort
    }

    return {
      verified: successful,
      txHash,
      ledger,
      operationResults,
      error: successful ? undefined : 'Transaction was not successful.',
    };
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return {
        verified: false,
        txHash,
        ledger: 0,
        operationResults: [],
        error: 'Transaction not found. It may not have been submitted or included in a ledger yet.',
      };
    }

    return {
      verified: false,
      txHash,
      ledger: 0,
      operationResults: [],
      error: err?.message ?? 'Verification failed.',
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapOperationType(sdkType: string): OperationType {
  const map: Record<string, OperationType> = {
    setOptions: 'set_flags',
    payment: 'payment',
    changeTrust: 'change_trust',
    allowTrust: 'allow_trust',
    setTrustLineFlags: 'set_trust_line_flags',
    clawback: 'clawback',
  };
  return map[sdkType] ?? 'payment';
}

/**
 * Redact the middle of a Stellar address for safe display.
 * G1234…ABCD → G123…ABCD
 */
function redactMiddle(value: string): string {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function buildDescription(
  type: OperationType,
  fields: Record<string, string>,
): string {
  switch (type) {
    case 'set_flags':
      return 'Modify account flags (authorization, clawback, immutability).';
    case 'payment':
      return `Send ${fields['Amount'] ?? '?'} ${fields['Asset'] ?? 'asset'} to ${fields['Destination'] ?? '?'}.`;
    case 'set_trust_line_flags':
      return `Update trustline authorization for ${fields['Trustor'] ?? '?'}.`;
    case 'clawback':
      return `Clawback ${fields['Amount'] ?? '?'} ${fields['Asset'] ?? 'asset'} from ${fields['From'] ?? '?'}.`;
    case 'lock_issuer':
      return 'Lock issuer account by setting master weight to 0 (irreversible).';
    default:
      return `Execute ${type} operation.`;
  }
}

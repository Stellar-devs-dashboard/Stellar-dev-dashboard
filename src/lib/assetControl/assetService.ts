/**
 * Asset Service — Core transaction-building logic for asset issuance,
 * trustline management, flag changes, and clawback.
 *
 * These functions construct Stellar SDK TransactionBuilder operations
 * but do NOT sign or submit — callers own that lifecycle.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  getServer,
  fetchAccount,
  NETWORKS,
  type NetworkName,
} from '../stellar';
import type {
  AccountFlags,
  AssetIdentifier,
  ClawbackRequest,
  ClawbackResult,
  FlagChangeRequest,
  IssuanceRequest,
  IssuanceResult,
  TrustlineAuthState,
  TrustlineChangeRequest,
  OperationEnvelope,
  OperationSummary,
  OperationType,
  ASSET_CONTROL_SCHEMA_VERSION,
} from '../../types/assetControl';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIMEOUT_SECONDS = 180;
const DEFAULT_BASE_FEE = '100000'; // 0.01 XLM — generous for priority

/**
 * Resolve an AssetIdentifier to a Stellar SDK Asset.
 */
export function resolveAsset(asset: AssetIdentifier): StellarSdk.Asset {
  if (asset.code === 'XLM' && !asset.issuer) {
    return StellarSdk.Asset.native();
  }
  return new StellarSdk.Asset(asset.code, asset.issuer);
}

/**
 * Map the typed AccountFlags to integer bitmask values the Stellar protocol expects.
 */
function flagsToBitmask(flags: Partial<AccountFlags>): number {
  let mask = 0;
  if (flags.authRequired) mask |= StellarSdk.AuthRequiredFlag;
  if (flags.authRevocable) mask |= StellarSdk.AuthRevocableFlag;
  if (flags.authImmutable) mask |= StellarSdk.AuthImmutableFlag;
  if (flags.authClawbackEnabled) mask |= StellarSdk.AuthClawbackEnabledFlag;
  return mask;
}

/**
 * Map TrustlineAuthState to the numeric flag value for setTrustlineFlags.
 */
function authStateToFlags(state: TrustlineAuthState): {
  authorized: boolean;
  authorizedToMaintainLiabilities: boolean;
} {
  switch (state) {
    case 'authorized':
      return { authorized: true, authorizedToMaintainLiabilities: false };
    case 'authorized_to_maintain_liabilities':
      return { authorized: false, authorizedToMaintainLiabilities: true };
    case 'deauthorized':
      return { authorized: false, authorizedToMaintainLiabilities: false };
  }
}

// ─── Build unsigned transaction XDR ──────────────────────────────────────────

async function buildBaseTx(
  sourceAddress: string,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<{ builder: StellarSdk.TransactionBuilder; passphrase: string }> {
  const account = await fetchAccount(sourceAddress, network, signal);
  const passphrase = NETWORKS[network].passphrase;

  const builder = new StellarSdk.TransactionBuilder(account, {
    fee: DEFAULT_BASE_FEE,
    networkPassphrase: passphrase,
  }).setTimeout(TIMEOUT_SECONDS);

  return { builder, passphrase };
}

// ─── Set Account Flags ───────────────────────────────────────────────────────

/**
 * Build an unsigned set-options transaction to change account flags.
 * Returns the XDR string ready for signing.
 */
export async function buildSetFlagsTx(
  issuerAddress: string,
  request: FlagChangeRequest,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<string> {
  const { builder } = await buildBaseTx(issuerAddress, network, signal);

  const opOptions: any = {
    source: issuerAddress,
  };

  if (request.setFlags) {
    (opOptions as any).setFlags = flagsToBitmask(request.setFlags);
  }
  if (request.clearFlags) {
    (opOptions as any).clearFlags = flagsToBitmask(request.clearFlags);
  }

  builder.addOperation(StellarSdk.Operation.setOptions(opOptions));
  const tx = builder.build();
  return tx.toXDR();
}

// ─── Trustline Authorization ─────────────────────────────────────────────────

/**
 * Build a setTrustlineFlags operation to authorize / deauthorize a trustline.
 */
export async function buildTrustlineAuthTx(
  issuerAddress: string,
  request: TrustlineChangeRequest,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<string> {
  const { builder } = await buildBaseTx(issuerAddress, network, signal);
  const asset = resolveAsset(request.asset);
  const flags = authStateToFlags(request.targetState);

  builder.addOperation(
    StellarSdk.Operation.setTrustLineFlags({
      trustor: request.holderAddress,
      asset,
      flags: {
        authorized: flags.authorized,
        authorizedToMaintainLiabilities: flags.authorizedToMaintainLiabilities,
      },
      source: issuerAddress,
    }),
  );

  const tx = builder.build();
  return tx.toXDR();
}

// ─── Create Trustline (Distributor side) ─────────────────────────────────────

/**
 * Build a change_trust operation to create or update a trustline.
 */
export async function buildChangeTrustTx(
  trustorAddress: string,
  asset: AssetIdentifier,
  limit: string,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<string> {
  const { builder } = await buildBaseTx(trustorAddress, network, signal);
  const stellarAsset = resolveAsset(asset);

  builder.addOperation(
    StellarSdk.Operation.changeTrust({
      asset: stellarAsset,
      limit,
      source: trustorAddress,
    }),
  );

  const tx = builder.build();
  return tx.toXDR();
}

// ─── Issuance (Payment from Issuer) ──────────────────────────────────────────

/**
 * Build a payment from the issuer to a distributor to issue new supply.
 */
export async function buildIssuanceTx(
  request: IssuanceRequest,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<string> {
  const { builder } = await buildBaseTx(request.asset.issuer, network, signal);
  const asset = resolveAsset(request.asset);

  builder.addOperation(
    StellarSdk.Operation.payment({
      destination: request.destination,
      asset,
      amount: request.amount,
      source: request.asset.issuer,
    }),
  );

  if (request.memo) {
    builder.addMemo(StellarSdk.Memo.text(request.memo));
  }

  const tx = builder.build();
  return tx.toXDR();
}

// ─── Clawback ────────────────────────────────────────────────────────────────

/**
 * Build a clawback transaction.
 */
export async function buildClawbackTx(
  issuerAddress: string,
  request: ClawbackRequest,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<string> {
  const { builder } = await buildBaseTx(issuerAddress, network, signal);
  const asset = resolveAsset(request.asset);

  builder.addOperation(
    StellarSdk.Operation.clawback({
      from: request.from,
      asset,
      amount: request.amount,
      source: issuerAddress,
    }),
  );

  const tx = builder.build();
  return tx.toXDR();
}

// ─── Lock Issuer (Irreversible!) ─────────────────────────────────────────────

/**
 * Build a transaction that sets master weight to 0 effectively locking
 * the issuer. THIS IS IRREVERSIBLE.
 */
export async function buildLockIssuerTx(
  issuerAddress: string,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<string> {
  const { builder } = await buildBaseTx(issuerAddress, network, signal);

  builder.addOperation(
    StellarSdk.Operation.setOptions({
      masterWeight: 0,
      source: issuerAddress,
    }),
  );

  const tx = builder.build();
  return tx.toXDR();
}

// ─── Sign and Submit ─────────────────────────────────────────────────────────

/**
 * Sign a transaction XDR with a secret key. Returns signed XDR.
 *
 * CAUTION: This handles raw secret keys in memory. The caller must ensure
 * the key is not logged, persisted, or exposed in UI error messages.
 */
export function signTransactionXdr(
  xdr: string,
  secretKey: string,
  networkPassphrase: string,
): string {
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    xdr,
    networkPassphrase,
  ) as StellarSdk.Transaction;
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  return tx.toXDR();
}

/**
 * Submit a signed transaction XDR to the network.
 */
export async function submitSignedTx(
  signedXdr: string,
  network: NetworkName,
): Promise<{ hash: string; success: boolean; error?: string }> {
  const server = getServer(network);
  const passphrase = NETWORKS[network].passphrase;

  const tx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    passphrase,
  ) as StellarSdk.Transaction;

  try {
    const result = await server.submitTransaction(tx);
    return {
      hash: (result as any).hash ?? '',
      success: (result as any).successful ?? true,
    };
  } catch (err: any) {
    const extras = err?.response?.data?.extras;
    const resultCodes = extras?.result_codes;
    return {
      hash: '',
      success: false,
      error: resultCodes
        ? `Transaction failed: ${JSON.stringify(resultCodes)}`
        : (err?.message ?? 'Unknown submission error'),
    };
  }
}

// ─── Fetch Asset Holders ─────────────────────────────────────────────────────

export interface AssetHolderPage {
  records: Array<{
    address: string;
    balance: string;
    limit: string;
    authorized: boolean;
    authorizedToMaintainLiabilities: boolean;
    lastModified: number;
  }>;
  nextCursor: string | null;
}

/**
 * Fetch accounts that hold a specific asset, with pagination.
 */
export async function fetchAssetHolders(
  asset: AssetIdentifier,
  network: NetworkName,
  cursor?: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<AssetHolderPage> {
  const server = getServer(network);
  const stellarAsset = resolveAsset(asset);

  let request = server
    .accounts()
    .forAsset(stellarAsset)
    .limit(limit)
    .order('asc');

  if (cursor) {
    request = request.cursor(cursor);
  }

  const response = await request.call();

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const records = (response.records ?? []).map((rec: any) => {
    const trustline = rec.balances?.find(
      (b: any) =>
        b.asset_code === asset.code && b.asset_issuer === asset.issuer,
    );

    return {
      address: rec.account_id,
      balance: trustline?.balance ?? '0',
      limit: trustline?.limit ?? '0',
      authorized: Boolean(trustline?.is_authorized),
      authorizedToMaintainLiabilities: Boolean(
        trustline?.is_authorized_to_maintain_liabilities,
      ),
      lastModified: Number(trustline?.last_modified_ledger ?? 0),
    };
  });

  const recs = response.records as any[];
  const lastRec = recs.length > 0 ? recs[recs.length - 1] : null;
  const nextCursor = lastRec?.paging_token ?? null;

  return { records, nextCursor };
}

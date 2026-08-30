import * as StellarSdk from '@stellar/stellar-sdk';
import { isValidPublicKey, type NetworkName, NETWORKS } from '../stellar';
import type {
  FeeBumpEnvelopeModel,
  InnerTransactionModel,
  SponsoredOperationEntry,
} from '../../types/feeBumpSponsorship';
import { astToClaimPredicate } from '../claimableBalance/predicateTree';

export const BASE_OPERATION_FEE_STROOPS = 100;

/**
 * Validates inner and outer fee-bump envelope parameters
 */
export function validateFeeBumpEnvelope(
  model: FeeBumpEnvelopeModel
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { innerTransaction, feeSource, maxFee, isFeeBump } = model;

  if (!innerTransaction.sourceAccount || !isValidPublicKey(innerTransaction.sourceAccount)) {
    errors.push('Inner transaction source account is missing or invalid.');
  }

  if (isFeeBump) {
    if (!feeSource || !isValidPublicKey(feeSource)) {
      errors.push('Outer fee source must be a valid Stellar public key.');
    }

    const numMaxFee = parseInt(maxFee, 10);
    const numInnerFee = parseInt(innerTransaction.baseFee, 10) || 100;
    const opCount = Math.max(1, innerTransaction.operations.length);
    const minRequiredMaxFee = numInnerFee * (opCount + 1);

    if (isNaN(numMaxFee) || numMaxFee <= 0) {
      errors.push('Max fee must be a positive integer in stroops.');
    } else if (numMaxFee < minRequiredMaxFee) {
      errors.push(
        `Max fee (${numMaxFee} stroops) must be at least ${minRequiredMaxFee} stroops (inner fee rate × (operations + 1)).`
      );
    }

    if (feeSource === innerTransaction.sourceAccount) {
      warnings.push(
        'Outer fee source is identical to inner transaction source. Fee-bump is usually used for third-party fee delegation.'
      );
    }
  }

  if (innerTransaction.operations.length === 0) {
    errors.push('Inner transaction must contain at least one operation.');
  } else if (innerTransaction.operations.length > 100) {
    errors.push('Transaction exceeds maximum limit of 100 operations.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Builds a StellarSdk Operation from a SponsoredOperationEntry
 */
export function buildSdkOperation(op: SponsoredOperationEntry): StellarSdk.xdr.Operation {
  const source = op.sourceAccount || undefined;
  const p = op.params || {};

  switch (op.type) {
    case 'beginSponsoringFutureReserves':
      return StellarSdk.Operation.beginSponsoringFutureReserves({
        sponsoredId: p.sponsoredId || p.account,
        source,
      });

    case 'endSponsoringFutureReserves':
      return StellarSdk.Operation.endSponsoringFutureReserves({
        source,
      });

    case 'revokeSponsorship': {
      const revokeType = p.type;
      if (revokeType === 'account') {
        return StellarSdk.Operation.revokeAccountSponsorship({
          account: p.account,
          source,
        });
      }
      if (revokeType === 'trustline') {
        const asset =
          p.assetType === 'native'
            ? StellarSdk.Asset.native()
            : new StellarSdk.Asset(p.assetCode, p.assetIssuer);
        return StellarSdk.Operation.revokeTrustlineSponsorship({
          account: p.account,
          asset,
          source,
        });
      }
      if (revokeType === 'offer') {
        return StellarSdk.Operation.revokeOfferSponsorship({
          seller: p.seller || p.account,
          offerId: p.offerId,
          source,
        });
      }
      if (revokeType === 'data') {
        return StellarSdk.Operation.revokeDataSponsorship({
          account: p.account,
          name: p.dataName,
          source,
        });
      }
      if (revokeType === 'claimableBalance') {
        return StellarSdk.Operation.revokeClaimableBalanceSponsorship({
          balanceId: p.claimableBalanceId,
          source,
        });
      }
      if (revokeType === 'signer') {
        return StellarSdk.Operation.revokeSignerSponsorship({
          account: p.account,
          signer: {
            ed25519PublicKey: p.signerKey,
          },
          source,
        });
      }
      return StellarSdk.Operation.revokeAccountSponsorship({
        account: p.account || source,
        source,
      });
    }

    case 'createAccount':
      return StellarSdk.Operation.createAccount({
        destination: p.destination,
        startingBalance: p.startingBalance || '1',
        source,
      });

    case 'payment': {
      const asset =
        p.assetType === 'native' || !p.assetIssuer
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(p.assetCode, p.assetIssuer);
      return StellarSdk.Operation.payment({
        destination: p.destination,
        asset,
        amount: p.amount || '1',
        source,
      });
    }

    case 'changeTrust': {
      const asset = new StellarSdk.Asset(p.assetCode, p.assetIssuer);
      return StellarSdk.Operation.changeTrust({
        asset,
        limit: p.limit,
        source,
      });
    }

    case 'manageData':
      return StellarSdk.Operation.manageData({
        name: p.name,
        value: p.value || null,
        source,
      });

    case 'setOptions': {
      const signer = p.signerKey
        ? {
            ed25519PublicKey: p.signerKey,
            weight: parseInt(p.signerWeight || '1', 10),
          }
        : undefined;
      return StellarSdk.Operation.setOptions({
        masterWeight: p.masterWeight !== undefined ? parseInt(p.masterWeight, 10) : undefined,
        lowThreshold: p.lowThreshold !== undefined ? parseInt(p.lowThreshold, 10) : undefined,
        medThreshold: p.medThreshold !== undefined ? parseInt(p.medThreshold, 10) : undefined,
        highThreshold: p.highThreshold !== undefined ? parseInt(p.highThreshold, 10) : undefined,
        signer,
        source,
      });
    }

    default:
      return StellarSdk.Operation.manageData({
        name: 'custom_op',
        value: 'true',
        source,
      });
  }
}

/**
 * Builds an inner StellarSdk.Transaction object from InnerTransactionModel
 */
export function buildInnerTransaction(
  model: InnerTransactionModel,
  network: NetworkName
): StellarSdk.Transaction {
  const networkPassphrase = NETWORKS[network].passphrase;
  const seq = model.sequenceNumber || '1000';

  const account = new StellarSdk.Account(model.sourceAccount, seq);
  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee: model.baseFee || '100',
    networkPassphrase,
  });

  if (model.memo && model.memo.type !== 'none' && model.memo.value) {
    if (model.memo.type === 'text') {
      txBuilder.addMemo(StellarSdk.Memo.text(model.memo.value));
    } else if (model.memo.type === 'id') {
      txBuilder.addMemo(StellarSdk.Memo.id(model.memo.value));
    }
  }

  if (model.timeBounds) {
    txBuilder.setTimeout(
      model.timeBounds.maxTime ? parseInt(model.timeBounds.maxTime, 10) : 300
    );
  } else {
    txBuilder.setTimeout(300);
  }

  model.operations.forEach((op) => {
    txBuilder.addOperation(buildSdkOperation(op));
  });

  return txBuilder.build();
}

/**
 * Builds full Fee-Bump or Standard Transaction Envelope
 */
export function buildCompleteEnvelope(
  model: FeeBumpEnvelopeModel,
  network: NetworkName
): StellarSdk.Transaction | StellarSdk.FeeBumpTransaction {
  const innerTx = buildInnerTransaction(model.innerTransaction, network);

  if (!model.isFeeBump) {
    return innerTx;
  }

  const networkPassphrase = NETWORKS[network].passphrase;
  const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
    model.feeSource,
    model.maxFee,
    innerTx,
    networkPassphrase
  );

  return feeBumpTx;
}

/**
 * Verifies XDR round-trip encoding and integrity
 */
export function verifyXdrRoundTrip(
  model: FeeBumpEnvelopeModel,
  network: NetworkName
): { success: boolean; xdr: string; parsedBack?: any; error?: string } {
  try {
    const tx = buildCompleteEnvelope(model, network);
    const xdr = tx.toXDR();

    const networkPassphrase = NETWORKS[network].passphrase;
    const reconstructed = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);

    return {
      success: true,
      xdr,
      parsedBack: reconstructed,
    };
  } catch (err: any) {
    return {
      success: false,
      xdr: '',
      error: err.message || 'XDR serialization failed',
    };
  }
}

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  isValidPublicKey,
  getServer,
  NETWORKS,
  type NetworkName,
  type SimulateResult,
} from '../stellar';
import {
  astToClaimPredicate,
  validatePredicateTree,
  createUnconditional,
} from './predicateTree';
import type {
  ClaimableBalanceCreateParams,
  ReserveRequirementEstimate,
  ClaimantEntry,
} from '../../types/claimableBalanceExplorer';

const BASE_RESERVE_XLM = 0.5;

/**
 * Calculate reserve requirements for creating a claimable balance with N claimants
 */
export function estimateClaimableBalanceReserves(
  claimantsCount: number,
  sponsorAddress?: string,
  sponsorNativeBalance?: number
): ReserveRequirementEstimate {
  // Creating a claimable balance consumes:
  // 1 base entry reserve for the claimable balance entry
  // + 1 base entry reserve per claimant
  const claimableBalanceEntryReserve = BASE_RESERVE_XLM;
  const claimantReservesTotal = claimantsCount * BASE_RESERVE_XLM;
  const totalReserveRequired = claimableBalanceEntryReserve + claimantReservesTotal;

  const isSponsorSufficient =
    sponsorNativeBalance !== undefined ? sponsorNativeBalance >= totalReserveRequired : true;

  return {
    baseReservePerEntry: BASE_RESERVE_XLM,
    claimantEntriesCount: claimantsCount,
    claimantReservesTotal,
    claimableBalanceEntryReserve,
    totalReserveRequired,
    sponsorAddress,
    sponsorAvailableReserve: sponsorNativeBalance,
    isSponsorSufficient,
  };
}

/**
 * Validates all parameters before assembling a Claimable Balance creation transaction
 */
export function validateClaimableBalanceParams(params: ClaimableBalanceCreateParams): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!params.sourceAccount || !isValidPublicKey(params.sourceAccount)) {
    errors.push('Source account must be a valid Stellar public key (G...).');
  }

  if (params.sponsor && !isValidPublicKey(params.sponsor)) {
    errors.push('Sponsor address must be a valid Stellar public key if specified.');
  }

  const numAmount = parseFloat(params.amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    errors.push('Amount must be a positive decimal number.');
  }

  if (!params.claimants || params.claimants.length === 0) {
    errors.push('At least one claimant is required.');
  } else if (params.claimants.length > 10) {
    errors.push('Stellar supports a maximum of 10 claimants per claimable balance.');
  }

  const seenDestinations = new Set<string>();
  params.claimants.forEach((claimant, idx) => {
    if (!claimant.destination || !isValidPublicKey(claimant.destination)) {
      errors.push(`Claimant #${idx + 1} has an invalid destination public key.`);
    } else if (seenDestinations.has(claimant.destination)) {
      errors.push(`Duplicate destination '${claimant.destination}' in claimant list.`);
    } else {
      seenDestinations.add(claimant.destination);
    }

    const predicateValidation = validatePredicateTree(claimant.predicate);
    if (!predicateValidation.isValid) {
      predicateValidation.issues
        .filter((i) => i.severity === 'error')
        .forEach((issue) => {
          errors.push(`Claimant #${idx + 1} predicate error: ${issue.message}`);
        });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Build StellarSdk Asset object from asset specification
 */
export function buildAssetFromSpec(asset: {
  type: string;
  code: string;
  issuer: string;
}): StellarSdk.Asset {
  if (asset.type === 'native' || asset.code === 'XLM' || !asset.issuer) {
    return StellarSdk.Asset.native();
  }
  return new StellarSdk.Asset(asset.code, asset.issuer);
}

/**
 * Build a Create Claimable Balance transaction envelope
 */
export async function buildCreateClaimableBalanceTransaction(
  params: ClaimableBalanceCreateParams,
  network: NetworkName,
  fee = '100000'
): Promise<StellarSdk.Transaction> {
  const validation = validateClaimableBalanceParams(params);
  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
  }

  const server = getServer(network);
  const account = await server.loadAccount(params.sourceAccount);
  const networkPassphrase = NETWORKS[network].passphrase;

  const stellarAsset = buildAssetFromSpec(params.asset);

  // Convert claimant entries to Stellar SDK Claimant objects
  const sdkClaimants = params.claimants.map((entry) => {
    const predicate = astToClaimPredicate(entry.predicate);
    return new StellarSdk.Claimant(entry.destination, predicate);
  });

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee,
    networkPassphrase,
  });

  // If sponsor is specified and distinct from sourceAccount, wrap with sponsorship operations
  if (params.sponsor && params.sponsor !== params.sourceAccount) {
    txBuilder.addOperation(
      StellarSdk.Operation.beginSponsoringFutureReserves({
        sponsoredId: params.sourceAccount,
        source: params.sponsor,
      })
    );
  }

  txBuilder.addOperation(
    StellarSdk.Operation.createClaimableBalance({
      asset: stellarAsset,
      amount: params.amount,
      claimants: sdkClaimants,
      source: params.sourceAccount,
    })
  );

  if (params.sponsor && params.sponsor !== params.sourceAccount) {
    txBuilder.addOperation(
      StellarSdk.Operation.endSponsoringFutureReserves({
        source: params.sourceAccount,
      })
    );
  }

  txBuilder.setTimeout(300);
  return txBuilder.build();
}

/**
 * Build a Claim Claimable Balance transaction envelope
 */
export async function buildClaimTransaction(
  balanceId: string,
  claimantAddress: string,
  network: NetworkName,
  fee = '100000'
): Promise<StellarSdk.Transaction> {
  if (!isValidPublicKey(claimantAddress)) {
    throw new Error('Invalid claimant address.');
  }

  const server = getServer(network);
  const account = await server.loadAccount(claimantAddress);
  const networkPassphrase = NETWORKS[network].passphrase;

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.claimClaimableBalance({
        balanceId,
        source: claimantAddress,
      })
    )
    .setTimeout(180)
    .build();

  return tx;
}

/**
 * Build a Clawback Claimable Balance transaction envelope
 */
export async function buildClawbackClaimableBalanceTransaction(
  balanceId: string,
  issuerAddress: string,
  network: NetworkName,
  fee = '100000'
): Promise<StellarSdk.Transaction> {
  if (!isValidPublicKey(issuerAddress)) {
    throw new Error('Invalid issuer address.');
  }

  const server = getServer(network);
  const account = await server.loadAccount(issuerAddress);
  const networkPassphrase = NETWORKS[network].passphrase;

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.clawbackClaimableBalance({
        balanceId,
        source: issuerAddress,
      })
    )
    .setTimeout(180)
    .build();

  return tx;
}

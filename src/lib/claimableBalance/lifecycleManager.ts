import * as StellarSdk from '@stellar/stellar-sdk';
import {
  getServer,
  type NetworkName,
  isValidPublicKey,
} from '../stellar';
import {
  xdrOrJsonToPredicateAst,
  evaluatePredicate,
  explainPredicate,
} from './predicateTree';
import type {
  ClaimableBalanceLifecycleRecord,
  ClaimantEvaluation,
  LifecycleStatus,
  LifecycleEvent,
} from '../../types/claimableBalanceExplorer';

/**
 * Parses Horizon raw claimable balance record into rich typed Lifecycle Record
 */
export function parseHorizonClaimableBalance(
  raw: any,
  currentEpochSeconds = Math.floor(Date.now() / 1000)
): ClaimableBalanceLifecycleRecord {
  const assetStr = raw.asset || 'XLM:native';
  let assetCode = 'XLM';
  let assetIssuer = '';

  if (assetStr !== 'native' && assetStr.includes(':')) {
    const [c, i] = assetStr.split(':');
    assetCode = c;
    assetIssuer = i;
  }

  // Parse claimants
  const claimants = (raw.claimants || []).map((c: any) => {
    const destination = c.destination || '';
    const predicate = xdrOrJsonToPredicateAst(c.predicate);

    const evalResult = evaluatePredicate(predicate, {
      currentEpochSeconds,
      createdEpochSeconds: raw.last_modified_time
        ? Math.floor(new Date(raw.last_modified_time).getTime() / 1000)
        : currentEpochSeconds,
    });

    const explanation = explainPredicate(predicate);

    let status: LifecycleStatus = 'unknown';
    if (evalResult.isEligible) {
      status = 'claimable';
    } else {
      status = 'locked_pending_time';
    }

    const evaluation: ClaimantEvaluation = {
      destination,
      isEligibleNow: evalResult.isEligible,
      status,
      reason: evalResult.reason || explanation.summary,
    };

    return {
      destination,
      predicate,
      evaluation,
    };
  });

  const hasAnyClaimable = claimants.some((c: any) => c.evaluation.isEligibleNow);
  const overallStatus: LifecycleStatus = hasAnyClaimable ? 'claimable' : 'locked_pending_time';

  return {
    id: raw.id,
    asset: assetStr,
    assetCode,
    assetIssuer,
    amount: raw.amount || '0',
    sponsor: raw.sponsor,
    lastModifiedLedger: raw.last_modified_ledger || 0,
    lastModifiedTime: raw.last_modified_time || new Date().toISOString(),
    claimants,
    overallStatus,
    flags: {
      clawbackEnabled: Boolean(raw.flags?.clawback_enabled),
    },
    history: [
      {
        id: `ev_${raw.id}_created`,
        timestamp: raw.last_modified_time || new Date().toISOString(),
        type: 'created',
        ledger: raw.last_modified_ledger || 0,
        details: `Balance created with ${claimants.length} claimant(s).`,
      },
    ],
  };
}

/**
 * Fetch all claimable balances for a given account (as claimant or sponsor)
 */
export async function fetchAccountClaimableBalances(
  accountAddress: string,
  network: NetworkName,
  options?: {
    role?: 'claimant' | 'sponsor' | 'both';
    limit?: number;
  }
): Promise<ClaimableBalanceLifecycleRecord[]> {
  if (!isValidPublicKey(accountAddress)) {
    return [];
  }

  const server = getServer(network);
  const limit = options?.limit || 20;
  const results: ClaimableBalanceLifecycleRecord[] = [];
  const seenIds = new Set<string>();

  try {
    if (!options?.role || options.role === 'claimant' || options.role === 'both') {
      const claimantCall = await server
        .claimableBalances()
        .claimant(accountAddress)
        .limit(limit)
        .order('desc')
        .call();

      claimantCall.records.forEach((rec: any) => {
        if (!seenIds.has(rec.id)) {
          seenIds.add(rec.id);
          results.push(parseHorizonClaimableBalance(rec));
        }
      });
    }

    if (options?.role === 'sponsor' || options?.role === 'both') {
      const sponsorCall = await server
        .claimableBalances()
        .sponsor(accountAddress)
        .limit(limit)
        .order('desc')
        .call();

      sponsorCall.records.forEach((rec: any) => {
        if (!seenIds.has(rec.id)) {
          seenIds.add(rec.id);
          results.push(parseHorizonClaimableBalance(rec));
        }
      });
    }
  } catch (err: any) {
    // If 404 or empty response from Horizon
    if (err?.response?.status === 404) {
      return [];
    }
    throw err;
  }

  return results;
}

/**
 * Fetch a single claimable balance by its ID
 */
export async function fetchClaimableBalanceById(
  balanceId: string,
  network: NetworkName
): Promise<ClaimableBalanceLifecycleRecord | null> {
  const server = getServer(network);
  try {
    const record = await server.claimableBalances().claimableBalance(balanceId).call();
    return parseHorizonClaimableBalance(record);
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Account State Service — Readiness checks and safety validation
 *
 * Validates whether an issuer account is correctly configured before
 * allowing potentially irreversible operations.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { getServer, fetchAccount, NETWORKS, type NetworkName } from '../stellar';
import type {
  AccountFlags,
  IssuerState,
  IssuerReadiness,
  ReadinessCheck,
  FlagRisk,
  ReserveState,
  AssetBalance,
  SignerWeights,
} from '../../types/assetControl';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum XLM that must remain after reserves. */
const MIN_AVAILABLE_XLM = 1;
/** Stellar base reserve (may change via protocol upgrades). */
const BASE_RESERVE_STROOPS = 5_000_000; // 0.5 XLM

// ─── Flag Extraction ─────────────────────────────────────────────────────────

/**
 * Extract typed account flags from a Horizon AccountResponse.
 */
export function extractAccountFlags(
  account: StellarSdk.Horizon.AccountResponse,
): AccountFlags {
  const flags = (account as any).flags ?? {};
  return {
    authRequired: Boolean(flags.auth_required),
    authRevocable: Boolean(flags.auth_revocable),
    authImmutable: Boolean(flags.auth_immutable),
    authClawbackEnabled: Boolean(flags.auth_clawback_enabled),
  };
}

/**
 * Extract signer weight configuration from a Horizon AccountResponse.
 */
export function extractSignerWeights(
  account: StellarSdk.Horizon.AccountResponse,
): SignerWeights {
  const thresholds = (account as any).thresholds ?? {};
  return {
    masterWeight: Number(thresholds.master_weight ?? 1),
    lowThreshold: Number(thresholds.low_threshold ?? 0),
    medThreshold: Number(thresholds.med_threshold ?? 0),
    highThreshold: Number(thresholds.high_threshold ?? 0),
  };
}

/**
 * Extract balances with trustline metadata from a Horizon response.
 */
export function extractBalances(
  account: StellarSdk.Horizon.AccountResponse,
): AssetBalance[] {
  const rawBalances = (account as any).balances ?? [];
  return rawBalances.map((b: any) => ({
    assetCode: b.asset_type === 'native' ? 'XLM' : (b.asset_code ?? ''),
    assetIssuer: b.asset_issuer ?? '',
    balance: b.balance ?? '0',
    limit: b.limit,
    isAuthorized: b.is_authorized,
    isAuthorizedToMaintainLiabilities: b.is_authorized_to_maintain_liabilities,
    isClawbackEnabled: b.is_clawback_enabled,
  }));
}

/**
 * Calculate reserve state for an account.
 */
export function calculateReserves(
  account: StellarSdk.Horizon.AccountResponse,
): ReserveState {
  const subentryCount = Number((account as any).subentry_count ?? 0);
  const numSponsoring = Number((account as any).num_sponsoring ?? 0);
  const numSponsored = Number((account as any).num_sponsored ?? 0);
  const baseReserveXlm = BASE_RESERVE_STROOPS / 10_000_000;

  // Required = (2 + subentryCount + numSponsoring - numSponsored) × baseReserve
  const requiredEntries = 2 + subentryCount + numSponsoring - numSponsored;
  const requiredReserve = requiredEntries * baseReserveXlm;

  const balances = (account as any).balances ?? [];
  const nativeBalance = balances.find((b: any) => b.asset_type === 'native');
  const totalXlm = parseFloat(nativeBalance?.balance ?? '0');
  const available = Math.max(0, totalXlm - requiredReserve);

  return {
    baseReserve: baseReserveXlm.toFixed(7),
    requiredReserve: requiredReserve.toFixed(7),
    availableBalance: available.toFixed(7),
    subentryCount,
  };
}

// ─── Risk Detection ──────────────────────────────────────────────────────────

/**
 * Analyse current flags for risks. Returns warnings about irreversible
 * state or potential lockouts.
 */
export function detectFlagRisks(flags: AccountFlags): FlagRisk[] {
  const risks: FlagRisk[] = [];

  if (flags.authImmutable) {
    risks.push({
      flag: 'authImmutable',
      severity: 'critical',
      message:
        'Account flags are immutable. No flag changes (including enabling clawback) can ever be made.',
      irreversible: true,
    });
  }

  if (flags.authClawbackEnabled && !flags.authRevocable) {
    risks.push({
      flag: 'authClawbackEnabled',
      severity: 'warning',
      message:
        'Clawback is enabled but auth_revocable is not set. Stellar requires auth_revocable to be set alongside clawback.',
      irreversible: false,
    });
  }

  if (!flags.authRequired) {
    risks.push({
      flag: 'authRequired',
      severity: 'info',
      message:
        'Trustlines are not gated by authorization. Any account can establish a trustline to your asset.',
      irreversible: false,
    });
  }

  return risks;
}

// ─── Readiness Checks ────────────────────────────────────────────────────────

/**
 * Run all readiness checks for an issuer account. Each check produces a
 * pass/fail result with a human-readable explanation.
 */
export function runReadinessChecks(
  issuerState: IssuerState,
  distributorAddress?: string,
): IssuerReadiness {
  const checks: ReadinessCheck[] = [];

  // 1. Issuer ≠ Distributor
  checks.push({
    id: 'issuer-separation',
    label: 'Issuer / Distributor Separation',
    passed: !distributorAddress || issuerState.address !== distributorAddress,
    severity: 'error',
    detail: distributorAddress && issuerState.address === distributorAddress
      ? 'Issuer and distributor must be different accounts to maintain supply separation.'
      : 'Issuer and distributor are separate accounts.',
  });

  // 2. Home domain configured
  checks.push({
    id: 'home-domain',
    label: 'Home Domain',
    passed: !!issuerState.homeDomain,
    severity: 'warning',
    detail: issuerState.homeDomain
      ? `Home domain set to ${issuerState.homeDomain}`
      : 'No home domain configured. Setting a home domain improves asset discoverability.',
  });

  // 3. Signer thresholds (med/high should be > 0 for production)
  const hasNonTrivialThresholds =
    issuerState.signers.medThreshold > 0 && issuerState.signers.highThreshold > 0;
  checks.push({
    id: 'signer-thresholds',
    label: 'Signer Thresholds',
    passed: hasNonTrivialThresholds,
    severity: 'warning',
    detail: hasNonTrivialThresholds
      ? `Med=${issuerState.signers.medThreshold}, High=${issuerState.signers.highThreshold}`
      : 'Med or High threshold is zero. Consider raising thresholds for production issuers.',
  });

  // 4. Sufficient reserves
  const available = parseFloat(issuerState.reserves.availableBalance);
  checks.push({
    id: 'reserves',
    label: 'Available XLM Reserves',
    passed: available >= MIN_AVAILABLE_XLM,
    severity: 'error',
    detail:
      available >= MIN_AVAILABLE_XLM
        ? `${available.toFixed(2)} XLM available after reserves.`
        : `Only ${available.toFixed(7)} XLM available. Need at least ${MIN_AVAILABLE_XLM} XLM.`,
  });

  // 5. Immutable flag lockout check
  checks.push({
    id: 'not-immutable',
    label: 'Flags Not Immutable',
    passed: !issuerState.flags.authImmutable,
    severity: 'error',
    detail: issuerState.flags.authImmutable
      ? 'Account flags are immutable — no further flag changes are possible.'
      : 'Account flags can still be modified.',
  });

  // 6. Clawback + Revocable pairing
  if (issuerState.flags.authClawbackEnabled) {
    checks.push({
      id: 'clawback-revocable',
      label: 'Clawback ↔ Revocable Pairing',
      passed: issuerState.flags.authRevocable,
      severity: 'error',
      detail: issuerState.flags.authRevocable
        ? 'auth_revocable is correctly set alongside clawback.'
        : 'Clawback is enabled but auth_revocable is missing. This may cause operation failures.',
    });
  }

  const allPassed = checks.every((c) => c.passed || c.severity === 'info');

  return { ready: allPassed, checks };
}

// ─── Full Issuer State Builder ───────────────────────────────────────────────

/**
 * Fetch account from Horizon and build a complete IssuerState.
 */
export async function buildIssuerState(
  address: string,
  network: NetworkName,
  signal?: AbortSignal,
): Promise<IssuerState> {
  const account = await fetchAccount(address, network, signal);
  const flags = extractAccountFlags(account);
  const signers = extractSignerWeights(account);
  const balances = extractBalances(account);
  const reserves = calculateReserves(account);
  const risks = detectFlagRisks(flags);
  const homeDomain = (account as any).home_domain ?? null;

  return {
    address,
    flags,
    signers,
    homeDomain,
    balances,
    reserves,
    risks,
  };
}

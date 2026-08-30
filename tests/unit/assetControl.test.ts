/**
 * Unit tests for accountStateService and assetService.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractAccountFlags,
  extractSignerWeights,
  extractBalances,
  calculateReserves,
  detectFlagRisks,
  runReadinessChecks,
} from '../../src/lib/assetControl/accountStateService';
import { resolveAsset } from '../../src/lib/assetControl/assetService';
import {
  buildDryRunSummary,
} from '../../src/lib/assetControl/verificationService';
import type { IssuerState, AccountFlags } from '../../src/types/assetControl';

// ─── Mocked Horizon Account Response ─────────────────────────────────────────

function makeMockAccount(overrides: Record<string, any> = {}): any {
  return {
    account_id: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A',
    flags: {
      auth_required: false,
      auth_revocable: false,
      auth_immutable: false,
      auth_clawback_enabled: false,
    },
    thresholds: {
      master_weight: 1,
      low_threshold: 0,
      med_threshold: 0,
      high_threshold: 0,
    },
    balances: [
      {
        asset_type: 'native',
        balance: '100.0000000',
      },
    ],
    subentry_count: 2,
    num_sponsoring: 0,
    num_sponsored: 0,
    home_domain: undefined,
    ...overrides,
  };
}

// ─── extractAccountFlags ─────────────────────────────────────────────────────

describe('extractAccountFlags', () => {
  it('should extract default flags (all false)', () => {
    const account = makeMockAccount();
    const flags = extractAccountFlags(account);
    expect(flags).toEqual({
      authRequired: false,
      authRevocable: false,
      authImmutable: false,
      authClawbackEnabled: false,
    });
  });

  it('should detect enabled flags', () => {
    const account = makeMockAccount({
      flags: {
        auth_required: true,
        auth_revocable: true,
        auth_immutable: false,
        auth_clawback_enabled: true,
      },
    });
    const flags = extractAccountFlags(account);
    expect(flags.authRequired).toBe(true);
    expect(flags.authRevocable).toBe(true);
    expect(flags.authImmutable).toBe(false);
    expect(flags.authClawbackEnabled).toBe(true);
  });

  it('should handle missing flags gracefully', () => {
    const account = makeMockAccount({ flags: undefined });
    const flags = extractAccountFlags(account);
    expect(flags.authRequired).toBe(false);
  });
});

// ─── extractSignerWeights ────────────────────────────────────────────────────

describe('extractSignerWeights', () => {
  it('should extract thresholds', () => {
    const account = makeMockAccount({
      thresholds: {
        master_weight: 10,
        low_threshold: 1,
        med_threshold: 5,
        high_threshold: 10,
      },
    });
    const weights = extractSignerWeights(account);
    expect(weights.masterWeight).toBe(10);
    expect(weights.lowThreshold).toBe(1);
    expect(weights.medThreshold).toBe(5);
    expect(weights.highThreshold).toBe(10);
  });
});

// ─── extractBalances ─────────────────────────────────────────────────────────

describe('extractBalances', () => {
  it('should extract native balance as XLM', () => {
    const account = makeMockAccount();
    const balances = extractBalances(account);
    expect(balances).toHaveLength(1);
    expect(balances[0].assetCode).toBe('XLM');
    expect(balances[0].balance).toBe('100.0000000');
  });

  it('should extract custom asset balances', () => {
    const account = makeMockAccount({
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          balance: '500.0000000',
          limit: '1000.0000000',
          is_authorized: true,
          is_authorized_to_maintain_liabilities: false,
          is_clawback_enabled: false,
        },
        { asset_type: 'native', balance: '50.0000000' },
      ],
    });
    const balances = extractBalances(account);
    expect(balances).toHaveLength(2);
    expect(balances[0].assetCode).toBe('USDC');
    expect(balances[0].isAuthorized).toBe(true);
  });
});

// ─── calculateReserves ───────────────────────────────────────────────────────

describe('calculateReserves', () => {
  it('should compute correct available balance', () => {
    // (2 + 2 subentries) × 0.5 = 2.0 XLM required
    // 100 - 2 = 98 available
    const account = makeMockAccount({ subentry_count: 2 });
    const reserves = calculateReserves(account);
    expect(parseFloat(reserves.requiredReserve)).toBe(2);
    expect(parseFloat(reserves.availableBalance)).toBeCloseTo(98, 5);
    expect(reserves.subentryCount).toBe(2);
  });

  it('should return 0 available if balance < reserve', () => {
    const account = makeMockAccount({
      balances: [{ asset_type: 'native', balance: '1.0000000' }],
      subentry_count: 10,
    });
    const reserves = calculateReserves(account);
    expect(parseFloat(reserves.availableBalance)).toBe(0);
  });
});

// ─── detectFlagRisks ─────────────────────────────────────────────────────────

describe('detectFlagRisks', () => {
  it('should detect immutable flag as critical', () => {
    const flags: AccountFlags = {
      authRequired: false,
      authRevocable: false,
      authImmutable: true,
      authClawbackEnabled: false,
    };
    const risks = detectFlagRisks(flags);
    expect(risks.some((r) => r.flag === 'authImmutable' && r.severity === 'critical')).toBe(true);
  });

  it('should warn about clawback without revocable', () => {
    const flags: AccountFlags = {
      authRequired: true,
      authRevocable: false,
      authImmutable: false,
      authClawbackEnabled: true,
    };
    const risks = detectFlagRisks(flags);
    expect(risks.some((r) => r.flag === 'authClawbackEnabled' && r.severity === 'warning')).toBe(true);
  });

  it('should note open trustlines when authRequired is false', () => {
    const flags: AccountFlags = {
      authRequired: false,
      authRevocable: false,
      authImmutable: false,
      authClawbackEnabled: false,
    };
    const risks = detectFlagRisks(flags);
    expect(risks.some((r) => r.flag === 'authRequired' && r.severity === 'info')).toBe(true);
  });

  it('should return no risks for well-configured issuer', () => {
    const flags: AccountFlags = {
      authRequired: true,
      authRevocable: true,
      authImmutable: false,
      authClawbackEnabled: true,
    };
    const risks = detectFlagRisks(flags);
    expect(risks).toHaveLength(0);
  });
});

// ─── runReadinessChecks ──────────────────────────────────────────────────────

describe('runReadinessChecks', () => {
  function makeIssuerState(overrides: Partial<IssuerState> = {}): IssuerState {
    return {
      address: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A',
      flags: {
        authRequired: true,
        authRevocable: true,
        authImmutable: false,
        authClawbackEnabled: false,
      },
      signers: {
        masterWeight: 1,
        lowThreshold: 1,
        medThreshold: 2,
        highThreshold: 3,
      },
      homeDomain: 'example.com',
      balances: [],
      reserves: {
        baseReserve: '0.5000000',
        requiredReserve: '2.0000000',
        availableBalance: '98.0000000',
        subentryCount: 2,
      },
      risks: [],
      ...overrides,
    };
  }

  it('should pass all checks for a well-configured issuer', () => {
    const state = makeIssuerState();
    const result = runReadinessChecks(state, 'GDISTRIBUTOR1234567890123456789012345678901234567890123456');
    expect(result.ready).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('should fail on issuer = distributor', () => {
    const state = makeIssuerState();
    const result = runReadinessChecks(state, state.address);
    const separationCheck = result.checks.find((c) => c.id === 'issuer-separation');
    expect(separationCheck?.passed).toBe(false);
  });

  it('should fail when immutable', () => {
    const state = makeIssuerState({
      flags: {
        authRequired: true,
        authRevocable: true,
        authImmutable: true,
        authClawbackEnabled: false,
      },
    });
    const result = runReadinessChecks(state);
    expect(result.ready).toBe(false);
    const immutableCheck = result.checks.find((c) => c.id === 'not-immutable');
    expect(immutableCheck?.passed).toBe(false);
  });

  it('should warn on missing home domain', () => {
    const state = makeIssuerState({ homeDomain: null });
    const result = runReadinessChecks(state);
    // Home domain is a warning, so readiness may still be true
    const domainCheck = result.checks.find((c) => c.id === 'home-domain');
    expect(domainCheck?.passed).toBe(false);
    expect(domainCheck?.severity).toBe('warning');
  });

  it('should fail on insufficient reserves', () => {
    const state = makeIssuerState({
      reserves: {
        baseReserve: '0.5000000',
        requiredReserve: '100.0000000',
        availableBalance: '0.0000000',
        subentryCount: 200,
      },
    });
    const result = runReadinessChecks(state);
    expect(result.ready).toBe(false);
    const reserveCheck = result.checks.find((c) => c.id === 'reserves');
    expect(reserveCheck?.passed).toBe(false);
  });
});

// ─── resolveAsset ────────────────────────────────────────────────────────────

describe('resolveAsset', () => {
  it('should resolve XLM as native', () => {
    const asset = resolveAsset({ code: 'XLM', issuer: '' });
    expect(asset.isNative()).toBe(true);
  });

  it('should resolve custom asset', () => {
    const asset = resolveAsset({
      code: 'USDC',
      issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    });
    expect(asset.isNative()).toBe(false);
    expect(asset.code).toBe('USDC');
  });
});

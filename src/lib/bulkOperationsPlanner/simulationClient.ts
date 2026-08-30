/**
 * Simulated Horizon submission client for offline bulk execution and tests.
 */

import type { BulkManifest } from '../../types/bulkOperationsPlanner';
import type { SubmitResult } from './executor';
import { buildOperationXdrFromSpec } from './xdrBuilder';

export interface SimulationProfile {
  failureRate: number;
  latencyMs: number;
  retryableFailureRate: number;
}

export function defaultSimulationProfile(): SimulationProfile {
  return {
    failureRate: 0.05,
    latencyMs: 120,
    retryableFailureRate: 0.5,
  };
}

export async function simulateSubmitXdr(xdr: string, profile: SimulationProfile = defaultSimulationProfile()): Promise<SubmitResult> {
  await new Promise((resolve) => setTimeout(resolve, profile.latencyMs));

  const roll = Math.random();
  if (roll < profile.failureRate) {
    const retryable = Math.random() < profile.retryableFailureRate;
    return {
      ok: false,
      error: retryable ? 'Simulated network timeout' : 'Simulated op_underfunded',
    };
  }

  return {
    ok: true,
    txHash: `sim-${hashXdr(xdr)}`,
    ledger: 4_000_000 + Math.floor(Math.random() * 10_000),
    feeCharged: '100',
  };
}

function hashXdr(xdr: string): string {
  let hash = 0;
  for (let i = 0; i < xdr.length; i += 1) hash = (hash * 31 + xdr.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export function createManifestSimulatedSubmitter(manifest: BulkManifest, profile?: SimulationProfile) {
  const lookup = new Map(manifest.operations.map((op) => [op.id, op]));

  return {
    buildOperationXdr: async (operationId: string) => {
      const op = lookup.get(operationId);
      if (!op) throw new Error(`Unknown operation ${operationId}`);
      return buildOperationXdrFromSpec(op);
    },
    submitPack: async (_packId: string, xdrs: string[]) =>
      Promise.all(xdrs.map((xdr) => simulateSubmitXdr(xdr, profile))),
  };
}

export function deterministicSimulatedSubmitter(seed = 1) {
  let counter = seed;
  return async (_packId: string, xdrs: string[]): Promise<SubmitResult[]> =>
    xdrs.map((xdr) => {
      counter += 1;
      const fail = counter % 7 === 0;
      if (fail) return { ok: false, error: 'Simulated network timeout' };
      return { ok: true, txHash: `det-${hashXdr(xdr)}-${counter}`, ledger: 4_000_000 + counter, feeCharged: '100' };
    });
}

export function describeSimulationProfile(profile: SimulationProfile): string {
  return `fail ${Math.round(profile.failureRate * 100)}%, latency ${profile.latencyMs}ms`;
}

export async function simulateHorizonUnavailable(): Promise<SubmitResult> {
  return { ok: false, error: 'Horizon unavailable (simulated)' };
}

export async function simulateRateLimited(): Promise<SubmitResult> {
  return { ok: false, error: '429 rate limit exceeded (simulated)' };
}

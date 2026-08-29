import { describe, expect, it } from 'vitest';
import { base64ByteLength, normalizeFromConfirmedTransaction, normalizeFromSimulation } from './normalizer';
import type { ContractSimulationResult } from '../stellar';

function buildSimulationResult(overrides: Partial<ContractSimulationResult> = {}): ContractSimulationResult {
  return {
    xdr: 'AAAAAgAAAAA=',
    latestLedger: 12345,
    cost: { cpuInsns: '4200000', memBytes: '180000' },
    result: { ok: true },
    events: [{ inSuccessfulContractCall: true, type: 'contract', contractId: null, topics: ['transfer'], value: 100 }],
    footprint: {
      readOnly: [{ type: 'ContractData', xdr: 'AAAABgAAAAA=' }],
      readWrite: [{ type: 'ContractData', xdr: 'AAAABgAAAAE=' }],
      minResourceFee: '90000',
      resources: { instructions: 4300000, readBytes: 2048, writeBytes: 512 },
    },
    ...overrides,
  };
}

describe('base64ByteLength', () => {
  it('matches the decoded byte length for padded and unpadded base64', () => {
    expect(base64ByteLength('')).toBe(0);
    expect(base64ByteLength('QQ==')).toBe(1); // "A"
    expect(base64ByteLength('QUI=')).toBe(2); // "AB"
    expect(base64ByteLength('QUJD')).toBe(3); // "ABC"
  });
});

describe('normalizeFromSimulation', () => {
  const provenanceInput = { network: 'testnet' as const, contractId: 'CABC', functionName: 'transfer', inputsSummary: 'transfer(...)' };

  it('extracts cpu/memory/fee metrics from a well-formed simulation result', () => {
    const profile = normalizeFromSimulation(buildSimulationResult(), provenanceInput);
    expect(profile.metrics.cpuInstructions).toBe(4_200_000);
    expect(profile.metrics.memoryBytes).toBe(180_000);
    expect(profile.metrics.readBytes).toBe(2048);
    expect(profile.metrics.writeBytes).toBe(512);
    expect(profile.metrics.resourceFeeStroops).toBe(90_000);
    expect(profile.metrics.readLedgerEntries).toBe(1);
    expect(profile.metrics.writeLedgerEntries).toBe(1);
  });

  it('records inclusionFeeStroops and totalFeeStroops as missing for a simulation-only profile', () => {
    const profile = normalizeFromSimulation(buildSimulationResult(), provenanceInput);
    expect(profile.missingMetrics).toContain('inclusionFeeStroops');
    expect(profile.missingMetrics).toContain('totalFeeStroops');
    expect(profile.metrics.inclusionFeeStroops).toBeUndefined();
  });

  it('degrades gracefully when the RPC response has no cost data (older RPC version)', () => {
    const profile = normalizeFromSimulation(buildSimulationResult({ cost: undefined }), provenanceInput);
    expect(profile.missingMetrics).toContain('cpuInstructions');
    expect(profile.missingMetrics).toContain('memoryBytes');
    expect(profile.metrics.cpuInstructions).toBeUndefined();
  });

  it('degrades gracefully when the footprint is entirely absent', () => {
    const profile = normalizeFromSimulation(buildSimulationResult({ footprint: null }), provenanceInput);
    expect(profile.footprint).toEqual([]);
    expect(profile.missingMetrics).toContain('readBytes');
    expect(profile.missingMetrics).toContain('resourceFeeStroops');
  });

  it('drops an implausibly huge cost value into missingMetrics instead of trusting it', () => {
    const profile = normalizeFromSimulation(buildSimulationResult({ cost: { cpuInsns: '999999999999999', memBytes: '180000' } }), provenanceInput);
    expect(profile.metrics.cpuInstructions).toBeUndefined();
    expect(profile.missingMetrics).toContain('cpuInstructions');
  });

  it('never lists a metric in both metrics and missingMetrics', () => {
    const profile = normalizeFromSimulation(buildSimulationResult(), provenanceInput);
    for (const key of profile.missingMetrics) {
      expect(profile.metrics[key]).toBeUndefined();
    }
  });

  it('redacts strkey-shaped addresses out of the persisted inputs summary', () => {
    const address = `G${'A'.repeat(55)}`;
    const profile = normalizeFromSimulation(buildSimulationResult(), { ...provenanceInput, inputsSummary: `transfer(${address})` });
    expect(profile.provenance.inputsSummary).not.toContain(address);
  });
});

describe('normalizeFromConfirmedTransaction', () => {
  it('populates fee metrics but marks Soroban resource metrics as missing (Horizon does not report them)', () => {
    const profile = normalizeFromConfirmedTransaction({
      network: 'testnet',
      contractId: 'CABC',
      functionName: 'transfer',
      inputsSummary: 'transfer(...)',
      transactionHash: 'abc123',
      ledgerSequence: 500,
      feeChargedStroops: 100_000,
      resourceFeeStroops: 80_000,
      operationCount: 1,
      transactionSizeBytes: 400,
    });
    expect(profile.metrics.totalFeeStroops).toBe(100_000);
    expect(profile.metrics.inclusionFeeStroops).toBe(20_000);
    expect(profile.missingMetrics).toContain('cpuInstructions');
    expect(profile.missingMetrics).toContain('eventCount');
  });

  it('leaves inclusionFeeStroops missing when the fee breakdown is unavailable', () => {
    const profile = normalizeFromConfirmedTransaction({
      network: 'testnet',
      contractId: null,
      functionName: null,
      inputsSummary: '',
      transactionHash: 'abc123',
      ledgerSequence: null,
      feeChargedStroops: 100_000,
      resourceFeeStroops: undefined,
      operationCount: 1,
      transactionSizeBytes: undefined,
    });
    expect(profile.missingMetrics).toContain('inclusionFeeStroops');
    expect(profile.metrics.inclusionFeeStroops).toBeUndefined();
  });
});

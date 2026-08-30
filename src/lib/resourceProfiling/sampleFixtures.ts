import type { Baseline, ResourceProfile } from '../../types/resourceProfiling';
import { RESOURCE_PROFILING_SCHEMA_VERSION } from '../../types/resourceProfiling';

const SAMPLE_CONTRACT_ID = 'CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX';

function sampleProfile(
  id: string,
  capturedAt: string,
  cpu: number,
  mem: number,
  readBytes: number,
  writeBytes: number
): ResourceProfile {
  return {
    id,
    metrics: {
      cpuInstructions: cpu,
      memoryBytes: mem,
      readBytes,
      writeBytes,
      readLedgerEntries: 2,
      writeLedgerEntries: 1,
      eventCount: 1,
      eventSizeBytes: 96,
      returnValueSizeBytes: 32,
      transactionSizeBytes: 420,
      resourceFeeStroops: Math.round(cpu / 50 + readBytes / 4),
    },
    missingMetrics: ['inclusionFeeStroops', 'totalFeeStroops'],
    footprint: [
      { type: 'ContractData', xdr: 'AAAABgAAAAA=', access: 'read-only', approxSizeBytes: readBytes / 2 },
      { type: 'ContractData', xdr: 'AAAABgAAAAE=', access: 'read-write', approxSizeBytes: writeBytes },
    ],
    provenance: {
      network: 'testnet',
      source: 'simulation',
      capturedAt,
      ledgerSequence: 1000,
      contractId: SAMPLE_CONTRACT_ID,
      functionName: 'transfer',
      inputsHash: 'sample',
      inputsSummary: 'transfer(address:GABCD…, int:100)',
      transactionHash: null,
      rpcLatestLedger: 1000,
      sdkVersion: null,
      artifactName: 'token-contract.wasm',
    },
  };
}

/**
 * A small, deterministic baseline with mild sample-to-sample noise, useful for demoing and
 * testing statistics/comparisons without a live network connection.
 */
export function createSampleBaseline(): Baseline {
  return {
    id: 'sample-baseline-token-transfer',
    schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION,
    name: 'Token transfer (sample)',
    description: 'Deterministic sample baseline bundled with the dashboard for demos and tests.',
    tags: ['sample', 'token'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    profiles: [
      sampleProfile('sample-profile-1', '2026-01-01T00:00:00.000Z', 4_200_000, 180_000, 2_048, 512),
      sampleProfile('sample-profile-2', '2026-01-01T01:00:00.000Z', 4_260_000, 182_500, 2_060, 512),
      sampleProfile('sample-profile-3', '2026-01-01T02:00:00.000Z', 4_180_000, 179_000, 2_040, 512),
    ],
  };
}

/** A candidate profile with a deliberate CPU + read-bytes regression against the sample baseline. */
export function createSampleRegressionCandidate(): ResourceProfile {
  return sampleProfile('sample-candidate-regression', '2026-01-02T00:00:00.000Z', 5_600_000, 210_000, 3_100, 512);
}

/** A candidate profile within normal variance of the sample baseline. */
export function createSampleNeutralCandidate(): ResourceProfile {
  return sampleProfile('sample-candidate-neutral', '2026-01-02T00:00:00.000Z', 4_230_000, 181_000, 2_050, 512);
}

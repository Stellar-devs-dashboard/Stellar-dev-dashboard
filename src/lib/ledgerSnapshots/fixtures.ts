/**
 * Deterministic fixtures for offline snapshot exploration, unit tests, and E2E.
 */

import type { CaptureSimulationInput } from './captureClient';
import type { PortableLedgerSnapshot } from '../../types/ledgerSnapshots';
import {
  LEDGER_SNAPSHOT_FORMAT_KIND,
  LEDGER_SNAPSHOT_SCHEMA_VERSION,
} from '../../types/ledgerSnapshots';
import { computeSnapshotDigest, stableCanonicalJson } from './canonicalize';

export const DEMO_ACCOUNT =
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
export const DEMO_CONTRACT =
  'CBCD7777777777777777777777777777777777777777777777777777777777777';
export const DEMO_COUNTERPARTY =
  'GDEMOCOUNTERPARTYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const FIXED_LEDGER = {
  sequence: 1000001,
  hash: 'demo-ledger-hash-0000000000000000000000000000000000000000000000000000000001',
  closeTime: 1700000000,
  baseFee: '100',
  baseReserve: '5000000',
  maxTxSetSize: 1000,
};

const FIXED_NETWORK = {
  networkName: 'testnet',
  passphrase: 'Test SDF Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  protocolVersion: 22,
};

export function buildDemoSimulations(): CaptureSimulationInput[] {
  return [
    {
      kind: 'classic',
      request: {
        source: DEMO_ACCOUNT,
        operations: [{ type: 'payment', destination: DEMO_COUNTERPARTY, amount: '10' }],
      },
      response: {
        successful: true,
        feeCharged: '100',
        result: { operationCount: 1 },
      },
      supported: true,
    },
    {
      kind: 'soroban',
      request: {
        contractId: DEMO_CONTRACT,
        function: 'increment',
        args: [{ type: 'u32', value: 1 }],
      },
      response: {
        successful: true,
        minResourceFee: '120000',
        cpuInstructions: 2500000,
        memoryBytes: 4096,
        result: { retval: { type: 'u32', value: 42 } },
      },
      supported: true,
    },
    {
      kind: 'soroban',
      request: {
        contractId: DEMO_CONTRACT,
        function: 'unsupported_host_fn',
        args: [],
      },
      response: {
        successful: false,
        error: 'Unsupported host function at capture time',
        unsupportedHostFunctions: ['call_contract_with_auth_v2'],
      },
      supported: false,
      unsupportedReasons: ['Host function not available in offline replay engine'],
    },
  ];
}

export async function buildDemoSnapshot(
  accountId: string = DEMO_ACCOUNT
): Promise<PortableLedgerSnapshot> {
  const snapshotId = 'demo-snapshot-fixed-00000001';
  const account = {
    accountId,
    sequence: '1000001',
    subentryCount: 2,
    balances: [
      { assetType: 'native', balance: '10000.0000000' },
      {
        assetType: 'credit_alphanum4',
        assetCode: 'USDC',
        assetIssuer: 'GDEMOISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        balance: '500.0000000',
        limit: '1000000.0000000',
      },
    ],
    signers: [{ key: accountId, weight: 1, type: 'ed25519_public_key' }],
    flags: 0,
    thresholds: { low: 1, med: 1, high: 1 },
  };

  const ledgerEntries = [
    {
      id: `entry-${accountId}`,
      kind: 'account' as const,
      key: `account:${accountId}`,
      ledgerKeyXdr: `account:${accountId}`,
      valueXdr: stableCanonicalJson(account),
      lastModifiedLedgerSeq: FIXED_LEDGER.sequence,
      accountId,
    },
    {
      id: 'entry-trustline-usdc',
      kind: 'trustline' as const,
      key: `trustline:${accountId}:USDC:GDEMOISSUER`,
      ledgerKeyXdr: 'trustline-xdr-demo',
      valueXdr: '{"balance":"500.0000000","limit":"1000000.0000000"}',
      lastModifiedLedgerSeq: FIXED_LEDGER.sequence,
      accountId,
      assetCode: 'USDC',
      assetIssuer: 'GDEMOISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
  ];

  const contractStorage = [
    {
      contractId: DEMO_CONTRACT,
      keyXdr: 'c3RvcmFnZTp1MzI=',
      valXdr: 'AAAAAQAAAAI=',
      durability: 'persistent' as const,
      liveUntilLedgerSeq: FIXED_LEDGER.sequence + 5000,
    },
  ];

  const simulations = buildDemoSimulations().map((sim, index) => {
    const requestCanonical = stableCanonicalJson(sim.request);
    const responseCanonical = stableCanonicalJson(sim.response);
    return {
      id: `demo-sim-${index + 1}`,
      kind: sim.kind,
      requestDigest: `demo-digest-${index + 1}`.padEnd(16, '0'),
      requestCanonical,
      responseCanonical,
      capturedAt: '2024-01-01T00:00:00.000Z',
      supported: sim.supported ?? true,
      unsupportedReasons: sim.unsupportedReasons,
    };
  });

  let snapshot: PortableLedgerSnapshot = {
    formatKind: LEDGER_SNAPSHOT_FORMAT_KIND,
    schemaVersion: LEDGER_SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    label: 'Deterministic demonstration snapshot',
    tags: ['demo', 'offline', 'regression'],
    network: FIXED_NETWORK,
    ledger: FIXED_LEDGER,
    provenance: {
      capturedAt: '2024-01-01T00:00:00.000Z',
      capturedBy: 'stellar-dev-dashboard-fixture',
      dashboardVersion: '0.1.0',
      sdkVersion: '12.3.0',
      captureSessionId: 'demo-session-0001',
      footprintRoot: accountId,
      notes: 'Fixed fixture for offline exploration and E2E tests.',
    },
    footprint: {
      accounts: [accountId],
      contracts: [DEMO_CONTRACT],
      maxDepth: 2,
      maxEntries: 100,
      includeSimulations: true,
      includeContractStorage: true,
      includeTtlEntries: false,
    },
    accounts: [account],
    ledgerEntries,
    contractStorage,
    simulations,
    integrity: {
      algorithm: 'sha256',
      contentDigest: '',
      entryCount: ledgerEntries.length,
      uncompressedSizeBytes: 4096,
    },
    redaction: {
      level: 'none',
      redactedFieldCount: 0,
      redactedPaths: [],
      secretsRemoved: false,
    },
    compatibility: {
      replayEngineMinVersion: 1,
      unsupportedEntryKinds: [],
      diagnosticOnly: true,
    },
  };

  const digest = await computeSnapshotDigest(snapshot);
  snapshot = {
    ...snapshot,
    integrity: { ...snapshot.integrity, contentDigest: digest },
  };

  return snapshot;
}

export function buildCorruptedSnapshotJson(): string {
  return JSON.stringify({
    formatKind: LEDGER_SNAPSHOT_FORMAT_KIND,
    schemaVersion: LEDGER_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: 'corrupt',
    integrity: { algorithm: 'sha256', contentDigest: 'deadbeef'.repeat(8), entryCount: 0 },
  });
}

export function buildUnsupportedVersionSnapshotJson(): string {
  return JSON.stringify({
    formatKind: LEDGER_SNAPSHOT_FORMAT_KIND,
    schemaVersion: 999,
    snapshotId: 'unsupported',
  });
}

export async function buildLargeDemoSnapshot(entryCount: number): Promise<PortableLedgerSnapshot> {
  const base = await buildDemoSnapshot();
  const extraEntries = Array.from({ length: entryCount }, (_, index) => ({
    id: `bulk-entry-${index}`,
    kind: 'data' as const,
    key: `data:${DEMO_ACCOUNT}:key-${index}`,
    ledgerKeyXdr: `data-xdr-${index}`,
    valueXdr: stableCanonicalJson({ index, payload: 'x'.repeat(64) }),
    lastModifiedLedgerSeq: FIXED_LEDGER.sequence,
    accountId: DEMO_ACCOUNT,
  }));

  let snapshot: PortableLedgerSnapshot = {
    ...base,
    ledgerEntries: [...base.ledgerEntries, ...extraEntries],
    integrity: {
      ...base.integrity,
      entryCount: base.ledgerEntries.length + extraEntries.length,
    },
  };

  const digest = await computeSnapshotDigest(snapshot);
  snapshot = {
    ...snapshot,
    integrity: { ...snapshot.integrity, contentDigest: digest },
  };

  return snapshot;
}

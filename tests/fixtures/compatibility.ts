import {
  COMPATIBILITY_SCHEMA_VERSION,
  type AuditArtifact,
  type NetworkProbeResult,
  type ProbeEvidence,
  type RpcMethodName,
} from '../../src/types/compatibility';

const METHODS: RpcMethodName[] = [
  'getHealth',
  'getNetwork',
  'getLatestLedger',
  'getLedgerEntries',
  'getTransaction',
  'getTransactions',
  'getEvents',
  'simulateTransaction',
  'sendTransaction',
  'getFeeStats',
  'getVersionInfo',
];

export function makeCompatibilityProbe(
  patch: Partial<NetworkProbeResult> & {
    protocolVersion?: number | null;
    unsupportedMethods?: RpcMethodName[];
    unknownMethods?: RpcMethodName[];
  } = {}
): NetworkProbeResult {
  const completedAt = patch.completedAt ?? '2026-08-28T12:00:00.000Z';
  const evidence: ProbeEvidence[] = METHODS.map((method, index) => ({
    id: `fixture:e${index}`,
    source: 'rpc-method-probe' as const,
    field: `rpc.${method}`,
    value: patch.unknownMethods?.includes(method)
      ? null
      : !patch.unsupportedMethods?.includes(method),
    observedAt: completedAt,
    endpoint: 'https://rpc.fixture',
    confidence: 'direct' as const,
    detail: 'Deterministic fixture.',
  }));
  const protocolVersion = patch.protocolVersion === undefined ? 21 : patch.protocolVersion;
  evidence.push({
    id: 'fixture:protocol',
    source: 'rpc-getNetwork',
    field: 'protocolVersion',
    value: protocolVersion,
    observedAt: completedAt,
    endpoint: 'https://rpc.fixture',
    confidence: 'direct',
    detail: 'Deterministic fixture.',
  });
  return {
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    target: {
      id: 'network:testnet',
      label: 'Testnet fixture',
      network: 'testnet',
      horizonUrl: 'https://horizon.fixture',
      rpcUrl: 'https://rpc.fixture',
      expectedPassphrase: 'Test SDF Network ; September 2015',
    },
    requestId: 'fixture-request',
    startedAt: '2026-08-28T11:59:59.000Z',
    completedAt,
    expiresAt: patch.expiresAt ?? '2026-08-28T12:05:00.000Z',
    identity: {
      network: 'testnet',
      passphrase: 'Test SDF Network ; September 2015',
      networkId: 'fixture-network-id',
      horizonVersion: '27.0.1',
      coreVersion: '27.1.0',
      rpcVersion: '21.3.0',
      captiveCoreVersion: 'stellar-core 21.0.0',
    },
    latestLedger: 1000,
    protocolVersion,
    methods: METHODS.map((method, index) => ({
      name: method,
      supported: patch.unknownMethods?.includes(method)
        ? null
        : !patch.unsupportedMethods?.includes(method),
      evidenceId: `fixture:e${index}`,
      latencyMs: 5 + index,
      detail: 'Deterministic fixture.',
    })),
    retention: {
      latestLedger: 1000,
      oldestLedger: 500,
      ledgerCount: 501,
      estimatedSeconds: 2505,
      evidence: ['getTransaction.oldestLedger'],
    },
    limits: {
      maxLedgerEntriesPerRequest: 200,
      maxEventFilters: 5,
      maxEventRangeLedgers: 10_000,
      maxTransactionSizeBytes: 100_000,
      maxContractSizeBytes: 64_000,
      maxTransactionsPerLedger: 1000,
      source: 'reported',
    },
    vendorExtensions: [],
    evidence,
    warnings: [],
    errors: [],
    online: true,
    ...patch,
  };
}

export function makeAuditArtifacts(): AuditArtifact[] {
  return [
    {
      id: 'envelope-1',
      kind: 'saved-envelope',
      name: 'Payment envelope',
      schemaVersion: 1,
      protocolVersion: 21,
      xdrType: 'TransactionEnvelope',
      updatedAt: '2026-08-28T11:00:00.000Z',
      payload: null,
    },
    {
      id: 'snapshot-1',
      kind: 'snapshot',
      name: 'Ledger snapshot',
      schemaVersion: 1,
      protocolVersion: 21,
      xdrType: null,
      updatedAt: '2026-08-28T11:00:00.000Z',
      payload: null,
    },
    {
      id: 'contract-1',
      kind: 'contract-artifact',
      name: 'Token WASM',
      schemaVersion: 1,
      protocolVersion: 21,
      xdrType: null,
      updatedAt: '2026-08-28T11:00:00.000Z',
      payload: { wasmHash: 'sha256:fixture', sdkVersion: '21.0.0', interfaceVersion: 1 },
    },
    {
      id: 'plugin-1',
      kind: 'plugin',
      name: 'Fixture plugin',
      schemaVersion: 1,
      protocolVersion: 21,
      xdrType: null,
      updatedAt: '2026-08-28T11:00:00.000Z',
      payload: { minimumProtocol: 20, maximumProtocol: 21 },
    },
    {
      id: 'network-1',
      kind: 'custom-network',
      name: 'Custom test network',
      schemaVersion: 1,
      protocolVersion: 21,
      xdrType: null,
      updatedAt: '2026-08-28T11:00:00.000Z',
      payload: { horizonUrl: 'configured', rpcUrl: 'configured', passphrase: 'configured' },
    },
    {
      id: 'cache-1',
      kind: 'cached-data',
      name: 'Simulation cache',
      schemaVersion: 1,
      protocolVersion: 21,
      xdrType: null,
      updatedAt: '2026-08-28T11:00:00.000Z',
      payload: null,
    },
  ];
}

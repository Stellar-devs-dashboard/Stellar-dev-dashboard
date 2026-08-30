import {
  COMPATIBILITY_SCHEMA_VERSION,
  type CompatibilityMatrixDocument,
  type DashboardFeatureId,
  type DashboardFeatureRequirement,
  type ProtocolMatrixRelease,
  type RpcMethodCapability,
  type RpcMethodName,
  type SdkCapabilityProfile,
  type VersionRange,
} from '../../types/compatibility';

const CORE_METHODS: RpcMethodName[] = [
  'getHealth',
  'getNetwork',
  'getLatestLedger',
  'getLedgerEntries',
  'getTransaction',
  'getEvents',
  'simulateTransaction',
  'sendTransaction',
  'getFeeStats',
  'getVersionInfo',
];

const EXTENDED_METHODS: RpcMethodName[] = [...CORE_METHODS, 'getTransactions'];

/**
 * The profile compiled into this dashboard. This deliberately describes the
 * installed package rather than the newest package available on the internet.
 */
export const INSTALLED_SDK_PROFILE: SdkCapabilityProfile = {
  packageName: '@stellar/stellar-sdk',
  version: '12.3.0',
  protocolRange: { minimum: 20, maximum: 21 },
  xdrRange: { minimum: 20, maximum: 21 },
  rpcMethods: EXTENDED_METHODS,
  notes: [
    'Protocol and XDR support are pinned to the package installed by package-lock.json.',
    'A newer network protocol is never inferred to be compatible from method availability alone.',
  ],
};

export const RPC_METHOD_CAPABILITIES: RpcMethodCapability[] = [
  {
    name: 'getHealth',
    introducedInProtocol: 20,
    requiredForIdentity: true,
    safeProbe: 'no-params',
    description: 'Reports whether the RPC process is healthy.',
  },
  {
    name: 'getNetwork',
    introducedInProtocol: 20,
    requiredForIdentity: true,
    safeProbe: 'no-params',
    description: 'Reports network passphrase and protocol version.',
  },
  {
    name: 'getLatestLedger',
    introducedInProtocol: 20,
    requiredForIdentity: true,
    safeProbe: 'no-params',
    description: 'Reports the newest ingested ledger and protocol version.',
  },
  {
    name: 'getLedgerEntries',
    introducedInProtocol: 20,
    requiredForIdentity: false,
    safeProbe: 'invalid-params',
    description: 'Reads contract and ledger state from XDR ledger keys.',
  },
  {
    name: 'getTransaction',
    introducedInProtocol: 20,
    requiredForIdentity: false,
    safeProbe: 'invalid-params',
    description: 'Reads one transaction and exposes transaction retention bounds.',
  },
  {
    name: 'getTransactions',
    introducedInProtocol: 21,
    requiredForIdentity: false,
    safeProbe: 'invalid-params',
    description: 'Pages transactions by ledger range and cursor.',
  },
  {
    name: 'getEvents',
    introducedInProtocol: 20,
    requiredForIdentity: false,
    safeProbe: 'invalid-params',
    description: 'Pages contract, system, and diagnostic events.',
  },
  {
    name: 'simulateTransaction',
    introducedInProtocol: 20,
    requiredForIdentity: false,
    safeProbe: 'invalid-params',
    description: 'Simulates a transaction and returns resource and authorization data.',
  },
  {
    name: 'sendTransaction',
    introducedInProtocol: 20,
    requiredForIdentity: false,
    safeProbe: 'invalid-params',
    description: 'Submits a signed transaction envelope.',
  },
  {
    name: 'getFeeStats',
    introducedInProtocol: 20,
    requiredForIdentity: false,
    safeProbe: 'no-params',
    description: 'Reports inclusion and Soroban resource fee distributions.',
  },
  {
    name: 'getVersionInfo',
    introducedInProtocol: 20,
    requiredForIdentity: false,
    safeProbe: 'no-params',
    description: 'Reports RPC, build, Captive Core, and protocol version details.',
  },
];

export const DASHBOARD_FEATURE_REQUIREMENTS: DashboardFeatureRequirement[] = [
  {
    id: 'network-overview',
    label: 'Network overview',
    description: 'Network identity, ledger height, protocol, and health status.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['getNetwork', 'getLatestLedger'],
    optionalMethods: ['getHealth', 'getVersionInfo'],
    hardFailureMessage: 'Network identity or latest-ledger evidence is missing.',
    degradedMessage: 'Core identity is available, but health or build evidence is incomplete.',
    recovery: 'Verify the RPC URL, CORS policy, and getNetwork/getLatestLedger availability.',
  },
  {
    id: 'classic-transactions',
    label: 'Classic transactions',
    description: 'Builds and decodes classic Stellar transaction envelopes.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: [],
    optionalMethods: ['getTransaction'],
    hardFailureMessage: 'The observed protocol uses XDR newer than the installed SDK.',
    degradedMessage: 'Envelope construction works, but RPC transaction lookup is unavailable.',
    recovery: 'Upgrade @stellar/stellar-sdk before building envelopes for this protocol.',
  },
  {
    id: 'contract-read',
    label: 'Contract state',
    description: 'Reads and decodes contract instance, code, and data entries.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['getLedgerEntries'],
    optionalMethods: ['getVersionInfo'],
    hardFailureMessage: 'getLedgerEntries or compatible XDR decoding is unavailable.',
    degradedMessage: 'Contract reads work without RPC build metadata.',
    recovery: 'Select an RPC endpoint with getLedgerEntries and install SDK XDR for the protocol.',
  },
  {
    id: 'contract-simulation',
    label: 'Contract simulation',
    description: 'Simulates contract transactions and decodes resource/auth results.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['simulateTransaction'],
    optionalMethods: ['getFeeStats', 'getLedgerEntries'],
    hardFailureMessage: 'Simulation is missing or the SDK cannot encode the target protocol.',
    degradedMessage: 'Simulation works, but fee or footprint enrichment is incomplete.',
    recovery: 'Upgrade the SDK and use an RPC release aligned with the network protocol.',
  },
  {
    id: 'contract-submission',
    label: 'Contract submission',
    description: 'Submits signed Soroban envelopes after a compatible simulation.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['simulateTransaction', 'sendTransaction'],
    optionalMethods: ['getTransaction'],
    hardFailureMessage: 'A required simulation or submission method is unavailable.',
    degradedMessage: 'Submission works, but confirmation polling is limited.',
    recovery: 'Do not submit until simulation and sendTransaction are confirmed on one endpoint.',
  },
  {
    id: 'contract-events',
    label: 'Contract events',
    description: 'Filters and decodes retained contract events.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['getEvents'],
    optionalMethods: ['getVersionInfo'],
    hardFailureMessage: 'getEvents or event XDR support is unavailable.',
    degradedMessage: 'Events are readable, but vendor/version semantics need confirmation.',
    recovery: 'Use the endpoint event cursor shape matching its RPC major version.',
  },
  {
    id: 'transaction-history',
    label: 'RPC transaction history',
    description: 'Pages RPC-retained transactions and displays retention evidence.',
    protocolRange: { minimum: 21, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['getTransactions'],
    optionalMethods: ['getTransaction'],
    hardFailureMessage: 'getTransactions is not exposed by this endpoint.',
    degradedMessage: 'Bulk history works, but individual confirmation lookup is unavailable.',
    recovery: 'Use Horizon for classic history or an RPC endpoint exposing getTransactions.',
  },
  {
    id: 'resource-profiling',
    label: 'Resource profiling',
    description: 'Captures simulation cost, footprint, events, and fee metrics.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['simulateTransaction'],
    optionalMethods: ['getFeeStats', 'getLedgerEntries'],
    hardFailureMessage: 'Simulation or its XDR result shape is incompatible.',
    degradedMessage: 'Core measurements are available; fee or storage fields are partial.',
    recovery: 'Capture only after the SDK and RPC protocol versions are aligned.',
  },
  {
    id: 'fee-estimation',
    label: 'Fee estimation',
    description: 'Uses reported fee distributions to present inclusion choices.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: [],
    optionalMethods: ['getFeeStats'],
    hardFailureMessage: 'The protocol is not represented in the fee model.',
    degradedMessage: 'Live fee statistics are missing; static estimates are shown.',
    recovery: 'Refresh against an endpoint exposing getFeeStats before signing.',
  },
  {
    id: 'upgrade-readiness',
    label: 'Upgrade readiness audit',
    description: 'Checks saved artifacts and cached data before a protocol upgrade.',
    protocolRange: { minimum: 20, maximum: 27 },
    xdrRange: { minimum: 20, maximum: 27 },
    requiredMethods: ['getNetwork', 'getLatestLedger'],
    optionalMethods: ['getVersionInfo'],
    hardFailureMessage: 'The target protocol or network identity is not verified.',
    degradedMessage: 'The audit can run, but build provenance is incomplete.',
    recovery: 'Probe the upgrade target and review every unknown artifact before migration.',
  },
];

const SDK_BY_PROTOCOL: Record<number, string> = {
  20: '11.2.1',
  21: '12.1.0',
  22: '13.1.0',
  23: '14.1.1',
  24: '14.3.0',
  25: '14.4.3',
  26: '15.1.0',
  27: '16.2.0',
};

const CHANGES_BY_PROTOCOL: Record<number, string[]> = {
  20: [
    'Soroban smart-contract transactions became available on public networks.',
    'RPC identity, simulation, event, ledger entry, and submission workflows established.',
  ],
  21: [
    'Contract instance/code TTL extension semantics and new host cryptography landed.',
    'Dashboard transaction pagination requires explicit getTransactions evidence.',
  ],
  22: [
    'Contract constructors and BLS12-381 host functions require updated XDR and SDK support.',
    'SDK 12.x artifacts must be rebuilt or decoded with a protocol-22-capable SDK.',
  ],
  23: [
    'Unified events and state archival changed event and transaction metadata shapes.',
    'RPC removed legacy getLedgerEntry and snake_case getVersionInfo fields.',
    'TransactionMetaV4 and LedgerCloseMetaV2 require protocol-23 XDR.',
  ],
  24: [
    'Stability upgrade aligned RPC/Core at protocol 24.',
    'RPC simulation accepts transactions built for protocol 23 or newer.',
  ],
  25: [
    'BN254 and Poseidon primitives expanded contract host capabilities.',
    'Protocol-25 XDR and SDK provenance are required for newly compiled artifacts.',
  ],
  26: [
    'Protocol-26 XDR and RPC releases require SDK 15.x compatibility.',
    'Older cached simulation and metadata results must be treated as unverified.',
  ],
  27: [
    'Protocol-27 XDR and RPC releases require SDK 16.x compatibility.',
    'Future protocol evidence remains gated until a separately reviewed matrix release.',
  ],
};

function makeSdkProfile(protocol: number): SdkCapabilityProfile {
  return {
    packageName: '@stellar/stellar-sdk',
    version: SDK_BY_PROTOCOL[protocol],
    protocolRange: { minimum: protocol, maximum: protocol },
    xdrRange: { minimum: protocol, maximum: protocol },
    rpcMethods: protocol >= 21 ? EXTENDED_METHODS : CORE_METHODS,
    notes: [`Minimum reviewed JavaScript SDK line for protocol ${protocol}.`],
  };
}

function featuresForProtocol(protocol: number): DashboardFeatureId[] {
  return DASHBOARD_FEATURE_REQUIREMENTS.filter(
    (feature) =>
      protocol >= feature.protocolRange.minimum &&
      (feature.protocolRange.maximum === null || protocol <= feature.protocolRange.maximum)
  ).map((feature) => feature.id);
}

function makeRelease(protocol: number): ProtocolMatrixRelease {
  const methods = RPC_METHOD_CAPABILITIES.filter(
    (method) => method.introducedInProtocol <= protocol
  ).map((method) => method.name);

  return {
    protocol,
    lifecycle:
      protocol <= 21
        ? 'legacy'
        : protocol <= 25
          ? 'supported'
          : protocol === 26
            ? 'preferred'
            : 'preview',
    sdk: makeSdkProfile(protocol),
    xdr: {
      supported: true,
      label: `Stellar XDR v${protocol}`,
      notes: [`Decode with an SDK whose reviewed XDR range includes protocol ${protocol}.`],
    },
    rpc: {
      required: ['getHealth', 'getNetwork', 'getLatestLedger'],
      optional: methods.filter(
        (method) => !['getHealth', 'getNetwork', 'getLatestLedger'].includes(method)
      ),
    },
    dashboardFeatures: featuresForProtocol(protocol),
    changed: CHANGES_BY_PROTOCOL[protocol],
  };
}

export const COMPATIBILITY_MATRIX: CompatibilityMatrixDocument = {
  schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
  matrixVersion: '2026.08.1',
  generatedFromSdkVersion: INSTALLED_SDK_PROFILE.version,
  reviewedAt: '2026-08-28T00:00:00.000Z',
  knownProtocolRange: { minimum: 20, maximum: 27 },
  releases: [20, 21, 22, 23, 24, 25, 26, 27].map(makeRelease),
  methods: RPC_METHOD_CAPABILITIES,
  features: DASHBOARD_FEATURE_REQUIREMENTS,
};

export function isVersionInRange(version: number, range: VersionRange): boolean {
  return version >= range.minimum && (range.maximum === null || version <= range.maximum);
}

export function getMatrixRelease(protocol: number | null): ProtocolMatrixRelease | null {
  if (protocol === null || !Number.isInteger(protocol)) return null;
  return COMPATIBILITY_MATRIX.releases.find((release) => release.protocol === protocol) ?? null;
}

export function getFeatureRequirement(featureId: DashboardFeatureId): DashboardFeatureRequirement {
  const requirement = DASHBOARD_FEATURE_REQUIREMENTS.find((feature) => feature.id === featureId);
  if (!requirement) throw new Error(`Unknown compatibility feature: ${featureId}`);
  return requirement;
}

export function compareSemver(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/, '')
      .split(/[.+-]/)
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function validateMatrix(document: CompatibilityMatrixDocument): string[] {
  const errors: string[] = [];
  const protocols = new Set<number>();
  const featureIds = new Set(document.features.map((feature) => feature.id));
  const methodNames = new Set(document.methods.map((method) => method.name));

  if (document.schemaVersion !== COMPATIBILITY_SCHEMA_VERSION) {
    errors.push('Matrix schema version does not match this dashboard build.');
  }
  if (!/^\d{4}\.\d{2}\.\d+$/.test(document.matrixVersion)) {
    errors.push('Matrix version must use YYYY.MM.REVISION format.');
  }
  for (const release of document.releases) {
    if (protocols.has(release.protocol)) errors.push(`Protocol ${release.protocol} is duplicated.`);
    protocols.add(release.protocol);
    for (const method of [...release.rpc.required, ...release.rpc.optional]) {
      if (!methodNames.has(method))
        errors.push(`Protocol ${release.protocol} references unknown method ${method}.`);
    }
    for (const feature of release.dashboardFeatures) {
      if (!featureIds.has(feature))
        errors.push(`Protocol ${release.protocol} references unknown feature ${feature}.`);
    }
  }
  const expectedMaximum = document.knownProtocolRange.maximum;
  if (expectedMaximum !== null && !protocols.has(expectedMaximum)) {
    errors.push(`Known maximum protocol ${expectedMaximum} has no release entry.`);
  }
  return errors;
}

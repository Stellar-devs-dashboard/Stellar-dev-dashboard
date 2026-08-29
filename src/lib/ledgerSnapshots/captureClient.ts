/**
 * Footprint-driven snapshot capture from Horizon and Soroban RPC.
 * Bounded traversal with progress, cancellation, and size limits.
 */

import type { NetworkName } from '../stellar';
import { fetchContractInfo, getServer, NETWORKS } from '../stellar';
import type {
  AccountSnapshot,
  CaptureFailure,
  CaptureOptions,
  CaptureOutcome,
  CaptureProgress,
  CapturedSimulation,
  ContractStorageEntry,
  LedgerEntryKind,
  LedgerEntryRecord,
  LedgerMetadata,
  NetworkIdentity,
  PortableLedgerSnapshot,
  SourceProvenance,
  SnapshotFootprint,
  SnapshotIntegrity,
} from '../../types/ledgerSnapshots';
import {
  LEDGER_SNAPSHOT_FORMAT_KIND,
  LEDGER_SNAPSHOT_SCHEMA_VERSION,
} from '../../types/ledgerSnapshots';
import {
  byteLength,
  computeRequestDigest,
  computeSnapshotDigest,
  normalizeSimulationRequest,
  normalizeSimulationResponse,
  stableCanonicalJson,
} from './canonicalize';
import { redactSnapshot } from './redaction';

const DASHBOARD_VERSION = '0.1.0';
const SDK_VERSION = '12.3.0';
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export interface CaptureDependencies {
  now?: () => Date;
  idFactory?: () => string;
}

function createId(factory?: () => string): string {
  if (factory) return factory();
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildNetworkIdentity(network: NetworkName): NetworkIdentity {
  const config = NETWORKS[network];
  return {
    networkName: network,
    passphrase: config.passphrase,
    horizonUrl: config.horizonUrl,
    sorobanRpcUrl: config.sorobanUrl,
  };
}

async function fetchLedgerMetadata(network: NetworkName, signal?: AbortSignal): Promise<LedgerMetadata> {
  const server = getServer(network);
  const ledgers = await server.ledgers().order('desc').limit(1).call();
  if (signal?.aborted) throw new DOMException('Capture cancelled', 'AbortError');
  const latest = ledgers.records[0];
  return {
    sequence: latest.sequence,
    hash: latest.hash,
    closeTime: latest.closed_at ? Math.floor(new Date(latest.closed_at).getTime() / 1000) : 0,
    baseFee: String(latest.base_fee_in_stroops ?? 100),
    baseReserve: String(latest.base_reserve_in_stroops ?? 5000000),
    maxTxSetSize: latest.max_tx_set_size,
  };
}

async function fetchAccountSnapshot(
  network: NetworkName,
  accountId: string,
  signal?: AbortSignal
): Promise<AccountSnapshot> {
  const server = getServer(network);
  const account = await server.loadAccount(accountId);
  if (signal?.aborted) throw new DOMException('Capture cancelled', 'AbortError');

  const balances = account.balances.map((b) => {
    const base: AccountSnapshot['balances'][number] = {
      assetType: b.asset_type,
      balance: b.balance,
    };
    if ('buying_liabilities' in b) base.buyingLiabilities = b.buying_liabilities;
    if ('selling_liabilities' in b) base.sellingLiabilities = b.selling_liabilities;
    if (b.asset_type === 'native') return base;
    if ('asset_code' in b) {
      return {
        ...base,
        assetCode: b.asset_code,
        assetIssuer: 'asset_issuer' in b ? b.asset_issuer : undefined,
        limit: 'limit' in b ? b.limit : undefined,
      };
    }
    return base;
  });

  const signers = account.signers.map((s) => ({
    key: s.key,
    weight: s.weight,
    type: s.type,
  }));

  return {
    accountId,
    sequence: account.sequenceNumber(),
    subentryCount: account.subentry_count ?? signers.length,
    balances,
    signers,
    flags: Number(account.flags) || 0,
    homeDomain: account.home_domain,
    inflationDestination: account.inflation_destination,
    thresholds: {
      low: account.thresholds.low_threshold,
      med: account.thresholds.med_threshold,
      high: account.thresholds.high_threshold,
    },
    sponsor: 'sponsor' in account ? (account as { sponsor?: string }).sponsor : undefined,
  };
}

function inferEntryKind(key: string): LedgerEntryKind {
  if (key.startsWith('account:')) return 'account';
  if (key.startsWith('trustline:')) return 'trustline';
  if (key.startsWith('offer:')) return 'offer';
  if (key.startsWith('data:')) return 'data';
  if (key.startsWith('claimable_balance:')) return 'claimable_balance';
  if (key.startsWith('liquidity_pool:')) return 'liquidity_pool';
  if (key.startsWith('contract_code:')) return 'contract_code';
  if (key.startsWith('contract_data:')) return 'contract_data';
  if (key.startsWith('contract_ttl:')) return 'contract_ttl';
  if (key.startsWith('config_setting:')) return 'config_setting';
  return 'unknown';
}

async function fetchContractStorage(
  network: NetworkName,
  contractId: string,
  signal?: AbortSignal
): Promise<ContractStorageEntry[]> {
  try {
    const instance = await fetchContractInfo(contractId, network);
    if (signal?.aborted) throw new DOMException('Capture cancelled', 'AbortError');
    return [
      {
        contractId,
        keyXdr: 'contract_instance',
        valXdr: typeof instance === 'object' && instance !== null && 'xdr' in instance ? String((instance as { xdr?: string }).xdr ?? '') : stableCanonicalJson(instance),
        durability: 'instance' as const,
      },
    ];
  } catch {
    return [];
  }
}

function buildLedgerEntryFromAccount(account: AccountSnapshot, ledgerSeq: number): LedgerEntryRecord {
  const key = `account:${account.accountId}`;
  return {
    id: `entry-${account.accountId}`,
    kind: 'account',
    key,
    ledgerKeyXdr: key,
    valueXdr: stableCanonicalJson(account),
    lastModifiedLedgerSeq: ledgerSeq,
    accountId: account.accountId,
  };
}

function buildLedgerEntryFromStorage(entry: ContractStorageEntry, ledgerSeq: number): LedgerEntryRecord {
  return {
    id: `storage-${entry.contractId}-${entry.keyXdr.slice(0, 16)}`,
    kind: 'contract_data',
    key: `contract_data:${entry.contractId}:${entry.keyXdr.slice(0, 16)}`,
    ledgerKeyXdr: entry.keyXdr,
    valueXdr: entry.valXdr,
    lastModifiedLedgerSeq: ledgerSeq,
    contractId: entry.contractId,
  };
}

export interface CaptureSimulationInput {
  kind: 'classic' | 'soroban';
  request: unknown;
  response: unknown;
  supported?: boolean;
  unsupportedReasons?: string[];
}

export class SnapshotCaptureClient {
  private deps: CaptureDependencies;

  constructor(deps: CaptureDependencies = {}) {
    this.deps = deps;
  }

  async capture(
    network: NetworkName,
    options: CaptureOptions,
    simulations: CaptureSimulationInput[] = [],
    signal?: AbortSignal,
    onProgress?: (progress: CaptureProgress) => void
  ): Promise<CaptureOutcome> {
    const now = this.deps.now?.() ?? new Date();
    const snapshotId = createId(this.deps.idFactory);
    const sessionId = createId(this.deps.idFactory);
    const maxBytes = options.maxSnapshotBytes ?? DEFAULT_MAX_BYTES;
    const redactionLevel = options.redactionLevel ?? 'standard';

    const footprint = options.footprint;
    const targets = [...footprint.accounts, ...footprint.contracts];
    const totalSteps =
      targets.length +
      (footprint.includeContractStorage ? footprint.contracts.length : 0) +
      (footprint.includeSimulations ? simulations.length : 0) +
      2;

    let processed = 0;
    let bytesCollected = 0;

    const report = (phase: CaptureProgress['phase'], message: string, currentTarget?: string) => {
      processed += 1;
      onProgress?.({
        phase,
        processed,
        total: totalSteps,
        currentTarget,
        bytesCollected,
        message,
      });
    };

    try {
      report('init', 'Fetching ledger metadata…');
      const ledger = await fetchLedgerMetadata(network, signal);
      const networkIdentity = buildNetworkIdentity(network);

      const accounts: AccountSnapshot[] = [];
      const ledgerEntries: LedgerEntryRecord[] = [];
      const contractStorage: ContractStorageEntry[] = [];
      const capturedSimulations: CapturedSimulation[] = [];
      const unsupportedEntryKinds: LedgerEntryKind[] = [];

      for (const accountId of footprint.accounts.slice(0, footprint.maxEntries)) {
        if (signal?.aborted) {
          return { ok: false, code: 'cancelled', message: 'Capture was cancelled.' };
        }
        report('accounts', `Capturing account ${accountId.slice(0, 8)}…`, accountId);
        const account = await fetchAccountSnapshot(network, accountId, signal);
        accounts.push(account);
        ledgerEntries.push(buildLedgerEntryFromAccount(account, ledger.sequence));
        bytesCollected += byteLength(stableCanonicalJson(account));
        if (bytesCollected > maxBytes) {
          return {
            ok: false,
            code: 'size_limit',
            message: `Snapshot exceeded size limit of ${maxBytes} bytes.`,
          };
        }
      }

      if (footprint.includeContractStorage) {
        for (const contractId of footprint.contracts.slice(0, footprint.maxEntries)) {
          if (signal?.aborted) {
            return { ok: false, code: 'cancelled', message: 'Capture was cancelled.' };
          }
          report('contracts', `Capturing contract storage ${contractId.slice(0, 8)}…`, contractId);
          const storage = await fetchContractStorage(network, contractId, signal);
          contractStorage.push(...storage);
          for (const entry of storage) {
            ledgerEntries.push(buildLedgerEntryFromStorage(entry, ledger.sequence));
          }
          bytesCollected += byteLength(stableCanonicalJson(storage));
          if (bytesCollected > maxBytes) {
            return {
              ok: false,
              code: 'size_limit',
              message: `Snapshot exceeded size limit of ${maxBytes} bytes.`,
            };
          }
        }
      }

      if (footprint.includeSimulations) {
        for (const sim of simulations) {
          if (signal?.aborted) {
            return { ok: false, code: 'cancelled', message: 'Capture was cancelled.' };
          }
          const requestCanonical = normalizeSimulationRequest(sim.request);
          const responseCanonical = normalizeSimulationResponse(sim.response);
          const requestDigest = computeRequestDigest(requestCanonical);
          report('simulations', `Recording simulation ${requestDigest.slice(0, 8)}…`, requestDigest);
          capturedSimulations.push({
            id: createId(this.deps.idFactory),
            kind: sim.kind,
            requestDigest,
            requestCanonical,
            responseCanonical,
            capturedAt: now.toISOString(),
            supported: sim.supported ?? true,
            unsupportedReasons: sim.unsupportedReasons,
          });
          bytesCollected += byteLength(requestCanonical) + byteLength(responseCanonical);
        }
      }

      report('finalize', 'Finalizing snapshot integrity…');

      const provenance: SourceProvenance = {
        capturedAt: now.toISOString(),
        capturedBy: 'stellar-dev-dashboard',
        dashboardVersion: DASHBOARD_VERSION,
        sdkVersion: SDK_VERSION,
        captureSessionId: sessionId,
        footprintRoot: footprint.accounts[0],
        notes: options.includeProvenance ? 'Captured via dashboard snapshot workspace' : undefined,
      };

      let snapshot: PortableLedgerSnapshot = {
        formatKind: LEDGER_SNAPSHOT_FORMAT_KIND,
        schemaVersion: LEDGER_SNAPSHOT_SCHEMA_VERSION,
        snapshotId,
        label: options.label,
        tags: options.tags ?? [],
        network: networkIdentity,
        ledger,
        provenance,
        footprint,
        accounts,
        ledgerEntries,
        contractStorage,
        simulations: capturedSimulations,
        integrity: {
          algorithm: 'sha256',
          contentDigest: '',
          entryCount: ledgerEntries.length,
          uncompressedSizeBytes: bytesCollected,
        },
        redaction: {
          level: redactionLevel,
          redactedFieldCount: 0,
          redactedPaths: [],
          secretsRemoved: false,
        },
        compatibility: {
          replayEngineMinVersion: 1,
          unsupportedEntryKinds,
          diagnosticOnly: true,
        },
      };

      if (redactionLevel !== 'none') {
        const redacted = redactSnapshot(snapshot, { level: redactionLevel });
        snapshot = redacted.snapshot;
      }

      const digest = await computeSnapshotDigest(snapshot);
      const integrity: SnapshotIntegrity = {
        ...snapshot.integrity,
        contentDigest: digest,
      };
      snapshot = { ...snapshot, integrity };

      return { ok: true, snapshot, warnings: [] };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { ok: false, code: 'cancelled', message: 'Capture was cancelled.' };
      }
      return {
        ok: false,
        code: 'network_error',
        message: (error as Error).message || 'Network capture failed.',
      };
    }
  }
}

export const snapshotCaptureClient = new SnapshotCaptureClient();

export function buildFootprintFromAccounts(
  accounts: string[],
  contracts: string[] = [],
  overrides: Partial<SnapshotFootprint> = {}
): SnapshotFootprint {
  return {
    accounts,
    contracts,
    maxDepth: overrides.maxDepth ?? 2,
    maxEntries: overrides.maxEntries ?? 500,
    includeSimulations: overrides.includeSimulations ?? true,
    includeContractStorage: overrides.includeContractStorage ?? true,
    includeTtlEntries: overrides.includeTtlEntries ?? false,
  };
}

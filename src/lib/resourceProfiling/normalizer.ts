import type { ContractSimulationResult, NetworkName } from '../stellar';
import type {
  FootprintEntryProfile,
  ProfileSource,
  ResourceMetricKey,
  ResourceProfile,
} from '../../types/resourceProfiling';
import { ALL_METRIC_KEYS } from './metrics';
import { sanitizeMetricValue } from './validation';
import { requestId } from './errors';
import { redactInputsSummary } from './redaction';

/** Byte length of a base64-encoded XDR string, without allocating the decoded buffer. */
export function base64ByteLength(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Best-effort JSON-serialized byte size of a decoded ScVal-like value. */
function approxJsonSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null, (_key, val) => (typeof val === 'bigint' ? val.toString() : val))).length;
  } catch {
    return 0;
  }
}

function buildFootprint(footprint: ContractSimulationResult['footprint']): FootprintEntryProfile[] {
  if (!footprint) return [];
  const entries: FootprintEntryProfile[] = [];
  for (const key of footprint.readOnly) {
    entries.push({ type: key.type, xdr: key.xdr, access: 'read-only', approxSizeBytes: base64ByteLength(key.xdr) });
  }
  for (const key of footprint.readWrite) {
    entries.push({ type: key.type, xdr: key.xdr, access: 'read-write', approxSizeBytes: base64ByteLength(key.xdr) });
  }
  return entries;
}

function assignMetric(
  metrics: Partial<Record<ResourceMetricKey, number>>,
  missing: ResourceMetricKey[],
  key: ResourceMetricKey,
  raw: number | undefined
): void {
  const sanitized = raw === undefined ? undefined : sanitizeMetricValue(key, raw);
  if (sanitized === undefined) {
    missing.push(key);
  } else {
    metrics[key] = sanitized;
  }
}

export interface SimulationProvenanceInput {
  network: NetworkName;
  contractId: string;
  functionName: string;
  inputsSummary: string;
  artifactName?: string;
  source?: Extract<ProfileSource, 'simulation'>;
}

/**
 * Normalizes the shared `simulateContractCall` result (src/lib/stellar.ts) into a typed
 * ResourceProfile. Every metric that can't be extracted -- because this RPC endpoint's response
 * predates a field, or the simulation failed to produce cost data -- is recorded in
 * `missingMetrics` instead of silently defaulting to zero, so comparisons and budgets can tell
 * "measured zero" apart from "not captured".
 */
export function normalizeFromSimulation(
  result: ContractSimulationResult,
  input: SimulationProvenanceInput
): ResourceProfile {
  const metrics: Partial<Record<ResourceMetricKey, number>> = {};
  const missing: ResourceMetricKey[] = [];

  const cpuInsns = result.cost?.cpuInsns !== undefined ? Number(result.cost.cpuInsns) : undefined;
  const memBytes = result.cost?.memBytes !== undefined ? Number(result.cost.memBytes) : undefined;
  assignMetric(metrics, missing, 'cpuInstructions', cpuInsns);
  assignMetric(metrics, missing, 'memoryBytes', memBytes);

  const resources = result.footprint?.resources ?? null;
  assignMetric(metrics, missing, 'readBytes', resources?.readBytes);
  assignMetric(metrics, missing, 'writeBytes', resources?.writeBytes);

  assignMetric(metrics, missing, 'readLedgerEntries', result.footprint ? result.footprint.readOnly.length : undefined);
  assignMetric(metrics, missing, 'writeLedgerEntries', result.footprint ? result.footprint.readWrite.length : undefined);

  assignMetric(metrics, missing, 'eventCount', result.events.length);
  const eventSizeBytes = result.events.reduce((total, event) => total + approxJsonSize(event.topics) + approxJsonSize(event.value), 0);
  assignMetric(metrics, missing, 'eventSizeBytes', result.events.length > 0 ? eventSizeBytes : 0);

  assignMetric(metrics, missing, 'returnValueSizeBytes', approxJsonSize(result.result));
  assignMetric(metrics, missing, 'transactionSizeBytes', base64ByteLength(result.xdr));

  const resourceFeeStroops = result.footprint?.minResourceFee !== undefined ? Number(result.footprint.minResourceFee) : undefined;
  assignMetric(metrics, missing, 'resourceFeeStroops', resourceFeeStroops);
  // Simulations don't finalize the inclusion fee (it depends on network congestion at submit
  // time), so this is intentionally left as a missing metric rather than guessed at.
  missing.push('inclusionFeeStroops');
  missing.push('totalFeeStroops');

  const profile: ResourceProfile = {
    id: requestId('profile'),
    metrics,
    missingMetrics: dedupeMissing(missing, metrics),
    footprint: buildFootprint(result.footprint),
    provenance: {
      network: input.network,
      source: 'simulation',
      capturedAt: new Date().toISOString(),
      ledgerSequence: result.latestLedger ?? null,
      contractId: input.contractId,
      functionName: input.functionName,
      inputsHash: hashInputs(input.contractId, input.functionName, input.inputsSummary),
      inputsSummary: redactInputsSummary(input.inputsSummary),
      transactionHash: null,
      rpcLatestLedger: result.latestLedger ?? null,
      sdkVersion: null,
      artifactName: input.artifactName ?? null,
    },
  };

  return profile;
}

export interface ConfirmedTransactionProvenanceInput {
  network: NetworkName;
  contractId: string | null;
  functionName: string | null;
  inputsSummary: string;
  transactionHash: string;
  ledgerSequence: number | null;
  feeChargedStroops: number | undefined;
  resourceFeeStroops: number | undefined;
  operationCount: number;
  transactionSizeBytes: number | undefined;
  artifactName?: string;
}

/**
 * Normalizes provenance captured from a confirmed, already-submitted transaction (e.g. via
 * Horizon transaction details). Soroban resource metrics are frequently unavailable here --
 * Horizon does not expose CPU/memory/footprint for classic-fee-only lookups -- so most entries
 * land in `missingMetrics`; only the fee and size metrics that Horizon actually reports are
 * populated.
 */
export function normalizeFromConfirmedTransaction(input: ConfirmedTransactionProvenanceInput): ResourceProfile {
  const metrics: Partial<Record<ResourceMetricKey, number>> = {};
  const missing: ResourceMetricKey[] = [];

  assignMetric(metrics, missing, 'totalFeeStroops', input.feeChargedStroops);
  assignMetric(metrics, missing, 'resourceFeeStroops', input.resourceFeeStroops);
  if (input.feeChargedStroops !== undefined && input.resourceFeeStroops !== undefined) {
    assignMetric(metrics, missing, 'inclusionFeeStroops', Math.max(0, input.feeChargedStroops - input.resourceFeeStroops));
  } else {
    missing.push('inclusionFeeStroops');
  }
  assignMetric(metrics, missing, 'transactionSizeBytes', input.transactionSizeBytes);

  for (const key of ['cpuInstructions', 'memoryBytes', 'readBytes', 'writeBytes', 'readLedgerEntries', 'writeLedgerEntries', 'eventCount', 'eventSizeBytes', 'returnValueSizeBytes'] as ResourceMetricKey[]) {
    missing.push(key);
  }

  return {
    id: requestId('profile'),
    metrics,
    missingMetrics: dedupeMissing(missing, metrics),
    footprint: [],
    provenance: {
      network: input.network,
      source: 'confirmed-transaction',
      capturedAt: new Date().toISOString(),
      ledgerSequence: input.ledgerSequence,
      contractId: input.contractId,
      functionName: input.functionName,
      inputsHash: hashInputs(input.contractId ?? '', input.functionName ?? '', input.inputsSummary),
      inputsSummary: redactInputsSummary(input.inputsSummary),
      transactionHash: input.transactionHash,
      rpcLatestLedger: input.ledgerSequence,
      sdkVersion: null,
      artifactName: input.artifactName ?? null,
    },
  };
}

function dedupeMissing(missing: ResourceMetricKey[], metrics: Partial<Record<ResourceMetricKey, number>>): ResourceMetricKey[] {
  const set = new Set(missing.filter((key) => metrics[key] === undefined));
  return ALL_METRIC_KEYS.filter((key) => set.has(key));
}

/** Deterministic, non-cryptographic hash used only to group repeat samples of the same call. */
function hashInputs(contractId: string, functionName: string, inputsSummary: string): string {
  const raw = `${contractId}:${functionName}:${inputsSummary}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

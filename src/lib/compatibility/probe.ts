import {
  COMPATIBILITY_SCHEMA_VERSION,
  type NetworkLimits,
  type NetworkProbeResult,
  type NetworkProbeTarget,
  type ProbeEvidence,
  type ProbeOptions,
  type ProbeProblem,
  type ProbeService,
  type RpcMethodName,
  type RpcMethodObservation,
  type VendorExtension,
} from '../../types/compatibility';
import { RPC_METHOD_CAPABILITIES } from './matrix';
import { redactEndpoint, redactText, sanitizeHeaders } from './redaction';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const ZERO_HASH = '0'.repeat(64);

interface JsonResponse {
  body: unknown;
  headers: Record<string, string>;
  latencyMs: number;
}

interface JsonRpcEnvelope {
  jsonrpc?: string;
  id?: string | number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface RpcOutcome {
  method: RpcMethodName;
  supported: boolean | null;
  result: Record<string, unknown> | null;
  responseCode?: number;
  latencyMs: number | null;
  detail: string;
  headers: Record<string, string>;
  problem?: ProbeProblem;
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `compat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
}

function asFiniteNumber(value: unknown): number | null {
  const converted = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof converted === 'number' && Number.isFinite(converted) ? converted : null;
}

function asInteger(value: unknown): number | null {
  const number = asFiniteNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function combineUrl(base: string, path: string): string {
  const url = new URL(base);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}${path}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function createTimedSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener('abort', abortFromParent, { once: true });

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = new DOMException('Compatibility probe timed out.', 'TimeoutError');
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  return {
    signal: controller.signal,
    timeout,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer!);
      parent?.removeEventListener('abort', abortFromParent);
    },
  };
}

async function requestJson(
  url: string,
  init: RequestInit,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): Promise<JsonResponse> {
  const timed = createTimedSignal(parentSignal, timeoutMs);
  const started = performance.now();
  try {
    const response = await Promise.race([
      fetch(url, { ...init, signal: timed.signal }),
      timed.timeout,
    ]);
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Response exceeded the 2 MB probe limit.');
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Endpoint returned malformed JSON.');
    }
    return { body, headers: sanitizeHeaders(response.headers), latencyMs };
  } catch (cause) {
    if (timed.timedOut()) throw new DOMException('Compatibility probe timed out.', 'TimeoutError');
    throw cause;
  } finally {
    timed.dispose();
  }
}

function problemFromError(
  cause: unknown,
  source: ProbeProblem['source'],
  endpoint: string,
  parentSignal?: AbortSignal
): ProbeProblem {
  const errorLike =
    cause !== null && typeof cause === 'object'
      ? (cause as { name?: unknown; message?: unknown })
      : null;
  const name = typeof errorLike?.name === 'string' ? errorLike.name : '';
  const causeMessage = typeof errorLike?.message === 'string' ? errorLike.message : null;
  const aborted = parentSignal?.aborted || name === 'AbortError';
  const timeout = name === 'TimeoutError';
  return {
    code: aborted ? 'aborted' : timeout ? 'timeout' : 'network-error',
    source,
    message: redactText(
      aborted
        ? 'Compatibility probe was cancelled.'
        : timeout
          ? 'Endpoint did not answer within the configured timeout.'
          : causeMessage
            ? causeMessage
            : 'Endpoint request failed.'
    ),
    retryable: !aborted,
    endpoint: redactEndpoint(endpoint),
  };
}

async function rpcCall(
  target: NetworkProbeTarget,
  method: RpcMethodName,
  params: Record<string, unknown> | undefined,
  options: Required<Pick<ProbeOptions, 'timeoutMs'>> & Pick<ProbeOptions, 'signal'>
): Promise<RpcOutcome> {
  const endpoint = target.rpcUrl;
  try {
    const response = await requestJson(
      endpoint,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(target.headers ?? {}) },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `compat-${method}`,
          method,
          ...(params === undefined ? {} : { params }),
        }),
      },
      options.signal,
      options.timeoutMs
    );
    const envelope = asRecord(response.body) as JsonRpcEnvelope | null;
    if (!envelope || (envelope.result === undefined && envelope.error === undefined)) {
      return {
        method,
        supported: null,
        result: null,
        latencyMs: response.latencyMs,
        detail: 'RPC response did not match the JSON-RPC result/error contract.',
        headers: response.headers,
        problem: {
          code: 'invalid-response',
          source: 'rpc',
          message: 'RPC returned a malformed JSON-RPC envelope.',
          retryable: true,
          endpoint: redactEndpoint(endpoint),
          context: method,
        },
      };
    }

    if (envelope.error) {
      const code = asFiniteNumber(envelope.error.code) ?? undefined;
      const missing = code === -32601;
      return {
        method,
        supported: !missing,
        result: null,
        responseCode: code,
        latencyMs: response.latencyMs,
        detail: missing
          ? 'JSON-RPC method not found.'
          : `Method recognized; probe input was rejected${code === undefined ? '' : ` (${code})`}.`,
        headers: response.headers,
      };
    }

    return {
      method,
      supported: true,
      result: asRecord(envelope.result),
      latencyMs: response.latencyMs,
      detail: 'Method returned a JSON-RPC result.',
      headers: response.headers,
    };
  } catch (cause) {
    return {
      method,
      supported: null,
      result: null,
      latencyMs: null,
      detail: 'Method support could not be observed.',
      headers: {},
      problem: problemFromError(cause, 'rpc', endpoint, options.signal),
    };
  }
}

function methodParams(
  method: RpcMethodName,
  latestLedger: number | null
): Record<string, unknown> | undefined {
  switch (method) {
    case 'getHealth':
    case 'getNetwork':
    case 'getLatestLedger':
    case 'getFeeStats':
    case 'getVersionInfo':
      return undefined;
    case 'getLedgerEntries':
      return { keys: [] };
    case 'getTransaction':
      return { hash: ZERO_HASH };
    case 'getTransactions':
      return { startLedger: Math.max(1, latestLedger ?? 1), limit: 1 };
    case 'getEvents':
      return { startLedger: Math.max(1, latestLedger ?? 1), filters: [], limit: 1 };
    case 'simulateTransaction':
    case 'sendTransaction':
      return { transaction: 'invalid-xdr-capability-probe' };
  }
}

function extractHorizonLedger(
  root: Record<string, unknown> | null
): Record<string, unknown> | null {
  const embedded = asRecord(root?._embedded);
  const records = embedded?.records;
  return Array.isArray(records) ? asRecord(records[0]) : null;
}

function collectVendorExtensions(outcomes: RpcOutcome[]): VendorExtension[] {
  const extensions = new Map<string, VendorExtension>();
  for (const outcome of outcomes) {
    for (const [name, value] of Object.entries(outcome.headers)) {
      extensions.set(`${name}:${value}`, { name, value, source: 'header' });
    }
  }
  const version = outcomes.find((outcome) => outcome.method === 'getVersionInfo')?.result;
  for (const field of ['commitHash', 'buildTimestamp', 'interfaceVersion']) {
    const value = asString(version?.[field]) ?? asFiniteNumber(version?.[field])?.toString();
    if (value) extensions.set(`version:${field}`, { name: field, value, source: 'rpc-version' });
  }
  return [...extensions.values()].slice(0, 30);
}

function extractLimits(
  horizonLedger: Record<string, unknown> | null,
  outcomes: RpcOutcome[]
): NetworkLimits {
  const versionInfo = outcomes.find((outcome) => outcome.method === 'getVersionInfo')?.result;
  const reportedLimits = asRecord(versionInfo?.limits);
  const maxTransactions = asInteger(horizonLedger?.max_tx_set_size);
  const values = {
    maxLedgerEntriesPerRequest: asInteger(reportedLimits?.maxLedgerEntries),
    maxEventFilters: asInteger(reportedLimits?.maxEventFilters),
    maxEventRangeLedgers: asInteger(reportedLimits?.maxEventRangeLedgers),
    maxTransactionSizeBytes: asInteger(reportedLimits?.maxTransactionSizeBytes),
    maxContractSizeBytes: asInteger(reportedLimits?.maxContractSizeBytes),
    maxTransactionsPerLedger: maxTransactions,
  };
  return {
    ...values,
    source: Object.values(values).some((value) => value !== null) ? 'reported' : 'unknown',
  };
}

function extractRetention(outcomes: RpcOutcome[], latestLedger: number | null) {
  const candidates = ['getTransaction', 'getTransactions', 'getEvents'] as const;
  let oldestLedger: number | null = null;
  const evidence: string[] = [];
  let latest = latestLedger;
  for (const method of candidates) {
    const result = outcomes.find((outcome) => outcome.method === method)?.result;
    const candidateOldest = asInteger(result?.oldestLedger);
    const candidateLatest = asInteger(result?.latestLedger);
    if (candidateOldest !== null) {
      oldestLedger =
        oldestLedger === null ? candidateOldest : Math.min(oldestLedger, candidateOldest);
      evidence.push(`${method}.oldestLedger`);
    }
    if (candidateLatest !== null) {
      latest = latest === null ? candidateLatest : Math.max(latest, candidateLatest);
      evidence.push(`${method}.latestLedger`);
    }
  }
  const ledgerCount =
    latest !== null && oldestLedger !== null ? Math.max(0, latest - oldestLedger + 1) : null;
  return {
    latestLedger: latest,
    oldestLedger,
    ledgerCount,
    estimatedSeconds: ledgerCount === null ? null : ledgerCount * 5,
    evidence,
  };
}

export class BrowserNetworkProbeService implements ProbeService {
  async probe(target: NetworkProbeTarget, options: ProbeOptions = {}): Promise<NetworkProbeResult> {
    const now = options.now ?? (() => new Date());
    const timeoutMs = Math.min(30_000, Math.max(500, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    const cacheTtlMs = Math.min(
      24 * 60 * 60_000,
      Math.max(1_000, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS)
    );
    const started = now();
    const requestId = makeRequestId();
    const safeTarget = {
      id: target.id,
      label: target.label,
      network: target.network,
      horizonUrl: redactEndpoint(target.horizonUrl),
      rpcUrl: redactEndpoint(target.rpcUrl),
      ...(target.expectedPassphrase ? { expectedPassphrase: target.expectedPassphrase } : {}),
    };
    const evidence: ProbeEvidence[] = [];
    const errors: ProbeProblem[] = [];
    const warnings: string[] = [];
    let evidenceSequence = 0;
    const addEvidence = (
      source: ProbeEvidence['source'],
      field: string,
      value: ProbeEvidence['value'],
      endpoint: string,
      detail?: string
    ): string => {
      const id = `${requestId}:e${++evidenceSequence}`;
      evidence.push({
        id,
        source,
        field,
        value,
        observedAt: now().toISOString(),
        endpoint: redactEndpoint(endpoint),
        confidence: 'direct',
        ...(detail ? { detail } : {}),
      });
      return id;
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const completedAt = now();
      const problem: ProbeProblem = {
        code: 'offline',
        source: 'browser',
        message: 'Browser reports offline mode; no endpoints were contacted.',
        retryable: true,
        endpoint: 'browser',
      };
      return {
        schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
        target: safeTarget,
        requestId,
        startedAt: started.toISOString(),
        completedAt: completedAt.toISOString(),
        expiresAt: new Date(completedAt.getTime() + cacheTtlMs).toISOString(),
        identity: {
          network: target.network,
          passphrase: null,
          networkId: null,
          horizonVersion: null,
          coreVersion: null,
          rpcVersion: null,
          captiveCoreVersion: null,
        },
        latestLedger: null,
        protocolVersion: null,
        methods: RPC_METHOD_CAPABILITIES.map((method) => ({
          name: method.name,
          supported: null,
          evidenceId: addEvidence(
            'browser',
            `rpc.${method.name}`,
            null,
            'browser',
            'Offline; not probed.'
          ),
          latencyMs: null,
          detail: 'Offline; method support is unknown.',
        })),
        retention: {
          latestLedger: null,
          oldestLedger: null,
          ledgerCount: null,
          estimatedSeconds: null,
          evidence: [],
        },
        limits: {
          maxLedgerEntriesPerRequest: null,
          maxEventFilters: null,
          maxEventRangeLedgers: null,
          maxTransactionSizeBytes: null,
          maxContractSizeBytes: null,
          maxTransactionsPerLedger: null,
          source: 'unknown',
        },
        vendorExtensions: [],
        evidence,
        warnings: [],
        errors: [problem],
        online: false,
      };
    }

    let horizonRoot: Record<string, unknown> | null = null;
    let horizonLedger: Record<string, unknown> | null = null;
    const horizonRootUrl = target.horizonUrl;
    const horizonLedgerUrl = combineUrl(target.horizonUrl, '/ledgers?order=desc&limit=1');
    const horizonHeaders = { accept: 'application/json', ...(target.headers ?? {}) };
    const [rootResponse, ledgerResponse] = await Promise.allSettled([
      requestJson(horizonRootUrl, { headers: horizonHeaders }, options.signal, timeoutMs),
      requestJson(horizonLedgerUrl, { headers: horizonHeaders }, options.signal, timeoutMs),
    ]);

    if (rootResponse.status === 'fulfilled') {
      horizonRoot = asRecord(rootResponse.value.body);
      if (!horizonRoot) {
        errors.push({
          code: 'invalid-response',
          source: 'horizon',
          message: 'Horizon root response was not an object.',
          retryable: true,
          endpoint: redactEndpoint(horizonRootUrl),
        });
      }
    } else {
      errors.push(problemFromError(rootResponse.reason, 'horizon', horizonRootUrl, options.signal));
    }

    if (ledgerResponse.status === 'fulfilled') {
      horizonLedger = extractHorizonLedger(asRecord(ledgerResponse.value.body));
      if (!horizonLedger) {
        errors.push({
          code: 'invalid-response',
          source: 'horizon',
          message: 'Horizon latest-ledger response had no record.',
          retryable: true,
          endpoint: redactEndpoint(horizonLedgerUrl),
        });
      }
    } else {
      errors.push(
        problemFromError(ledgerResponse.reason, 'horizon', horizonLedgerUrl, options.signal)
      );
    }

    const firstMethods: RpcMethodName[] = [
      'getHealth',
      'getNetwork',
      'getLatestLedger',
      'getFeeStats',
      'getVersionInfo',
    ];
    const firstOutcomes = await Promise.all(
      firstMethods.map((method) =>
        rpcCall(target, method, methodParams(method, null), { timeoutMs, signal: options.signal })
      )
    );
    const latestRpc = asInteger(
      firstOutcomes.find((item) => item.method === 'getLatestLedger')?.result?.sequence
    );
    const remainingMethods = RPC_METHOD_CAPABILITIES.map((method) => method.name).filter(
      (method) => !firstMethods.includes(method)
    );
    const remainingOutcomes = await Promise.all(
      remainingMethods.map((method) =>
        rpcCall(target, method, methodParams(method, latestRpc), {
          timeoutMs,
          signal: options.signal,
        })
      )
    );
    const outcomes = [...firstOutcomes, ...remainingOutcomes];
    errors.push(...outcomes.flatMap((outcome) => (outcome.problem ? [outcome.problem] : [])));

    const rpcNetwork = outcomes.find((outcome) => outcome.method === 'getNetwork')?.result;
    const rpcLedger = outcomes.find((outcome) => outcome.method === 'getLatestLedger')?.result;
    const versionInfo = outcomes.find((outcome) => outcome.method === 'getVersionInfo')?.result;
    const passphrase =
      asString(rpcNetwork?.passphrase) ?? asString(horizonRoot?.network_passphrase) ?? null;
    const protocolCandidates = [
      ['rpc.getNetwork', asInteger(rpcNetwork?.protocolVersion)],
      ['rpc.getLatestLedger', asInteger(rpcLedger?.protocolVersion)],
      ['rpc.getVersionInfo', asInteger(versionInfo?.protocolVersion)],
      ['horizon.root', asInteger(horizonRoot?.current_protocol_version)],
      ['horizon.latestLedger', asInteger(horizonLedger?.protocol_version)],
    ] as const;
    const observedProtocols = protocolCandidates.filter((candidate) => candidate[1] !== null);
    const protocolVersion = observedProtocols[0]?.[1] ?? null;
    const uniqueProtocols = new Set(observedProtocols.map((candidate) => candidate[1]));
    if (uniqueProtocols.size > 1) {
      warnings.push(
        `Protocol evidence is contradictory: ${observedProtocols.map(([source, value]) => `${source}=${value}`).join(', ')}.`
      );
    }

    const latestCandidates = [
      ['rpc.getLatestLedger', asInteger(rpcLedger?.sequence)],
      ['horizon.latestLedger', asInteger(horizonLedger?.sequence)],
    ] as const;
    const observedLedgers = latestCandidates.filter((candidate) => candidate[1] !== null);
    const latestLedger = observedLedgers[0]?.[1] ?? null;
    if (observedLedgers.length > 1) {
      const values = observedLedgers.map((item) => item[1] as number);
      if (Math.max(...values) - Math.min(...values) > 5) {
        warnings.push(
          `Latest-ledger evidence differs by more than five ledgers: ${observedLedgers
            .map(([source, value]) => `${source}=${value}`)
            .join(', ')}.`
        );
      }
    }
    if (target.expectedPassphrase && passphrase && target.expectedPassphrase !== passphrase) {
      errors.push({
        code: 'identity-mismatch',
        source: 'rpc',
        message: 'Observed network passphrase does not match the selected network profile.',
        retryable: false,
        endpoint: redactEndpoint(target.rpcUrl),
        context: 'network passphrase',
      });
    }

    if (passphrase) addEvidence('rpc-getNetwork', 'network.passphrase', passphrase, target.rpcUrl);
    for (const [source, value] of protocolCandidates) {
      if (value !== null) {
        addEvidence(
          source.startsWith('horizon')
            ? source === 'horizon.root'
              ? 'horizon-root'
              : 'horizon-ledger'
            : source === 'rpc.getNetwork'
              ? 'rpc-getNetwork'
              : source === 'rpc.getLatestLedger'
                ? 'rpc-getLatestLedger'
                : 'rpc-response',
          'protocolVersion',
          value,
          source.startsWith('horizon') ? target.horizonUrl : target.rpcUrl,
          source
        );
      }
    }
    for (const [source, value] of latestCandidates) {
      if (value !== null) {
        addEvidence(
          source.startsWith('horizon') ? 'horizon-ledger' : 'rpc-getLatestLedger',
          'latestLedger',
          value,
          source.startsWith('horizon') ? target.horizonUrl : target.rpcUrl,
          source
        );
      }
    }

    const methods: RpcMethodObservation[] = outcomes.map((outcome) => ({
      name: outcome.method,
      supported: outcome.supported,
      evidenceId: addEvidence(
        'rpc-method-probe',
        `rpc.${outcome.method}`,
        outcome.supported,
        target.rpcUrl,
        outcome.detail
      ),
      ...(outcome.responseCode === undefined ? {} : { responseCode: outcome.responseCode }),
      latencyMs: outcome.latencyMs,
      detail: outcome.detail,
    }));

    const completed = now();
    return {
      schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
      target: safeTarget,
      requestId,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      expiresAt: new Date(completed.getTime() + cacheTtlMs).toISOString(),
      identity: {
        network: target.network,
        passphrase,
        networkId: asString(rpcNetwork?.networkId),
        horizonVersion: asString(horizonRoot?.horizon_version),
        coreVersion: asString(horizonRoot?.core_version),
        rpcVersion: asString(versionInfo?.version),
        captiveCoreVersion: asString(versionInfo?.captiveCoreVersion),
      },
      latestLedger,
      protocolVersion,
      methods,
      retention: extractRetention(outcomes, latestLedger),
      limits: extractLimits(horizonLedger, outcomes),
      vendorExtensions: collectVendorExtensions(outcomes),
      evidence,
      warnings,
      errors,
      online: errors.some((problem) => problem.code === 'aborted')
        ? false
        : outcomes.some((outcome) => outcome.supported !== null) || horizonRoot !== null,
    };
  }
}

export const browserNetworkProbeService = new BrowserNetworkProbeService();

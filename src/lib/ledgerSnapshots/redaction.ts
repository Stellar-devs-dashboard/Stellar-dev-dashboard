/**
 * Privacy-first redaction for ledger snapshots and exported bundles.
 */

import type {
  PortableLedgerSnapshot,
  RedactionLevel,
  SnapshotRedactionReport,
} from '../../types/ledgerSnapshots';

const SECRET_PATTERN = /\bS[A-Z2-7]{55}\b/g;
const ACCOUNT_PATTERN = /\bG[A-Z2-7]{54,55}\b/g;
const MUXED_PATTERN = /\bM[A-Z2-7]{67,68}\b/g;
const CONTRACT_PATTERN = /\bC[A-Z2-7]{54,55}\b/g;
const BEARER_PATTERN = /\b(?:Bearer|Token)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi;

export interface RedactionOptions {
  level: RedactionLevel;
  preserveAccountPrefixes?: boolean;
  preserveContractPrefixes?: boolean;
}

const DEFAULT_OPTIONS: RedactionOptions = {
  level: 'standard',
  preserveAccountPrefixes: true,
  preserveContractPrefixes: true,
};

function maskStellarId(value: string, prefix: string): string {
  if (value.length <= 11) return `[REDACTED_${prefix}]`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function redactString(value: string, options: RedactionOptions, paths: string[], path: string): string {
  let result = value.replace(SECRET_PATTERN, '[REDACTED_SECRET]');
  result = result.replace(BEARER_PATTERN, '[REDACTED_AUTH_TOKEN]');

  if (options.level === 'none') {
    return result;
  }

  if (options.level === 'strict') {
    result = result.replace(ACCOUNT_PATTERN, '[REDACTED_ACCOUNT]');
    result = result.replace(MUXED_PATTERN, '[REDACTED_ACCOUNT]');
    result = result.replace(CONTRACT_PATTERN, '[REDACTED_CONTRACT]');
    if (result !== value) paths.push(path);
    return result;
  }

  result = result.replace(ACCOUNT_PATTERN, (match) => {
    paths.push(path);
    return options.preserveAccountPrefixes ? maskStellarId(match, 'ACCOUNT') : '[REDACTED_ACCOUNT]';
  });
  result = result.replace(MUXED_PATTERN, (match) => {
    paths.push(path);
    return options.preserveAccountPrefixes ? maskStellarId(match, 'ACCOUNT') : '[REDACTED_ACCOUNT]';
  });
  result = result.replace(CONTRACT_PATTERN, (match) => {
    paths.push(path);
    return options.preserveContractPrefixes ? maskStellarId(match, 'CONTRACT') : '[REDACTED_CONTRACT]';
  });

  return result;
}

function redactValue(
  value: unknown,
  options: RedactionOptions,
  paths: string[],
  path: string,
  depth = 0
): unknown {
  if (depth > 12) return '[REDACTED_DEPTH]';
  if (typeof value === 'string') return redactString(value, options, paths, path);
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, options, paths, `${path}[${index}]`, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (/secret|seed|private|passphrase|mnemonic|signature/i.test(key)) {
        paths.push(`${path}.${key}`);
        output[key] = '[REDACTED_SENSITIVE_KEY]';
        continue;
      }
      if (
        options.level === 'strict' &&
        /account|address|contract|issuer|signer|destination|source|footprint|key|xdr|envelope/i.test(key) &&
        typeof nested === 'string'
      ) {
        paths.push(`${path}.${key}`);
        output[key] =
          /account/i.test(key) && /^G[A-Z2-7]{54,55}$/.test(nested)
            ? '[REDACTED_ACCOUNT]'
            : /contract/i.test(key) && /^C[A-Z2-7]{54,55}$/.test(nested)
              ? '[REDACTED_CONTRACT]'
              : redactString(nested, options, paths, `${path}.${key}`);
        continue;
      }
      output[key] = redactValue(nested, options, paths, `${path}.${key}`, depth + 1);
    }
    return output;
  }
  return value;
}

export function redactSnapshot(
  snapshot: PortableLedgerSnapshot,
  options: Partial<RedactionOptions> = {}
): { snapshot: PortableLedgerSnapshot; report: SnapshotRedactionReport } {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const redactedPaths: string[] = [];
  const redacted = redactValue(snapshot, resolved, redactedPaths, 'snapshot') as PortableLedgerSnapshot;

  const uniquePaths = [...new Set(redactedPaths)];
  const report: SnapshotRedactionReport = {
    level: resolved.level,
    redactedFieldCount: uniquePaths.length,
    redactedPaths: uniquePaths.slice(0, 200),
    secretsRemoved: uniquePaths.some((p) => /secret|seed|private|passphrase/i.test(p)),
  };

  return {
    snapshot: {
      ...redacted,
      redaction: report,
    },
    report,
  };
}

export function sanitizeErrorMessage(message: string): string {
  return redactString(message, { level: 'strict' }, [], 'error');
}

export function sanitizeLogPayload(payload: unknown): unknown {
  return redactValue(payload, { level: 'standard' }, [], 'log');
}

export function buildSanitizedExportLabel(label: string): string {
  return label.replace(/[^\w\s.-]/g, '_').slice(0, 120);
}

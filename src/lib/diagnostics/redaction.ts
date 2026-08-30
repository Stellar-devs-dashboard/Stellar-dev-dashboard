import type { RedactionOptions, RedactionReport, RedactionRule } from '../../types/diagnostics';

const DEFAULTS = {
  maxDepth: 8,
  maxNodes: 2_000,
  maxArrayItems: 100,
  maxObjectKeys: 100,
  maxStringLength: 8_192,
  maxOutputBytes: 256 * 1024,
} as const;

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SENSITIVE_KEY =
  /authorization|cookie|token|api[-_]?key|secret|password|passphrase|private|seed|mnemonic|signature|signed|xdr|envelope|account|address|public[-_]?key|contract[-_]?id|local[-_]?id|session[-_]?id|device[-_]?id|file[-_]?name|user[-_]?name/i;
const XDR_KEY = /xdr|envelope|transaction[-_]?bytes|wasm|bytecode/i;
const SIGNATURE_KEY = /signature|signed[-_]?payload|proof/i;
const URL_KEY = /url|uri|endpoint|origin|href|location/i;

const BUILTIN_PATTERNS: Array<{ id: string; expression: RegExp; replacement: string }> = [
  {
    id: 'stellar-secret',
    expression: /\bS[A-Z2-7]{55}\b/g,
    replacement: '[REDACTED_STELLAR_SECRET]',
  },
  {
    id: 'stellar-account',
    expression: /\bG[A-Z2-7]{55}\b/g,
    replacement: '[REDACTED_ACCOUNT_ID]',
  },
  {
    id: 'stellar-muxed-account',
    expression: /\bM[A-Z2-7]{68}\b/g,
    replacement: '[REDACTED_ACCOUNT_ID]',
  },
  {
    id: 'stellar-contract',
    expression: /\bC[A-Z2-7]{55}\b/g,
    replacement: '[REDACTED_CONTRACT_ID]',
  },
  {
    id: 'bearer-token',
    expression: /\b(?:Bearer|Token)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
    replacement: '[REDACTED_AUTH_TOKEN]',
  },
  {
    id: 'jwt',
    expression: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: '[REDACTED_AUTH_TOKEN]',
  },
  {
    id: 'credential-query',
    expression: /([?&](?:token|key|secret|signature|authorization|api[-_]?key)=)[^&#\s]+/gi,
    replacement: '$1[REDACTED]',
  },
  {
    id: 'email',
    expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED_LOCAL_NAME]',
  },
  {
    id: 'unix-home',
    expression: /\/(?:home|Users)\/[^/\s]+/g,
    replacement: '/[REDACTED_LOCAL_NAME]',
  },
  {
    id: 'windows-home',
    expression: /[A-Z]:\\Users\\[^\\\s]+/gi,
    replacement: '[REDACTED_LOCAL_NAME]',
  },
  {
    id: 'uuid',
    expression: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    replacement: '[REDACTED_LOCAL_ID]',
  },
];

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function increment(hits: Record<string, number>, id: string, count = 1): void {
  hits[id] = (hits[id] ?? 0) + count;
}

function countMatches(input: string, expression: RegExp): number {
  const flags = expression.flags.includes('g') ? expression.flags : `${expression.flags}g`;
  return Array.from(input.matchAll(new RegExp(expression.source, flags))).length;
}

function redactUrl(input: string, hits: Record<string, number>): string {
  try {
    const parsed = new URL(input);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return '[REDACTED_URL]';
    increment(hits, 'url');
    return `[REDACTED_URL:${parsed.protocol.replace(':', '')}:${parsed.hostname}]`;
  } catch {
    increment(hits, 'url');
    return '[REDACTED_URL]';
  }
}

function redactUrlsInText(input: string, hits: Record<string, number>): string {
  return input.replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, (url) => redactUrl(url, hits));
}

function applyPatterns(
  value: string,
  customRules: RedactionRule[],
  hits: Record<string, number>
): string {
  let output = redactUrlsInText(value, hits);
  for (const pattern of BUILTIN_PATTERNS) {
    const count = countMatches(output, pattern.expression);
    if (count > 0) {
      output = output.replace(pattern.expression, pattern.replacement);
      increment(hits, pattern.id, count);
    }
  }
  for (const rule of customRules) {
    if (!rule.enabled || !rule.literal) continue;
    const escaped = rule.literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, rule.caseSensitive ? 'g' : 'gi');
    const count = countMatches(output, expression);
    if (count > 0) {
      output = output.replace(expression, `[REDACTED_CUSTOM:${rule.id}]`);
      increment(hits, `custom:${rule.id}`, count);
    }
  }
  return output;
}

function sensitiveReplacement(key: string): string {
  if (XDR_KEY.test(key)) return '[REDACTED_XDR]';
  if (SIGNATURE_KEY.test(key)) return '[REDACTED_SIGNATURE]';
  if (URL_KEY.test(key)) return '[REDACTED_URL]';
  if (/account|address|public[-_]?key/i.test(key)) return '[REDACTED_ACCOUNT_ID]';
  if (/contract/i.test(key)) return '[REDACTED_CONTRACT_ID]';
  if (/name|file/i.test(key)) return '[REDACTED_LOCAL_NAME]';
  return '[REDACTED]';
}

export function validateRedactionRules(rules: RedactionRule[]): RedactionRule[] {
  if (!Array.isArray(rules) || rules.length > 20) {
    throw new Error('Sensitive-pattern configuration must contain at most 20 rules.');
  }
  const ids = new Set<string>();
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object') throw new Error('Sensitive pattern is malformed.');
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/i.test(rule.id)) {
      throw new Error('Sensitive-pattern IDs must use 1–32 letters, numbers, or dashes.');
    }
    if (ids.has(rule.id)) throw new Error(`Duplicate sensitive-pattern ID: ${rule.id}.`);
    ids.add(rule.id);
    const literal = String(rule.literal ?? '').trim();
    if (literal.length < 3 || literal.length > 128) {
      throw new Error('Sensitive-pattern literals must contain 3–128 characters.');
    }
    return {
      id: rule.id,
      label:
        String(rule.label ?? '')
          .trim()
          .slice(0, 80) || rule.id,
      literal,
      caseSensitive: Boolean(rule.caseSensitive),
      enabled: rule.enabled !== false,
    };
  });
}

export function redactDiagnosticValue(
  value: unknown,
  options: RedactionOptions = {}
): RedactionReport {
  const limits = {
    maxDepth: options.maxDepth ?? DEFAULTS.maxDepth,
    maxNodes: options.maxNodes ?? DEFAULTS.maxNodes,
    maxArrayItems: options.maxArrayItems ?? DEFAULTS.maxArrayItems,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULTS.maxObjectKeys,
    maxStringLength: options.maxStringLength ?? DEFAULTS.maxStringLength,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULTS.maxOutputBytes,
  };
  const customRules = validateRedactionRules(options.customRules ?? []);
  const seen = new WeakSet<object>();
  const ruleHits: Record<string, number> = {};
  let nodes = 0;
  let truncated = false;
  let cycles = 0;

  const visit = (input: unknown, key: string | undefined, depth: number): unknown => {
    nodes += 1;
    if (nodes > limits.maxNodes || depth > limits.maxDepth) {
      truncated = true;
      increment(ruleHits, 'limit');
      return '[TRUNCATED]';
    }
    if (input === null || typeof input === 'boolean' || typeof input === 'number') {
      return Number.isFinite(input as number) || typeof input !== 'number' ? input : String(input);
    }
    if (typeof input === 'bigint') return `${input.toString()}n`;
    if (typeof input === 'undefined') return '[UNDEFINED]';
    if (typeof input === 'function') return '[FUNCTION]';
    if (typeof input === 'symbol') return '[SYMBOL]';
    if (typeof input === 'string') {
      if (key && SENSITIVE_KEY.test(key)) {
        increment(ruleHits, `field:${key.toLowerCase()}`);
        return sensitiveReplacement(key);
      }
      let output = applyPatterns(input, customRules, ruleHits);
      if (output.length > limits.maxStringLength) {
        output = `${output.slice(0, limits.maxStringLength)}[TRUNCATED]`;
        truncated = true;
        increment(ruleHits, 'string-limit');
      }
      return output;
    }
    if (input instanceof Date)
      return Number.isNaN(input.getTime()) ? '[INVALID_DATE]' : input.toISOString();
    if (input instanceof Error) {
      return visit(
        {
          name: input.name,
          message: input.message,
          stack: input.stack,
          cause: 'cause' in input ? input.cause : undefined,
        },
        key,
        depth + 1
      );
    }
    if (typeof input !== 'object') return String(input);
    if (seen.has(input)) {
      cycles += 1;
      increment(ruleHits, 'cycle');
      return '[CIRCULAR]';
    }
    seen.add(input);
    if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer || input instanceof Blob) {
      increment(ruleHits, 'binary');
      return '[REDACTED_BINARY]';
    }
    if (Array.isArray(input)) {
      const limited = input
        .slice(0, limits.maxArrayItems)
        .map((item) => visit(item, key, depth + 1));
      if (input.length > limits.maxArrayItems) {
        limited.push(`[TRUNCATED_${input.length - limits.maxArrayItems}_ITEMS]`);
        truncated = true;
        increment(ruleHits, 'array-limit');
      }
      return limited;
    }
    const output: Record<string, unknown> = {};
    let keys: string[];
    try {
      keys = Object.keys(input as object).sort();
    } catch {
      increment(ruleHits, 'unreadable-object');
      return '[UNREADABLE_OBJECT]';
    }
    for (const childKey of keys.slice(0, limits.maxObjectKeys)) {
      if (BLOCKED_KEYS.has(childKey)) {
        increment(ruleHits, 'blocked-key');
        continue;
      }
      try {
        const child = (input as Record<string, unknown>)[childKey];
        if (
          SENSITIVE_KEY.test(childKey) &&
          (typeof child === 'string' ||
            typeof child === 'undefined' ||
            (child !== null && typeof child === 'object'))
        ) {
          output[childKey] = sensitiveReplacement(childKey);
          increment(ruleHits, `field:${childKey.toLowerCase()}`);
        } else {
          output[childKey] = visit(child, childKey, depth + 1);
        }
      } catch {
        output[childKey] = '[UNREADABLE_PROPERTY]';
        increment(ruleHits, 'unreadable-property');
      }
    }
    if (keys.length > limits.maxObjectKeys) {
      output['[truncatedKeys]'] = keys.length - limits.maxObjectKeys;
      truncated = true;
      increment(ruleHits, 'object-limit');
    }
    return output;
  };

  let redacted = visit(value, undefined, 0);
  let serialized = stableCanonicalJson(redacted);
  if (byteLength(serialized) > limits.maxOutputBytes) {
    redacted = {
      summary: '[TRUNCATED_PAYLOAD]',
      originalType: Array.isArray(value) ? 'array' : typeof value,
      byteLimit: limits.maxOutputBytes,
    };
    serialized = stableCanonicalJson(redacted);
    truncated = true;
    increment(ruleHits, 'byte-limit');
  }
  return {
    value: redacted,
    replacements: Object.entries(ruleHits)
      .filter(([id]) => !id.includes('limit') && id !== 'cycle')
      .reduce((total, [, count]) => total + count, 0),
    truncated,
    cycles,
    bytes: byteLength(serialized),
    ruleHits,
  };
}

export function stableCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableCanonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(record[key])}`)
    .join(',')}}`;
}

export function diagnosticByteLength(value: unknown): number {
  return byteLength(stableCanonicalJson(value));
}

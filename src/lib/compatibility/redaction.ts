const SENSITIVE_KEY = /authorization|api[-_]?key|token|secret|password|cookie|signature/i;
const SENSITIVE_VALUE =
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+|([?&](?:api[-_]?key|token|secret|signature)=)[^&#\s]+/gi;

export function redactText(value: string): string {
  return value
    .replace(
      SENSITIVE_VALUE,
      (_match, bearerPrefix: string | undefined, queryPrefix: string | undefined) =>
        `${bearerPrefix ?? queryPrefix ?? ''}[REDACTED]`
    )
    .replace(/\bS[A-Z2-7]{55}\b/g, '[REDACTED_STELLAR_SECRET]');
}

/** Drops query strings, credentials, and fragments while retaining useful endpoint context. */
export function redactEndpoint(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, parsed.pathname === '/' ? '' : '/');
  } catch {
    return redactText(value).split('?')[0].split('#')[0];
  }
}

export function redactUnknown(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[TRUNCATED]';
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactUnknown(item, depth + 1),
    ])
  );
}

export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const allowed = [
    'server',
    'x-stellar-rpc-version',
    'x-rpc-version',
    'x-request-id',
    'x-vendor',
    'x-ratelimit-limit',
  ];
  const output: Record<string, string> = {};
  for (const name of allowed) {
    const value = headers.get(name);
    if (value) output[name] = redactText(value).slice(0, 160);
  }
  return output;
}

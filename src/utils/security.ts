/**
 * Security utilities (#106)
 */

const DANGEROUS_HTML_CHARS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

const SECRET_KEY_PATTERN = /\bS[A-Z2-7]{55}\b/g;
const SENSITIVE_FIELD_REGEX = /(secret|secretkey|privatekey|seed|mnemonic|password|passphrase|token|apikey|authorization|headers)/i;
const AUTH_TOKEN_PATTERN = /\b(Bearer|Token)\s+[A-Za-z0-9\-._~+/]+=*\b/gi;

export function generateCspNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function buildCspHeader(nonce?: string): string {
  const nonceAttr = nonce ? ` 'nonce-${nonce}'` : '';
  return [
    `default-src 'self'`,
    `script-src 'self'${nonceAttr}`,
    `style-src 'self'${nonceAttr}`,
    `img-src 'self' data: https:`,
    `connect-src 'self' https://*.stellar.org https://api.coingecko.com`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export function redactSensitive(value: unknown, key?: string): unknown {
  if (value == null) return value;

  if (typeof value === 'string') {
    let redacted = value.replace(SECRET_KEY_PATTERN, '[REDACTED_SECRET_KEY]');
    redacted = redacted.replace(AUTH_TOKEN_PATTERN, '$1 [REDACTED]');
    if (key && SENSITIVE_FIELD_REGEX.test(key)) {
      return '[REDACTED]';
    }
    return redacted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [childKey, childValue]) => {
      if (SENSITIVE_FIELD_REGEX.test(childKey)) {
        acc[childKey] = '[REDACTED]';
      } else {
        acc[childKey] = redactSensitive(childValue, childKey);
      }
      return acc;
    }, {});
  }

  return value;
}

export function escapeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[&<>"'/]/g, (ch) => DANGEROUS_HTML_CHARS[ch] ?? ch);
}

export function stripHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '');
}

export function sanitizeStellarAddress(value: string): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^A-Z2-7]/gi, '').toUpperCase();
}

export function sanitizeMemo(value: string): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 28);
}

export async function secureCopy(text: string, clearAfterMs = 30_000): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (clearAfterMs > 0) {
      setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), clearAfterMs);
    }
    return true;
  } catch {
    return false;
  }
}

interface RateLimitRecord {
  calls: number[];
  blocked: boolean;
}

const _rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(action: string, maxCalls = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = _rateLimitMap.get(action) ?? { calls: [], blocked: false };

  record.calls = record.calls.filter((t) => now - t < windowMs);

  if (record.calls.length >= maxCalls) {
    _rateLimitMap.set(action, record);
    return false;
  }

  record.calls.push(now);
  _rateLimitMap.set(action, record);
  return true;
}

export function resetRateLimit(action: string): void {
  _rateLimitMap.delete(action);
}

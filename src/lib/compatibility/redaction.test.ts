import { describe, expect, it } from 'vitest';
import { redactEndpoint, redactText, redactUnknown, sanitizeHeaders } from './redaction';

describe('compatibility redaction', () => {
  it('redacts bearer tokens, query credentials, Stellar secret seeds, and nested keys', () => {
    expect(redactText('Bearer abc.def.ghi')).toBe('Bearer [REDACTED]');
    expect(redactText('url?token=hello&x=1')).not.toContain('hello');
    expect(redactText(`seed S${'A'.repeat(55)}`)).toContain('[REDACTED_STELLAR_SECRET]');
    expect(
      redactUnknown({ apiKey: 'secret', nested: { password: 'secret', ok: 'value' } })
    ).toEqual({
      apiKey: '[REDACTED]',
      nested: { password: '[REDACTED]', ok: 'value' },
    });
  });

  it('preserves only safe endpoint and response-header context', () => {
    expect(redactEndpoint('https://user:pass@example.test/rpc?token=x#y')).toBe(
      'https://example.test/rpc'
    );
    const headers = new Headers({
      authorization: 'Bearer secret',
      server: 'fixture',
      'x-request-id': 'request-1',
    });
    expect(sanitizeHeaders(headers)).toEqual({ server: 'fixture', 'x-request-id': 'request-1' });
  });
});

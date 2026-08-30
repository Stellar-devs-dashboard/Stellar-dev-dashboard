import { describe, expect, it } from 'vitest';
import {
  diagnosticByteLength,
  redactDiagnosticValue,
  stableCanonicalJson,
  validateRedactionRules,
} from '../redaction';

const ACCOUNT = `G${'A'.repeat(55)}`;
const SECRET = `S${'B'.repeat(55)}`;
const CONTRACT = `C${'C'.repeat(55)}`;

describe('diagnostic redaction boundary', () => {
  it('redacts protocol identifiers, credentials, URLs, local names, and sensitive fields', () => {
    const report = redactDiagnosticValue({
      message: `Account ${ACCOUNT} called ${CONTRACT} with ${SECRET} at https://rpc.example.test/path?token=raw`,
      authorization: 'Bearer very-secret-access-token',
      transactionXdr: 'AAAA-long-envelope',
      signature: 'deadbeef',
      accountId: ACCOUNT,
      endpointUrl: 'https://rpc.example.test/secret/path',
      localPath: '/home/emmy/private-diagnostics.json',
      emailMessage: 'operator@example.test reported it',
      cookieEnabled: true,
      accountCount: 3,
    });
    const serialized = JSON.stringify(report.value);

    expect(serialized).not.toContain(ACCOUNT);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(CONTRACT);
    expect(serialized).not.toContain('very-secret-access-token');
    expect(serialized).not.toContain('AAAA-long-envelope');
    expect(serialized).not.toContain('deadbeef');
    expect(serialized).not.toContain('/home/emmy');
    expect(serialized).not.toContain('operator@example.test');
    expect(serialized).toContain('[REDACTED_STELLAR_SECRET]');
    expect(serialized).toContain('[REDACTED_ACCOUNT_ID]');
    expect(serialized).toContain('[REDACTED_CONTRACT_ID]');
    expect(serialized).toContain('[REDACTED_XDR]');
    expect(serialized).toContain('[REDACTED_SIGNATURE]');
    expect(serialized).toContain('[REDACTED_URL:');
    expect(report.replacements).toBeGreaterThanOrEqual(8);
    expect(report.value).toMatchObject({ cookieEnabled: true, accountCount: 3 });
  });

  it('applies validated literal session rules without evaluating regular expressions', () => {
    const rules = validateRedactionRules([
      {
        id: 'tenant-code',
        label: 'Tenant code',
        literal: 'client.(a+)+[42]',
        caseSensitive: false,
        enabled: true,
      },
    ]);
    const report = redactDiagnosticValue(
      { note: 'CLIENT.(A+)+[42] and client.(a+)+[42]' },
      { customRules: rules }
    );

    expect(report.value).toEqual({
      note: '[REDACTED_CUSTOM:tenant-code] and [REDACTED_CUSTOM:tenant-code]',
    });
    expect(report.ruleHits['custom:tenant-code']).toBe(2);
    expect(() =>
      validateRedactionRules([
        { id: 'bad id', label: 'Bad', literal: 'abc', caseSensitive: true, enabled: true },
      ])
    ).toThrow(/IDs/);
  });

  it('bounds huge and cyclic inputs and survives hostile property access', () => {
    const cyclic: Record<string, unknown> = {
      huge: 'x'.repeat(20_000),
      items: Array.from({ length: 150 }, (_, index) => ({ index })),
    };
    cyclic.self = cyclic;
    Object.defineProperty(cyclic, 'hostile', {
      enumerable: true,
      get() {
        throw new Error('getter must remain contained');
      },
    });

    const report = redactDiagnosticValue(cyclic, {
      maxStringLength: 80,
      maxArrayItems: 5,
      maxOutputBytes: 4_096,
    });
    const serialized = JSON.stringify(report.value);

    expect(report.truncated).toBe(true);
    expect(report.cycles).toBe(1);
    expect(report.bytes).toBeLessThanOrEqual(4_096);
    expect(serialized).toContain('[CIRCULAR]');
    expect(serialized).toContain('[UNREADABLE_PROPERTY]');
    expect(serialized).toContain('TRUNCATED_145_ITEMS');
    expect(serialized).not.toContain('getter must remain contained');
  });

  it('produces stable canonical JSON and deterministic byte counts', () => {
    const first = { z: 1, a: { c: 3, b: 2 } };
    const second = { a: { b: 2, c: 3 }, z: 1 };
    expect(stableCanonicalJson(first)).toBe(stableCanonicalJson(second));
    expect(diagnosticByteLength(first)).toBe(diagnosticByteLength(second));
    expect(redactDiagnosticValue(first).value).toEqual(redactDiagnosticValue(second).value);
  });
});

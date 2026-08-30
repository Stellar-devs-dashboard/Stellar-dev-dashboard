import { describe, expect, it } from 'vitest';
import {
  buildExportPayload,
  buildGenericLedgerRows,
  DEFAULT_ACCOUNTING_MAPPING,
  parseExportPayload,
  roundTripPayload,
  validateAccountingMapping,
  validateExportPayload,
} from './exportImport';
import type { LedgerPosting, ReconciliationPeriod } from '../../types/treasury';

const period: ReconciliationPeriod = {
  id: 'acct:testnet:2024-01-01',
  accountId: 'GACCT',
  network: 'testnet',
  start: '2024-01-01',
  end: '2024-02-01',
  status: 'open',
  createdAt: '2024-01-01T00:00:00Z',
};

const postings: LedgerPosting[] = [
  {
    id: 'p1',
    txHash: 'tx1',
    ledger: 1,
    timestamp: '2024-01-05T00:00:00Z',
    kind: 'fee',
    asset: { kind: 'native', code: 'XLM', decimals: 7 },
    amount: '-0.00001',
    successful: true,
    category: 'network-fee',
    provenance: { sourceType: 'transaction-fee', sourceId: 'tx1' },
  },
  {
    id: 'p2',
    txHash: 'tx2',
    ledger: 2,
    timestamp: '2024-01-06T00:00:00Z',
    kind: 'payment',
    asset: { kind: 'native', code: 'XLM', decimals: 7 },
    amount: '100',
    counterparty: 'GVENDOR',
    successful: true,
    provenance: { sourceType: 'operation', sourceId: 'op2' },
  },
];

describe('buildExportPayload / round trip', () => {
  it('round-trips a payload through JSON export/import unchanged', () => {
    const payload = buildExportPayload(period, postings, [], [], []);
    const result = roundTripPayload(payload);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(payload);
  });

  it('stamps the current export schema version', () => {
    const payload = buildExportPayload(period, postings, [], [], []);
    expect(payload.version).toBe(1);
  });
});

describe('parseExportPayload', () => {
  it('rejects invalid JSON', () => {
    const result = parseExportPayload('{ not json');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not valid JSON/i);
  });

  it('rejects an unsupported version', () => {
    const payload = buildExportPayload(period, postings, [], [], []);
    const result = parseExportPayload(JSON.stringify({ ...payload, version: 2 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unsupported export version/i);
  });

  it('rejects a payload with an unparsable posting amount', () => {
    const payload = buildExportPayload(period, [{ ...postings[0], amount: 'not-a-number' }], [], [], []);
    const result = parseExportPayload(JSON.stringify(payload));
    expect(result.ok).toBe(false);
  });
});

describe('validateExportPayload', () => {
  it('flags every missing required field', () => {
    const errors = validateExportPayload({});
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exportedAt'),
        expect.stringContaining('period'),
        expect.stringContaining('postings'),
        expect.stringContaining('balances'),
      ])
    );
  });

  it('returns no errors for a well-formed payload', () => {
    const payload = buildExportPayload(period, postings, [], [], []);
    expect(validateExportPayload(payload)).toHaveLength(0);
  });
});

describe('accounting mapping', () => {
  it('validates the default mapping cleanly', () => {
    expect(validateAccountingMapping(DEFAULT_ACCOUNTING_MAPPING)).toHaveLength(0);
  });

  it('rejects duplicate category entries', () => {
    const mapping = {
      ...DEFAULT_ACCOUNTING_MAPPING,
      entries: [
        { category: 'x', accountCode: '1', accountName: 'A' },
        { category: 'x', accountCode: '2', accountName: 'B' },
      ],
    };
    expect(validateAccountingMapping(mapping).length).toBeGreaterThan(0);
  });

  it('builds balanced double-entry rows: every posting produces a debit leg and a matching credit leg', () => {
    const rows = buildGenericLedgerRows(postings, DEFAULT_ACCOUNTING_MAPPING);
    expect(rows).toHaveLength(postings.length * 2);
    for (let i = 0; i < postings.length; i += 1) {
      const [main, clearing] = rows.slice(i * 2, i * 2 + 2);
      expect(main.debit === '0' || main.credit === '0').toBe(true);
      // The two legs of one posting must be mirror images of each other.
      expect(main.debit).toBe(clearing.credit);
      expect(main.credit).toBe(clearing.debit);
    }
  });

  it('maps a categorized posting to its configured account code', () => {
    const rows = buildGenericLedgerRows([postings[0]], DEFAULT_ACCOUNTING_MAPPING);
    expect(rows[0].accountCode).toBe('6100'); // network-fee → 6100 per DEFAULT_ACCOUNTING_MAPPING
  });

  it('falls back to the default account code for an uncategorized posting', () => {
    const rows = buildGenericLedgerRows([postings[1]], DEFAULT_ACCOUNTING_MAPPING);
    expect(rows[0].accountCode).toBe(DEFAULT_ACCOUNTING_MAPPING.defaultAccountCode);
  });
});

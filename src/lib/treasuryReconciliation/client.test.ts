import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReconciliationPeriod, TreasuryReconciliationError } from './client';
import { resetPostingIdSequence } from './normalize';
import { resetDiscrepancyIdSequence } from './reconcile';
import type { ReconciliationPeriod } from '../../types/treasury';

vi.mock('../stellar', async () => {
  const actual = await vi.importActual<typeof import('../stellar')>('../stellar');
  return {
    ...actual,
    fetchOperations: vi.fn(),
    fetchTransactions: vi.fn(),
    fetchTrades: vi.fn(),
    fetchEffects: vi.fn(),
  };
});

import { fetchEffects, fetchOperations, fetchTrades, fetchTransactions } from '../stellar';

const ACCOUNT = 'GACCOUNTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const period: ReconciliationPeriod = {
  id: `${ACCOUNT}:testnet:2024-01-01`,
  accountId: ACCOUNT,
  network: 'testnet',
  start: '2024-01-01',
  end: '2024-02-01',
  status: 'open',
  createdAt: '2024-01-01T00:00:00Z',
};

function emptyPage() {
  return { records: [], nextCursor: null, hasMore: false };
}

beforeEach(() => {
  resetPostingIdSequence();
  resetDiscrepancyIdSequence();
  vi.mocked(fetchOperations).mockReset();
  vi.mocked(fetchTransactions).mockReset();
  vi.mocked(fetchTrades).mockReset();
  vi.mocked(fetchEffects).mockReset();
});

describe('fetchReconciliationPeriod — happy path', () => {
  it('normalizes a single in-period payment into a live result', async () => {
    vi.mocked(fetchOperations).mockResolvedValueOnce({
      records: [
        {
          id: 'op1',
          type: 'payment',
          source_account: ACCOUNT,
          created_at: '2024-01-15T00:00:00Z',
          transaction_hash: 'tx1',
          transaction_successful: true,
          from: ACCOUNT,
          to: 'GDEST',
          amount: '10',
          asset_type: 'native',
        } as never,
      ],
      nextCursor: null,
      hasMore: false,
    });
    vi.mocked(fetchTransactions).mockResolvedValueOnce(emptyPage() as never);
    vi.mocked(fetchTrades).mockResolvedValueOnce(emptyPage() as never);
    vi.mocked(fetchEffects).mockResolvedValueOnce(emptyPage() as never);

    const result = await fetchReconciliationPeriod(ACCOUNT, 'testnet', period);
    expect(result.state).toBe('live');
    expect(result.postings).toHaveLength(1);
    expect(result.balances[0].closing).toBe('-10');
    expect(result.truncated).toBe(false);
  });
});

describe('fetchReconciliationPeriod — pagination boundary', () => {
  it('skips records newer than the period end and stops once records older than the period start appear', async () => {
    vi.mocked(fetchOperations).mockResolvedValueOnce({
      records: [
        { id: 'too-new', type: 'payment', created_at: '2024-03-01T00:00:00Z', transaction_hash: 'tx-new', transaction_successful: true, from: ACCOUNT, to: 'G', amount: '1', asset_type: 'native' },
        { id: 'in-window', type: 'payment', created_at: '2024-01-15T00:00:00Z', transaction_hash: 'tx-in', transaction_successful: true, from: ACCOUNT, to: 'G', amount: '1', asset_type: 'native' },
        { id: 'too-old', type: 'payment', created_at: '2023-12-01T00:00:00Z', transaction_hash: 'tx-old', transaction_successful: true, from: ACCOUNT, to: 'G', amount: '1', asset_type: 'native' },
      ] as never[],
      nextCursor: 'cursor-1',
      hasMore: true,
    });
    vi.mocked(fetchTransactions).mockResolvedValueOnce(emptyPage() as never);
    vi.mocked(fetchTrades).mockResolvedValueOnce(emptyPage() as never);
    vi.mocked(fetchEffects).mockResolvedValueOnce(emptyPage() as never);

    const result = await fetchReconciliationPeriod(ACCOUNT, 'testnet', period);
    expect(result.postings.map((p) => p.operationId)).toEqual(['in-window']);
    // Having seen a too-old record, pagination must not have requested a second page.
    expect(fetchOperations).toHaveBeenCalledTimes(1);
  });
});

describe('fetchReconciliationPeriod — cancellation', () => {
  it('throws an aborted TreasuryReconciliationError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetchOperations).mockImplementation(() => new Promise(() => {}));
    vi.mocked(fetchTransactions).mockResolvedValue(emptyPage() as never);
    vi.mocked(fetchTrades).mockResolvedValue(emptyPage() as never);
    vi.mocked(fetchEffects).mockResolvedValue(emptyPage() as never);

    await expect(fetchReconciliationPeriod(ACCOUNT, 'testnet', period, { signal: controller.signal })).rejects.toMatchObject(
      { code: 'aborted' }
    );
  });
});

describe('fetchReconciliationPeriod — network failure fallback', () => {
  it('falls back to a deterministic simulation snapshot when Horizon is unreachable', async () => {
    vi.mocked(fetchOperations).mockRejectedValue(new Error('network unreachable'));
    vi.mocked(fetchTransactions).mockRejectedValue(new Error('network unreachable'));
    vi.mocked(fetchTrades).mockRejectedValue(new Error('network unreachable'));
    vi.mocked(fetchEffects).mockRejectedValue(new Error('network unreachable'));

    const result = await fetchReconciliationPeriod(ACCOUNT, 'testnet', period);
    expect(result.state).toBe('simulation');
    expect(result.postings.length).toBeGreaterThan(0);
  });

  it('the simulation fallback never throws, even though it is the error path', async () => {
    vi.mocked(fetchOperations).mockRejectedValue(new Error('boom'));
    vi.mocked(fetchTransactions).mockRejectedValue(new Error('boom'));
    vi.mocked(fetchTrades).mockRejectedValue(new Error('boom'));
    vi.mocked(fetchEffects).mockRejectedValue(new Error('boom'));

    await expect(fetchReconciliationPeriod(ACCOUNT, 'testnet', period)).resolves.toBeDefined();
  });

  it('falls back to simulation on a request that never settles, rather than hanging or throwing a hard timeout error', async () => {
    vi.useFakeTimers();
    try {
      // Never resolves or rejects on its own — only the internal timeout race ends it.
      vi.mocked(fetchOperations).mockImplementation(() => new Promise(() => {}));
      vi.mocked(fetchTransactions).mockImplementation(() => new Promise(() => {}));
      vi.mocked(fetchTrades).mockImplementation(() => new Promise(() => {}));
      vi.mocked(fetchEffects).mockImplementation(() => new Promise(() => {}));

      const pending = fetchReconciliationPeriod(ACCOUNT, 'testnet', period);
      await vi.advanceTimersByTimeAsync(16_000); // past the 15s internal request timeout
      const result = await pending;
      expect(result.state).toBe('simulation');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TreasuryReconciliationError', () => {
  it('carries code/retryable/requestId through the Error subclass', () => {
    const error = new TreasuryReconciliationError({ code: 'timeout', message: 'slow', retryable: true, requestId: 'r1' });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('timeout');
    expect(error.retryable).toBe(true);
    expect(error.requestId).toBe('r1');
  });
});

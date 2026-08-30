/**
 * Orchestrates fetching a reconciliation period's ledger activity from
 * Horizon (via `src/lib/stellar.ts`), normalizing it, and computing
 * balances/discrepancies. Mirrors `fraudDetection/client.ts`'s shape:
 * bounded timeout, abortable, and a graceful fallback to deterministic
 * fixtures (`state: 'simulation'`) rather than a hard failure when the
 * network is unreachable — the same behavior used throughout this app's
 * Playwright suite, which blocks all non-localhost requests.
 */

import type { NetworkName } from '../stellar';
import {
  fetchEffects,
  fetchOperations,
  fetchTrades,
  fetchTransactions,
} from '../stellar';
import { normalizeEffects, normalizeOperations, normalizeTrades, normalizeTransactionFees, resetPostingIdSequence } from './normalize';
import { computeAssetBalances, detectDiscrepancies, mergePostingSources, resetDiscrepancyIdSequence } from './reconcile';
import { applyCategoryRules, DEFAULT_CATEGORY_RULES } from './rules';
import { buildDemoPeriod, buildDemoPostings } from './fixtures';
import type {
  CategoryRule,
  CostBasisEntry,
  ReconciliationPeriod,
  ReconciliationResult,
  TreasuryApiError,
} from '../../types/treasury';

export class TreasuryReconciliationError extends Error implements TreasuryApiError {
  code: TreasuryApiError['code'];
  retryable: boolean;
  requestId?: string;
  constructor(error: TreasuryApiError) {
    super(error.message);
    this.name = 'TreasuryReconciliationError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.requestId = error.requestId;
  }
}

const requestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `treasury-${Date.now()}`;

const MAX_PAGES_PER_SOURCE = 25;
const PAGE_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 15_000;

interface Paged<T> {
  records: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Pages backward (Horizon's default `desc` order) through a record source
 * until the collected records fall entirely within `[period.start,
 * period.end)`, skipping records newer than the period and stopping once a
 * record older than the period is seen. Bounded by MAX_PAGES_PER_SOURCE so
 * a very large account history can never hang indefinitely — `truncated`
 * is set instead, and surfaced to the caller as a paging-gap discrepancy.
 */
async function paginateWithinPeriod<T>(
  fetchPage: (_cursor: string | null, _signal?: AbortSignal) => Promise<Paged<T>>,
  getTimestamp: (_record: T) => string,
  period: ReconciliationPeriod,
  signal?: AbortSignal
): Promise<{ records: T[]; truncated: boolean }> {
  const collected: T[] = [];
  let cursor: string | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES_PER_SOURCE; page += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { records, nextCursor, hasMore } = await fetchPage(cursor, signal);
    if (records.length === 0) break;

    let pastPeriodStart = false;
    for (const record of records) {
      const ts = getTimestamp(record);
      if (ts >= period.end) continue; // still newer than the window; keep paging back
      if (ts < period.start) {
        pastPeriodStart = true;
        break;
      }
      collected.push(record);
    }

    if (pastPeriodStart || !hasMore || !nextCursor) break;
    cursor = nextCursor;
    if (page === MAX_PAGES_PER_SOURCE - 1) truncated = true;
  }

  return { records: collected, truncated };
}

/** Distinguishes a timeout from a genuine rejection of the raced promise. */
class TimeoutRaceError extends Error {}

/**
 * Races `promise` against a timer. On timeout this *rejects* (rather than
 * merely flagging an AbortSignal that nothing downstream actually respects
 * for cancellation) so a slow-but-not-yet-failed Horizon call still causes
 * `fetchReconciliationPeriod`'s single catch block to run — the same
 * graceful fallback to the simulation snapshot as an outright network
 * failure, instead of a separate hard-error "timeout" path.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle = 0;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = window.setTimeout(() => reject(new TimeoutRaceError('Reconciliation request timed out.')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

export interface FetchReconciliationOptions {
  signal?: AbortSignal;
  rules?: CategoryRule[];
  costBasisEntries?: CostBasisEntry[];
  openingBalances?: Record<string, string>;
  /** Independently-known expected closing balances, for discrepancy cross-checks. */
  expectedClosingBalances?: Record<string, string>;
}

export async function fetchReconciliationPeriod(
  accountId: string,
  network: NetworkName,
  period: ReconciliationPeriod,
  options: FetchReconciliationOptions = {}
): Promise<ReconciliationResult> {
  const id = requestId();
  if (options.signal?.aborted) {
    // `AbortSignal.addEventListener('abort', ...)` below only fires on a
    // *future* abort — a signal already aborted before this call would
    // otherwise be silently ignored and the fetch would proceed anyway.
    throw new TreasuryReconciliationError({
      code: 'aborted',
      message: 'Reconciliation request was cancelled.',
      retryable: false,
      requestId: id,
    });
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });

  try {
    const [operationsResult, transactionsResult, tradesResult, effectsResult] = await withTimeout(
      Promise.all([
        paginateWithinPeriod(
          (cursor, signal) => fetchOperations(accountId, network, PAGE_LIMIT, cursor, signal),
          (op) => op.created_at,
          period,
          controller.signal
        ),
        paginateWithinPeriod(
          (cursor, signal) => fetchTransactions(accountId, network, PAGE_LIMIT, cursor, signal),
          (tx) => tx.created_at,
          period,
          controller.signal
        ),
        paginateWithinPeriod(
          (cursor, signal) => fetchTrades(accountId, network, PAGE_LIMIT, cursor, signal),
          (trade) => trade.ledger_close_time,
          period,
          controller.signal
        ),
        paginateWithinPeriod(
          (cursor, signal) => fetchEffects(accountId, network, PAGE_LIMIT, cursor, signal),
          (effect) => effect.created_at,
          period,
          controller.signal
        ),
      ]),
      REQUEST_TIMEOUT_MS
    );

    if (options.signal?.aborted) {
      throw new TreasuryReconciliationError({
        code: 'aborted',
        message: 'Reconciliation request was cancelled.',
        retryable: false,
        requestId: id,
      });
    }

    const operationPostings = normalizeOperations(accountId, operationsResult.records);
    const feePostings = normalizeTransactionFees(accountId, transactionsResult.records);
    const tradePostings = normalizeTrades(accountId, tradesResult.records);
    const effectPostings = normalizeEffects(accountId, effectsResult.records);

    let postings = mergePostingSources({ operationPostings, feePostings, tradePostings, effectPostings });
    postings = applyCategoryRules(postings, options.rules ?? DEFAULT_CATEGORY_RULES);

    const balances = computeAssetBalances(postings, options.openingBalances);
    const truncated =
      operationsResult.truncated || transactionsResult.truncated || tradesResult.truncated || effectsResult.truncated;
    const pagingGapWarnings = truncated
      ? [
          `Reached the ${MAX_PAGES_PER_SOURCE * PAGE_LIMIT}-record safety cap for one or more sources before ` +
            `covering the full period; some early activity in this period may be missing. Narrow the period or ` +
            `increase the page cap to get a complete reconciliation.`,
        ]
      : [];
    const discrepancies = detectDiscrepancies({
      periodId: period.id,
      postings,
      balances,
      costBasisEntries: options.costBasisEntries ?? [],
      expectedClosingBalances: options.expectedClosingBalances,
      pagingGapWarnings,
    });

    return {
      state: 'live',
      period,
      postings,
      balances,
      discrepancies,
      generatedAt: new Date().toISOString(),
      requestId: id,
      truncated,
    };
  } catch (error) {
    if (error instanceof TreasuryReconciliationError) throw error;
    if (options.signal?.aborted) {
      throw new TreasuryReconciliationError({
        code: 'aborted',
        message: 'Reconciliation request was cancelled.',
        retryable: false,
        requestId: id,
      });
    }
    // Network unreachable (offline, blocked, Horizon down): fall back to a
    // deterministic demonstration snapshot rather than a hard failure, so
    // the workspace is still explorable — clearly labeled as simulated.
    return buildSimulationResult(accountId, network, period, id);
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}

function buildSimulationResult(
  accountId: string,
  network: NetworkName,
  period: ReconciliationPeriod,
  id: string
): ReconciliationResult {
  resetPostingIdSequence();
  resetDiscrepancyIdSequence();
  const demoPeriod = { ...period, accountId, network };
  const postings = applyCategoryRules(buildDemoPostings(demoPeriod), DEFAULT_CATEGORY_RULES);
  const balances = computeAssetBalances(postings);
  const discrepancies = detectDiscrepancies({
    periodId: period.id,
    postings,
    balances,
    costBasisEntries: [],
  });
  return {
    state: 'simulation',
    period: demoPeriod,
    postings,
    balances,
    discrepancies,
    generatedAt: new Date().toISOString(),
    requestId: id,
    truncated: false,
  };
}

export function createDemonstrationPeriod(accountId: string, network: string, start: string, end: string): ReconciliationPeriod {
  return buildDemoPeriod(accountId, network, start, end);
}

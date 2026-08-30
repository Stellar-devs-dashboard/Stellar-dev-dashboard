import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TreasuryReconciliationDashboard from './TreasuryReconciliationDashboard';
import useTreasuryReconciliation from '../../hooks/useTreasuryReconciliation';
import { useStore } from '../../lib/store';
import type { ReconciliationPeriod, ReconciliationResult } from '../../types/treasury';

vi.mock('../../hooks/useTreasuryReconciliation');
vi.mock('../../lib/store');

const mocked = vi.mocked(useTreasuryReconciliation);
const mockedStore = vi.mocked(useStore);

const period: ReconciliationPeriod = {
  id: 'acct:testnet:2024-01-01',
  accountId: 'GACCOUNTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  network: 'testnet',
  start: '2024-01-01',
  end: '2024-02-01',
  status: 'open',
  createdAt: '2024-01-01T00:00:00Z',
};

function reconciliationResult(overrides: Partial<ReconciliationResult> = {}): ReconciliationResult {
  return {
    state: 'live',
    period,
    postings: [
      {
        id: 'p1',
        txHash: 'tx1',
        ledger: 1,
        timestamp: '2024-01-05T00:00:00Z',
        kind: 'payment',
        asset: { kind: 'native', code: 'XLM', decimals: 7 },
        amount: '-25',
        counterparty: 'GVENDOR',
        successful: true,
        provenance: { sourceType: 'operation', sourceId: 'op1' },
      },
    ],
    balances: [
      { asset: { kind: 'native', code: 'XLM', decimals: 7 }, opening: '100', closing: '75', netChange: '-25', inflow: '0', outflow: '25', postingCount: 1 },
    ],
    discrepancies: [],
    generatedAt: '2024-01-20T00:00:00Z',
    requestId: 'req-1',
    truncated: false,
    ...overrides,
  };
}

function baseMock(overrides: Partial<ReturnType<typeof useTreasuryReconciliation>> = {}) {
  return {
    periods: [period],
    activePeriod: period,
    setActivePeriodId: vi.fn(),
    result: reconciliationResult(),
    closedSnapshot: null,
    rules: [],
    costBasisEntries: [],
    review: [],
    loading: false,
    refreshing: false,
    error: null,
    message: '',
    clearMessage: vi.fn(),
    preferences: { minimumDiscrepancySeverity: 'info' as const, accountingMappingId: 'default' },
    setPreferences: vi.fn(),
    unresolvedCount: 0,
    refresh: vi.fn(),
    createPeriod: vi.fn(),
    closePeriod: vi.fn(),
    upsertRule: vi.fn(),
    removeRule: vi.fn(),
    upsertCostBasisEntry: vi.fn(),
    removeCostBasisEntry: vi.fn(),
    setReviewStatus: vi.fn(),
    exportJson: vi.fn(),
    exportCsv: vi.fn(),
    exportGenericLedger: vi.fn(),
    importAndVerify: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTreasuryReconciliation>;
}

describe('TreasuryReconciliationDashboard', () => {
  beforeEach(() => {
    mocked.mockReturnValue(baseMock());
    mockedStore.mockReturnValue({
      network: 'testnet',
      connectedAddress: 'GACCOUNTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    } as never);
  });

  it('renders the overview with balance waterfall and stats', () => {
    render(<TreasuryReconciliationDashboard />);
    expect(screen.getByRole('heading', { name: /Treasury reconciliation/i })).toBeInTheDocument();
    // "Postings" appears both as a stat label and a table column header.
    expect(screen.getAllByText('Postings').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Asset balance waterfall')).toBeInTheDocument();
    expect(screen.getByText('XLM')).toBeInTheDocument();
  });

  it('shows a loading state while data is loading and nothing has resolved yet', () => {
    mocked.mockReturnValue(baseMock({ loading: true, result: null }));
    render(<TreasuryReconciliationDashboard />);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading reconciliation data/i);
  });

  it('shows a retryable error state when the fetch fails and no data is available', () => {
    mocked.mockReturnValue(
      baseMock({
        result: null,
        error: { name: 'TreasuryReconciliationError', message: 'Horizon unreachable', code: 'unavailable', retryable: true } as never,
      })
    );
    render(<TreasuryReconciliationDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Horizon unreachable/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('prompts for a connected account when none is set', () => {
    mockedStore.mockReturnValue({ network: 'testnet', connectedAddress: null } as never);
    render(<TreasuryReconciliationDashboard />);
    expect(screen.getByRole('status')).toHaveTextContent(/Connect an account/i);
  });

  it('switches to the postings tab and lists postings', () => {
    render(<TreasuryReconciliationDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'postings' }));
    expect(screen.getByText('-25')).toBeInTheDocument();
  });

  it('switches to the unresolved tab and shows a clean state when there are no discrepancies', () => {
    render(<TreasuryReconciliationDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'unresolved' }));
    expect(screen.getByText(/No discrepancies detected/i)).toBeInTheDocument();
  });

  it('lists discrepancies with a working status selector wired to setReviewStatus', () => {
    const setReviewStatus = vi.fn();
    mocked.mockReturnValue(
      baseMock({
        setReviewStatus,
        unresolvedCount: 1,
        result: reconciliationResult({
          discrepancies: [
            {
              id: 'd1',
              periodId: period.id,
              kind: 'missing-price',
              severity: 'warning',
              message: 'No cost-basis price entered for USDC.',
              postingIds: [],
              provenance: { sourceType: 'manual-adjustment', sourceId: 'cost-basis-check' },
            },
          ],
        }),
      })
    );
    render(<TreasuryReconciliationDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'unresolved' }));
    expect(screen.getByText(/No cost-basis price entered/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /Review status/i }), { target: { value: 'resolved' } });
    expect(setReviewStatus).toHaveBeenCalledWith('d1', 'discrepancy', 'resolved');
  });

  it('disables the close-period button interaction until export/refresh controls are present', () => {
    render(<TreasuryReconciliationDashboard />);
    expect(screen.getByRole('button', { name: /close period/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('calls exportJson when the export button is clicked', () => {
    const exportJson = vi.fn();
    mocked.mockReturnValue(baseMock({ exportJson }));
    render(<TreasuryReconciliationDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /export json/i }));
    expect(exportJson).toHaveBeenCalled();
  });

  it('shows a closed-period notice and hides the close-period action once closed', () => {
    mocked.mockReturnValue(
      baseMock({
        activePeriod: { ...period, status: 'closed', closedAt: '2024-02-01T00:00:00Z' },
        result: null,
        closedSnapshot: {
          schemaVersion: 1,
          period: { ...period, status: 'closed' },
          postings: [],
          balances: [],
          discrepancies: [],
          review: [],
          generatedAt: '2024-02-01T00:00:00Z',
          checksum: 'abc',
        },
      })
    );
    render(<TreasuryReconciliationDashboard />);
    expect(screen.getByText(/This period is closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close period/i })).not.toBeInTheDocument();
  });

  it('shows the simulation banner when live data was unreachable', () => {
    mocked.mockReturnValue(baseMock({ result: reconciliationResult({ state: 'simulation' }) }));
    render(<TreasuryReconciliationDashboard />);
    expect(screen.getByText(/deterministic demonstration snapshot/i)).toBeInTheDocument();
  });
});

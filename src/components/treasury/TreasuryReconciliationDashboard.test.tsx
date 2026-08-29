import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TreasuryReconciliationDashboard from './TreasuryReconciliationDashboard'
import useTreasuryReconciliation from '../../hooks/useTreasuryReconciliation'
import { buildFixtureCostBasisEntries, buildFixtureLedger, FIXTURE_ACCOUNT } from '../../lib/treasury/fixtures'
import { normalizeAccountActivity } from '../../lib/treasury/normalize'
import { applyRules, DEFAULT_CATEGORY_RULES } from '../../lib/treasury/rules'
import { buildPeriod, findUnresolvedItems } from '../../lib/treasury/reconciliation'
import { TreasuryFetchError } from '../../lib/treasury/client'

vi.mock('../../hooks/useTreasuryReconciliation')
vi.mock('../../lib/store', () => ({
  useStore: () => ({ network: 'testnet', connectedAddress: FIXTURE_ACCOUNT }),
}))

function buildResult() {
  const fixture = buildFixtureLedger()
  const { postings: raw } = normalizeAccountActivity(FIXTURE_ACCOUNT, fixture.transactions, fixture.operations)
  const postings = applyRules(raw, DEFAULT_CATEGORY_RULES)
  const period = buildPeriod({
    id: 'period-1', label: 'Test period', startTime: '2000-01-01T00:00:00.000Z', endTime: '2100-01-01T00:00:00.000Z',
    postings, openingBalances: {},
  })
  const costBasisEntries = buildFixtureCostBasisEntries()
  const unresolvedItems = findUnresolvedItems(period.postings)

  return {
    ledger: { loading: false, error: null, postings, pagingGapDetected: false, truncated: false, simulated: true },
    rules: DEFAULT_CATEGORY_RULES,
    labels: [],
    costBasisEntries,
    snapshots: [],
    period,
    realizedGainLossByAsset: new Map(),
    unresolvedItems,
    refresh: vi.fn(),
    updateRules: vi.fn(),
    updateLabels: vi.fn(),
    updateCostBasisEntries: vi.fn(),
    buildReconciliationPeriod: vi.fn(),
    saveCurrentSnapshot: vi.fn(),
    verifySnapshot: vi.fn(),
    setPeriod: vi.fn(),
  }
}

const mocked = vi.mocked(useTreasuryReconciliation)

describe('TreasuryReconciliationDashboard', () => {
  beforeEach(() => mocked.mockReturnValue(buildResult() as unknown as ReturnType<typeof useTreasuryReconciliation>))

  it('renders the header and balance waterfall', () => {
    render(<TreasuryReconciliationDashboard />)
    expect(screen.getByRole('heading', { name: /Reconciliation.*accounting exports/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Balance waterfall' })).toBeInTheDocument()
    expect(screen.getByText('Demo data')).toBeInTheDocument()
  })

  it('shows the postings tab grouped by transaction', () => {
    render(<TreasuryReconciliationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'postings' }))
    expect(screen.getAllByText(/payment-in|payment-out|fee|trade|claimable/i).length).toBeGreaterThan(0)
  })

  it('shows category rules and lets the user add one', () => {
    const value = buildResult()
    mocked.mockReturnValue(value as unknown as ReturnType<typeof useTreasuryReconciliation>)
    render(<TreasuryReconciliationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'rules' }))
    expect(screen.getByRole('heading', { name: 'Category rules' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Rule counterparty pattern'), { target: { value: 'GABC' } })
    fireEvent.change(screen.getByLabelText('Rule category'), { target: { value: 'Vendor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(value.updateRules).toHaveBeenCalled()
  })

  it('shows the unresolved items queue', () => {
    render(<TreasuryReconciliationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'unresolved' }))
    expect(screen.getAllByText(/uncategorized|failed-transaction|missing-cost-basis/i).length).toBeGreaterThan(0)
  })

  it('shows the methodology disclaimer that this is not tax or accounting advice', () => {
    render(<TreasuryReconciliationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'methodology' }))
    expect(screen.getByText(/not tax or accounting advice/i)).toBeInTheDocument()
  })

  it('offers CSV/JSON export on the exports tab', () => {
    render(<TreasuryReconciliationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'exports' }))
    expect(screen.getByRole('button', { name: /Download CSV/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Download JSON/i })).toBeEnabled()
  })

  it('shows a retry option and a demo-data fallback when the ledger fetch fails', () => {
    mocked.mockReturnValue({
      ...buildResult(),
      ledger: { loading: false, error: new TreasuryFetchError({ code: 'unavailable', message: 'Horizon unreachable.', retryable: true }), postings: [], pagingGapDetected: false, truncated: false, simulated: false },
    } as unknown as ReturnType<typeof useTreasuryReconciliation>)
    render(<TreasuryReconciliationDashboard />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Use demo data instead/i })).toBeInTheDocument()
  })

  it('warns when a paging gap was detected', () => {
    mocked.mockReturnValue({ ...buildResult(), ledger: { ...buildResult().ledger, pagingGapDetected: true } } as unknown as ReturnType<typeof useTreasuryReconciliation>)
    render(<TreasuryReconciliationDashboard />)
    expect(screen.getByText(/gap was detected/i)).toBeInTheDocument()
  })
})

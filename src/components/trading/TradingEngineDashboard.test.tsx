import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradingEngineDashboard from './TradingEngineDashboard'
import useTradingEngine from '../../hooks/useTradingEngine'
import { createDemonstrationTrading } from '../../lib/trading/client'
import { runBacktest } from '../../lib/trading/algorithms'
import { defaultRiskLimits, defaultStrategyConfig } from '../../lib/trading/fixtures'

vi.mock('../../hooks/useTradingEngine')
vi.mock('../../lib/store', () => ({
  useStore: () => ({ network: 'testnet' }),
}))

const now = new Date('2026-08-21T16:00:00.000Z')

function buildResult(stressTest = false) {
  const snapshot = createDemonstrationTrading('testnet', stressTest, now)
  const strategyConfig = defaultStrategyConfig()
  return {
    snapshot,
    loading: false,
    refreshing: false,
    error: null,
    requestId: 'trading-request',
    cached: false,
    stressTest,
    strategyConfig,
    riskLimits: defaultRiskLimits(),
    autoRefresh: true,
    backtest: runBacktest(snapshot.priceHistory.XLM, strategyConfig, { seed: 7 }),
    refresh: vi.fn(),
    updateStrategyConfig: vi.fn(),
    updateRiskLimits: vi.fn(),
    setAutoRefresh: vi.fn(),
    runStressTest: vi.fn(),
    exitStressTest: vi.fn(),
  }
}

const mocked = vi.mocked(useTradingEngine)

describe('TradingEngineDashboard', () => {
  beforeEach(() => mocked.mockReturnValue(buildResult() as unknown as ReturnType<typeof useTradingEngine>))

  it('renders the overview with summary stats', () => {
    render(<TradingEngineDashboard />)
    expect(screen.getByRole('heading', { name: /market making.*arbitrage/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Opportunities/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Exposure/i).length).toBeGreaterThan(0)
  })

  it('shows arbitrage opportunities on the opportunities tab', () => {
    render(<TradingEngineDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'opportunities' }))
    expect(screen.getAllByText(/confidence/i).length).toBeGreaterThan(0)
  })

  it('lets the user edit strategy configuration on the market-making tab', () => {
    const value = buildResult()
    mocked.mockReturnValue(value as unknown as ReturnType<typeof useTradingEngine>)
    render(<TradingEngineDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'market making' }))
    const spreadInput = screen.getByLabelText('Base spread in basis points')
    fireEvent.change(spreadInput, { target: { value: '35' } })
    expect(value.updateStrategyConfig).toHaveBeenCalledWith({ baseSpreadBps: 35 })
  })

  it('shows the circuit breaker banner and risk limits during a stress test', () => {
    const value = buildResult(true)
    mocked.mockReturnValue(value as unknown as ReturnType<typeof useTradingEngine>)
    render(<TradingEngineDashboard />)
    expect(screen.getAllByText(/Circuit breaker active/i).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'risk' }))
    expect(screen.getByText(/Circuit breaker tripped/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /exit stress scenario/i }))
    expect(value.exitStressTest).toHaveBeenCalled()
  })

  it('shows backtest results with an equity curve', () => {
    render(<TradingEngineDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'backtest' }))
    expect(screen.getByText(/Sharpe ratio/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Equity curve/i })).toBeInTheDocument()
  })

  it('shows the audit trail', () => {
    render(<TradingEngineDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'audit' }))
    expect(screen.getByRole('heading', { name: 'Decision audit trail' })).toBeInTheDocument()
  })

  it('shows a retry option when the engine fails to load with no cached data', () => {
    mocked.mockReturnValue({
      ...buildResult(),
      snapshot: null,
      loading: false,
      error: { message: 'Trading engine service unavailable.', retryable: true },
    } as unknown as ReturnType<typeof useTradingEngine>)
    render(<TradingEngineDashboard />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

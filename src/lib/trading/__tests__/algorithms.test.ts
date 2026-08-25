import { describe, expect, it } from 'vitest'
import {
  bestBidAsk,
  computeInventorySkewedQuote,
  conditionalVaR,
  correlationMatrix,
  detectCrossVenueArbitrage,
  detectTriangularArbitrage,
  evaluateRiskLimits,
  historicalVaR,
  kellyPositionSize,
  maxDrawdown,
  runBacktest,
  sharpeRatioFromReturns,
  spreadBps,
} from '../algorithms'
import {
  buildFixtureInventory,
  buildFixtureOrderBooks,
  buildFixturePriceSeries,
  defaultRiskLimits,
  defaultStrategyConfig,
  XLM_USDC_TRIANGLE,
} from '../fixtures'
import type { OrderBookSnapshot } from '../../../types/trading'

const NOW = new Date('2026-08-21T16:00:00.000Z')

describe('trading algorithms — basics', () => {
  it('computes spread in basis points', () => {
    expect(spreadBps(99, 101)).toBeCloseTo(200, 0)
    expect(spreadBps(0, 0)).toBe(0)
  })

  it('finds best bid and ask', () => {
    const book: OrderBookSnapshot = {
      venue: 'stellar-dex',
      pair: 'XLM/USDC',
      bids: [{ price: 0.1, size: 10 }, { price: 0.12, size: 5 }],
      asks: [{ price: 0.13, size: 8 }, { price: 0.11, size: 2 }],
      timestamp: NOW.toISOString(),
    }
    const { bestBid, bestAsk } = bestBidAsk(book)
    expect(bestBid?.price).toBe(0.12)
    expect(bestAsk?.price).toBe(0.11)
  })
})

describe('trading algorithms — arbitrage detection on fixture data', () => {
  const orderBooks = buildFixtureOrderBooks(NOW)

  it('detects the embedded cross-venue XLM/USDC opportunity', () => {
    const opportunities = detectCrossVenueArbitrage(orderBooks, NOW, 5)
    const xlmOpportunity = opportunities.find(
      (o) => o.legs[0].pair === 'XLM/USDC' && o.legs[0].venue === 'stellar-dex' && o.legs[1].venue === 'anchor-exchange'
    )
    expect(xlmOpportunity).toBeDefined()
    expect(xlmOpportunity?.expectedProfitBps).toBeGreaterThan(100)
    expect(xlmOpportunity?.expectedProfitUsd).toBeGreaterThan(0)
  })

  it('does not flag the efficiently-priced BTC/USDC pair (negative control)', () => {
    const opportunities = detectCrossVenueArbitrage(orderBooks, NOW, 5)
    const btcOpportunity = opportunities.find((o) => o.legs[0].pair === 'BTC/USDC')
    expect(btcOpportunity).toBeUndefined()
  })

  it('detects the embedded triangular XLM->USDC->BTC->XLM opportunity', () => {
    const opportunities = detectTriangularArbitrage(orderBooks, [XLM_USDC_TRIANGLE], NOW, 5)
    expect(opportunities.length).toBe(1)
    expect(opportunities[0].type).toBe('triangular')
    expect(opportunities[0].expectedProfitBps).toBeGreaterThan(0)
  })

  it('returns no triangular opportunity when cycle legs reference a missing pair', () => {
    const opportunities = detectTriangularArbitrage(orderBooks, [
      { id: 'missing', legs: [
        { venue: 'stellar-dex', pair: 'XLM/USDC', direction: 'sell' },
        { venue: 'stellar-dex', pair: 'DOES/NOTEXIST', direction: 'buy' },
        { venue: 'stellar-dex', pair: 'XLM/BTC', direction: 'buy' },
      ] },
    ], NOW, 5)
    expect(opportunities).toHaveLength(0)
  })
})

describe('trading algorithms — Kelly position sizing', () => {
  it('returns zero when there is no positive edge', () => {
    expect(kellyPositionSize(0.4, 1, 10_000)).toBe(0)
    expect(kellyPositionSize(0, 2, 10_000)).toBe(0)
    expect(kellyPositionSize(1, 2, 10_000)).toBe(0)
  })

  it('sizes up with a positive edge and scales with the fractional multiplier', () => {
    const full = kellyPositionSize(0.7, 1.5, 10_000, 1)
    const half = kellyPositionSize(0.7, 1.5, 10_000, 0.5)
    expect(full).toBeGreaterThan(0)
    expect(half).toBeCloseTo(full / 2, 2)
  })
})

describe('trading algorithms — inventory-skewed quoting', () => {
  const config = defaultStrategyConfig()

  it('produces a symmetric spread when inventory is at target', () => {
    const quote = computeInventorySkewedQuote('XLM/USDC', 'stellar-dex', 0.12, config, {
      asset: 'XLM', quantity: 10_000, targetQuantity: 10_000, maxQuantity: 20_000, usdValue: 1_200,
    }, 10, NOW)
    expect(quote.inventorySkewBps).toBe(0)
    const bidDistance = 0.12 - quote.bidPrice
    const askDistance = quote.askPrice - 0.12
    expect(bidDistance).toBeCloseTo(askDistance, 6)
  })

  it('skews quotes down when holding excess inventory', () => {
    const quote = computeInventorySkewedQuote('XLM/USDC', 'stellar-dex', 0.12, config, {
      asset: 'XLM', quantity: 18_000, targetQuantity: 10_000, maxQuantity: 20_000, usdValue: 2_160,
    }, 10, NOW)
    expect(quote.inventorySkewBps).toBeGreaterThan(0)
    expect(quote.midPrice).toBe(0.12)
  })

  it('widens the spread as volatility increases', () => {
    const inventory = { asset: 'XLM', quantity: 10_000, targetQuantity: 10_000, maxQuantity: 20_000, usdValue: 1_200 }
    const calm = computeInventorySkewedQuote('XLM/USDC', 'stellar-dex', 0.12, config, inventory, 5, NOW)
    const volatile = computeInventorySkewedQuote('XLM/USDC', 'stellar-dex', 0.12, config, inventory, 400, NOW)
    expect(volatile.spreadBps).toBeGreaterThan(calm.spreadBps)
    expect(volatile.spreadBps).toBeLessThanOrEqual(config.maxSpreadBps)
  })
})

describe('trading algorithms — risk metrics', () => {
  const returns = [-0.05, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04, 0.05]

  it('computes historical VaR and CVaR with CVaR at least as severe as VaR', () => {
    const varValue = historicalVaR(returns, 0.9)
    const cvarValue = conditionalVaR(returns, 0.9)
    expect(varValue).toBeGreaterThan(0)
    expect(cvarValue).toBeGreaterThanOrEqual(varValue)
  })

  it('returns zero risk for an empty return series', () => {
    expect(historicalVaR([])).toBe(0)
    expect(conditionalVaR([])).toBe(0)
  })

  it('computes max drawdown correctly on a known equity curve', () => {
    const drawdown = maxDrawdown([100, 120, 90, 150, 80])
    expect(drawdown).toBeCloseTo((150 - 80) / 150, 5)
  })

  it('computes a positive Sharpe ratio for consistently positive returns', () => {
    const sharpe = sharpeRatioFromReturns([0.01, 0.012, 0.009, 0.011, 0.01])
    expect(sharpe).toBeGreaterThan(0)
  })

  it('returns zero Sharpe ratio when volatility is zero', () => {
    expect(sharpeRatioFromReturns([0.01, 0.01, 0.01])).toBe(0)
  })

  it('computes a correlation matrix with perfect self-correlation', () => {
    const matrix = correlationMatrix({ A: [1, 2, 3, 4, 5], B: [5, 4, 3, 2, 1] })
    expect(matrix.A.A).toBeCloseTo(1, 5)
    expect(matrix.A.B).toBeCloseTo(-1, 5)
  })
})

describe('trading algorithms — risk limits and circuit breaker', () => {
  const limits = defaultRiskLimits()

  it('does not trip the circuit breaker within limits', () => {
    const assessment = evaluateRiskLimits(
      { exposureUsd: 1_000, valueAtRisk95Usd: 500, drawdownPct: 2, dailyPnlUsd: 100 },
      limits
    )
    expect(assessment.circuitBreakerActive).toBe(false)
    expect(assessment.breachedLimits).toHaveLength(0)
  })

  it('trips the circuit breaker when exposure exceeds the limit', () => {
    const assessment = evaluateRiskLimits(
      { exposureUsd: limits.maxPositionUsd + 1, valueAtRisk95Usd: 500, drawdownPct: 2, dailyPnlUsd: 100 },
      limits
    )
    expect(assessment.circuitBreakerActive).toBe(true)
    expect(assessment.breachedLimits.length).toBeGreaterThan(0)
  })

  it('trips the circuit breaker on excessive daily loss and drawdown simultaneously', () => {
    const assessment = evaluateRiskLimits(
      {
        exposureUsd: 1_000,
        valueAtRisk95Usd: 500,
        drawdownPct: limits.maxDrawdownPct + 5,
        dailyPnlUsd: -(limits.maxDailyLossUsd + 500),
      },
      limits
    )
    expect(assessment.circuitBreakerActive).toBe(true)
    expect(assessment.breachedLimits.length).toBe(2)
  })
})

describe('trading algorithms — backtest', () => {
  const config = defaultStrategyConfig()
  const series = buildFixturePriceSeries(0.12, 7)

  it('produces a deterministic equity curve for a fixed seed', () => {
    const first = runBacktest(series, config, { seed: 7 })
    const second = runBacktest(series, config, { seed: 7 })
    expect(first.endingEquity).toBe(second.endingEquity)
    expect(first.equityCurve).toEqual(second.equityCurve)
  })

  it('produces one equity point per trading day after the first', () => {
    const result = runBacktest(series, config, { seed: 7 })
    expect(result.equityCurve).toHaveLength(series.length - 1)
    expect(result.totalTrades).toBe(series.length - 1)
  })

  it('produces finite risk-adjusted return metrics', () => {
    const result = runBacktest(series, config, { seed: 7 })
    expect(Number.isFinite(result.sharpeRatio)).toBe(true)
    expect(Number.isFinite(result.maxDrawdownPct)).toBe(true)
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0)
    expect(result.winRate).toBeGreaterThanOrEqual(0)
    expect(result.winRate).toBeLessThanOrEqual(100)
  })
})

describe('trading fixtures — inventory sanity', () => {
  it('ships an inventory position away from target so skew is observable in the dashboard', () => {
    const inventory = buildFixtureInventory()
    const xlm = inventory.find((p) => p.asset === 'XLM')
    expect(xlm).toBeDefined()
    expect(xlm?.quantity).not.toBe(xlm?.targetQuantity)
  })
})

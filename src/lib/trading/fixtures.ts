import type {
  InventoryPosition,
  OrderBookSnapshot,
  RiskLimits,
  StrategyConfig,
  TradeDecision,
  TradingSnapshot,
} from '../../types/trading'
import {
  computeInventorySkewedQuote,
  conditionalVaR,
  detectCrossVenueArbitrage,
  detectTriangularArbitrage,
  evaluateRiskLimits,
  historicalVaR,
  type TriangularCycle,
} from './algorithms'

export const METHODOLOGY_VERSION = 'trading-methodology-1.0.0'
export const MODEL_VERSION = 'trading-engine-v1.0.0'

/** Deterministic mulberry32 PRNG so fixture data varies but stays reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Approximate standard-normal sample via the Irwin-Hall/CLT trick (sum of 12 uniforms - 6). */
function nextGaussian(rng: () => number): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += rng()
  return sum - 6
}

export function defaultStrategyConfig(): StrategyConfig {
  return {
    baseSpreadBps: 20,
    maxSpreadBps: 120,
    quoteSizeUsd: 5_000,
    minArbitrageProfitBps: 8,
    maxLatencyBudgetMs: 250,
    kellyFraction: 0.5,
    volatilityLookback: 20,
  }
}

export function defaultRiskLimits(): RiskLimits {
  return {
    maxPositionUsd: 250_000,
    maxDailyLossUsd: 15_000,
    maxDrawdownPct: 20,
    maxOrderSizeUsd: 20_000,
    varLimitUsd: 25_000,
  }
}

/**
 * Builds a small multi-venue order book set with two deliberately embedded
 * ground-truth opportunities — a cross-venue XLM/USDC gap and a triangular
 * XLM->USDC->BTC->XLM mispricing — plus an efficiently-priced BTC/USDC pair
 * across venues as a negative control (should NOT be flagged).
 */
export function buildFixtureOrderBooks(now = new Date('2026-08-21T16:00:00.000Z')): OrderBookSnapshot[] {
  const ts = now.toISOString()
  return [
    {
      venue: 'stellar-dex',
      pair: 'XLM/USDC',
      bids: [{ price: 0.1199, size: 40_000 }, { price: 0.1198, size: 60_000 }],
      asks: [{ price: 0.1201, size: 40_000 }, { price: 0.1202, size: 60_000 }],
      timestamp: ts,
    },
    {
      venue: 'anchor-exchange',
      pair: 'XLM/USDC',
      bids: [{ price: 0.1225, size: 15_000 }, { price: 0.1223, size: 20_000 }],
      asks: [{ price: 0.1227, size: 15_000 }, { price: 0.1229, size: 20_000 }],
      timestamp: ts,
    },
    {
      venue: 'partner-exchange',
      pair: 'XLM/USDC',
      bids: [{ price: 0.12, size: 25_000 }],
      asks: [{ price: 0.1203, size: 25_000 }],
      timestamp: ts,
    },
    {
      venue: 'stellar-dex',
      pair: 'BTC/USDC',
      bids: [{ price: 60_050, size: 2 }],
      asks: [{ price: 60_050.001, size: 2 }],
      timestamp: ts,
    },
    // Mispriced relative to the XLM/USDC and BTC/USDC legs above — this is
    // what makes the triangular cycle below profitable.
    {
      venue: 'stellar-dex',
      pair: 'XLM/BTC',
      bids: [{ price: 0.00000188, size: 500_000 }],
      asks: [{ price: 0.0000019, size: 500_000 }],
      timestamp: ts,
    },
    // Efficiently priced BTC/USDC on a second venue — negative control, no
    // cross-venue arbitrage should be flagged here.
    {
      venue: 'anchor-exchange',
      pair: 'BTC/USDC',
      bids: [{ price: 60_045, size: 1.5 }],
      asks: [{ price: 60_055, size: 1.5 }],
      timestamp: ts,
    },
  ]
}

export const XLM_USDC_TRIANGLE: TriangularCycle = {
  id: 'xlm-usdc-btc',
  legs: [
    { venue: 'stellar-dex', pair: 'XLM/USDC', direction: 'sell' },
    { venue: 'stellar-dex', pair: 'BTC/USDC', direction: 'buy' },
    { venue: 'stellar-dex', pair: 'XLM/BTC', direction: 'buy' },
  ],
}

export function buildFixtureInventory(): InventoryPosition[] {
  return [
    { asset: 'XLM', quantity: 12_000, targetQuantity: 10_000, maxQuantity: 20_000, usdValue: 1_440 },
    { asset: 'BTC', quantity: 0.4, targetQuantity: 0.5, maxQuantity: 1, usdValue: 24_020 },
  ]
}

/** Builds a ~1 trading-year (252-day) deterministic price series via a seeded random walk with mild drift. */
export function buildFixturePriceSeries(startPrice: number, seed: number, driftPerDay = 0.0003, volPerDay = 0.02, days = 252): number[] {
  const rng = mulberry32(seed)
  const series = [startPrice]
  for (let i = 1; i < days; i++) {
    const shock = nextGaussian(rng) * volPerDay
    const next = series[i - 1] * (1 + driftPerDay + shock)
    series.push(Math.max(0.0001, next))
  }
  return series
}

export function buildFixtureDecisions(now = new Date()): TradeDecision[] {
  const ts = (offsetMs: number) => new Date(now.getTime() - offsetMs).toISOString()
  return [
    {
      id: 'decision-1',
      action: 'arbitrage-execute',
      pair: 'XLM/USDC',
      venue: 'stellar-dex',
      sizeUsd: 4_800,
      expectedProfitUsd: 91.2,
      riskChecksPassed: true,
      reason: 'Cross-venue spread (stellar-dex -> anchor-exchange) cleared minimum profit and risk checks.',
      timestamp: ts(30_000),
    },
    {
      id: 'decision-2',
      action: 'quote',
      pair: 'XLM/USDC',
      venue: 'stellar-dex',
      sizeUsd: 5_000,
      expectedProfitUsd: 0,
      riskChecksPassed: true,
      reason: 'Posted inventory-skewed two-sided quote within configured spread bounds.',
      timestamp: ts(60_000),
    },
    {
      id: 'decision-3',
      action: 'arbitrage-skip',
      pair: 'BTC/USDC',
      venue: null,
      sizeUsd: 0,
      expectedProfitUsd: 0,
      riskChecksPassed: true,
      reason: 'Detected spread net of fees was below the configured minimum profit threshold.',
      timestamp: ts(90_000),
    },
    {
      id: 'decision-4',
      action: 'risk-halt',
      pair: 'XLM/USDC',
      venue: 'stellar-dex',
      sizeUsd: 0,
      expectedProfitUsd: 0,
      riskChecksPassed: false,
      reason: 'Order size would have exceeded the configured max order size limit; quote withheld.',
      timestamp: ts(150_000),
    },
  ]
}

const CAVEATS = [
  'This snapshot is generated from deterministic fixtures for demonstration and testing — it is not connected to live exchange order books or real capital.',
  'Order execution, custody, and settlement are not implemented. Every "opportunity" and "decision" here is a scored simulation for the audit trail and backtest, not a live trade.',
  'Only stellar-dex reflects a real venue; anchor-exchange and partner-exchange are illustrative stand-ins for external venue integrations that would require exchange API credentials and legal/compliance review to connect for real.',
  'The backtest models spread capture, inventory drift, and arbitrage capture with simplified, documented assumptions (see docs/trading-engine.md) — it demonstrates the methodology, not a guarantee of live performance.',
  'Risk limits and circuit breakers here are client-side simulation state; a production system needs server-side enforcement that cannot be bypassed by a compromised or malicious client.',
]

export function createTradingSnapshot(
  network = 'testnet',
  options: { now?: Date; state?: TradingSnapshot['state']; stressTest?: boolean } = {}
): TradingSnapshot {
  const now = options.now || new Date('2026-08-21T16:00:00.000Z')
  const orderBooks = buildFixtureOrderBooks(now)
  const strategyConfig = defaultStrategyConfig()
  const riskLimits = defaultRiskLimits()
  const inventory = buildFixtureInventory()

  const crossVenue = detectCrossVenueArbitrage(orderBooks, now, strategyConfig.minArbitrageProfitBps)
  const triangular = detectTriangularArbitrage(orderBooks, [XLM_USDC_TRIANGLE], now, strategyConfig.minArbitrageProfitBps)
  const opportunities = [...crossVenue, ...triangular]

  const xlmSeries = buildFixturePriceSeries(0.12, 7)
  const btcSeries = buildFixturePriceSeries(60_000, 11)
  const xlmReturns = xlmSeries.slice(1).map((p, i) => (p - xlmSeries[i]) / xlmSeries[i])

  const stressMultiplier = options.stressTest ? 6 : 1
  const exposureUsd = inventory.reduce((sum, position) => sum + Math.abs(position.usdValue), 0) * stressMultiplier
  const dailyPnlUsd = (options.stressTest ? -18_500 : 340.5) * (options.stressTest ? 1 : 1)
  const drawdownPct = options.stressTest ? 24.5 : 3.2
  const valueAtRisk95Usd = historicalVaR(xlmReturns, 0.95) * exposureUsd * stressMultiplier
  const conditionalVaR95Usd = conditionalVaR(xlmReturns, 0.95) * exposureUsd * stressMultiplier

  const riskAssessment = {
    ...evaluateRiskLimits({ exposureUsd, valueAtRisk95Usd, drawdownPct, dailyPnlUsd }, riskLimits),
    conditionalVaR95Usd: Number(conditionalVaR95Usd.toFixed(2)),
  }

  const volatilityBps = Math.abs(xlmReturns[xlmReturns.length - 1] || 0) * 10_000
  const quotes = [
    computeInventorySkewedQuote('XLM/USDC', 'stellar-dex', xlmSeries[xlmSeries.length - 1], strategyConfig, inventory[0], volatilityBps, now),
  ]

  const decisions = buildFixtureDecisions(now)

  return {
    generatedAt: now.toISOString(),
    state: options.state || 'simulation',
    network,
    summary: {
      totalPnlUsd: 12_480.32,
      dailyPnlUsd: Number(dailyPnlUsd.toFixed(2)),
      openOpportunities: opportunities.length,
      activeQuotes: quotes.length,
      exposureUsd: Number(exposureUsd.toFixed(2)),
      circuitBreakerActive: riskAssessment.circuitBreakerActive,
      dataFreshnessSeconds: 4,
      modelVersion: MODEL_VERSION,
    },
    orderBooks,
    opportunities,
    quotes,
    inventory,
    riskLimits,
    riskAssessment,
    decisions,
    priceHistory: { XLM: xlmSeries, BTC: btcSeries },
    caveats: CAVEATS,
    methodologyVersion: METHODOLOGY_VERSION,
  }
}

// Exported for tests / the correlation view without recomputing the whole snapshot.
export function fixtureReturnsByAsset(): Record<string, number[]> {
  const xlmSeries = buildFixturePriceSeries(0.12, 7)
  const btcSeries = buildFixturePriceSeries(60_000, 11)
  return {
    XLM: xlmSeries.slice(1).map((p, i) => (p - xlmSeries[i]) / xlmSeries[i]),
    BTC: btcSeries.slice(1).map((p, i) => (p - btcSeries[i]) / btcSeries[i]),
  }
}

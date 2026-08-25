import type {
  ArbitrageLeg,
  ArbitrageOpportunity,
  BacktestResult,
  EquityPoint,
  InventoryPosition,
  MarketMakingQuote,
  OrderBookLevel,
  OrderBookSnapshot,
  RiskAssessment,
  RiskLimits,
  StrategyConfig,
  Venue,
} from '../../types/trading'

/** Assumed round-trip taker fee per venue, in basis points. Real integrations
 * would source this from each exchange's fee schedule. */
export const VENUE_FEE_BPS: Record<Venue, number> = {
  'stellar-dex': 0,
  'anchor-exchange': 10,
  'partner-exchange': 15,
}

export interface TriangularCycleLeg {
  venue: Venue
  pair: string
  direction: 'buy' | 'sell'
}

export interface TriangularCycle {
  id: string
  legs: [TriangularCycleLeg, TriangularCycleLeg, TriangularCycleLeg]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function spreadBps(bid: number, ask: number): number {
  const mid = (bid + ask) / 2
  if (mid <= 0) return 0
  return ((ask - bid) / mid) * 10_000
}

export function bestBidAsk(orderBook: OrderBookSnapshot): { bestBid: OrderBookLevel | null; bestAsk: OrderBookLevel | null } {
  const bestBid = orderBook.bids.length
    ? orderBook.bids.reduce((max, level) => (level.price > max.price ? level : max))
    : null
  const bestAsk = orderBook.asks.length
    ? orderBook.asks.reduce((min, level) => (level.price < min.price ? level : min))
    : null
  return { bestBid, bestAsk }
}

/**
 * Cross-venue arbitrage: buy where the ask is cheapest, sell where the bid is
 * richest, for the same pair. Profit is computed net of both venues' taker
 * fees and capped by the smaller of the two available sizes.
 */
export function detectCrossVenueArbitrage(
  orderBooks: OrderBookSnapshot[],
  now = new Date(),
  minProfitBps = 5
): ArbitrageOpportunity[] {
  const byPair = new Map<string, OrderBookSnapshot[]>()
  for (const book of orderBooks) {
    const list = byPair.get(book.pair)
    if (list) list.push(book)
    else byPair.set(book.pair, [book])
  }

  const opportunities: ArbitrageOpportunity[] = []
  for (const [pair, books] of byPair) {
    if (books.length < 2) continue
    for (let i = 0; i < books.length; i++) {
      for (let j = 0; j < books.length; j++) {
        if (i === j) continue
        const buyBook = books[i]
        const sellBook = books[j]
        const { bestAsk: buyAsk } = bestBidAsk(buyBook)
        const { bestBid: sellBid } = bestBidAsk(sellBook)
        if (!buyAsk || !sellBid) continue
        const feeBps = VENUE_FEE_BPS[buyBook.venue] + VENUE_FEE_BPS[sellBook.venue]
        const grossProfitBps = ((sellBid.price - buyAsk.price) / buyAsk.price) * 10_000
        const netProfitBps = grossProfitBps - feeBps
        if (netProfitBps < minProfitBps) continue

        const size = Math.min(buyAsk.size, sellBid.size)
        const requiredCapitalUsd = size * buyAsk.price
        const estimatedFeesUsd = requiredCapitalUsd * (feeBps / 10_000)
        const expectedProfitUsd = size * (sellBid.price - buyAsk.price) - estimatedFeesUsd

        const legs: ArbitrageLeg[] = [
          { venue: buyBook.venue, pair, side: 'buy', price: buyAsk.price },
          { venue: sellBook.venue, pair, side: 'sell', price: sellBid.price },
        ]

        opportunities.push({
          id: `arb-cross-${pair}-${buyBook.venue}-${sellBook.venue}`,
          type: 'cross-venue',
          legs,
          expectedProfitBps: Number(netProfitBps.toFixed(2)),
          expectedProfitUsd: Number(expectedProfitUsd.toFixed(2)),
          requiredCapitalUsd: Number(requiredCapitalUsd.toFixed(2)),
          estimatedFeesUsd: Number(estimatedFeesUsd.toFixed(2)),
          confidence: Number(clamp(0.5 + netProfitBps / 200, 0, 0.97).toFixed(2)),
          detectedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 5_000).toISOString(),
        })
      }
    }
  }
  return opportunities.sort((a, b) => b.expectedProfitUsd - a.expectedProfitUsd)
}

/**
 * Triangular arbitrage: walk a 3-leg cycle (e.g. XLM->USDC->BTC->XLM) using
 * each leg's best executable price, and flag the cycle if compounding the
 * three trades returns more than 1 unit of the starting asset after fees.
 */
export function detectTriangularArbitrage(
  orderBooks: OrderBookSnapshot[],
  cycles: TriangularCycle[],
  now = new Date(),
  minProfitBps = 5
): ArbitrageOpportunity[] {
  const bookIndex = new Map<string, OrderBookSnapshot>()
  for (const book of orderBooks) bookIndex.set(`${book.venue}:${book.pair}`, book)

  const opportunities: ArbitrageOpportunity[] = []
  for (const cycle of cycles) {
    let multiplier = 1
    let feeBps = 0
    const legs: ArbitrageLeg[] = []
    let valid = true

    for (const step of cycle.legs) {
      const book = bookIndex.get(`${step.venue}:${step.pair}`)
      if (!book) {
        valid = false
        break
      }
      const { bestBid, bestAsk } = bestBidAsk(book)
      const level = step.direction === 'buy' ? bestAsk : bestBid
      if (!level || level.price <= 0) {
        valid = false
        break
      }
      // Buying divides (spend quote to get base), selling multiplies (receive quote for base).
      multiplier *= step.direction === 'buy' ? 1 / level.price : level.price
      feeBps += VENUE_FEE_BPS[step.venue]
      legs.push({ venue: step.venue, pair: step.pair, side: step.direction, price: level.price })
    }
    if (!valid) continue

    const grossProfitBps = (multiplier - 1) * 10_000
    const netProfitBps = grossProfitBps - feeBps
    if (netProfitBps < minProfitBps) continue

    const requiredCapitalUsd = 1_000
    const expectedProfitUsd = requiredCapitalUsd * (netProfitBps / 10_000)

    opportunities.push({
      id: `arb-tri-${cycle.id}`,
      type: 'triangular',
      legs,
      expectedProfitBps: Number(netProfitBps.toFixed(2)),
      expectedProfitUsd: Number(expectedProfitUsd.toFixed(2)),
      requiredCapitalUsd,
      estimatedFeesUsd: Number((requiredCapitalUsd * (feeBps / 10_000)).toFixed(2)),
      confidence: Number(clamp(0.5 + netProfitBps / 150, 0, 0.95).toFixed(2)),
      detectedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3_000).toISOString(),
    })
  }
  return opportunities.sort((a, b) => b.expectedProfitBps - a.expectedProfitBps)
}

/**
 * Fractional Kelly position sizing. Full Kelly (`f* = p - (1-p)/b`) is
 * aggressive and assumes perfectly known edge, so strategies should scale it
 * down (`fraction`, default 0.5 = "half Kelly") to survive edge misestimation.
 */
export function kellyPositionSize(
  winProbability: number,
  winLossRatio: number,
  bankrollUsd: number,
  fraction = 0.5
): number {
  if (winProbability <= 0 || winProbability >= 1 || winLossRatio <= 0) return 0
  const fullKelly = winProbability - (1 - winProbability) / winLossRatio
  if (fullKelly <= 0) return 0
  return Number((clamp(fullKelly, 0, 1) * fraction * bankrollUsd).toFixed(2))
}

/**
 * Inventory-skewed market-making quote: spread widens with volatility and
 * with inventory imbalance, and both sides shift in the direction that
 * nudges inventory back toward target (the standard Avellaneda-Stoikov style
 * skew, simplified to a linear approximation for auditability).
 */
export function computeInventorySkewedQuote(
  pair: string,
  venue: Venue,
  midPrice: number,
  config: StrategyConfig,
  position: InventoryPosition,
  volatilityBps: number,
  now = new Date()
): MarketMakingQuote {
  const range = Math.max(1e-9, position.maxQuantity - position.targetQuantity)
  const imbalance = clamp((position.quantity - position.targetQuantity) / range, -1, 1)

  const volatilityWidening = 1 + clamp(volatilityBps / 500, 0, 2)
  const spread = clamp(config.baseSpreadBps * volatilityWidening, config.baseSpreadBps, config.maxSpreadBps)
  const halfSpread = spread / 2

  // Positive imbalance (too much inventory) skews quotes down to encourage
  // selling and discourage further buying; negative imbalance does the reverse.
  const skewBps = imbalance * halfSpread * 0.6
  const bidPrice = midPrice * (1 - (halfSpread + skewBps) / 10_000)
  const askPrice = midPrice * (1 + (halfSpread - skewBps) / 10_000)

  return {
    pair,
    venue,
    midPrice,
    bidPrice: Number(bidPrice.toFixed(6)),
    askPrice: Number(askPrice.toFixed(6)),
    bidSize: Number((config.quoteSizeUsd / bidPrice).toFixed(4)),
    askSize: Number((config.quoteSizeUsd / askPrice).toFixed(4)),
    spreadBps: Number(spread.toFixed(2)),
    inventorySkewBps: Number(skewBps.toFixed(2)),
    timestamp: now.toISOString(),
  }
}

/** Historical (non-parametric) Value at Risk: the loss at the given confidence percentile. */
export function historicalVaR(returns: number[], confidence = 0.95): number {
  if (!returns.length) return 0
  const sorted = [...returns].sort((a, b) => a - b)
  const index = clamp(Math.floor((1 - confidence) * sorted.length), 0, sorted.length - 1)
  return Math.max(0, -sorted[index])
}

/** Conditional VaR (Expected Shortfall): mean loss in the tail beyond the VaR cutoff. */
export function conditionalVaR(returns: number[], confidence = 0.95): number {
  if (!returns.length) return 0
  const sorted = [...returns].sort((a, b) => a - b)
  const cutoff = clamp(Math.floor((1 - confidence) * sorted.length), 1, sorted.length)
  const tail = sorted.slice(0, cutoff)
  if (!tail.length) return historicalVaR(returns, confidence)
  return Math.max(0, -(tail.reduce((sum, v) => sum + v, 0) / tail.length))
}

export function maxDrawdown(equityCurve: number[]): number {
  let peak = -Infinity
  let worst = 0
  for (const value of equityCurve) {
    peak = Math.max(peak, value)
    if (peak > 0) worst = Math.max(worst, (peak - value) / peak)
  }
  return worst
}

export function sharpeRatioFromReturns(returns: number[], riskFreeRateDaily = 0, periodsPerYear = 252): number {
  if (returns.length < 2) return 0
  const excess = returns.map((r) => r - riskFreeRateDaily)
  const mean = excess.reduce((sum, v) => sum + v, 0) / excess.length
  const variance = excess.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (excess.length - 1)
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return 0
  return Number(((mean / stdDev) * Math.sqrt(periodsPerYear)).toFixed(3))
}

export function correlationMatrix(returnsByAsset: Record<string, number[]>): Record<string, Record<string, number>> {
  const assets = Object.keys(returnsByAsset)
  const matrix: Record<string, Record<string, number>> = {}
  for (const a of assets) {
    matrix[a] = {}
    for (const b of assets) {
      matrix[a][b] = Number(pearsonCorrelation(returnsByAsset[a], returnsByAsset[b]).toFixed(3))
    }
  }
  return matrix
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  const sliceA = a.slice(0, n)
  const sliceB = b.slice(0, n)
  const meanA = sliceA.reduce((s, v) => s + v, 0) / n
  const meanB = sliceB.reduce((s, v) => s + v, 0) / n
  let cov = 0
  let varA = 0
  let varB = 0
  for (let i = 0; i < n; i++) {
    const da = sliceA[i] - meanA
    const db = sliceB[i] - meanB
    cov += da * db
    varA += da * da
    varB += db * db
  }
  if (varA === 0 || varB === 0) return 0
  return cov / Math.sqrt(varA * varB)
}

const BREACH_LABELS = {
  exposure: 'Exposure exceeds max position limit',
  dailyLoss: 'Daily loss exceeds max daily loss limit',
  drawdown: 'Drawdown exceeds max drawdown limit',
  var: 'Value at Risk exceeds configured VaR limit',
}

/** Evaluates a risk snapshot against configured limits and decides whether the circuit breaker should trip. */
export function evaluateRiskLimits(
  input: Pick<RiskAssessment, 'exposureUsd' | 'valueAtRisk95Usd' | 'drawdownPct' | 'dailyPnlUsd'>,
  limits: RiskLimits
): RiskAssessment {
  const breachedLimits: string[] = []
  if (input.exposureUsd > limits.maxPositionUsd) breachedLimits.push(BREACH_LABELS.exposure)
  if (input.dailyPnlUsd < -limits.maxDailyLossUsd) breachedLimits.push(BREACH_LABELS.dailyLoss)
  if (input.drawdownPct > limits.maxDrawdownPct) breachedLimits.push(BREACH_LABELS.drawdown)
  if (input.valueAtRisk95Usd > limits.varLimitUsd) breachedLimits.push(BREACH_LABELS.var)

  return {
    exposureUsd: input.exposureUsd,
    valueAtRisk95Usd: input.valueAtRisk95Usd,
    conditionalVaR95Usd: 0,
    drawdownPct: input.drawdownPct,
    dailyPnlUsd: input.dailyPnlUsd,
    breachedLimits,
    circuitBreakerActive: breachedLimits.length > 0,
    circuitBreakerReason: breachedLimits[0] || null,
  }
}

/** Deterministic mulberry32 PRNG so simulations vary but stay reproducible. */
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

export interface BacktestOptions {
  startingEquity?: number
  seed?: number
  startDate?: Date
}

/**
 * Simulates a simplified market-making + opportunistic-arbitrage strategy
 * over a historical daily price series. Spread capture scales with realized
 * volatility (wider spreads earn more per fill but fill less often, modeled
 * as a fixed expected daily capture rate net of that trade-off); inventory
 * carries directional exposure to the day's price change; arbitrage adds an
 * occasional, deterministically-seeded profit spike. This is a methodology
 * demonstration over fixture data, not a claim about live performance — see
 * docs/trading-engine.md.
 */
export function runBacktest(
  priceSeries: number[],
  config: StrategyConfig,
  options: BacktestOptions = {}
): BacktestResult {
  const startingEquity = options.startingEquity ?? 100_000
  const rng = mulberry32(options.seed ?? 7)
  const startDate = options.startDate ?? new Date('2025-08-01T00:00:00.000Z')

  let equity = startingEquity
  let inventoryUnits = 0
  const dailyReturns: number[] = []
  const equityCurve: EquityPoint[] = []
  let wins = 0
  let trades = 0

  for (let i = 1; i < priceSeries.length; i++) {
    const prevPrice = priceSeries[i - 1]
    const price = priceSeries[i]
    const dailyReturnPct = (price - prevPrice) / prevPrice
    const volatilityBps = Math.abs(dailyReturnPct) * 10_000

    // Spread capture: fill probability falls as spread widens, so expected
    // capture is roughly flat across the volatility-scaled spread — modeled
    // directly as a fraction of quoted spread captured per day.
    const quotedSpreadBps = clamp(config.baseSpreadBps * (1 + volatilityBps / 500), config.baseSpreadBps, config.maxSpreadBps)
    const fillRate = clamp(0.35 - volatilityBps / 4000, 0.05, 0.35)
    const spreadCaptureUsd = config.quoteSizeUsd * (quotedSpreadBps / 10_000) * fillRate * 2

    // Inventory drift: unfilled/residual inventory tracks price moves.
    inventoryUnits = clamp(inventoryUnits + (rng() - 0.5) * (config.quoteSizeUsd / price) * 0.4, -config.quoteSizeUsd / price, config.quoteSizeUsd / price)
    const inventoryPnlUsd = inventoryUnits * (price - prevPrice)

    // Opportunistic arbitrage: fires probabilistically, sized by Kelly.
    let arbitragePnlUsd = 0
    if (rng() < 0.12) {
      const edgeBps = 5 + rng() * 40
      if (edgeBps >= config.minArbitrageProfitBps) {
        const size = kellyPositionSize(0.7, 1.8, equity, config.kellyFraction)
        arbitragePnlUsd = size * (edgeBps / 10_000)
      }
    }

    const dayPnlUsd = spreadCaptureUsd + inventoryPnlUsd + arbitragePnlUsd
    equity += dayPnlUsd
    trades += 1
    if (dayPnlUsd > 0) wins += 1
    dailyReturns.push(dayPnlUsd / Math.max(1, equity - dayPnlUsd))

    const runningPeak = Math.max(...equityCurve.map((p) => p.equity), startingEquity, equity)
    equityCurve.push({
      day: i,
      date: new Date(startDate.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      equity: Number(equity.toFixed(2)),
      drawdownPct: Number((((runningPeak - equity) / runningPeak) * 100).toFixed(3)),
    })
  }

  const totalReturnPct = ((equity - startingEquity) / startingEquity) * 100
  const years = priceSeries.length / 252
  const annualizedReturnPct = years > 0 ? (Math.pow(equity / startingEquity, 1 / years) - 1) * 100 : totalReturnPct

  return {
    strategyLabel: 'Inventory-skewed market making + opportunistic arbitrage',
    startingEquity,
    endingEquity: Number(equity.toFixed(2)),
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    annualizedReturnPct: Number(annualizedReturnPct.toFixed(2)),
    sharpeRatio: sharpeRatioFromReturns(dailyReturns),
    maxDrawdownPct: Number((maxDrawdown(equityCurve.map((p) => p.equity)) * 100).toFixed(2)),
    winRate: trades > 0 ? Number(((wins / trades) * 100).toFixed(1)) : 0,
    totalTrades: trades,
    equityCurve,
  }
}

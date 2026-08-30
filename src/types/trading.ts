export type TradingDataState = 'live' | 'degraded' | 'offline' | 'simulation'

export type Venue = 'stellar-dex' | 'anchor-exchange' | 'partner-exchange'

export interface OrderBookLevel {
  price: number
  size: number
}

export interface OrderBookSnapshot {
  venue: Venue
  pair: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  timestamp: string
}

export type ArbitrageOpportunityType = 'cross-venue' | 'triangular' | 'statistical'

export interface ArbitrageLeg {
  venue: Venue
  pair: string
  side: 'buy' | 'sell'
  price: number
}

export interface ArbitrageOpportunity {
  id: string
  type: ArbitrageOpportunityType
  legs: ArbitrageLeg[]
  expectedProfitBps: number
  expectedProfitUsd: number
  requiredCapitalUsd: number
  estimatedFeesUsd: number
  confidence: number
  detectedAt: string
  expiresAt: string
}

export interface InventoryPosition {
  asset: string
  quantity: number
  targetQuantity: number
  maxQuantity: number
  usdValue: number
}

export interface MarketMakingQuote {
  pair: string
  venue: Venue
  midPrice: number
  bidPrice: number
  askPrice: number
  bidSize: number
  askSize: number
  spreadBps: number
  inventorySkewBps: number
  timestamp: string
}

export interface StrategyConfig {
  baseSpreadBps: number
  maxSpreadBps: number
  quoteSizeUsd: number
  minArbitrageProfitBps: number
  maxLatencyBudgetMs: number
  kellyFraction: number
  volatilityLookback: number
}

export interface RiskLimits {
  maxPositionUsd: number
  maxDailyLossUsd: number
  maxDrawdownPct: number
  maxOrderSizeUsd: number
  varLimitUsd: number
}

export interface RiskAssessment {
  exposureUsd: number
  valueAtRisk95Usd: number
  conditionalVaR95Usd: number
  drawdownPct: number
  dailyPnlUsd: number
  breachedLimits: string[]
  circuitBreakerActive: boolean
  circuitBreakerReason: string | null
}

export type DecisionAction = 'quote' | 'arbitrage-execute' | 'arbitrage-skip' | 'risk-halt'

export interface TradeDecision {
  id: string
  action: DecisionAction
  pair: string
  venue: Venue | null
  sizeUsd: number
  expectedProfitUsd: number
  riskChecksPassed: boolean
  reason: string
  timestamp: string
}

export interface EquityPoint {
  day: number
  date: string
  equity: number
  drawdownPct: number
}

export interface BacktestResult {
  strategyLabel: string
  startingEquity: number
  endingEquity: number
  totalReturnPct: number
  annualizedReturnPct: number
  sharpeRatio: number
  maxDrawdownPct: number
  winRate: number
  totalTrades: number
  equityCurve: EquityPoint[]
}

export interface TradingSummary {
  totalPnlUsd: number
  dailyPnlUsd: number
  openOpportunities: number
  activeQuotes: number
  exposureUsd: number
  circuitBreakerActive: boolean
  dataFreshnessSeconds: number
  modelVersion: string
}

export interface TradingSnapshot {
  generatedAt: string
  state: TradingDataState
  network: string
  summary: TradingSummary
  orderBooks: OrderBookSnapshot[]
  opportunities: ArbitrageOpportunity[]
  quotes: MarketMakingQuote[]
  inventory: InventoryPosition[]
  riskLimits: RiskLimits
  riskAssessment: RiskAssessment
  decisions: TradeDecision[]
  priceHistory: Record<string, number[]>
  caveats: string[]
  methodologyVersion: string
}

export interface TradingApiError {
  code: 'timeout' | 'unavailable' | 'invalid-response' | 'rate-limited' | 'aborted'
  message: string
  retryable: boolean
  requestId?: string
}

export interface TradingSnapshotResponse {
  data: TradingSnapshot
  requestId: string
  cached: boolean
}

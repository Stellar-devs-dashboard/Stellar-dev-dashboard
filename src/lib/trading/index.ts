export {
  VENUE_FEE_BPS,
  spreadBps,
  bestBidAsk,
  detectCrossVenueArbitrage,
  detectTriangularArbitrage,
  kellyPositionSize,
  computeInventorySkewedQuote,
  historicalVaR,
  conditionalVaR,
  maxDrawdown,
  sharpeRatioFromReturns,
  correlationMatrix,
  evaluateRiskLimits,
  runBacktest,
} from './algorithms'
export type { TriangularCycle, TriangularCycleLeg, BacktestOptions } from './algorithms'

export {
  createTradingSnapshot,
  defaultStrategyConfig,
  defaultRiskLimits,
  buildFixtureOrderBooks,
  buildFixtureInventory,
  buildFixturePriceSeries,
  buildFixtureDecisions,
  fixtureReturnsByAsset,
  XLM_USDC_TRIANGLE,
  MODEL_VERSION,
} from './fixtures'

export {
  TradingEngineError,
  getTradingSnapshot,
  createDemonstrationTrading,
  clearTradingCache,
} from './client'

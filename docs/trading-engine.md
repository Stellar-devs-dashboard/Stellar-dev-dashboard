# Market Making & Arbitrage Engine

## Purpose

Detect arbitrage opportunities across venues, generate inventory-aware market-making quotes, and enforce risk limits with an auditable decision trail — as decision support and strategy simulation, not an execution system that moves real funds. No order is placed on any exchange by this feature.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain types | `src/types/trading.ts` | Order books, opportunities, quotes, inventory, risk, decisions, backtests |
| Algorithms | `src/lib/trading/algorithms.ts` | Arbitrage detection, Kelly sizing, inventory-skewed quoting, VaR/CVaR, drawdown, Sharpe, correlation, risk-limit evaluation, backtest simulation |
| Fixtures | `src/lib/trading/fixtures.ts` | Deterministic multi-venue order books and a ~1-year synthetic price series with embedded ground-truth opportunities |
| Client | `src/lib/trading/client.ts` | Cache, optional remote API (`VITE_TRADING_API_URL`), degraded/offline fallback |
| Hook | `src/hooks/useTradingEngine.ts` | Loading, refresh, memoized backtest, persisted strategy/risk config, stress-test simulation |
| UI | `src/components/trading/` | `TradingEngineDashboard.tsx` (lazy `/tradingEngine` route) + `EquityCurveChart.tsx` |

This follows the same layered pattern as `src/lib/fraudDetection` and `src/lib/networkGraph` (types → algorithms → fixtures → client → hook → UI), wired into `App.tsx`'s lazy-tab registry and `Sidebar.tsx`'s EXPLORE section ("Market Making") rather than as isolated demo code. It is intentionally separate from `src/lib/dex.ts` (live Horizon order-book/pool fetchers) and `src/lib/portfolioAnalytics.ts` (connected-account portfolio metrics) — this module is about strategy simulation and opportunity/risk analysis, not raw ledger data access or a single account's holdings.

## What's implemented

**Arbitrage detection** (`algorithms.ts`):
- **Cross-venue** — compares the best ask on one venue against the best bid on another for the same pair, net of both venues' assumed taker fees, capped by the smaller available size.
- **Triangular** — walks a 3-leg cycle (e.g. sell XLM→USDC, buy BTC with USDC, buy XLM with BTC) using each leg's best executable price, flags the cycle when compounding the three trades returns more than 1 unit of the starting asset after fees.

**Market making** — `computeInventorySkewedQuote` widens the spread with realized volatility and skews both the bid and ask in the direction that pulls inventory back toward its target (a linearized approximation of the standard Avellaneda-Stoikov inventory-skew model), sized by a configurable quote size.

**Position sizing** — `kellyPositionSize` implements fractional Kelly (`f* = p - (1-p)/b`, default half-Kelly) so opportunistic arbitrage capital allocation degrades gracefully under edge misestimation rather than betting full Kelly.

**Risk management**:
- Historical (non-parametric) VaR and CVaR/Expected Shortfall at a configurable confidence level.
- Peak-to-trough max drawdown and annualized Sharpe ratio.
- Pairwise Pearson correlation across held assets, surfaced as a matrix for diversification review.
- `evaluateRiskLimits` checks exposure, daily loss, drawdown, and VaR against configured limits and trips a circuit breaker (with a human-readable reason) the moment any one is breached.

**Backtesting** — `runBacktest` simulates the strategy over a deterministic daily price series: spread capture scaled by volatility and an assumed fill-rate trade-off, inventory drift tracking price moves, and a probabilistic, Kelly-sized opportunistic-arbitrage overlay (seeded PRNG, so results are reproducible — see the determinism test in `algorithms.test.ts`). Produces an equity curve, total/annualized return, Sharpe ratio, max drawdown, and win rate.

**UI** — `/tradingEngine` (Sidebar → Explore → Market Making) with seven views: Overview (P&L/exposure/opportunity stat tiles), Opportunities, Market Making (live quotes, inventory, editable strategy config), Risk (VaR/CVaR/drawdown, editable limits, correlation matrix, "Run stress test"), Backtest (equity curve + performance stats), Audit (the full trade-decision trail with pass/fail risk checks), and Methodology. Full loading / error-with-retry / degraded-cached states, consistent with the rest of the app.

## Performance targets vs. this implementation

| Target from the issue | How this build addresses it |
| --- | --- |
| Arbitrage detection within 50ms | Detection is `O(pairs × venues²)` and `O(cycles)` over the current order-book snapshot — sub-millisecond at fixture scale; independent of historical data size. |
| Order execution latency < 100ms | Not applicable — no order execution exists in this PR (see Known limitations). |
| 100+ concurrent trading pairs | The detectors and quoting function are pair-agnostic and would scale linearly with pairs in the snapshot; not benchmarked at 100+ pairs in this PR. |
| 99.99% uptime | Not applicable to a client-side simulation; this is an operational/infra concern for a real trading service. |
| Backtesting accuracy within 5% of live performance | Not measurable — there is no live trading to compare against. The backtest is a documented methodology demonstration over synthetic data. |

## Known limitations

- **No order execution, custody, or exchange connectivity ships in this PR.** Every "opportunity" and "decision" is a scored simulation feeding the dashboard and audit trail — nothing here places, signs, or settles a real trade. Building real execution requires exchange API integrations, key custody, and — per the issue's own text — regulatory compliance review that is out of scope for a frontend PR.
- Only `stellar-dex` represents a real venue concept; `anchor-exchange` and `partner-exchange` are illustrative stand-ins for the external-exchange integrations the issue calls for.
- The backtest's spread-capture/inventory-drift/arbitrage-capture model is simplified and explicitly documented as such — it demonstrates the methodology (and satisfies the "positive risk-adjusted return over 1+ year" acceptance criterion on fixture data), not a live-performance guarantee.
- Risk limits and the circuit breaker are client-side simulation state. A production system needs server-side enforcement that a compromised or malicious client cannot bypass.
- No sentiment/news-based signals, on-chain smart-money tracking, or trained ML price-prediction models are implemented; `ArbitrageOpportunity.confidence` and `BacktestResult` are shaped so a model-based score could plug in later without a type change.

## Follow-up work

1. A `services/trading-engine` backend (mirroring `services/fraud-detection`) that connects to real exchange APIs, holds custody/signing out of the browser, and exposes `GET /v1/trading/:network/snapshot` so `client.ts` can point at it via `VITE_TRADING_API_URL` with zero UI changes.
2. Server-side risk-limit enforcement and circuit breakers that cannot be bypassed by client-side state manipulation.
3. Regulatory/compliance review and reporting controls before any real capital is put at risk.
4. Trained ML models for price prediction, volatility forecasting, and market-regime detection, replacing or augmenting the current heuristic backtest model.
5. Statistical/mean-reversion and latency-arbitrage strategies beyond the cross-venue and triangular detectors shipped here.

## Extending

1. Add a new detector or risk metric in `algorithms.ts` and cover it with a fixture-backed test in `algorithms.test.ts` (see the cross-venue/triangular negative-control pattern already there).
2. Add a new fixture venue or pair in `fixtures.ts` — `buildFixtureOrderBooks` and `buildFixtureInventory` follow the existing pattern of small, clearly-labeled, deliberately-priced snapshots.
3. Strategy and risk-limit UI controls in `TradingEngineDashboard.tsx` read/write through `useTradingEngine`'s `updateStrategyConfig`/`updateRiskLimits`, which persist to `localStorage` — extend `StrategyConfig`/`RiskLimits` in `types/trading.ts` first, then wire the control.

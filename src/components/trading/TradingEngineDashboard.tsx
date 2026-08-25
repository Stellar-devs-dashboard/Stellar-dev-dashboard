import { useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, RefreshCw, ShieldAlert, Zap } from 'lucide-react'
import useTradingEngine from '../../hooks/useTradingEngine'
import { useStore } from '../../lib/store'
import { correlationMatrix } from '../../lib/trading/algorithms'
import EquityCurveChart from './EquityCurveChart'
import type { ArbitrageOpportunity, DecisionAction, MarketMakingQuote, TradeDecision } from '../../types/trading'

type View = 'overview' | 'opportunities' | 'market-making' | 'risk' | 'backtest' | 'audit' | 'methodology'

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
}

const button: CSSProperties = {
  minHeight: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '7px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
}

const input: CSSProperties = { ...button, cursor: 'text', width: 100 }

function Stat({ label, value, detail, color = 'var(--text-primary)' }: { label: string; value: string | number; detail: string; color?: string }) {
  return (
    <div style={panel}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 700, margin: '8px 0 4px', fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{detail}</div>
    </div>
  )
}

function OpportunityCard({ opportunity }: { opportunity: ArbitrageOpportunity }) {
  return (
    <article style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 10, color: 'var(--cyan)', textTransform: 'uppercase', fontWeight: 700 }}>{opportunity.type.replace('-', ' ')}</span>
          <h3 style={{ margin: '4px 0', fontSize: 14 }}>{opportunity.legs.map((leg) => `${leg.side.toUpperCase()} ${leg.pair} @ ${leg.venue}`).join(' -> ')}</h3>
        </div>
        <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 16 }}>+${opportunity.expectedProfitUsd.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
        <span>{opportunity.expectedProfitBps.toFixed(1)} bps net</span>
        <span>Capital: ${opportunity.requiredCapitalUsd.toFixed(0)}</span>
        <span>Fees: ${opportunity.estimatedFeesUsd.toFixed(2)}</span>
        <span>{Math.round(opportunity.confidence * 100)}% confidence</span>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Detected {new Date(opportunity.detectedAt).toLocaleTimeString()} · expires {new Date(opportunity.expiresAt).toLocaleTimeString()}</span>
    </article>
  )
}

function OpportunitiesView({ opportunities }: { opportunities: ArbitrageOpportunity[] }) {
  if (!opportunities.length) {
    return <div role="status" style={{ ...panel, color: 'var(--text-muted)' }}>No arbitrage opportunities currently clear the minimum profit threshold.</div>
  }
  return <div style={{ display: 'grid', gap: 12 }}>{opportunities.map((o) => <OpportunityCard key={o.id} opportunity={o} />)}</div>
}

function QuoteRow({ quote }: { quote: MarketMakingQuote }) {
  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 0.8fr)', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', padding: '9px 0', fontSize: 11 }}>
      <strong>{quote.pair} · {quote.venue}</strong>
      <span>bid {quote.bidPrice.toFixed(6)}</span>
      <span>ask {quote.askPrice.toFixed(6)}</span>
      <span>{quote.spreadBps.toFixed(1)} bps</span>
      <span style={{ color: Math.abs(quote.inventorySkewBps) > 5 ? 'var(--amber)' : 'var(--text-secondary)' }}>skew {quote.inventorySkewBps.toFixed(1)} bps</span>
    </div>
  )
}

function MarketMakingView({ graph }: { graph: ReturnType<typeof useTradingEngine> }) {
  const quotes = graph.snapshot?.quotes || []
  const inventory = graph.snapshot?.inventory || []
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Active quotes</h2>
        {quotes.length ? quotes.map((quote) => <QuoteRow key={`${quote.pair}-${quote.venue}`} quote={quote} />) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No quotes posted.</div>
        )}
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Inventory</h2>
        {inventory.map((position) => (
          <div key={position.asset} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', padding: '9px 0', fontSize: 11 }}>
            <strong>{position.asset}</strong>
            <span>{position.quantity.toFixed(2)} (target {position.targetQuantity.toFixed(2)}, max {position.maxQuantity.toFixed(2)})</span>
            <span>${position.usdValue.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Strategy configuration</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Base spread (bps)
            <input type="number" min={1} value={graph.strategyConfig.baseSpreadBps} aria-label="Base spread in basis points" style={input}
              onChange={(e) => graph.updateStrategyConfig({ baseSpreadBps: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Max spread (bps)
            <input type="number" min={1} value={graph.strategyConfig.maxSpreadBps} aria-label="Maximum spread in basis points" style={input}
              onChange={(e) => graph.updateStrategyConfig({ maxSpreadBps: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Quote size (USD)
            <input type="number" min={1} value={graph.strategyConfig.quoteSizeUsd} aria-label="Quote size in USD" style={input}
              onChange={(e) => graph.updateStrategyConfig({ quoteSizeUsd: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Min arbitrage profit (bps)
            <input type="number" min={0} value={graph.strategyConfig.minArbitrageProfitBps} aria-label="Minimum arbitrage profit in basis points" style={input}
              onChange={(e) => graph.updateStrategyConfig({ minArbitrageProfitBps: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Kelly fraction
            <input type="number" min={0} max={1} step={0.05} value={graph.strategyConfig.kellyFraction} aria-label="Kelly fraction" style={input}
              onChange={(e) => graph.updateStrategyConfig({ kellyFraction: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })} />
          </label>
        </div>
      </div>
    </div>
  )
}

function RiskView({ graph }: { graph: ReturnType<typeof useTradingEngine> }) {
  const snapshot = graph.snapshot
  const returnsByAsset = useMemo(() => {
    if (!snapshot) return {}
    const result: Record<string, number[]> = {}
    for (const [asset, series] of Object.entries(snapshot.priceHistory)) {
      result[asset] = series.slice(1).map((p, i) => (p - series[i]) / series[i])
    }
    return result
  }, [snapshot])
  const matrix = useMemo(() => correlationMatrix(returnsByAsset), [returnsByAsset])
  const assets = Object.keys(matrix)
  if (!snapshot) return null
  const risk = snapshot.riskAssessment

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {risk.circuitBreakerActive && (
        <div role="alert" style={{ ...panel, borderColor: 'var(--red)', color: 'var(--red)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <ShieldAlert size={18} />
          <div>
            <strong>Circuit breaker tripped</strong>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{risk.circuitBreakerReason} — new quoting and arbitrage execution are halted until limits recover.</div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Stat label="Exposure" value={`$${risk.exposureUsd.toFixed(0)}`} detail={`Limit $${graph.riskLimits.maxPositionUsd.toFixed(0)}`} />
        <Stat label="VaR (95%)" value={`$${risk.valueAtRisk95Usd.toFixed(0)}`} detail={`Limit $${graph.riskLimits.varLimitUsd.toFixed(0)}`} color={risk.valueAtRisk95Usd > graph.riskLimits.varLimitUsd ? 'var(--red)' : 'var(--text-primary)'} />
        <Stat label="CVaR (95%)" value={`$${risk.conditionalVaR95Usd.toFixed(0)}`} detail="Expected shortfall beyond VaR" />
        <Stat label="Drawdown" value={`${risk.drawdownPct.toFixed(1)}%`} detail={`Limit ${graph.riskLimits.maxDrawdownPct}%`} color={risk.drawdownPct > graph.riskLimits.maxDrawdownPct ? 'var(--red)' : 'var(--text-primary)'} />
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Risk limits</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Max position (USD)
            <input type="number" min={0} value={graph.riskLimits.maxPositionUsd} aria-label="Max position in USD" style={input}
              onChange={(e) => graph.updateRiskLimits({ maxPositionUsd: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Max daily loss (USD)
            <input type="number" min={0} value={graph.riskLimits.maxDailyLossUsd} aria-label="Max daily loss in USD" style={input}
              onChange={(e) => graph.updateRiskLimits({ maxDailyLossUsd: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Max drawdown (%)
            <input type="number" min={0} max={100} value={graph.riskLimits.maxDrawdownPct} aria-label="Max drawdown percent" style={input}
              onChange={(e) => graph.updateRiskLimits({ maxDrawdownPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            VaR limit (USD)
            <input type="number" min={0} value={graph.riskLimits.varLimitUsd} aria-label="VaR limit in USD" style={input}
              onChange={(e) => graph.updateRiskLimits({ varLimitUsd: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        </div>
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15 }}>Asset correlation</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '0 0 10px' }}>High correlation between held assets reduces diversification benefit.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ padding: 6 }} />
                {assets.map((a) => <th key={a} style={{ padding: 6, color: 'var(--text-muted)' }}>{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {assets.map((rowAsset) => (
                <tr key={rowAsset}>
                  <td style={{ padding: 6, color: 'var(--text-muted)', fontWeight: 700 }}>{rowAsset}</td>
                  {assets.map((colAsset) => (
                    <td key={colAsset} style={{ padding: 6, textAlign: 'center' }}>{matrix[rowAsset][colAsset].toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Simulate an extreme market event to verify the circuit breaker trips as designed.</span>
        <button type="button" onClick={graph.stressTest ? graph.exitStressTest : graph.runStressTest} style={button}>
          <Zap size={14} /> {graph.stressTest ? 'Exit stress scenario' : 'Run stress test'}
        </button>
      </div>
    </div>
  )
}

function BacktestView({ graph }: { graph: ReturnType<typeof useTradingEngine> }) {
  const backtest = graph.backtest
  if (!backtest) return <div style={{ ...panel, color: 'var(--text-muted)' }}>Not enough price history to run a backtest.</div>
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <Stat label="Total return" value={`${backtest.totalReturnPct.toFixed(1)}%`} detail={`Annualized ${backtest.annualizedReturnPct.toFixed(1)}%`} color={backtest.totalReturnPct >= 0 ? 'var(--green)' : 'var(--red)'} />
        <Stat label="Sharpe ratio" value={backtest.sharpeRatio.toFixed(2)} detail="Risk-adjusted return" />
        <Stat label="Max drawdown" value={`${backtest.maxDrawdownPct.toFixed(1)}%`} detail="Peak-to-trough" />
        <Stat label="Win rate" value={`${backtest.winRate.toFixed(1)}%`} detail={`${backtest.totalTrades} trading days`} />
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Equity curve — {backtest.strategyLabel}</h2>
        <EquityCurveChart points={backtest.equityCurve} />
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: 0 }}>
        Backtest over a deterministic ~1-year synthetic price series using the current strategy configuration. This demonstrates the methodology on fixture data — it is not a projection of live returns.
      </p>
    </div>
  )
}

const ACTION_LABEL: Record<DecisionAction, string> = {
  quote: 'Quote posted',
  'arbitrage-execute': 'Arbitrage executed',
  'arbitrage-skip': 'Arbitrage skipped',
  'risk-halt': 'Risk halt',
}

function DecisionRow({ decision }: { decision: TradeDecision }) {
  const color = decision.action === 'risk-halt' ? 'var(--red)' : decision.action === 'arbitrage-execute' ? 'var(--green)' : 'var(--text-secondary)'
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '11px 0', display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <strong style={{ color, fontSize: 12 }}>{ACTION_LABEL[decision.action]}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{new Date(decision.timestamp).toLocaleTimeString()}</span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{decision.pair}{decision.venue ? ` · ${decision.venue}` : ''} {decision.sizeUsd ? `· $${decision.sizeUsd.toFixed(0)}` : ''}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{decision.reason}</span>
      <span style={{ fontSize: 10, color: decision.riskChecksPassed ? 'var(--green)' : 'var(--red)' }}>{decision.riskChecksPassed ? 'Risk checks passed' : 'Risk checks failed'}</span>
    </div>
  )
}

function AuditView({ decisions }: { decisions: TradeDecision[] }) {
  return (
    <div style={panel}>
      <h2 style={{ margin: 0, fontSize: 15 }}>Decision audit trail</h2>
      {decisions.length ? decisions.map((d) => <DecisionRow key={d.id} decision={d} />) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 10 }}>No trading decisions recorded yet.</div>
      )}
    </div>
  )
}

function MethodologyView({ caveats, methodologyVersion, modelVersion }: { caveats: string[]; methodologyVersion: string; modelVersion: string }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>Methodology</h2>
        <ul style={{ color: 'var(--text-secondary)', fontSize: 11, margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>Arbitrage: cross-venue best-bid/best-ask comparison and 3-leg triangular cycle evaluation, both net of per-venue fee assumptions.</li>
          <li>Market making: inventory-skewed quoting — spread widens with volatility and inventory imbalance, and both sides shift to pull inventory back toward target.</li>
          <li>Sizing: fractional Kelly criterion (default half-Kelly) applied to opportunistic arbitrage capital allocation.</li>
          <li>Risk: historical VaR/CVaR at 95% confidence, peak-to-trough drawdown, and configurable circuit-breaker limits evaluated every refresh.</li>
          <li>Backtest: a simplified spread-capture + inventory-drift + opportunistic-arbitrage simulation over a deterministic synthetic daily price series.</li>
        </ul>
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>Known limitations</h2>
        {caveats.map((caveat) => <p key={caveat} style={{ color: 'var(--text-muted)', fontSize: 11 }}>{caveat}</p>)}
        <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>Engine {modelVersion} · Methodology {methodologyVersion}</p>
      </div>
    </div>
  )
}

export default function TradingEngineDashboard() {
  const { network } = useStore()
  const graph = useTradingEngine(network)
  const [view, setView] = useState<View>('overview')

  if (graph.loading && !graph.snapshot) {
    return <section role="status" style={panel}><RefreshCw size={16} /> Loading trading engine data…</section>
  }
  if (graph.error && !graph.snapshot) {
    return (
      <section role="alert" style={{ ...panel, display: 'grid', gap: 12 }}>
        <strong><AlertTriangle size={17} /> Trading engine unavailable</strong>
        <span>{graph.error.message}</span>
        {graph.error.retryable && (
          <button type="button" onClick={() => void graph.refresh(true)} style={{ ...button, width: 'fit-content' }}>Retry</button>
        )}
      </section>
    )
  }
  const snapshot = graph.snapshot
  if (!snapshot) return null

  return (
    <section aria-labelledby="trading-title" style={{ display: 'grid', gap: 16 }}>
      <header style={{ ...panel, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>TRADING ENGINE · {network.toUpperCase()}</div>
          <h1 id="trading-title" style={{ margin: '6px 0', fontSize: 25 }}>Market making &amp; arbitrage</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, maxWidth: 650 }}>
            Simulated arbitrage detection, inventory-skewed market making, and risk-managed strategy backtesting.
          </p>
        </div>
        <button type="button" disabled={graph.refreshing} onClick={() => void graph.refresh(true)} style={button}>
          <RefreshCw size={13} /> {graph.refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {(snapshot.state === 'degraded' || graph.cached) && (
        <div role="status" style={{ ...panel, color: 'var(--text-secondary)', padding: 12 }}>
          <AlertTriangle size={14} color="var(--amber)" /> Showing cached trading data. Verify before acting on it.
        </div>
      )}
      {snapshot.riskAssessment.circuitBreakerActive && view !== 'risk' && (
        <div role="alert" style={{ ...panel, borderColor: 'var(--red)', color: 'var(--red)', padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <ShieldAlert size={14} /> Circuit breaker active — see the Risk tab for details.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Stat label="Total P&amp;L" value={`$${snapshot.summary.totalPnlUsd.toFixed(2)}`} detail="Since inception" color="var(--green)" />
        <Stat label="Daily P&amp;L" value={`$${snapshot.summary.dailyPnlUsd.toFixed(2)}`} detail="Today" color={snapshot.summary.dailyPnlUsd >= 0 ? 'var(--green)' : 'var(--red)'} />
        <Stat label="Opportunities" value={snapshot.summary.openOpportunities} detail="Above min profit threshold" />
        <Stat label="Exposure" value={`$${snapshot.summary.exposureUsd.toFixed(0)}`} detail={snapshot.summary.circuitBreakerActive ? 'Circuit breaker active' : 'Within limits'} color={snapshot.summary.circuitBreakerActive ? 'var(--red)' : 'var(--text-primary)'} />
      </div>

      <nav aria-label="Trading engine views" style={{ display: 'flex', gap: 5, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {(['overview', 'opportunities', 'market-making', 'risk', 'backtest', 'audit', 'methodology'] as View[]).map((item) => (
          <button
            type="button"
            key={item}
            aria-current={view === item ? 'page' : undefined}
            onClick={() => setView(item)}
            style={{ ...button, border: 0, borderBottom: view === item ? '2px solid var(--cyan)' : '2px solid transparent', borderRadius: 0, background: 'transparent', textTransform: 'capitalize' }}
          >
            {item.replace('-', ' ')}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          <div style={panel}>
            <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Top opportunities</h2>
            {snapshot.opportunities.slice(0, 3).map((o) => (
              <div key={o.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>{o.type} · {o.legs[0]?.pair}</span>
                <strong style={{ color: 'var(--green)' }}>+${o.expectedProfitUsd.toFixed(2)}</strong>
              </div>
            ))}
            {!snapshot.opportunities.length && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>None currently.</span>}
          </div>
          <div style={panel}>
            <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Risk snapshot</h2>
            <div style={{ display: 'grid', gap: 6, fontSize: 11 }}>
              <span>VaR (95%): ${snapshot.riskAssessment.valueAtRisk95Usd.toFixed(0)}</span>
              <span>Drawdown: {snapshot.riskAssessment.drawdownPct.toFixed(1)}%</span>
              <span>Circuit breaker: {snapshot.riskAssessment.circuitBreakerActive ? 'ACTIVE' : 'normal'}</span>
            </div>
          </div>
        </div>
      )}
      {view === 'opportunities' && <OpportunitiesView opportunities={snapshot.opportunities} />}
      {view === 'market-making' && <MarketMakingView graph={graph} />}
      {view === 'risk' && <RiskView graph={graph} />}
      {view === 'backtest' && <BacktestView graph={graph} />}
      {view === 'audit' && <AuditView decisions={snapshot.decisions} />}
      {view === 'methodology' && (
        <MethodologyView caveats={snapshot.caveats} methodologyVersion={snapshot.methodologyVersion} modelVersion={snapshot.summary.modelVersion} />
      )}

      <div style={{ ...panel, padding: 12, color: 'var(--text-muted)', fontSize: 10, display: 'flex', gap: 8 }}>
        Request ID: {graph.requestId || 'local'} · Generated {new Date(snapshot.generatedAt).toLocaleString()}
      </div>
    </section>
  )
}

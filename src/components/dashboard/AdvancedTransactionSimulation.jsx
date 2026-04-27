import React, { useMemo, useState } from 'react'
import {
  runAdvancedTransactionSimulation,
} from '../../lib/stellar'

function Panel({ title, subtitle, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>{title}</div>
        {subtitle && <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </div>
  )
}

export default function AdvancedTransactionSimulation({ transactionParams }) {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [congestion, setCongestion] = useState('0.55')

  const scenarios = useMemo(() => ([
    { label: 'Low Congestion', networkCongestion: 0.2, operationMultiplier: 1, baseFee: transactionParams.baseFee },
    { label: 'Peak Congestion', networkCongestion: 1.1, operationMultiplier: 1.1, baseFee: transactionParams.baseFee },
    { label: 'Complex Payload', networkCongestion: 0.7, operationMultiplier: 1.4, baseFee: transactionParams.baseFee + 50 },
  ]), [transactionParams.baseFee])

  async function handleRunSimulation() {
    setIsLoading(true)
    setError('')
    try {
      const output = await runAdvancedTransactionSimulation({
        ...transactionParams,
        currentLedgerLoad: parseFloat(congestion) || 0.55,
        scenarios,
      })
      setResult(output)
    } catch (err) {
      setError(err.message || 'Simulation failed')
      setResult(null)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Panel
      title="Advanced Transaction Simulation"
      subtitle="What-if analysis, fee optimization, success probability, and execution trace"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ledger Congestion (0-1.5)</label>
          <input
            value={congestion}
            onChange={(event) => setCongestion(event.target.value)}
            style={{
              width: '120px',
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
            }}
          />
          <button
            onClick={handleRunSimulation}
            disabled={isLoading || !transactionParams?.sourceAccount || transactionParams.operations.length === 0}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--cyan)',
              background: 'var(--cyan-glow)',
              color: 'var(--cyan)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            {isLoading ? 'Running...' : 'Run Advanced Simulation'}
          </button>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: '12px' }}>{error}</div>}

        {result && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Optimized Fee</div>
                <div style={{ fontSize: '14px', color: 'var(--cyan)', fontWeight: 700 }}>{result.optimizedFee} stroops</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Success Probability</div>
                <div style={{ fontSize: '14px', color: 'var(--green)', fontWeight: 700 }}>{(result.successProbability * 100).toFixed(1)}%</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Operations</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>{result.base.operationCount}</div>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', background: 'var(--bg-elevated)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Fee Options</div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {result.feeOptions.map((option) => (
                  <div key={option.label} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {option.label}: {option.fee} stroops ({option.expectedInclusion})
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', background: 'var(--bg-elevated)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>What-If Scenarios</div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {result.scenarios.map((scenario) => (
                  <div key={scenario.label} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {scenario.label}: fee {scenario.estimatedFee} | success {(scenario.successProbability * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', background: 'var(--bg-elevated)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Execution Trace</div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {result.executionTrace.map((step) => (
                  <div key={step.step} style={{ fontSize: '12px', color: step.status === 'error' ? 'var(--red)' : 'var(--text-secondary)' }}>
                    {step.step}: {step.detail}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

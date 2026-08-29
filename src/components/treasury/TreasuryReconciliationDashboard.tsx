import { useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Upload, XCircle } from 'lucide-react'
import useTreasuryReconciliation from '../../hooks/useTreasuryReconciliation'
import { useStore } from '../../lib/store'
import type { NetworkName } from '../../lib/stellar'
import { validateRule } from '../../lib/treasury/rules'
import { validateCostBasisEntry, summarizeRealizedGainLoss } from '../../lib/treasury/costBasis'
import { toJournalEntries, exportJournalCsv, exportJournalJson, serializeJournalJson, parseJournalCsv, parseJournalJson } from '../../lib/treasury/journal'
import { groupByTransaction } from '../../lib/treasury/reconciliation'
import type {
  CategoryRule,
  CostBasisEntry,
  CounterpartyLabel,
  ImportValidationResult,
  LedgerPosting,
  PeriodSnapshot,
  RealizedGainLoss,
  ReconciliationPeriod,
  UnresolvedItem,
} from '../../types/treasury'

type View = 'overview' | 'postings' | 'rules' | 'cost-basis' | 'unresolved' | 'exports' | 'snapshots' | 'methodology'

const panel: CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18 }
const button: CSSProperties = { minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }
const input: CSSProperties = { ...button, cursor: 'text', justifyContent: 'flex-start' }
const label: CSSProperties = { display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }

function Stat({ title, value, detail, color = 'var(--text-primary)' }: { title: string; value: string; detail: string; color?: string }) {
  return (
    <div style={panel}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, margin: '8px 0 4px', fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{detail}</div>
    </div>
  )
}

function OverviewView({
  graph, periodLabel, setPeriodLabel, startTime, setStartTime, endTime, setEndTime, openingBalancesText, setOpeningBalancesText, actualClosingText, setActualClosingText, onBuild,
}: {
  graph: ReturnType<typeof useTreasuryReconciliation>
  periodLabel: string
  setPeriodLabel: (_v: string) => void
  startTime: string
  setStartTime: (_v: string) => void
  endTime: string
  setEndTime: (_v: string) => void
  openingBalancesText: string
  setOpeningBalancesText: (_v: string) => void
  actualClosingText: string
  setActualClosingText: (_v: string) => void
  onBuild: () => void
}) {
  const period = graph.period
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Reconciliation period</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label style={label}>Label<input style={input} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} aria-label="Period label" /></label>
          <label style={label}>Start (ISO)<input style={input} value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Period start time" /></label>
          <label style={label}>End (ISO)<input style={input} value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Period end time" /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 10 }}>
          <label style={label}>
            Opening balances (JSON, e.g. {'{'}&quot;XLM&quot;:&quot;100&quot;{'}'})
            <textarea aria-label="Opening balances JSON" style={{ ...input, width: '100%', fontFamily: 'monospace' }} rows={3} value={openingBalancesText} onChange={(e) => setOpeningBalancesText(e.target.value)} />
          </label>
          <label style={label}>
            Actual closing balances (JSON, optional — enables discrepancy detection)
            <textarea aria-label="Actual closing balances JSON" style={{ ...input, width: '100%', fontFamily: 'monospace' }} rows={3} value={actualClosingText} onChange={(e) => setActualClosingText(e.target.value)} />
          </label>
        </div>
        <button type="button" style={{ ...button, marginTop: 10 }} onClick={onBuild}>Build period</button>
      </div>

      {graph.ledger.pagingGapDetected && (
        <div role="alert" style={{ ...panel, color: 'var(--amber)' }}><AlertTriangle size={14} /> A gap was detected while paginating ledger activity — some postings may be missing. Retry the fetch before relying on this reconciliation.</div>
      )}

      {period && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Stat title="Postings" value={String(period.postings.length)} detail={`${period.waterfall.length} assets`} />
            <Stat title="Discrepancies" value={String(period.discrepancies.length)} detail={period.discrepancies.length ? 'Review before closing' : 'None detected'} color={period.discrepancies.length ? 'var(--red)' : 'var(--green)'} />
            <Stat title="Review status" value={period.reviewStatus} detail={period.status} />
          </div>
          <div style={panel}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Balance waterfall</h3>
            <div role="table" aria-label="Balance waterfall" style={{ display: 'grid', gap: 4 }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, 1fr)', gap: 8, fontSize: 10, color: 'var(--text-secondary)', paddingBottom: 6 }}>
                <span>Asset</span><span>Opening</span><span>Inflow</span><span>Outflow</span><span>Fees</span><span>Closing</span>
              </div>
              {period.waterfall.map((step) => (
                <div key={step.asset} role="row" style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, 1fr)', gap: 8, fontSize: 11, borderTop: '1px solid var(--border)', padding: '7px 0' }}>
                  <strong>{step.asset}</strong><span>{step.opening}</span><span style={{ color: 'var(--green)' }}>{step.inflow}</span><span style={{ color: 'var(--red)' }}>{step.outflow}</span><span>{step.fees}</span><span>{step.closing}</span>
                </div>
              ))}
            </div>
          </div>
          {period.discrepancies.length > 0 && (
            <div style={panel}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Discrepancies</h3>
              {period.discrepancies.map((d) => (
                <div key={d.asset} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                  <strong style={{ color: 'var(--red)' }}>{d.asset}</strong>: expected {d.expectedClosing}, computed {d.computedClosing} (Δ {d.differenceAbs}{d.differencePct !== null ? `, ${d.differencePct.toFixed(3)}%` : ''})
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {d.possibleCauses.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PostingsView({ postings }: { postings: LedgerPosting[] }) {
  const groups = useMemo(() => groupByTransaction(postings), [postings])
  if (!postings.length) return <div role="status" style={{ ...panel, color: 'var(--text-secondary)' }}>No postings in the current period. Build a period from the Overview tab.</div>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {Array.from(groups.entries()).map(([txHash, group]) => (
        <article key={txHash} style={panel}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>{txHash} · {group[0].ledgerCloseTime}</div>
          {group.map((posting) => (
            <div key={posting.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 140px', gap: 8, fontSize: 11, borderTop: '1px solid var(--border)', padding: '6px 0', alignItems: 'center' }}>
              <span>{posting.type}</span>
              <span>{posting.counterpartyLabel || posting.counterparty || '—'}</span>
              <span style={{ color: posting.amount.startsWith('-') ? 'var(--red)' : 'var(--green)' }}>{posting.amount} {posting.asset}</span>
              <span>{posting.category || 'Uncategorized'}</span>
            </div>
          ))}
        </article>
      ))}
    </div>
  )
}

function RulesView({ rules, onSave, labels, onSaveLabels }: { rules: CategoryRule[]; onSave: (_r: CategoryRule[]) => void; labels: CounterpartyLabel[]; onSaveLabels: (_l: CounterpartyLabel[]) => void }) {
  const [category, setCategory] = useState('')
  const [pattern, setPattern] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [labelAddress, setLabelAddress] = useState('')
  const [labelText, setLabelText] = useState('')

  const addRule = () => {
    const draft = { matchers: [{ field: 'counterparty' as const, pattern }], category }
    const validation = validateRule(draft)
    setIssues(validation)
    if (validation.length) return
    onSave([...rules, { id: `rule-${Date.now()}`, priority: rules.length + 100, matchers: draft.matchers, category, enabled: true }])
    setCategory('')
    setPattern('')
  }

  const addLabel = () => {
    if (!labelAddress.trim() || !labelText.trim()) return
    onSaveLabels([...labels.filter((l) => l.address !== labelAddress), { address: labelAddress, label: labelText, tags: [] }])
    setLabelAddress('')
    setLabelText('')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Category rules</h2>
        {rules.map((rule) => (
          <div key={rule.id} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
            <span>{rule.matchers.map((m) => `${m.field}=${m.pattern}`).join(', ')} → <strong>{rule.category}</strong></span>
            <span style={{ color: 'var(--text-secondary)' }}>priority {rule.priority}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input style={input} placeholder="counterparty address pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Rule counterparty pattern" />
          <input style={input} placeholder="category name" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Rule category" />
          <button type="button" style={button} onClick={addRule}>Add rule</button>
        </div>
        {issues.map((issue) => <div key={issue} style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{issue}</div>)}
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Counterparty labels</h2>
        {labels.map((l) => <div key={l.address} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 11 }}>{l.address.slice(0, 8)}… → <strong>{l.label}</strong></div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input style={input} placeholder="account address" value={labelAddress} onChange={(e) => setLabelAddress(e.target.value)} aria-label="Counterparty address" />
          <input style={input} placeholder="label" value={labelText} onChange={(e) => setLabelText(e.target.value)} aria-label="Counterparty label text" />
          <button type="button" style={button} onClick={addLabel}>Add label</button>
        </div>
      </div>
    </div>
  )
}

function CostBasisView({ entries, onSave, realizedByAsset }: { entries: CostBasisEntry[]; onSave: (_e: CostBasisEntry[]) => void; realizedByAsset: Map<string, RealizedGainLoss[]> }) {
  const [asset, setAsset] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [issues, setIssues] = useState<string[]>([])

  const addEntry = () => {
    const draft = { asset, unitPrice, currency: 'USD', effectiveAt }
    const validation = validateCostBasisEntry(draft)
    setIssues(validation)
    if (validation.length) return
    onSave([...entries, { ...draft, source: 'manual-input' }])
    setAsset('')
    setUnitPrice('')
    setEffectiveAt('')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Cost basis entries</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: '0 0 10px' }}>Prices are user-provided input, never fetched or predicted — a disposal with no covering entry is flagged as missing rather than estimated.</p>
        {entries.map((e) => <div key={`${e.asset}-${e.effectiveAt}`} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 11 }}>{e.asset} @ {e.unitPrice} {e.currency} from {e.effectiveAt}</div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input style={input} placeholder="asset (e.g. XLM)" value={asset} onChange={(ev) => setAsset(ev.target.value)} aria-label="Cost basis asset" />
          <input style={input} placeholder="unit price USD" value={unitPrice} onChange={(ev) => setUnitPrice(ev.target.value)} aria-label="Cost basis unit price" />
          <input style={input} placeholder="effective at (ISO)" value={effectiveAt} onChange={(ev) => setEffectiveAt(ev.target.value)} aria-label="Cost basis effective date" />
          <button type="button" style={button} onClick={addEntry}>Add entry</button>
        </div>
        {issues.map((issue) => <div key={issue} style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{issue}</div>)}
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Realized gain/loss (FIFO)</h2>
        {Array.from(realizedByAsset.entries()).map(([asset, realized]) => {
          const summary = summarizeRealizedGainLoss(realized)
          return (
            <div key={asset} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 11 }}>
              <strong>{asset}</strong>: {summary.totalGainLoss} total {summary.missingCostBasisCount > 0 && <span style={{ color: 'var(--amber)' }}>({summary.missingCostBasisCount} disposals missing cost basis)</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UnresolvedView({ items }: { items: UnresolvedItem[] }) {
  if (!items.length) return <div role="status" style={{ ...panel, color: 'var(--green)' }}><CheckCircle2 size={14} /> No unresolved items.</div>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((item, index) => (
        <div key={`${item.postingId}-${index}`} style={panel}>
          <strong style={{ color: 'var(--amber)', fontSize: 12 }}>{item.reason}</strong>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{item.detail}</div>
        </div>
      ))}
    </div>
  )
}

function ExportsView({ period }: { period: ReconciliationPeriod | null }) {
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<ImportValidationResult | null>(null)
  const entries = useMemo(() => (period ? toJournalEntries(period.postings) : []), [period])

  const downloadCsv = () => {
    const blob = new Blob([exportJournalCsv(entries)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `journal-${period?.id || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadJson = async () => {
    if (!period) return
    const journalExport = await exportJournalJson(period.id, entries)
    const blob = new Blob([serializeJournalJson(journalExport)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `journal-${period.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const runImportCheck = async () => {
    const trimmed = importText.trim()
    const looksJson = trimmed.startsWith('{')
    const result = looksJson ? await parseJournalJson(trimmed) : parseJournalCsv(trimmed)
    setImportResult(result)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Journal export</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: '0 0 10px' }}>{entries.length} double-entry rows from {period?.postings.length || 0} postings.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={button} onClick={downloadCsv} disabled={!period}><Download size={13} /> Download CSV</button>
          <button type="button" style={button} onClick={() => void downloadJson()} disabled={!period}><Download size={13} /> Download JSON</button>
        </div>
      </div>
      <div style={panel}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Round-trip import validation</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: '0 0 8px' }}>Paste a previously exported CSV or JSON journal to verify it re-imports cleanly (JSON re-checks its checksum).</p>
        <textarea aria-label="Journal import text" value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} style={{ ...input, width: '100%', fontFamily: 'monospace', fontSize: 11 }} />
        <button type="button" style={{ ...button, marginTop: 8 }} onClick={() => void runImportCheck()}><Upload size={13} /> Validate import</button>
        {importResult && (
          <div role="status" style={{ marginTop: 10, color: importResult.valid ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>
            {importResult.valid ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {importResult.valid ? `${importResult.entries.length} entries validated.` : importResult.issues.map((i) => i.message).join(' ')}
          </div>
        )}
      </div>
    </div>
  )
}

function SnapshotsView({ snapshots, onVerify, onSave, canSave }: { snapshots: PeriodSnapshot[]; onVerify: (_s: PeriodSnapshot) => Promise<boolean>; onSave: () => void; canSave: boolean }) {
  const [results, setResults] = useState<Record<string, boolean>>({})
  const verify = async (snapshot: PeriodSnapshot) => {
    const valid = await onVerify(snapshot)
    setResults((prev) => ({ ...prev, [snapshot.id]: valid }))
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Snapshots are immutable, content-hashed records of a period at the time it was saved.</span>
        <button type="button" style={button} onClick={onSave} disabled={!canSave}>Save current period as snapshot</button>
      </div>
      {snapshots.map((snapshot) => (
        <div key={snapshot.id} style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 12 }}>{snapshot.periodId}</strong>
            <button type="button" style={{ ...button, padding: '4px 8px' }} onClick={() => void verify(snapshot)}>Verify integrity</button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{snapshot.generatedAt} · hash {snapshot.contentHash.slice(0, 16)}…</div>
          {results[snapshot.id] !== undefined && (
            <div style={{ fontSize: 11, color: results[snapshot.id] ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
              {results[snapshot.id] ? 'Hash matches — unmodified.' : 'Hash mismatch — this snapshot was altered after it was saved.'}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MethodologyView() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div role="note" style={{ ...panel, borderColor: 'var(--amber)' }}>
        <strong style={{ color: 'var(--amber)' }}>This is an operational record, not tax or accounting advice.</strong>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: '6px 0 0' }}>
          Reconciliation results, journal exports, and realized gain/loss figures are derived deterministically from ledger activity and the rules/prices you provide. They are not a substitute for review by a qualified accountant or tax professional, and this feature does not predict, forecast, or recommend portfolio allocation — see the AI Portfolio Optimizer feature for predictive analysis.
        </p>
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>How reconciliation works</h2>
        <ul style={{ color: 'var(--text-secondary)', fontSize: 11, margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>All amounts are computed in integer stroops (10,000,000ths) to avoid floating-point rounding error.</li>
          <li>Assets are keyed by code+issuer, never by code alone, so two assets sharing a code under different issuers are never merged.</li>
          <li>Failed transactions produce no operation-level posting, but the network fee is still posted — Stellar charges it regardless of success.</li>
          <li>Operation types without a directly observable amount in the /operations feed (account merges, claimable-balance claims on some Horizon versions, Soroban contract transfers) produce a zero-amount informational posting rather than a fabricated number, and surface in the Unresolved queue.</li>
          <li>Cost basis is FIFO and entirely user-supplied; a disposal with no covering price entry is flagged, never estimated.</li>
        </ul>
      </div>
    </div>
  )
}

export default function TreasuryReconciliationDashboard() {
  const { network, connectedAddress } = useStore()
  const graph = useTreasuryReconciliation(connectedAddress || null, network as NetworkName)
  const [view, setView] = useState<View>('overview')
  const [periodLabel, setPeriodLabel] = useState('Current period')
  const [startTime, setStartTime] = useState('2000-01-01T00:00:00.000Z')
  const [endTime, setEndTime] = useState('2100-01-01T00:00:00.000Z')
  const [openingBalancesText, setOpeningBalancesText] = useState('{}')
  const [actualClosingText, setActualClosingText] = useState('')

  const handleBuild = () => {
    let openingBalances: Record<string, string> = {}
    let actualClosingBalances: Record<string, string> | null = null
    try {
      openingBalances = JSON.parse(openingBalancesText || '{}')
    } catch {
      openingBalances = {}
    }
    if (actualClosingText.trim()) {
      try {
        actualClosingBalances = JSON.parse(actualClosingText)
      } catch {
        actualClosingBalances = null
      }
    }
    graph.buildReconciliationPeriod({ id: `period-${Date.now()}`, label: periodLabel, startTime, endTime, openingBalances, actualClosingBalances })
  }

  if (graph.ledger.loading && !graph.ledger.postings.length) {
    return <section role="status" style={panel}><RefreshCw size={16} /> Loading ledger activity…</section>
  }
  if (graph.ledger.error) {
    return (
      <section role="alert" style={{ ...panel, display: 'grid', gap: 12 }}>
        <strong><AlertTriangle size={17} /> {graph.ledger.error.message}</strong>
        {graph.ledger.error.retryable && <button type="button" onClick={() => void graph.refresh()} style={{ ...button, width: 'fit-content' }}>Retry</button>}
        <button type="button" onClick={() => void graph.refresh(true)} style={{ ...button, width: 'fit-content' }}>Use demo data instead</button>
      </section>
    )
  }

  return (
    <section aria-labelledby="treasury-title" style={{ display: 'grid', gap: 16 }}>
      <header style={{ ...panel, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>TREASURY · {network.toUpperCase()}</div>
          <h1 id="treasury-title" style={{ margin: '6px 0', fontSize: 25 }}>Reconciliation &amp; accounting exports</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, maxWidth: 650 }}>Normalize ledger activity into auditable periods, reconcile balances, and export versioned journals.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {graph.ledger.simulated && <span style={{ ...button, cursor: 'default', color: 'var(--amber)' }}>Demo data</span>}
          <button type="button" disabled={graph.ledger.loading} onClick={() => void graph.refresh()} style={button}><RefreshCw size={13} /> Refresh</button>
        </div>
      </header>

      <nav aria-label="Treasury reconciliation views" style={{ display: 'flex', gap: 5, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {(['overview', 'postings', 'rules', 'cost-basis', 'unresolved', 'exports', 'snapshots', 'methodology'] as View[]).map((item) => (
          <button type="button" key={item} aria-current={view === item ? 'page' : undefined} onClick={() => setView(item)}
            style={{ ...button, border: 0, borderBottom: view === item ? '2px solid var(--cyan)' : '2px solid transparent', borderRadius: 0, background: 'transparent', textTransform: 'capitalize' }}>
            {item.replace('-', ' ')}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <OverviewView
          graph={graph} periodLabel={periodLabel} setPeriodLabel={setPeriodLabel} startTime={startTime} setStartTime={setStartTime}
          endTime={endTime} setEndTime={setEndTime} openingBalancesText={openingBalancesText} setOpeningBalancesText={setOpeningBalancesText}
          actualClosingText={actualClosingText} setActualClosingText={setActualClosingText} onBuild={handleBuild}
        />
      )}
      {view === 'postings' && <PostingsView postings={graph.period?.postings || []} />}
      {view === 'rules' && <RulesView rules={graph.rules} onSave={(r) => void graph.updateRules(r)} labels={graph.labels} onSaveLabels={(l) => void graph.updateLabels(l)} />}
      {view === 'cost-basis' && <CostBasisView entries={graph.costBasisEntries} onSave={(e) => void graph.updateCostBasisEntries(e)} realizedByAsset={graph.realizedGainLossByAsset} />}
      {view === 'unresolved' && <UnresolvedView items={graph.unresolvedItems} />}
      {view === 'exports' && <ExportsView period={graph.period} />}
      {view === 'snapshots' && <SnapshotsView snapshots={graph.snapshots} onVerify={graph.verifySnapshot} onSave={() => void graph.saveCurrentSnapshot()} canSave={Boolean(graph.period)} />}
      {view === 'methodology' && <MethodologyView />}
    </section>
  )
}

import { useState, type CSSProperties, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Lock,
  RefreshCw,
  Upload,
} from 'lucide-react';
import useTreasuryReconciliation from '../../hooks/useTreasuryReconciliation';
import { useStore } from '../../lib/store';
import { DEFAULT_ACCOUNTING_MAPPING, validateCostBasisEntry, validateRule } from '../../lib/treasuryReconciliation';
import type {
  AssetBalance,
  CategoryRule,
  CostBasisEntry,
  Discrepancy,
  DiscrepancySeverity,
  LedgerPosting,
  ReviewStatus,
} from '../../types/treasury';

type View = 'overview' | 'postings' | 'unresolved' | 'rules' | 'costBasis' | 'periods';

const SEVERITY_COLORS: Record<DiscrepancySeverity, string> = {
  info: 'var(--cyan)',
  warning: 'var(--amber)',
  critical: 'var(--red)',
};

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

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
};

const short = (value: string) => (value.length > 13 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value);

function SeverityPill({ severity }: { severity: DiscrepancySeverity }) {
  return (
    <span
      style={{
        color: SEVERITY_COLORS[severity],
        border: `1px solid ${SEVERITY_COLORS[severity]}`,
        borderRadius: 999,
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
      }}
    >
      {severity}
    </span>
  );
}

function Stat({ label, value, detail, color = 'var(--text-primary)' }: { label: string; value: string | number; detail: string; color?: string }) {
  return (
    <div style={panel}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: 700, margin: '8px 0 4px', fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{detail}</div>
    </div>
  );
}

function BalanceWaterfall({ balances }: { balances: AssetBalance[] }) {
  return (
    <div style={panel}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Asset balance waterfall</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
            <th style={{ padding: '6px 4px' }}>Asset</th>
            <th style={{ padding: '6px 4px' }}>Opening</th>
            <th style={{ padding: '6px 4px' }}>Inflow</th>
            <th style={{ padding: '6px 4px' }}>Outflow</th>
            <th style={{ padding: '6px 4px' }}>Closing</th>
            <th style={{ padding: '6px 4px' }}>Postings</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((balance) => (
            <tr key={balance.asset.code} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 4px', fontWeight: 600 }}>{balance.asset.code}</td>
              <td style={{ padding: '8px 4px' }}>{balance.opening}</td>
              <td style={{ padding: '8px 4px', color: 'var(--green)' }}>+{balance.inflow}</td>
              <td style={{ padding: '8px 4px', color: 'var(--red)' }}>-{balance.outflow}</td>
              <td style={{ padding: '8px 4px', fontWeight: 700 }}>{balance.closing}</td>
              <td style={{ padding: '8px 4px', color: 'var(--text-muted)' }}>{balance.postingCount}</td>
            </tr>
          ))}
          {balances.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: '16px 4px', color: 'var(--text-muted)' }}>
                No asset activity in this period yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PostingsTable({ postings, onSelect }: { postings: LedgerPosting[]; onSelect: (_p: LedgerPosting) => void }) {
  return (
    <div style={panel}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
            <th style={{ padding: '6px 4px' }}>When</th>
            <th style={{ padding: '6px 4px' }}>Kind</th>
            <th style={{ padding: '6px 4px' }}>Asset</th>
            <th style={{ padding: '6px 4px' }}>Amount</th>
            <th style={{ padding: '6px 4px' }}>Counterparty</th>
            <th style={{ padding: '6px 4px' }}>Category</th>
          </tr>
        </thead>
        <tbody>
          {postings.map((posting) => (
            <tr key={posting.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onSelect(posting)}>
              <td style={{ padding: '8px 4px', color: 'var(--text-muted)' }}>{new Date(posting.timestamp).toLocaleString()}</td>
              <td style={{ padding: '8px 4px' }}>{posting.kind.replace(/_/g, ' ')}</td>
              <td style={{ padding: '8px 4px' }}>{posting.asset.code}</td>
              <td style={{ padding: '8px 4px', color: posting.amount.startsWith('-') ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                {posting.amount}
              </td>
              <td style={{ padding: '8px 4px' }}>{posting.counterpartyLabel ?? (posting.counterparty ? short(posting.counterparty) : '—')}</td>
              <td style={{ padding: '8px 4px', color: 'var(--text-muted)' }}>{posting.category ?? 'uncategorized'}</td>
            </tr>
          ))}
          {postings.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: '16px 4px', color: 'var(--text-muted)' }}>
                No postings for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PostingDetail({ posting, onClose }: { posting: LedgerPosting; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Posting provenance"
      style={{ ...panel, position: 'fixed', zIndex: 1200, right: 20, top: 80, width: 'min(460px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 110px)', overflow: 'auto', boxShadow: '0 18px 45px rgba(0,0,0,.35)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Posting {short(posting.id)}</h2>
        <button type="button" aria-label="Close posting detail" onClick={onClose} style={{ ...button, padding: 7 }}>
          ×
        </button>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 10px', fontSize: 12, margin: '14px 0' }}>
        <dt style={{ color: 'var(--text-muted)' }}>Kind</dt>
        <dd>{posting.kind}</dd>
        <dt style={{ color: 'var(--text-muted)' }}>Asset</dt>
        <dd>{posting.asset.code}</dd>
        <dt style={{ color: 'var(--text-muted)' }}>Amount</dt>
        <dd>{posting.amount}</dd>
        <dt style={{ color: 'var(--text-muted)' }}>Tx hash</dt>
        <dd style={{ wordBreak: 'break-all' }}>{posting.txHash}</dd>
        <dt style={{ color: 'var(--text-muted)' }}>Source</dt>
        <dd>
          {posting.provenance.sourceType} · {posting.provenance.sourceId}
        </dd>
        {posting.provenance.ruleId && (
          <>
            <dt style={{ color: 'var(--text-muted)' }}>Rule</dt>
            <dd>{posting.provenance.ruleId}</dd>
          </>
        )}
      </dl>
      {posting.needsReview && (
        <div role="status" style={{ color: 'var(--amber)', fontSize: 11 }}>
          <AlertTriangle size={13} /> {posting.reviewReason}
        </div>
      )}
    </div>
  );
}

function UnresolvedQueue({
  discrepancies,
  reviewStatus,
  onSetStatus,
}: {
  discrepancies: Discrepancy[];
  reviewStatus: (_id: string) => ReviewStatus;
  onSetStatus: (_id: string, _status: ReviewStatus) => void;
}) {
  return (
    <div style={panel}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Unresolved items</h2>
      {discrepancies.length === 0 && (
        <div style={{ color: 'var(--green)', padding: '12px 0' }}>
          <CheckCircle2 size={16} /> No discrepancies detected for this period.
        </div>
      )}
      {discrepancies.map((discrepancy) => (
        <article key={discrepancy.id} style={{ borderTop: '1px solid var(--border)', padding: '13px 0', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SeverityPill severity={discrepancy.severity} />
              <strong style={{ fontSize: 12 }}>{discrepancy.kind.replace(/-/g, ' ')}</strong>
            </div>
            <label style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              Status{' '}
              <select
                aria-label={`Review status for ${discrepancy.kind}`}
                value={reviewStatus(discrepancy.id)}
                onChange={(event) => onSetStatus(discrepancy.id, event.target.value as ReviewStatus)}
                style={{ ...button, marginLeft: 6 }}
              >
                {(['unresolved', 'flagged', 'resolved'] as ReviewStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{discrepancy.message}</span>
          {discrepancy.expected !== undefined && (
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              Expected {discrepancy.expected} · Actual {discrepancy.actual}
            </span>
          )}
        </article>
      ))}
    </div>
  );
}

function RulesEditor({
  rules,
  onSave,
  onRemove,
}: {
  rules: CategoryRule[];
  onSave: (_rule: CategoryRule) => void;
  onRemove: (_id: string) => void;
}) {
  const [draft, setDraft] = useState<CategoryRule>({
    id: '',
    priority: rules.length,
    enabled: true,
    name: '',
    match: {},
    category: '',
  });
  // `id` is only assigned at submit time (see onSubmit below), so validate
  // against a placeholder id rather than flagging the still-empty draft.id
  // as an error the form could never satisfy before being submitted.
  const errors = validateRule({ ...draft, id: draft.id || 'pending' });

  return (
    <div style={panel}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Category rules</h2>
      {rules.map((rule) => (
        <div key={rule.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <strong style={{ fontSize: 12 }}>{rule.name}</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              → {rule.category} · priority {rule.priority} · {rule.enabled ? 'enabled' : 'disabled'}
            </div>
          </div>
          <button type="button" onClick={() => onRemove(rule.id)} style={{ ...button, padding: '5px 9px' }}>
            Remove
          </button>
        </div>
      ))}
      <form
        aria-label="Add category rule"
        style={{ display: 'grid', gap: 8, marginTop: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (errors.length) return;
          onSave({ ...draft, id: draft.id || `rule-${Date.now()}` });
          setDraft({ id: '', priority: rules.length + 1, enabled: true, name: '', match: {}, category: '' });
        }}
      >
        <input aria-label="Rule name" placeholder="Rule name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={button} />
        <input
          aria-label="Match counterparty contains"
          placeholder="Match: counterparty contains…"
          value={draft.match.counterparty ?? ''}
          onChange={(e) => setDraft({ ...draft, match: { ...draft.match, counterparty: e.target.value || undefined } })}
          style={button}
        />
        <input aria-label="Category" placeholder="Category (e.g. vendor-payment)" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={button} />
        <button type="submit" style={{ ...button, width: 'fit-content' }} disabled={errors.length > 0}>
          Add rule
        </button>
      </form>
    </div>
  );
}

function CostBasisEditor({
  entries,
  onSave,
  onRemove,
}: {
  entries: CostBasisEntry[];
  onSave: (_entry: CostBasisEntry) => void;
  onRemove: (_id: string) => void;
}) {
  const [draft, setDraft] = useState<Omit<CostBasisEntry, 'id'>>({
    assetCode: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
    pricePerUnit: '',
    currency: 'USD',
    source: '',
  });
  const errors = validateCostBasisEntry(draft);

  return (
    <div style={panel}>
      <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>Cost-basis inputs</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>
        Manually entered reference prices, used only to show an operational valuation — not tax or accounting advice.
      </p>
      {entries.map((entry) => (
        <div key={entry.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <strong style={{ fontSize: 12 }}>{entry.assetCode}</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              {entry.pricePerUnit} {entry.currency} as of {entry.effectiveDate} · {entry.source}
            </div>
          </div>
          <button type="button" onClick={() => onRemove(entry.id)} style={{ ...button, padding: '5px 9px' }}>
            Remove
          </button>
        </div>
      ))}
      <form
        aria-label="Add cost-basis entry"
        style={{ display: 'grid', gap: 8, marginTop: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (errors.length) return;
          onSave({ ...draft, id: `cb-${Date.now()}` });
          setDraft({ ...draft, assetCode: '', pricePerUnit: '', source: '' });
        }}
      >
        <input aria-label="Asset code" placeholder="Asset code (e.g. USDC)" value={draft.assetCode} onChange={(e) => setDraft({ ...draft, assetCode: e.target.value })} style={button} />
        <input aria-label="Price per unit" placeholder="Price per unit" value={draft.pricePerUnit} onChange={(e) => setDraft({ ...draft, pricePerUnit: e.target.value })} style={button} />
        <input aria-label="Price source" placeholder="Source (e.g. exchange name)" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} style={button} />
        <button type="submit" style={{ ...button, width: 'fit-content' }} disabled={errors.length > 0}>
          Add price
        </button>
      </form>
    </div>
  );
}

export default function TreasuryReconciliationDashboard() {
  const { connectedAddress, network } = useStore();
  const treasury = useTreasuryReconciliation(connectedAddress, network);
  const [view, setView] = useState<View>('overview');
  const [selected, setSelected] = useState<LedgerPosting | null>(null);

  const activeData = treasury.result
    ? { ...treasury.result }
    : treasury.closedSnapshot
      ? {
          postings: treasury.closedSnapshot.postings,
          balances: treasury.closedSnapshot.balances,
          discrepancies: treasury.closedSnapshot.discrepancies,
          state: 'live' as const,
          truncated: false,
          generatedAt: treasury.closedSnapshot.generatedAt,
        }
      : null;

  const reviewStatusFor = (id: string): ReviewStatus =>
    treasury.review.find((r) => r.targetId === id && r.targetType === 'discrepancy')?.status ?? 'unresolved';

  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => treasury.importAndVerify(String(reader.result));
    reader.readAsText(file);
    event.target.value = '';
  };

  if (!connectedAddress) {
    return (
      <section role="status" style={panel}>
        <Lock size={16} /> Connect an account to reconcile its treasury activity.
      </section>
    );
  }

  if (treasury.loading && !activeData) {
    return (
      <section role="status" style={panel}>
        <RefreshCw size={16} /> Loading reconciliation data…
      </section>
    );
  }

  if (treasury.error && !activeData) {
    return (
      <section role="alert" style={{ ...panel, display: 'grid', gap: 12 }}>
        <strong>
          <AlertTriangle size={17} /> Reconciliation data unavailable
        </strong>
        <span>{treasury.error.message}</span>
        {treasury.error.retryable && (
          <button type="button" onClick={() => void treasury.refresh()} style={{ ...button, width: 'fit-content' }}>
            Retry
          </button>
        )}
      </section>
    );
  }

  if (!activeData || !treasury.activePeriod) return null;

  return (
    <section aria-labelledby="treasury-title" style={{ display: 'grid', gap: 16, '--text-muted': 'var(--text-secondary)' } as CSSProperties}>
      <header style={{ ...panel, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>TREASURY · {network.toUpperCase()}</div>
          <h1 id="treasury-title" style={{ margin: '6px 0', fontSize: 24 }}>
            Treasury reconciliation
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, maxWidth: 650 }}>
            Deterministic operational records reconstructed from ledger activity for {treasury.activePeriod.start} –{' '}
            {treasury.activePeriod.end}. Not tax or accounting advice.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={treasury.exportJson} style={button}>
            <FileJson size={14} /> Export JSON
          </button>
          <button type="button" onClick={treasury.exportCsv} style={button}>
            <Download size={14} /> Export CSV
          </button>
          <button type="button" onClick={() => treasury.exportGenericLedger(DEFAULT_ACCOUNTING_MAPPING)} style={button}>
            <Download size={14} /> Export ledger mapping
          </button>
          <label style={button}>
            <Upload size={14} /> Import & verify
            <input aria-label="Import export file" type="file" accept="application/json" onChange={importFile} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {activeData.state === 'simulation' && (
        <div role="status" style={{ ...panel, color: 'var(--text-secondary)', padding: 12 }}>
          <AlertTriangle size={14} color="var(--amber)" /> Showing a deterministic demonstration snapshot — live ledger
          data was unreachable.
        </div>
      )}
      {treasury.closedSnapshot && (
        <div role="status" style={{ ...panel, color: 'var(--text-secondary)', padding: 12 }}>
          <Lock size={14} /> This period is closed. Its snapshot is immutable — start a new period to record further
          activity.
        </div>
      )}
      {treasury.message && (
        <div role="status" style={{ ...panel, color: treasury.message.startsWith('Import rejected') ? 'var(--red)' : 'var(--green)', padding: 12 }}>
          {treasury.message}
        </div>
      )}

      <nav aria-label="Treasury views" style={{ display: 'flex', gap: 5, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {(['overview', 'postings', 'unresolved', 'rules', 'costBasis', 'periods'] as View[]).map((item) => (
          <button
            type="button"
            key={item}
            aria-current={view === item ? 'page' : undefined}
            onClick={() => setView(item)}
            style={{ ...button, border: 0, borderBottom: view === item ? '2px solid var(--cyan)' : '2px solid transparent', borderRadius: 0, background: 'transparent' }}
          >
            {item === 'costBasis' ? 'Cost basis' : item}
          </button>
        ))}
      </nav>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {treasury.unresolvedCount} unresolved item(s) · generated {new Date(activeData.generatedAt).toLocaleString()}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {treasury.activePeriod.status === 'open' && (
            <button type="button" onClick={treasury.closePeriod} style={button}>
              <Lock size={13} /> Close period
            </button>
          )}
          <button type="button" disabled={treasury.refreshing} onClick={() => void treasury.refresh()} style={button}>
            <RefreshCw size={13} /> {treasury.refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {view === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Stat label="Postings" value={activeData.postings.length} detail="This period" />
            <Stat label="Unresolved" value={treasury.unresolvedCount} detail="Needs review" color="var(--amber)" />
            <Stat label="Assets" value={activeData.balances.length} detail="With activity or balance" />
            <Stat label="Critical issues" value={activeData.discrepancies.filter((d) => d.severity === 'critical').length} detail="Blocks period close" color="var(--red)" />
          </div>
          <BalanceWaterfall balances={activeData.balances} />
        </>
      )}
      {view === 'postings' && <PostingsTable postings={activeData.postings} onSelect={setSelected} />}
      {view === 'unresolved' && (
        <UnresolvedQueue discrepancies={activeData.discrepancies} reviewStatus={reviewStatusFor} onSetStatus={(id, status) => void treasury.setReviewStatus(id, 'discrepancy', status)} />
      )}
      {view === 'rules' && <RulesEditor rules={treasury.rules} onSave={(rule) => void treasury.upsertRule(rule)} onRemove={(id) => void treasury.removeRule(id)} />}
      {view === 'costBasis' && (
        <CostBasisEditor entries={treasury.costBasisEntries} onSave={(entry) => void treasury.upsertCostBasisEntry(entry)} onRemove={(id) => void treasury.removeCostBasisEntry(id)} />
      )}
      {view === 'periods' && (
        <div style={panel}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Periods</h2>
          {treasury.periods.map((period) => (
            <div key={period.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: 12 }}>
                  {period.start} – {period.end}
                </strong>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{period.status}</div>
              </div>
              <button type="button" onClick={() => treasury.setActivePeriodId(period.id)} style={{ ...button, padding: '5px 9px' }}>
                View
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && <PostingDetail posting={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

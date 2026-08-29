import type { CSSProperties } from 'react';
import type { SnapshotLibraryRecord } from '../../types/ledgerSnapshots';
import { inspectSnapshotEntries } from '../../lib/ledgerSnapshots/diffEngine';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface Props {
  record: SnapshotLibraryRecord;
  inspection: ReturnType<typeof inspectSnapshotEntries> | null;
}

export default function SnapshotInspectPanel({ record, inspection }: Props) {
  const { snapshot } = record;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{snapshot.label}</h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: 12, margin: 0 }}>
          <dt style={{ color: 'var(--text-muted)' }}>Snapshot ID</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{snapshot.snapshotId}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Network</dt>
          <dd style={{ margin: 0 }}>{snapshot.network.networkName}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Ledger</dt>
          <dd style={{ margin: 0 }}>
            #{snapshot.ledger.sequence} · {snapshot.ledger.hash.slice(0, 16)}…
          </dd>
          <dt style={{ color: 'var(--text-muted)' }}>Integrity</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{snapshot.integrity.contentDigest.slice(0, 16)}…</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Captured</dt>
          <dd style={{ margin: 0 }}>{snapshot.provenance.capturedAt}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Redaction</dt>
          <dd style={{ margin: 0 }}>{snapshot.redaction.level}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Mode</dt>
          <dd style={{ margin: 0, color: 'var(--amber)' }}>Diagnostic simulation only</dd>
        </dl>
      </div>

      {inspection && (
        <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          <Metric label="Ledger entries" value={inspection.totalEntries} />
          <Metric label="Accounts" value={inspection.accountCount} />
          <Metric label="Contract storage" value={inspection.contractStorageCount} />
          <Metric label="Simulations" value={inspection.simulationCount} />
        </div>
      )}

      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Accounts</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '6px 8px' }}>Account</th>
              <th style={{ padding: '6px 8px' }}>Sequence</th>
              <th style={{ padding: '6px 8px' }}>Balances</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.accounts.map((account) => (
              <tr key={account.accountId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px', fontFamily: 'monospace' }}>{account.accountId.slice(0, 12)}…</td>
                <td style={{ padding: '8px' }}>{account.sequence}</td>
                <td style={{ padding: '8px' }}>{account.balances.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Captured simulations</h4>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {snapshot.simulations.map((sim) => (
            <li
              key={sim.id}
              style={{
                padding: 10,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {sim.kind} · {sim.requestDigest.slice(0, 12)}…
                </span>
                <span style={{ color: sim.supported ? 'var(--green)' : 'var(--red)' }}>
                  {sim.supported ? 'Supported' : 'Unsupported'}
                </span>
              </div>
              {sim.unsupportedReasons?.length ? (
                <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                  {sim.unsupportedReasons.join('; ')}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>Ledger entries by kind</h4>
        {inspection && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, display: 'grid', gap: 4 }}>
            {Object.entries(inspection.byKind).map(([kind, count]) => (
              <li key={kind} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{kind}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

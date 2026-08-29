import { useMemo, type CSSProperties } from 'react';
import type { BulkExecutionPlan, BulkManifest } from '../../types/bulkOperationsPlanner';
import {
  buildAdjacencyList,
  buildDependencyGraph,
  computeDependencyDepth,
  findCriticalPath,
  topologicalSort,
} from '../../lib/bulkOperationsPlanner/dependencyGraph';

const panel: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
};

interface BulkDependencyGraphPanelProps {
  manifest: BulkManifest | null;
  plan: BulkExecutionPlan | null;
}

export default function BulkDependencyGraphPanel({ manifest, plan }: BulkDependencyGraphPanelProps) {
  const graphInfo = useMemo(() => {
    if (!manifest) return null;
    const graph = buildDependencyGraph(manifest.operations, manifest.edges);
    const ordered = topologicalSort(graph);
    const criticalPath = findCriticalPath(graph);
    const adjacency = buildAdjacencyList(graph);
    const depths = Object.fromEntries(manifest.operations.map((op) => [op.id, computeDependencyDepth(graph, op.id)]));
    return { ordered, criticalPath, adjacency, depths };
  }, [manifest]);

  if (!manifest || !graphInfo) {
    return (
      <section style={panel}>
        <p role="status" style={{ color: 'var(--text-muted)', margin: 0 }}>
          Load a manifest to inspect its dependency graph.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={panel} aria-labelledby="bulk-graph-heading">
        <h2 id="bulk-graph-heading" style={{ marginTop: 0 }}>
          Dependency graph
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Topological order and critical path for {manifest.operations.length} operations.
          {plan ? ` Planned into ${plan.totalPacks} pack(s).` : ''}
        </p>

        <p>
          Critical path:{' '}
          <code>{graphInfo.criticalPath.join(' → ') || 'none'}</code>
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Order</th>
                <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Operation</th>
                <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Dependencies</th>
                <th scope="col" style={{ textAlign: 'right', padding: 8 }}>Depth</th>
              </tr>
            </thead>
            <tbody>
              {graphInfo.ordered.map((opId, index) => (
                <tr
                  key={opId}
                  style={{
                    borderTop: '1px solid var(--border)',
                    background: graphInfo.criticalPath.includes(opId) ? 'rgba(0, 180, 255, 0.06)' : undefined,
                  }}
                >
                  <td style={{ padding: 8 }}>{index + 1}</td>
                  <td style={{ padding: 8 }}>{opId}</td>
                  <td style={{ padding: 8 }}>{(graphInfo.adjacency[opId] ?? []).join(', ') || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{graphInfo.depths[opId] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

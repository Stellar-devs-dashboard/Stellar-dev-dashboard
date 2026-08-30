import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  buildDemoManifest,
  buildExecutionPlan,
  buildReconciliationReport,
  createCheckpoint,
  defaultCsvImportOptions,
  detectCycle,
  dryRunPlan,
  importCsvPreview,
  InMemoryBulkRepository,
  planManifest,
  runBulkExecution,
  topologicalSort,
  validateManifestOperations,
  buildDependencyGraph,
} from './index';
import { DEMO_CSV_PAYMENTS, DEMO_SEQUENCE_NUMBERS } from './fixtures';

describe('bulkOperationsPlanner', () => {
  it('builds a demo manifest with valid checksum', async () => {
    const manifest = await buildDemoManifest();
    expect(manifest.operations.length).toBeGreaterThan(0);
    expect(manifest.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects dependency cycles', async () => {
    const manifest = await buildDemoManifest();
    const cyclic = {
      ...manifest,
      operations: manifest.operations.map((op) =>
        op.id === 'demo-pay-1' ? { ...op, dependencies: ['demo-pay-2'] } : op
      ),
    };
    const graph = buildDependencyGraph(cyclic.operations, cyclic.edges);
    const cycle = detectCycle(graph);
    expect(cycle.length).toBeGreaterThan(0);
  });

  it('topologically sorts demo operations', async () => {
    const manifest = await buildDemoManifest();
    const graph = buildDependencyGraph(manifest.operations, manifest.edges);
    const ordered = topologicalSort(graph);
    expect(ordered.indexOf('demo-pay-1')).toBeLessThan(ordered.indexOf('demo-pay-2'));
  });

  it('plans manifest into transaction packs', async () => {
    const manifest = await buildDemoManifest();
    const { plan, validation } = await planManifest(manifest, DEMO_SEQUENCE_NUMBERS);
    expect(validation.valid).toBe(true);
    expect(plan.totalPacks).toBeGreaterThan(0);
    expect(plan.orderedOperationIds.length).toBe(manifest.operations.length);
  });

  it('previews CSV import with mapped operations', () => {
    const preview = importCsvPreview(DEMO_CSV_PAYMENTS, defaultCsvImportOptions());
    expect(preview.mappedOperations.length).toBeGreaterThan(0);
    const errors = preview.issues.filter((issue) => issue.severity === 'error');
    expect(errors, JSON.stringify(errors)).toEqual([]);
  });

  it('dry-runs a plan without network', async () => {
    const manifest = await buildDemoManifest();
    const { plan } = await planManifest(manifest, DEMO_SEQUENCE_NUMBERS);
    const dry = dryRunPlan(manifest, plan);
    expect(dry.simulatedOutcomes.every((item) => item.wouldSucceed)).toBe(true);
  });

  it('executes a simulated bulk run to completion', async () => {
    const manifest = await buildDemoManifest();
    const { plan } = await planManifest(manifest, DEMO_SEQUENCE_NUMBERS);
    const runId = 'test-run-1';
    const checkpoint = createCheckpoint(runId, manifest, plan, DEMO_SEQUENCE_NUMBERS);
    const result = await runBulkExecution({ manifest, plan, checkpoint });
    expect(result.receipt.completedCount).toBeGreaterThan(0);
    expect(result.checkpoint.status).toBe('completed');
  });

  it('persists manifests and runs in memory repository', async () => {
    const repo = new InMemoryBulkRepository();
    const manifest = await buildDemoManifest();
    await repo.saveManifest({ id: manifest.id, manifest, savedAt: new Date().toISOString(), pinned: false });
    const stored = await repo.getManifest(manifest.id);
    expect(stored?.manifest.id).toBe(manifest.id);
  });
});

describe('bulkOperationsPlanner validation', () => {
  it('reports invalid Stellar addresses', async () => {
    const manifest = await buildDemoManifest();
    const invalid = {
      ...manifest,
      operations: manifest.operations.map((op, index) =>
        index === 0 ? { ...op, sourceAccount: 'NOT_A_KEY' } : op
      ),
    };
    const report = validateManifestOperations(invalid.operations, invalid.edges);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'INVALID_SOURCE')).toBe(true);
  });
});

describe('bulkOperationsPlanner reconciliation', () => {
  it('builds reconciliation report after simulated run', async () => {
    const manifest = await buildDemoManifest();
    const plan = await buildExecutionPlan(manifest, DEMO_SEQUENCE_NUMBERS);
    const checkpoint = createCheckpoint('recon-run', manifest, plan, DEMO_SEQUENCE_NUMBERS);
    const { checkpoint: finished, receipt } = await runBulkExecution({ manifest, plan, checkpoint });
    const report = buildReconciliationReport(manifest, finished, receipt);
    expect(report.rows.length).toBe(manifest.operations.length);
    expect(report.matchedCount).toBeGreaterThan(0);
  });
});

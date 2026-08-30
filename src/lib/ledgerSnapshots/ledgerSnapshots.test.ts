import { describe, expect, it } from 'vitest';
import {
  buildDemoSnapshot,
  buildCorruptedSnapshotJson,
  buildUnsupportedVersionSnapshotJson,
  computeSnapshotDigest,
  diffSnapshots,
  importSnapshotFromJson,
  InMemorySnapshotRepository,
  isReplayDeterministic,
  migrateSnapshot,
  redactSnapshot,
  replayEngine,
  stableCanonicalJson,
  validateSnapshotStructure,
  verifySnapshotDigest,
} from './index';

describe('ledgerSnapshots canonicalize', () => {
  it('produces stable canonical JSON regardless of key order', () => {
    const a = stableCanonicalJson({ b: 2, a: { z: 1, y: 2 } });
    const b = stableCanonicalJson({ a: { y: 2, z: 1 }, b: 2 });
    expect(a).toBe(b);
  });

  it('computes deterministic snapshot digests', async () => {
    const snapshot = await buildDemoSnapshot();
    const digestA = await computeSnapshotDigest(snapshot);
    const digestB = await computeSnapshotDigest(snapshot);
    expect(digestA).toBe(digestB);
    expect(digestA).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies snapshot integrity', async () => {
    const snapshot = await buildDemoSnapshot();
    expect(await verifySnapshotDigest(snapshot)).toBe(true);
  });
});

describe('ledgerSnapshots schema', () => {
  it('validates demo snapshot structure', async () => {
    const snapshot = await buildDemoSnapshot();
    const report = validateSnapshotStructure(snapshot);
    expect(report.valid).toBe(true);
  });

  it('rejects unsupported schema versions', () => {
    const result = migrateSnapshot(JSON.parse(buildUnsupportedVersionSnapshotJson()));
    expect(result.ok).toBe(false);
  });

  it('rejects corrupted integrity digests on import', async () => {
    const result = await importSnapshotFromJson(buildCorruptedSnapshotJson());
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(['validation_error', 'corrupt']).toContain(result.code);
    }
  });
});

describe('ledgerSnapshots redaction', () => {
  it('redacts account identifiers in strict mode', async () => {
    const snapshot = await buildDemoSnapshot();
    const { snapshot: redacted, report } = redactSnapshot(snapshot, { level: 'strict' });
    expect(redacted.accounts[0]?.accountId).toBe('[REDACTED_ACCOUNT]');
    expect(report.redactedFieldCount).toBeGreaterThan(0);
    expect(report.secretsRemoved).toBe(true);
  });
});

describe('ledgerSnapshots replay', () => {
  it('replays demo simulations deterministically', async () => {
    const snapshot = await buildDemoSnapshot();
    const resultA = await replayEngine.replay(snapshot, { snapshotId: snapshot.snapshotId, strictMode: false });
    const resultB = await replayEngine.replay(snapshot, { snapshotId: snapshot.snapshotId, strictMode: false });
    expect(isReplayDeterministic(resultA, resultB)).toBe(true);
    expect(resultA.diagnosticOnly).toBe(true);
    expect(resultA.simulationResults.filter((r) => r.matched).length).toBeGreaterThan(0);
  });

  it('blocks unsupported simulations in strict mode', async () => {
    const snapshot = await buildDemoSnapshot();
    const result = await replayEngine.replay(snapshot, { snapshotId: snapshot.snapshotId, strictMode: true });
    const blocked = result.simulationResults.find((r) => !r.matched);
    expect(blocked).toBeDefined();
  });
});

describe('ledgerSnapshots diff', () => {
  it('detects no diffs for identical snapshots', async () => {
    const snapshot = await buildDemoSnapshot();
    const diffs = diffSnapshots(snapshot, snapshot);
    expect(diffs).toHaveLength(0);
  });
});

describe('ledgerSnapshots repository', () => {
  it('stores and compares snapshots in memory', async () => {
    const repo = new InMemorySnapshotRepository();
    const snapshot = await buildDemoSnapshot();
    const record = {
      id: snapshot.snapshotId,
      snapshot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sizeBytes: 1000,
      tags: snapshot.tags,
      label: snapshot.label,
      pinned: false,
      replayCount: 0,
    };
    await repo.put(record);
    const loaded = await repo.get(snapshot.snapshotId);
    expect(loaded?.label).toBe(snapshot.label);
    const comparison = await repo.compare(snapshot.snapshotId, snapshot.snapshotId);
    expect(comparison?.changedEntries).toHaveLength(0);
  });
});

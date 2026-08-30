import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetConnectionForTests,
  createEmptyBaseline,
  deleteBaseline,
  getBaseline,
  listBaselines,
  listBudgets,
  migrateBaseline,
  saveBaseline,
  saveBudget,
} from './baselineStore';
import { createDefaultBudget } from './budgetEngine';
import { createSampleBaseline } from './sampleFixtures';
import { RESOURCE_PROFILING_SCHEMA_VERSION } from '../../types/resourceProfiling';

beforeEach(async () => {
  __resetConnectionForTests();
  indexedDB = new IDBFactory();
});

describe('baseline CRUD', () => {
  it('round-trips a created baseline through save/get/list/delete', async () => {
    const baseline = createEmptyBaseline('My baseline', 'desc');
    await saveBaseline(baseline);

    const fetched = await getBaseline(baseline.id);
    expect(fetched?.name).toBe('My baseline');

    const list = await listBaselines();
    expect(list.map((b) => b.id)).toContain(baseline.id);

    await deleteBaseline(baseline.id);
    expect(await getBaseline(baseline.id)).toBeNull();
  });

  it('rejects saving a structurally invalid baseline', async () => {
    const baseline = createEmptyBaseline('');
    await expect(saveBaseline(baseline)).rejects.toThrow();
  });

  it('handles a baseline with a large sample history without error', async () => {
    const baseline = createSampleBaseline();
    const manySamples = Array.from({ length: 500 }, (_unused, index) => ({
      ...baseline.profiles[0],
      id: `${baseline.profiles[0].id}-${index}`,
    }));
    const large = { ...createEmptyBaseline('Large baseline'), profiles: manySamples };
    await saveBaseline(large);
    const fetched = await getBaseline(large.id);
    expect(fetched?.profiles).toHaveLength(500);
  });
});

describe('migrateBaseline', () => {
  it('upgrades a version-1 document (notes field, no tags) to the current schema', () => {
    const legacy = {
      id: 'legacy-1',
      name: 'Legacy baseline',
      notes: 'old free-text notes field',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      profiles: [],
    };
    const migrated = migrateBaseline(legacy);
    expect(migrated.schemaVersion).toBe(RESOURCE_PROFILING_SCHEMA_VERSION);
    expect(migrated.description).toBe('old free-text notes field');
    expect(migrated.tags).toEqual([]);
  });

  it('rejects a document from a future, unsupported schema version', () => {
    const future = { ...createSampleBaseline(), schemaVersion: RESOURCE_PROFILING_SCHEMA_VERSION + 5 };
    expect(() => migrateBaseline(future)).toThrow(/newer than this build supports/);
  });

  it('rejects a non-object document', () => {
    expect(() => migrateBaseline(null)).toThrow();
    expect(() => migrateBaseline('a string')).toThrow();
  });

  it('backfills a missing id rather than throwing', () => {
    const migrated = migrateBaseline({ name: 'No id', profiles: [] });
    expect(migrated.id).toBeTruthy();
  });
});

describe('budgets', () => {
  it('seeds one default budget on first read', async () => {
    const budgets = await listBudgets();
    expect(budgets).toHaveLength(1);
    expect(budgets[0].thresholds.length).toBeGreaterThan(0);
  });

  it('persists a saved budget across reads', async () => {
    const budget = { ...createDefaultBudget('Strict'), id: 'strict-budget' };
    await saveBudget(budget);
    const budgets = await listBudgets();
    expect(budgets.some((b) => b.id === 'strict-budget')).toBe(true);
  });
});

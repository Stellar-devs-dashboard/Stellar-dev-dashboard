import { beforeEach, describe, expect, it } from 'vitest';
import type { DiagnosticBundle } from '../../../types/diagnostics';
import { buildDiagnosticBundle } from '../bundle';
import { BrowserDiagnosticRepository } from '../persistence';

const NOW = new Date('2026-08-28T12:00:00.000Z');

async function makeBundle(id: string, createdAt = NOW): Promise<DiagnosticBundle> {
  return (
    await buildDiagnosticBundle({
      id,
      now: createdAt,
      events: [],
      breadcrumbs: [],
      expiresInDays: 7,
    })
  ).bundle;
}

describe('BrowserDiagnosticRepository', () => {
  beforeEach(() => localStorage.clear());

  it('persists at most five bundles, deduplicates IDs, and removes records', async () => {
    const repository = new BrowserDiagnosticRepository(localStorage, () => NOW);
    for (let index = 0; index < 7; index += 1) {
      repository.save(await makeBundle(`bundle-${index}`, new Date(NOW.getTime() + index * 1_000)));
    }
    repository.save(await makeBundle('bundle-6', new Date(NOW.getTime() + 20_000)));
    const restored = new BrowserDiagnosticRepository(localStorage, () => NOW).load();

    expect(restored.persistence).toBe('durable');
    expect(restored.bundles).toHaveLength(5);
    expect(restored.bundles.filter((bundle) => bundle.id === 'bundle-6')).toHaveLength(1);
    expect(repository.remove('bundle-6').bundles.some((bundle) => bundle.id === 'bundle-6')).toBe(
      false
    );
  });

  it('cleans up expired bundles without touching unrelated application storage', async () => {
    localStorage.setItem('unrelated-setting', 'keep');
    const repository = new BrowserDiagnosticRepository(localStorage, () => NOW);
    repository.save(await makeBundle('expiring'));
    const state = repository.cleanup(new Date('2026-09-20T00:00:00.000Z'));

    expect(state.bundles).toEqual([]);
    expect(localStorage.getItem('unrelated-setting')).toBe('keep');
  });

  it('degrades to bounded in-memory storage when private-mode storage throws', async () => {
    const failingStorage = {
      get length() {
        return 0;
      },
      clear() {
        throw new DOMException('blocked', 'SecurityError');
      },
      getItem() {
        throw new DOMException('blocked', 'SecurityError');
      },
      key() {
        return null;
      },
      removeItem() {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem() {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    } satisfies Storage;
    const repository = new BrowserDiagnosticRepository(failingStorage, () => NOW);
    expect(repository.load()).toMatchObject({ persistence: 'memory-only' });
    const saved = repository.save(await makeBundle('memory-bundle'));

    expect(saved.persistence).toBe('memory-only');
    expect(saved.warning).toMatch(/remain|memory/i);
    expect(saved.bundles.map((bundle) => bundle.id)).toEqual(['memory-bundle']);
  });

  it('clears malformed and forward-versioned envelopes instead of trusting them', () => {
    localStorage.setItem(
      'stellar:diagnostics:bundles:v1',
      JSON.stringify({ schemaVersion: 999, bundles: [] })
    );
    const repository = new BrowserDiagnosticRepository(localStorage, () => NOW);
    const state = repository.load();

    expect(state.bundles).toEqual([]);
    expect(state.warning).toMatch(/newer/i);
    expect(localStorage.getItem('stellar:diagnostics:bundles:v1')).toBeNull();
  });

  it('rejects superficially shaped bundles that still contain sensitive values', async () => {
    const repository = new BrowserDiagnosticRepository(localStorage, () => NOW);
    const unsafe = await makeBundle('unsafe-storage');
    unsafe.content.events.push({
      schemaVersion: 1,
      id: 'event-unsafe',
      sequence: 1,
      timestamp: NOW.toISOString(),
      category: 'signing',
      severity: 'error',
      name: 'signing.failed',
      message: `Seed S${'Q'.repeat(55)}`,
      outcome: 'failure',
      details: {},
      source: 'import',
      redactionCount: 0,
      truncated: false,
    });

    expect(() => repository.save(unsafe)).toThrow(/redaction-safe/i);
    expect(localStorage.getItem('stellar:diagnostics:bundles:v1')).toBeNull();
  });
});

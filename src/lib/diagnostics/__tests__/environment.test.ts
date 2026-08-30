import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectEnvironmentSnapshot,
  collectFeatureFlags,
  collectServiceWorkerState,
} from '../environment';

const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');
const cachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');

afterEach(() => {
  if (serviceWorkerDescriptor)
    Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
  if (storageDescriptor) Object.defineProperty(navigator, 'storage', storageDescriptor);
  else Reflect.deleteProperty(navigator, 'storage');
  if (cachesDescriptor) Object.defineProperty(globalThis, 'caches', cachesDescriptor);
  else Reflect.deleteProperty(globalThis, 'caches');
});

describe('coarse diagnostic environment metadata', () => {
  it('buckets storage capacity and omits raw browser/device values', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn().mockResolvedValue({
          usage: 5 * 1024 * 1024,
          quota: 2 * 1024 * 1024 * 1024,
        }),
      },
    });

    const snapshot = await collectEnvironmentSnapshot(new Date('2026-08-28T12:00:00.000Z'));

    expect(snapshot.storageEstimate).toEqual({
      usageBucket: '1–10MiB',
      quotaBucket: '>=1GiB',
    });
    expect(snapshot.capturedAt).toBe('2026-08-28T12:00:00.000Z');
    expect(snapshot.viewport.width).toBeGreaterThanOrEqual(0);
    expect(snapshot).not.toHaveProperty('userAgent');
    expect(snapshot).not.toHaveProperty('deviceMemory');
    expect(snapshot).not.toHaveProperty('ip');
  });

  it('sorts, validates, and bounds feature flag metadata', () => {
    const flags = Object.fromEntries([
      ['zeta', true],
      ['alpha', false],
      ['invalid flag name', true],
      ...Array.from({ length: 110 }, (_, index) => [
        `flag-${String(index).padStart(3, '0')}`,
        true,
      ]),
    ]);
    const snapshot = collectFeatureFlags(flags);

    expect(snapshot).toHaveLength(100);
    expect(snapshot[0].id).toBe('alpha');
    expect(snapshot.some((flag) => flag.id === 'invalid flag name')).toBe(false);
    expect(snapshot.every((flag) => flag.source === 'runtime')).toBe(true);
  });

  it('reports an explicit unsupported service-worker state', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    const snapshot = await collectServiceWorkerState(new Date('2026-08-28T12:00:00.000Z'));

    expect(snapshot).toEqual({
      supported: false,
      controlled: false,
      registrationState: 'none',
      scope: 'none',
      cacheNames: [],
      checkedAt: '2026-08-28T12:00:00.000Z',
    });
  });

  it('classifies scope and normalizes cache names without exposing their values', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: { state: 'activated' },
        getRegistration: vi.fn().mockResolvedValue({
          scope: 'https://unrelated.example/private-scope/',
          active: { state: 'activated' },
          waiting: null,
          installing: null,
        }),
      },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['tenant-secret-cache', 'stellar-static-v4']),
      },
    });

    const snapshot = await collectServiceWorkerState(new Date('2026-08-28T12:00:00.000Z'));

    expect(snapshot.supported).toBe(true);
    expect(snapshot.controlled).toBe(true);
    expect(snapshot.registrationState).toBe('active');
    expect(snapshot.scope).toBe('unexpected');
    expect(snapshot.cacheNames).toEqual(['cache-1', 'cache-2']);
    expect(JSON.stringify(snapshot)).not.toContain('tenant-secret-cache');
    expect(JSON.stringify(snapshot)).not.toContain('stellar-static-v4');
  });
});

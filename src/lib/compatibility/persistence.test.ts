import { beforeEach, describe, expect, it } from 'vitest';
import { COMPATIBILITY_SCHEMA_VERSION, type MaintainerOverride } from '../../types/compatibility';
import { makeCompatibilityProbe } from '../../../tests/fixtures/compatibility';
import {
  loadOverrides,
  loadProbe,
  parseCompatibilityExport,
  probeCacheKey,
  saveOverrides,
  saveProbe,
} from './persistence';
import { createCompatibilityExport } from './export';
import { assessCompatibility } from './assessment';

describe('compatibility persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a redacted probe without request headers or URL credentials', () => {
    const probe = makeCompatibilityProbe({
      target: {
        ...makeCompatibilityProbe().target,
        rpcUrl: 'https://user:pass@rpc.fixture/path?api_key=sensitive#fragment',
      },
      warnings: ['Bearer very-sensitive-token'],
    });
    saveProbe(probe);
    const raw = localStorage.getItem(probeCacheKey(probe.target.id)) ?? '';
    expect(raw).not.toContain('very-sensitive-token');
    expect(raw).not.toContain('api_key');
    expect(raw).not.toContain('user:pass');
    const loaded = loadProbe(probe.target.id);
    expect(loaded?.target.rpcUrl).toBe('https://rpc.fixture/path');
  });

  it('drops malformed, obsolete, and forward-version cache entries', () => {
    localStorage.setItem(probeCacheKey('broken'), '{');
    expect(loadProbe('broken')).toBeNull();
    localStorage.setItem(probeCacheKey('future'), JSON.stringify({ schemaVersion: 99, probe: {} }));
    expect(loadProbe('future')).toBeNull();
  });

  it('validates and expires maintainer overrides', () => {
    const valid: MaintainerOverride = {
      id: 'override-1',
      schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
      targetId: 'network:testnet',
      featureId: '*',
      forcedStatus: 'degraded',
      reason: 'Fixture evidence supports vendor-specific behavior.',
      createdAt: '2026-08-28T10:00:00.000Z',
      expiresAt: '2026-08-29T10:00:00.000Z',
      author: 'Maintainer',
    };
    saveOverrides([valid, { ...valid, id: 'expired', expiresAt: '2026-08-01T00:00:00.000Z' }]);
    expect(loadOverrides(undefined, new Date('2026-08-28T12:00:00.000Z'))).toEqual([valid]);
  });

  it('parses only redacted, supported compatibility exports', () => {
    const assessment = assessCompatibility(makeCompatibilityProbe(), {
      now: new Date('2026-08-28T12:01:00.000Z'),
    });
    const document = createCompatibilityExport(
      assessment,
      null,
      null,
      new Date('2026-08-28T12:02:00.000Z')
    );
    expect(parseCompatibilityExport(JSON.stringify(document)).redacted).toBe(true);
    expect(() =>
      parseCompatibilityExport(JSON.stringify({ ...document, schemaVersion: 2 }))
    ).toThrow(/newer/i);
    expect(() =>
      parseCompatibilityExport(JSON.stringify({ ...document, redacted: false }))
    ).toThrow(/invalid/i);
  });
});

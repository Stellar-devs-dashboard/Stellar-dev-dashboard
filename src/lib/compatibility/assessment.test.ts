import { describe, expect, it } from 'vitest';
import { COMPATIBILITY_SCHEMA_VERSION, type MaintainerOverride } from '../../types/compatibility';
import { makeCompatibilityProbe } from '../../../tests/fixtures/compatibility';
import { assessCompatibility, compareEndpoints } from './assessment';

const NOW = new Date('2026-08-28T12:01:00.000Z');

describe('compatibility assessment', () => {
  it('enables reviewed protocol features when evidence is satisfied', () => {
    const assessment = assessCompatibility(makeCompatibilityProbe(), { now: NOW });
    expect(assessment.status).toBe('compatible');
    expect(assessment.features.every((feature) => feature.enabled)).toBe(true);
    expect(assessment.freshness.stale).toBe(false);
  });

  it('hard-gates a known protocol newer than the installed SDK', () => {
    const assessment = assessCompatibility(makeCompatibilityProbe({ protocolVersion: 23 }), {
      now: NOW,
    });
    expect(assessment.status).toBe('incompatible');
    expect(assessment.summary).toMatch(/older than reviewed/i);
    expect(assessment.features.every((feature) => !feature.enabled)).toBe(true);
  });

  it('never treats an unknown future protocol as automatically compatible', () => {
    const assessment = assessCompatibility(makeCompatibilityProbe({ protocolVersion: 99 }), {
      now: NOW,
    });
    expect(assessment.status).toBe('incompatible');
    expect(assessment.matrixRelease).toBeNull();
    expect(assessment.summary).toContain('not represented');
  });

  it('distinguishes hard missing methods from optional degraded modes', () => {
    const hard = assessCompatibility(
      makeCompatibilityProbe({ unsupportedMethods: ['simulateTransaction'] }),
      { now: NOW }
    );
    expect(hard.features.find((item) => item.feature.id === 'contract-simulation')?.status).toBe(
      'incompatible'
    );
    const degraded = assessCompatibility(
      makeCompatibilityProbe({ unsupportedMethods: ['getFeeStats'] }),
      { now: NOW }
    );
    expect(degraded.features.find((item) => item.feature.id === 'fee-estimation')?.status).toBe(
      'degraded'
    );
  });

  it('marks unknown method evidence and expired probes conservatively', () => {
    const unknown = assessCompatibility(
      makeCompatibilityProbe({ unknownMethods: ['getNetwork'] }),
      { now: NOW }
    );
    expect(unknown.features.find((item) => item.feature.id === 'network-overview')?.status).toBe(
      'unknown'
    );
    const expired = assessCompatibility(
      makeCompatibilityProbe({ expiresAt: '2026-08-28T12:00:30.000Z' }),
      { now: NOW }
    );
    expect(expired.status).toBe('unknown');
    expect(expired.freshness.stale).toBe(true);
  });

  it('surfaces contradictory protocol evidence above feature state', () => {
    const probe = makeCompatibilityProbe();
    probe.evidence.push({
      id: 'fixture:contradiction',
      source: 'horizon-ledger',
      field: 'protocolVersion',
      value: 22,
      observedAt: probe.completedAt,
      endpoint: probe.target.horizonUrl,
      confidence: 'direct',
    });
    expect(assessCompatibility(probe, { now: NOW }).status).toBe('contradictory');
  });

  it('applies only active, attributed overrides and records evidence', () => {
    const override: MaintainerOverride = {
      id: 'override-1',
      schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
      targetId: 'network:testnet',
      featureId: 'contract-simulation',
      forcedStatus: 'degraded',
      reason: 'Vendor fixture confirms the alternate simulation response shape.',
      createdAt: '2026-08-28T11:00:00.000Z',
      expiresAt: '2026-08-29T11:00:00.000Z',
      author: 'Maintainer',
    };
    const assessment = assessCompatibility(
      makeCompatibilityProbe({ unsupportedMethods: ['simulateTransaction'] }),
      { now: NOW, overrides: [override] }
    );
    const feature = assessment.features.find((item) => item.feature.id === 'contract-simulation');
    expect(feature?.status).toBe('degraded');
    expect(feature?.enabled).toBe(true);
    expect(feature?.evidence.some((item) => item.source === 'maintainer-override')).toBe(true);
  });
});

describe('endpoint comparison', () => {
  it('detects passphrase, protocol, ledger, retention, and method contradictions', () => {
    const primary = makeCompatibilityProbe();
    const secondary = makeCompatibilityProbe({
      target: { ...primary.target, id: 'secondary', label: 'Secondary' },
      protocolVersion: 22,
      latestLedger: 900,
      identity: { ...primary.identity, passphrase: 'Another network' },
      retention: { ...primary.retention, oldestLedger: 700 },
      unsupportedMethods: ['getEvents'],
    });
    const result = compareEndpoints([primary, secondary], NOW);
    expect(result.status).toBe('contradictory');
    expect(result.differences.map((item) => item.field)).toEqual(
      expect.arrayContaining([
        'Network passphrase',
        'Protocol version',
        'Latest ledger',
        'RPC method: getEvents',
      ])
    );
  });

  it('returns unknown rather than success for a single endpoint', () => {
    expect(compareEndpoints([makeCompatibilityProbe()], NOW).status).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';
import { makeAuditArtifacts, makeCompatibilityProbe } from '../../../tests/fixtures/compatibility';
import { assessCompatibility } from './assessment';
import { parseAuditInventory, runUpgradeReadinessAudit } from './audit';

const NOW = new Date('2026-08-28T12:01:00.000Z');

describe('upgrade-readiness audit', () => {
  const assessment = assessCompatibility(makeCompatibilityProbe(), { now: NOW });

  it('audits every supported artifact category with deterministic evidence', () => {
    const audit = runUpgradeReadinessAudit(makeAuditArtifacts(), 21, assessment, NOW);
    expect(audit.status).toBe('ready');
    expect(audit.counts.pass).toBe(6);
    expect(new Set(audit.findings.map((finding) => finding.kind))).toEqual(
      new Set([
        'saved-envelope',
        'snapshot',
        'contract-artifact',
        'plugin',
        'custom-network',
        'cached-data',
      ])
    );
    expect(audit.evidence.some((item) => item.field === 'audit.targetProtocol')).toBe(true);
  });

  it('blocks an unreviewed future protocol before individual artifacts', () => {
    const audit = runUpgradeReadinessAudit([], 999, assessment, NOW);
    expect(audit.status).toBe('blocked');
    expect(audit.findings[0].title).toMatch(/not reviewed/i);
  });

  it('requires an upgraded SDK for reviewed but newer XDR', () => {
    const audit = runUpgradeReadinessAudit([], 23, assessment, NOW);
    expect(audit.status).toBe('blocked');
    expect(audit.findings[0].artifactId).toBe('installed-sdk');
  });

  it('flags malformed provenance and protocol-sensitive envelopes', () => {
    const artifacts = makeAuditArtifacts();
    artifacts[0] = { ...artifacts[0], protocolVersion: 20, xdrType: 'SorobanTransactionEnvelope' };
    artifacts[2] = { ...artifacts[2], payload: { wasmHash: null } };
    artifacts[3] = { ...artifacts[3], payload: { minimumProtocol: 22, maximumProtocol: 23 } };
    const audit = runUpgradeReadinessAudit(artifacts, 21, assessment, NOW);
    expect(audit.counts.fail).toBeGreaterThanOrEqual(2);
    expect(audit.counts.unknown).toBeGreaterThanOrEqual(1);
  });
});

describe('audit inventory import', () => {
  it('accepts the versioned bounded contract', () => {
    const document = parseAuditInventory(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'upgrade-audit-inventory',
        exportedAt: NOW.toISOString(),
        artifacts: makeAuditArtifacts(),
      })
    );
    expect(document.artifacts).toHaveLength(6);
  });

  it.each([
    ['malformed JSON', '{'],
    ['wrong kind', JSON.stringify({ schemaVersion: 1, kind: 'other', artifacts: [] })],
    [
      'future schema',
      JSON.stringify({ schemaVersion: 2, kind: 'upgrade-audit-inventory', artifacts: [] }),
    ],
    [
      'bad artifact',
      JSON.stringify({
        schemaVersion: 1,
        kind: 'upgrade-audit-inventory',
        artifacts: [{ id: 'x' }],
      }),
    ],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseAuditInventory(raw)).toThrow();
  });
});

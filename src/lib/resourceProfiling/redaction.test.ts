import { describe, expect, it } from 'vitest';
import { redactBaseline, redactInputsSummary, redactProvenance, redactResourceProfile } from './redaction';
import { createSampleBaseline } from './sampleFixtures';

describe('redactInputsSummary', () => {
  it('redacts G/C/S-prefixed strkeys embedded in free text', () => {
    const publicKey = `G${'A'.repeat(55)}`;
    const contractId = `C${'B'.repeat(55)}`;
    const secret = `S${'C'.repeat(55)}`;
    const summary = redactInputsSummary(`transfer(${publicKey}, ${contractId}, ${secret})`);
    expect(summary).not.toContain(publicKey);
    expect(summary).not.toContain(contractId);
    expect(summary).not.toContain(secret);
    expect(summary).toContain('[redacted]');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactInputsSummary('transfer(int:100)')).toBe('transfer(int:100)');
  });

  it('handles an empty string without throwing', () => {
    expect(redactInputsSummary('')).toBe('');
  });
});

describe('redactProvenance', () => {
  it('shortens the contract id to a non-reversible prefix/suffix', () => {
    const profile = createSampleBaseline().profiles[0];
    const redacted = redactProvenance(profile.provenance);
    expect(redacted.contractId).not.toBe(profile.provenance.contractId);
    expect(redacted.contractId).toMatch(/^.{4}….{4}$/);
  });

  it('leaves a null contractId as null', () => {
    const profile = createSampleBaseline().profiles[0];
    const redacted = redactProvenance({ ...profile.provenance, contractId: null });
    expect(redacted.contractId).toBeNull();
  });
});

describe('redactResourceProfile / redactBaseline', () => {
  it('redacts every footprint entry XDR', () => {
    const profile = createSampleBaseline().profiles[0];
    const redacted = redactResourceProfile(profile);
    expect(redacted.footprint.every((entry) => entry.xdr === '[redacted]')).toBe(true);
  });

  it('redacts every profile inside a baseline', () => {
    const baseline = createSampleBaseline();
    const redacted = redactBaseline(baseline);
    expect(redacted.profiles).toHaveLength(baseline.profiles.length);
    for (const profile of redacted.profiles) {
      expect(profile.footprint.every((entry) => entry.xdr === '[redacted]')).toBe(true);
    }
  });
});

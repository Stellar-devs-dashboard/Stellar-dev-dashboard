import { describe, expect, it } from 'vitest';
import {
  COMPATIBILITY_MATRIX,
  INSTALLED_SDK_PROFILE,
  compareSemver,
  getMatrixRelease,
  isVersionInRange,
  validateMatrix,
} from './matrix';

describe('compatibility matrix', () => {
  it('is internally consistent and versioned', () => {
    expect(validateMatrix(COMPATIBILITY_MATRIX)).toEqual([]);
    expect(COMPATIBILITY_MATRIX.matrixVersion).toMatch(/^2026\.08\./);
    expect(COMPATIBILITY_MATRIX.releases.map((release) => release.protocol)).toEqual([
      20, 21, 22, 23, 24, 25, 26, 27,
    ]);
  });

  it('maps SDK, XDR, RPC, and feature requirements for every release', () => {
    for (const release of COMPATIBILITY_MATRIX.releases) {
      expect(release.sdk.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(release.xdr.label).toBe(`Stellar XDR v${release.protocol}`);
      expect(release.rpc.required).toContain('getNetwork');
      expect(release.dashboardFeatures).toContain('upgrade-readiness');
    }
    expect(getMatrixRelease(23)?.changed.join(' ')).toMatch(/Unified events/i);
    expect(getMatrixRelease(999)).toBeNull();
  });

  it('represents installed capability independently from newer matrix entries', () => {
    expect(INSTALLED_SDK_PROFILE.version).toBe('12.3.0');
    expect(isVersionInRange(21, INSTALLED_SDK_PROFILE.xdrRange)).toBe(true);
    expect(isVersionInRange(22, INSTALLED_SDK_PROFILE.xdrRange)).toBe(false);
    expect(compareSemver('12.3.0', '12.1.0')).toBeGreaterThan(0);
    expect(compareSemver('12.3.0', '13.1.0')).toBeLessThan(0);
    expect(compareSemver('v12.3.0', '12.3.0')).toBe(0);
  });
});

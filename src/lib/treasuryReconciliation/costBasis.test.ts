import { describe, expect, it } from 'vitest';
import { findEffectiveCostBasis, validateCostBasisEntry, valueAmount } from './costBasis';
import type { CostBasisEntry } from '../../types/treasury';

const entries: CostBasisEntry[] = [
  { id: '1', assetCode: 'USDC', effectiveDate: '2024-01-01', pricePerUnit: '1.00', currency: 'USD', source: 'exchange' },
  { id: '2', assetCode: 'USDC', effectiveDate: '2024-02-01', pricePerUnit: '1.02', currency: 'USD', source: 'exchange' },
];

describe('validateCostBasisEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(validateCostBasisEntry(entries[0])).toHaveLength(0);
  });

  it('rejects a malformed date', () => {
    const errors = validateCostBasisEntry({ ...entries[0], effectiveDate: '01-01-2024' });
    expect(errors.some((e) => e.includes('ISO date'))).toBe(true);
  });

  it('rejects a negative price', () => {
    const errors = validateCostBasisEntry({ ...entries[0], pricePerUnit: '-1' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-numeric price', () => {
    const errors = validateCostBasisEntry({ ...entries[0], pricePerUnit: 'free' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a missing asset code', () => {
    const errors = validateCostBasisEntry({ ...entries[0], assetCode: '' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('findEffectiveCostBasis', () => {
  it('picks the most recent entry on or before the given date', () => {
    const found = findEffectiveCostBasis(entries, 'USDC', '2024-02-15');
    expect(found?.id).toBe('2');
  });

  it('falls back to an earlier entry when the date is before the newest one', () => {
    const found = findEffectiveCostBasis(entries, 'USDC', '2024-01-15');
    expect(found?.id).toBe('1');
  });

  it('returns undefined when no entry exists for that date (missing price)', () => {
    const found = findEffectiveCostBasis(entries, 'USDC', '2023-12-31');
    expect(found).toBeUndefined();
  });

  it('returns undefined for an asset with no entries at all', () => {
    expect(findEffectiveCostBasis(entries, 'XLM', '2024-06-01')).toBeUndefined();
  });
});

describe('valueAmount', () => {
  it('computes value using the effective price', () => {
    const result = valueAmount(entries, 'USDC', '100', '2024-02-15');
    expect(result.missingPrice).toBe(false);
    expect(result.value).toBe('102.00');
    expect(result.currency).toBe('USD');
  });

  it('reports missingPrice: true rather than defaulting to zero when no price exists', () => {
    const result = valueAmount(entries, 'USDC', '100', '2023-01-01');
    expect(result.missingPrice).toBe(true);
    expect(result.value).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  absDiff,
  addAmounts,
  formatAmount,
  isWithinRoundingTolerance,
  parseAmount,
  ROUNDING_TOLERANCE_MICRO_UNITS,
  sumAmountStrings,
} from './decimal';

describe('parseAmount / formatAmount round-trip', () => {
  it('round-trips whole numbers', () => {
    expect(formatAmount(parseAmount('100'))).toBe('100');
  });

  it('round-trips 7-decimal precision without floating-point drift', () => {
    expect(formatAmount(parseAmount('10.0000001'))).toBe('10.0000001');
  });

  it('round-trips negative amounts', () => {
    expect(formatAmount(parseAmount('-42.5'))).toBe('-42.5');
  });

  it('trims trailing zero fractional digits', () => {
    expect(formatAmount(parseAmount('5.1000000'))).toBe('5.1');
  });

  it('treats -0 as 0 without a leading minus sign', () => {
    expect(formatAmount(parseAmount('-0'))).toBe('0');
    expect(formatAmount(parseAmount('0.0000000'))).toBe('0');
  });

  it('rejects amounts with more than 7 decimal places', () => {
    expect(() => parseAmount('1.12345678')).toThrow();
  });

  it('rejects non-numeric input', () => {
    expect(() => parseAmount('not-a-number')).toThrow();
  });
});

describe('addAmounts / sumAmountStrings', () => {
  it('sums many tiny amounts without losing precision (the classic float bug)', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754 float; must be exact here.
    const sum = addAmounts(parseAmount('0.1'), parseAmount('0.2'));
    expect(formatAmount(sum)).toBe('0.3');
  });

  it('sums a large batch of stroop-level amounts exactly', () => {
    const amounts = Array.from({ length: 10_000 }, () => '0.0000001');
    const total = sumAmountStrings(amounts);
    expect(formatAmount(total)).toBe('0.001'); // 10,000 * 1 stroop = 1000 stroops = 0.001
  });

  it('mixes positive and negative amounts correctly', () => {
    const total = sumAmountStrings(['100', '-30.5', '-19.5']);
    expect(formatAmount(total)).toBe('50');
  });
});

describe('rounding tolerance', () => {
  it('treats a 1-stroop delta as within tolerance', () => {
    expect(isWithinRoundingTolerance(ROUNDING_TOLERANCE_MICRO_UNITS)).toBe(true);
    expect(isWithinRoundingTolerance(-ROUNDING_TOLERANCE_MICRO_UNITS)).toBe(true);
  });

  it('treats a 2-stroop delta as outside tolerance', () => {
    expect(isWithinRoundingTolerance(2n)).toBe(false);
  });

  it('absDiff is always non-negative regardless of argument order', () => {
    expect(absDiff(5n, 10n)).toBe(5n);
    expect(absDiff(10n, 5n)).toBe(5n);
  });
});

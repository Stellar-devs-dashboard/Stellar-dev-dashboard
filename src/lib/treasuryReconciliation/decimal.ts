/**
 * Fixed-point decimal arithmetic for Stellar amounts.
 *
 * Stellar amounts are decimal strings with up to 7 fractional digits
 * ("stroop" precision, e.g. "10.0000000"). Doing reconciliation math in
 * floating point silently loses/gains fractions of a stroop across
 * thousands of postings, which is exactly the kind of rounding bug the
 * feature is required to be tested against. Every amount is instead
 * represented internally as a bigint count of "micro-units" (value * 1e7),
 * and only formatted back to a decimal string at the UI/export boundary.
 */

export const SCALE = 10_000_000n; // 7 decimal places, matching Stellar's amount precision

/** Parses a Stellar-style decimal amount string into scaled micro-units. */
export function parseAmount(value: string | number): bigint {
  const str = typeof value === 'number' ? value.toString() : value.trim();
  if (str === '' || str === '-' || Number.isNaN(Number(str))) {
    throw new Error(`Invalid amount: "${value}"`);
  }
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [wholePart, fractionPart = ''] = unsigned.split('.');
  if (fractionPart.length > 7) {
    throw new Error(`Amount "${value}" exceeds 7 decimal places of precision`);
  }
  const paddedFraction = fractionPart.padEnd(7, '0');
  const whole = BigInt(wholePart || '0');
  const fraction = BigInt(paddedFraction || '0');
  const micro = whole * SCALE + fraction;
  return negative ? -micro : micro;
}

/** Formats scaled micro-units back into a Stellar-style decimal string. */
export function formatAmount(microUnits: bigint): string {
  const negative = microUnits < 0n;
  const abs = negative ? -microUnits : microUnits;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(7, '0');
  const trimmedFraction = fraction.replace(/0+$/, '');
  const body = trimmedFraction ? `${whole}.${trimmedFraction}` : `${whole}`;
  return negative && abs !== 0n ? `-${body}` : body;
}

export function addAmounts(...values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

export function sumAmountStrings(values: string[]): bigint {
  return values.reduce((sum, value) => sum + parseAmount(value), 0n);
}

/** Absolute difference between two scaled amounts, always non-negative. */
export function absDiff(a: bigint, b: bigint): bigint {
  const diff = a - b;
  return diff < 0n ? -diff : diff;
}

/**
 * Tolerance for treating a small residual delta as "rounding noise" rather
 * than a genuine discrepancy: 1 stroop (the smallest representable unit).
 */
export const ROUNDING_TOLERANCE_MICRO_UNITS = 1n;

export function isWithinRoundingTolerance(delta: bigint): boolean {
  return absDiff(delta, 0n) <= ROUNDING_TOLERANCE_MICRO_UNITS;
}

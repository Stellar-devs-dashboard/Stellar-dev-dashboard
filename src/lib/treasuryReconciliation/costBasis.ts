/**
 * Cost-basis inputs are user-supplied reference prices, never fetched or
 * predicted automatically — this module only stores and looks them up. It
 * deliberately does not compute realized/unrealized gain, tax lots, or any
 * accounting treatment: the dashboard surfaces operational valuations only
 * ("this posting was worth about $X on this date, per the price you
 * entered"), not tax or accounting advice.
 */

import type { CostBasisEntry } from '../../types/treasury';

export function validateCostBasisEntry(entry: Omit<CostBasisEntry, 'id'>): string[] {
  const errors: string[] = [];
  if (!entry.assetCode.trim()) errors.push('Asset code is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.effectiveDate)) errors.push('Effective date must be an ISO date (yyyy-mm-dd).');
  const price = Number(entry.pricePerUnit);
  if (!Number.isFinite(price) || price < 0) errors.push('Price per unit must be a non-negative number.');
  if (!entry.currency.trim()) errors.push('Currency is required.');
  if (!entry.source.trim()) errors.push('Source is required (who/what supplied this price).');
  return errors;
}

/**
 * Finds the entry effective on `date` for `assetCode`: the most recent
 * entry whose `effectiveDate` is on or before `date`. Returns undefined
 * when no price has been entered yet for that date — callers must treat
 * that as "missing price", not fall back to zero.
 */
export function findEffectiveCostBasis(
  entries: CostBasisEntry[],
  assetCode: string,
  date: string
): CostBasisEntry | undefined {
  const candidates = entries
    .filter((entry) => entry.assetCode === assetCode && entry.effectiveDate <= date)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
  return candidates[0];
}

export interface ValuedAmount {
  assetCode: string;
  amount: string;
  valuedAt?: string;
  currency?: string;
  value?: string;
  priceSource?: string;
  missingPrice: boolean;
}

/** Multiplies a posting amount by its effective cost-basis price, if one exists. */
export function valueAmount(entries: CostBasisEntry[], assetCode: string, amount: string, date: string): ValuedAmount {
  const basis = findEffectiveCostBasis(entries, assetCode, date);
  if (!basis) {
    return { assetCode, amount, missingPrice: true };
  }
  const value = (Number(amount) * Number(basis.pricePerUnit)).toFixed(2);
  return {
    assetCode,
    amount,
    valuedAt: basis.effectiveDate,
    currency: basis.currency,
    value,
    priceSource: basis.source,
    missingPrice: false,
  };
}

import { compareAmounts, parseAmountToStroops, stroopsToAmount, subtractAmounts } from './amount'
import type { CostBasisEntry, DisposalLot, LedgerPosting, RealizedGainLoss } from '../../types/treasury'

/**
 * Finds the cost-basis entry effective at or before `at`, i.e. the most
 * recent entry that isn't in the future relative to the disposal. Entries
 * are user-provided (imported prices or manual input) — this module never
 * fetches or predicts a price, so a disposal with no covering entry is
 * reported as missing rather than estimated.
 */
export function lookupCostBasis(asset: string, at: string, entries: CostBasisEntry[]): CostBasisEntry | null {
  const candidates = entries.filter((entry) => entry.asset === asset && entry.effectiveAt <= at).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))
  return candidates[0] || null
}

export function validateCostBasisEntry(entry: Pick<CostBasisEntry, 'asset' | 'unitPrice' | 'currency' | 'effectiveAt'>): string[] {
  const issues: string[] = []
  if (!entry.asset.trim()) issues.push('Asset is required.')
  if (!entry.currency.trim() || entry.currency.length > 10) issues.push('Currency must be a short code (e.g. USD).')
  if (Number.isNaN(Date.parse(entry.effectiveAt))) issues.push('effectiveAt must be a valid ISO-8601 timestamp.')
  try {
    if (compareAmounts(entry.unitPrice, '0') <= 0) issues.push('unitPrice must be greater than zero.')
  } catch {
    issues.push('unitPrice must be a valid decimal amount.')
  }
  return issues
}

/**
 * FIFO cost-basis matching: acquisitions (positive/credit postings) build a
 * queue of lots; disposals (negative/debit postings) consume the oldest
 * lots first. This is the most common, most auditable convention for
 * ledger-derived cost basis and avoids needing a user-selected accounting
 * method for a first implementation (see docs for LIFO/specific-ID as
 * follow-up work).
 */
export function computeRealizedGainLoss(
  asset: string,
  postings: LedgerPosting[],
  costBasisEntries: CostBasisEntry[]
): { realized: RealizedGainLoss[]; remainingLots: DisposalLot[] } {
  const assetPostings = postings
    .filter((p) => p.asset === asset && p.transactionSuccessful)
    .slice()
    .sort((a, b) => a.ledgerCloseTime.localeCompare(b.ledgerCloseTime))

  const lots: DisposalLot[] = []
  const realized: RealizedGainLoss[] = []

  for (const posting of assetPostings) {
    const isCredit = compareAmounts(posting.amount, '0') > 0
    if (isCredit) {
      const basis = lookupCostBasis(asset, posting.ledgerCloseTime, costBasisEntries)
      lots.push({ asset, acquiredAt: posting.ledgerCloseTime, quantity: posting.amount, unitCost: basis?.unitPrice || '0' })
      continue
    }

    let remainingToDispose = parseAmountToStroops(posting.amount) * -1n
    const disposalBasis = lookupCostBasis(asset, posting.ledgerCloseTime, costBasisEntries)
    const proceedsPerUnit = disposalBasis?.unitPrice ?? null

    while (remainingToDispose > 0n && lots.length > 0) {
      const lot = lots[0]
      const lotStroops = parseAmountToStroops(lot.quantity)
      const consumed = lotStroops <= remainingToDispose ? lotStroops : remainingToDispose
      realized.push({
        asset,
        disposedAt: posting.ledgerCloseTime,
        quantity: stroopsToAmount(consumed),
        proceedsPerUnit: proceedsPerUnit ?? '0',
        costBasisPerUnit: lot.unitCost,
        gainLoss: proceedsPerUnit ? computeLotGainLoss(consumed, proceedsPerUnit, lot.unitCost) : '0',
        costBasisMissing: proceedsPerUnit === null || lot.unitCost === '0',
      })
      remainingToDispose -= consumed
      if (consumed === lotStroops) lots.shift()
      else lots[0] = { ...lot, quantity: stroopsToAmount(lotStroops - consumed) }
    }

    if (remainingToDispose > 0n) {
      // Disposal exceeds tracked acquisitions (e.g. history starts mid-holding) — flag rather than invent a lot.
      realized.push({
        asset,
        disposedAt: posting.ledgerCloseTime,
        quantity: stroopsToAmount(remainingToDispose),
        proceedsPerUnit: proceedsPerUnit ?? '0',
        costBasisPerUnit: '0',
        gainLoss: '0',
        costBasisMissing: true,
      })
    }
  }

  return { realized, remainingLots: lots }
}

function computeLotGainLoss(quantityStroops: bigint, proceedsPerUnit: string, costPerUnit: string): string {
  const proceeds = stroopsToAmount(quantityStroops)
  const grossProceeds = multiplyAmounts(proceeds, proceedsPerUnit)
  const grossCost = multiplyAmounts(proceeds, costPerUnit)
  return subtractAmounts(grossProceeds, grossCost)
}

/** Multiplies two decimal amounts via stroop-scaled integer math, avoiding float error, then rescales back to a 7-decimal amount string. */
function multiplyAmounts(quantity: string, unitPrice: string): string {
  const quantityStroops = parseAmountToStroops(quantity)
  const priceStroops = parseAmountToStroops(unitPrice)
  const productStroops = (quantityStroops * priceStroops) / 10_000_000n
  return stroopsToAmount(productStroops)
}

export function summarizeRealizedGainLoss(realized: RealizedGainLoss[]): { totalGainLoss: string; missingCostBasisCount: number } {
  const total = realized.reduce((sum, entry) => sum + parseAmountToStroops(entry.gainLoss), 0n)
  return {
    totalGainLoss: stroopsToAmount(total),
    missingCostBasisCount: realized.filter((entry) => entry.costBasisMissing).length,
  }
}

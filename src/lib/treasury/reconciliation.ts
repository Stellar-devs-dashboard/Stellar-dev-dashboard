import { addAmounts, compareAmounts, parseAmountToStroops, percentDifference, stroopsToAmount, sumStroops } from './amount'
import type {
  AssetWaterfallStep,
  Discrepancy,
  LedgerPosting,
  ReconciliationPeriod,
  RealizedGainLoss,
  ReviewStatus,
  UnresolvedItem,
} from '../../types/treasury'

const DISCREPANCY_TOLERANCE_STROOPS = 1n // Sub-stroop rounding is not a real discrepancy.

export function groupByTransaction(postings: LedgerPosting[]): Map<string, LedgerPosting[]> {
  const groups = new Map<string, LedgerPosting[]>()
  for (const posting of postings) {
    const list = groups.get(posting.txHash)
    if (list) list.push(posting)
    else groups.set(posting.txHash, [posting])
  }
  return groups
}

function assetsInvolved(postings: LedgerPosting[], opening: Record<string, string>): string[] {
  return Array.from(new Set([...postings.map((p) => p.asset), ...Object.keys(opening)])).sort()
}

export function computeBalanceWaterfall(postings: LedgerPosting[], openingBalances: Record<string, string>): AssetWaterfallStep[] {
  const assets = assetsInvolved(postings, openingBalances)
  return assets.map((asset) => {
    const assetPostings = postings.filter((p) => p.asset === asset)
    const inflow = sumStroops(assetPostings.filter((p) => compareAmounts(p.amount, '0') > 0).map((p) => parseAmountToStroops(p.amount)))
    const outflow = sumStroops(assetPostings.filter((p) => compareAmounts(p.amount, '0') < 0 && p.type !== 'fee').map((p) => parseAmountToStroops(p.amount)))
    const fees = sumStroops(assetPostings.filter((p) => p.type === 'fee').map((p) => parseAmountToStroops(p.amount)))
    const opening = openingBalances[asset] || '0'
    const closing = stroopsToAmount(parseAmountToStroops(opening) + inflow + outflow + fees)
    return {
      asset,
      opening,
      inflow: stroopsToAmount(inflow),
      outflow: stroopsToAmount(outflow),
      fees: stroopsToAmount(fees),
      closing,
    }
  })
}

export function detectDiscrepancies(waterfall: AssetWaterfallStep[], actualClosingBalances: Record<string, string> | null): Discrepancy[] {
  if (!actualClosingBalances) return []
  const discrepancies: Discrepancy[] = []
  for (const step of waterfall) {
    const expected = actualClosingBalances[step.asset]
    if (expected === undefined) continue
    const diffStroops = parseAmountToStroops(step.closing) - parseAmountToStroops(expected)
    if (diffStroops === 0n || (diffStroops > 0n ? diffStroops : -diffStroops) <= DISCREPANCY_TOLERANCE_STROOPS) continue
    const possibleCauses: string[] = []
    if (diffStroops < 0n) possibleCauses.push('Computed balance is lower than actual — a credit may be missing from the fetched activity (check for a paging gap).')
    else possibleCauses.push('Computed balance is higher than actual — a debit (e.g. a trade fill or account-merge transfer) may not be captured by this normalizer.')
    possibleCauses.push('Verify no postings fall outside the reconciled period window.')
    discrepancies.push({
      asset: step.asset,
      expectedClosing: expected,
      computedClosing: step.closing,
      differenceAbs: stroopsToAmount(diffStroops < 0n ? -diffStroops : diffStroops),
      differencePct: percentDifference(expected, step.closing),
      possibleCauses,
    })
  }
  return discrepancies
}

export function findUnresolvedItems(postings: LedgerPosting[], realizedGainLoss: RealizedGainLoss[] = []): UnresolvedItem[] {
  const items: UnresolvedItem[] = []
  for (const posting of postings) {
    if (!posting.transactionSuccessful) {
      items.push({ postingId: posting.id, reason: 'failed-transaction', detail: 'Belongs to a failed transaction; the fee was still charged.' })
      continue
    }
    if (!posting.category) {
      items.push({ postingId: posting.id, reason: 'uncategorized', detail: `No category rule matched this ${posting.type} posting.` })
    }
    if (posting.asset === 'UNKNOWN' || posting.asset === 'CONTRACT') {
      items.push({ postingId: posting.id, reason: 'uncategorized', detail: posting.provenance.note })
    }
  }
  for (const entry of realizedGainLoss) {
    if (!entry.costBasisMissing) continue
    const posting = postings.find((p) => p.asset === entry.asset && p.ledgerCloseTime === entry.disposedAt)
    items.push({
      postingId: posting?.id || `${entry.asset}:${entry.disposedAt}`,
      reason: 'missing-cost-basis',
      detail: `No cost-basis entry covers this ${entry.asset} disposal of ${entry.quantity} at ${entry.disposedAt}.`,
    })
  }
  return items
}

export interface BuildPeriodInput {
  id: string
  label: string
  startTime: string
  endTime: string
  postings: LedgerPosting[]
  openingBalances: Record<string, string>
  actualClosingBalances?: Record<string, string> | null
  pagingGapDetected?: boolean
  reviewStatus?: ReviewStatus
}

export function buildPeriod(input: BuildPeriodInput): ReconciliationPeriod {
  const inWindow = input.postings.filter((p) => p.ledgerCloseTime >= input.startTime && p.ledgerCloseTime < input.endTime)
  const waterfall = computeBalanceWaterfall(inWindow, input.openingBalances)
  const discrepancies = detectDiscrepancies(waterfall, input.actualClosingBalances ?? null)

  return {
    id: input.id,
    label: input.label,
    startTime: input.startTime,
    endTime: input.endTime,
    status: 'open',
    reviewStatus: input.reviewStatus ?? 'unreviewed',
    openingBalances: input.openingBalances,
    actualClosingBalances: input.actualClosingBalances ?? null,
    postings: inWindow,
    waterfall,
    discrepancies,
    pagingGapDetected: input.pagingGapDetected ?? false,
  }
}

export function computedClosingBalances(period: ReconciliationPeriod): Record<string, string> {
  const result: Record<string, string> = {}
  for (const step of period.waterfall) result[step.asset] = step.closing
  return result
}

export function closePeriod(period: ReconciliationPeriod): ReconciliationPeriod {
  return { ...period, status: 'closed' }
}

export function setReviewStatus(period: ReconciliationPeriod, status: ReviewStatus): ReconciliationPeriod {
  return { ...period, reviewStatus: status }
}

/** Rolls a closed period's computed closing balances forward as the next period's opening balances. */
export function deriveNextOpeningBalances(period: ReconciliationPeriod): Record<string, string> {
  return computedClosingBalances(period)
}

export function addPostingAmount(a: string, b: string): string {
  return addAmounts(a, b)
}

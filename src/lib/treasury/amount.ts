export const STROOP_DECIMALS = 7
const STROOP_SCALE = 10_000_000n
const AMOUNT_PATTERN = /^-?\d+(\.\d{1,7})?$/

export class AmountParseError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid Stellar amount (expected up to 7 decimal places).`)
    this.name = 'AmountParseError'
  }
}

/**
 * Converts a decimal Stellar amount string to integer stroops (1 XLM/unit =
 * 10,000,000 stroops). All reconciliation arithmetic happens in this integer
 * space so postings never accumulate floating-point rounding error —
 * critical for an accounting feature where cents (or the 7th decimal place)
 * must reconcile exactly.
 */
export function parseAmountToStroops(value: string): bigint {
  const trimmed = value.trim()
  if (!AMOUNT_PATTERN.test(trimmed)) throw new AmountParseError(value)
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [whole, fraction = ''] = unsigned.split('.')
  const paddedFraction = fraction.padEnd(STROOP_DECIMALS, '0')
  const stroops = BigInt(whole || '0') * STROOP_SCALE + BigInt(paddedFraction || '0')
  return negative ? -stroops : stroops
}

/** Converts integer stroops back to a canonical decimal string (trailing zeros trimmed, always at least "0"). */
export function stroopsToAmount(stroops: bigint): string {
  const negative = stroops < 0n
  const abs = negative ? -stroops : stroops
  const whole = abs / STROOP_SCALE
  const fraction = abs % STROOP_SCALE
  const fractionStr = fraction.toString().padStart(STROOP_DECIMALS, '0').replace(/0+$/, '')
  const body = fractionStr ? `${whole}.${fractionStr}` : whole.toString()
  return negative && abs !== 0n ? `-${body}` : body
}

export function sumStroops(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n)
}

export function addAmounts(a: string, b: string): string {
  return stroopsToAmount(parseAmountToStroops(a) + parseAmountToStroops(b))
}

export function subtractAmounts(a: string, b: string): string {
  return stroopsToAmount(parseAmountToStroops(a) - parseAmountToStroops(b))
}

export function negateAmount(value: string): string {
  return stroopsToAmount(-parseAmountToStroops(value))
}

export function isZeroAmount(value: string): boolean {
  return parseAmountToStroops(value) === 0n
}

export function compareAmounts(a: string, b: string): -1 | 0 | 1 {
  const diff = parseAmountToStroops(a) - parseAmountToStroops(b)
  if (diff > 0n) return 1
  if (diff < 0n) return -1
  return 0
}

/** Percentage difference of `computed` vs `expected`, or null when expected is zero (division is undefined). */
export function percentDifference(expected: string, computed: string): number | null {
  const expectedStroops = parseAmountToStroops(expected)
  if (expectedStroops === 0n) return null
  const diffStroops = parseAmountToStroops(computed) - expectedStroops
  // Scale before dividing so the result keeps sub-percent precision despite integer division.
  const scaled = (diffStroops * 1_000_000n) / expectedStroops
  return Number(scaled) / 10_000
}

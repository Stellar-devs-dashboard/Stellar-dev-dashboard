import { describe, expect, it } from 'vitest'
import {
  addAmounts,
  AmountParseError,
  compareAmounts,
  isZeroAmount,
  negateAmount,
  parseAmountToStroops,
  percentDifference,
  stroopsToAmount,
  subtractAmounts,
  sumStroops,
} from '../amount'

describe('amount — parsing and formatting', () => {
  it('round-trips whole and fractional amounts', () => {
    expect(stroopsToAmount(parseAmountToStroops('100'))).toBe('100')
    expect(stroopsToAmount(parseAmountToStroops('25.1234567'))).toBe('25.1234567')
    expect(stroopsToAmount(parseAmountToStroops('0.0000001'))).toBe('0.0000001')
  })

  it('trims trailing zeros without losing precision', () => {
    expect(stroopsToAmount(parseAmountToStroops('10.5000000'))).toBe('10.5')
    expect(stroopsToAmount(parseAmountToStroops('10.0000000'))).toBe('10')
  })

  it('round-trips negative amounts', () => {
    expect(stroopsToAmount(parseAmountToStroops('-25.1234567'))).toBe('-25.1234567')
  })

  it('rejects malformed amounts instead of silently coercing them', () => {
    expect(() => parseAmountToStroops('abc')).toThrow(AmountParseError)
    expect(() => parseAmountToStroops('1.23456789')).toThrow(AmountParseError) // more than 7 decimals
    expect(() => parseAmountToStroops('')).toThrow(AmountParseError)
    expect(() => parseAmountToStroops('1,000')).toThrow(AmountParseError)
  })

  it('never loses precision to floating point on repeated addition', () => {
    // 0.1 + 0.2 famously != 0.3 in IEEE754 — this must not leak into accounting math.
    let total = '0'
    for (let i = 0; i < 10; i++) total = addAmounts(total, '0.1')
    expect(total).toBe('1')
  })
})

describe('amount — arithmetic helpers', () => {
  it('adds and subtracts precisely', () => {
    expect(addAmounts('10.5', '5.25')).toBe('15.75')
    expect(subtractAmounts('10.5', '5.25')).toBe('5.25')
  })

  it('negates and detects zero', () => {
    expect(negateAmount('5')).toBe('-5')
    expect(negateAmount('-5')).toBe('5')
    expect(isZeroAmount('0')).toBe(true)
    expect(isZeroAmount('0.0000000')).toBe(true)
    expect(isZeroAmount('0.0000001')).toBe(false)
  })

  it('compares amounts', () => {
    expect(compareAmounts('5', '10')).toBe(-1)
    expect(compareAmounts('10', '5')).toBe(1)
    expect(compareAmounts('5', '5')).toBe(0)
  })

  it('sums a list of stroop values', () => {
    expect(sumStroops([parseAmountToStroops('1'), parseAmountToStroops('2.5'), parseAmountToStroops('-0.5')])).toBe(parseAmountToStroops('3'))
  })
})

describe('amount — percentDifference', () => {
  it('computes a signed percentage difference', () => {
    expect(percentDifference('100', '105')).toBeCloseTo(5, 3)
    expect(percentDifference('100', '95')).toBeCloseTo(-5, 3)
  })

  it('returns null when the expected value is zero (undefined percentage)', () => {
    expect(percentDifference('0', '5')).toBeNull()
  })
})

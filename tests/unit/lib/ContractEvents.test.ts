// tests/unit/lib/contractEvents.test.ts
import { describe, it, expect } from 'vitest'
import * as StellarSdk from '@stellar/stellar-sdk'
import {
  decodeEventScVal,
  decodeContractEvent,
  type RawContractEvent,
} from '../../../src/lib/stellar'
import { mergeEvents } from '../../../src/components/dashboard/ContractEvents'
import type { DecodedContractEvent } from '../../../src/lib/stellar'

// Helpers to produce base64 XDR for ScVals, mirroring what Soroban RPC returns.
const symbolXdr = (s: string) =>
  StellarSdk.nativeToScVal(s, { type: 'symbol' }).toXDR('base64')
const stringXdr = (s: string) =>
  StellarSdk.nativeToScVal(s, { type: 'string' }).toXDR('base64')
const i128Xdr = (n: bigint) =>
  StellarSdk.nativeToScVal(n, { type: 'i128' }).toXDR('base64')

describe('decodeEventScVal', () => {
  it('decodes a base64 XDR symbol string to a native string', () => {
    expect(decodeEventScVal(symbolXdr('transfer'))).toBe('transfer')
  })

  it('decodes an i128 XDR string to a native bigint', () => {
    expect(decodeEventScVal(i128Xdr(1000n))).toBe(1000n)
  })

  it('decodes an already-parsed xdr.ScVal object', () => {
    const scVal = StellarSdk.nativeToScVal('mint', { type: 'symbol' })
    expect(decodeEventScVal(scVal)).toBe('mint')
  })

  it('decodes a { xdr } wrapper', () => {
    expect(decodeEventScVal({ xdr: stringXdr('hello') })).toBe('hello')
  })

  it('returns null for null/undefined input', () => {
    expect(decodeEventScVal(null)).toBeNull()
    expect(decodeEventScVal(undefined)).toBeNull()
  })

  it('falls back to the raw string when decoding fails', () => {
    expect(decodeEventScVal('not-valid-xdr!!!')).toBe('not-valid-xdr!!!')
  })
})

describe('decodeContractEvent', () => {
  it('decodes topics and value from base64 XDR to native JS', () => {
    const raw: RawContractEvent = {
      id: '0001-0000000001',
      type: 'contract',
      ledger: 42,
      ledgerClosedAt: '2024-01-01T00:00:00Z',
      contractId: 'CONTRACT123',
      pagingToken: '0001-0000000001',
      txHash: 'abc123',
      inSuccessfulContractCall: true,
      topic: [symbolXdr('transfer'), stringXdr('from'), stringXdr('to')],
      value: i128Xdr(500n),
    }

    const decoded = decodeContractEvent(raw)

    expect(decoded.id).toBe('0001-0000000001')
    expect(decoded.type).toBe('contract')
    expect(decoded.ledger).toBe(42)
    expect(decoded.contractId).toBe('CONTRACT123')
    expect(decoded.txHash).toBe('abc123')
    expect(decoded.topics).toEqual(['transfer', 'from', 'to'])
    expect(decoded.value).toBe(500n)
  })

  it('normalizes an object-form type and falls back on missing fields', () => {
    const raw: RawContractEvent = {
      type: { name: 'system' },
      topics: [symbolXdr('fee')],
      value: i128Xdr(7n),
    }

    const decoded = decodeContractEvent(raw)

    expect(decoded.type).toBe('system')
    expect(decoded.topics).toEqual(['fee'])
    expect(decoded.value).toBe(7n)
    expect(decoded.id).toBe('')
    expect(decoded.ledger).toBe(0)
    expect(decoded.inSuccessfulContractCall).toBe(true)
    expect(decoded.txHash).toBeNull()
  })

  it('reads txHash from the transactionHash alias', () => {
    const decoded = decodeContractEvent({ transactionHash: 'deadbeef', value: null })
    expect(decoded.txHash).toBe('deadbeef')
    expect(decoded.value).toBeNull()
  })
})

describe('mergeEvents', () => {
  const ev = (id: string, ledger: number): DecodedContractEvent => ({
    id,
    type: 'contract',
    ledger,
    ledgerClosedAt: null,
    contractId: null,
    txHash: null,
    pagingToken: id,
    inSuccessfulContractCall: true,
    topics: [],
    value: null,
  })

  it('de-dupes by id and sorts newest-first', () => {
    const merged = mergeEvents([ev('a', 1), ev('b', 2)], [ev('b', 2), ev('c', 3)])
    expect(merged.map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('places newly polled events at the top', () => {
    const existing = [ev('old', 10)]
    const incoming = [ev('new', 11)]
    expect(mergeEvents(existing, incoming)[0].id).toBe('new')
  })
})

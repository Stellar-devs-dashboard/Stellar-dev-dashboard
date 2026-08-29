import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAPPING_RULES,
  exportJournalCsv,
  exportJournalJson,
  findMappingRule,
  parseJournalCsv,
  parseJournalJson,
  serializeJournalJson,
  toJournalEntries,
} from '../journal'
import type { LedgerPosting } from '../../../types/treasury'

function posting(overrides: Partial<LedgerPosting>): LedgerPosting {
  return {
    id: 'p1', txHash: 'tx1', operationId: 'op1', ledgerCloseTime: '2026-01-15T00:00:00.000Z',
    type: 'payment-in', asset: 'XLM', amount: '10', counterparty: 'GCOUNTERPARTY', memo: null,
    transactionSuccessful: true, category: 'General', counterpartyLabel: null,
    provenance: { source: 'derived', note: 'test' }, ...overrides,
  }
}

describe('findMappingRule', () => {
  it('finds the default rule for a posting type', () => {
    expect(findMappingRule('fee', null, DEFAULT_MAPPING_RULES)?.debitAccount).toBe('Expenses:Network Fees')
  })

  it('returns null for a type with no configured rule', () => {
    expect(findMappingRule('fee', null, [])).toBeNull()
  })
})

describe('toJournalEntries', () => {
  it('produces a balanced double-entry pair for each posting', () => {
    const entries = toJournalEntries([posting({ amount: '10' })])
    expect(entries).toHaveLength(2)
    const totalDebit = entries.reduce((sum, e) => sum + Number(e.debit), 0)
    const totalCredit = entries.reduce((sum, e) => sum + Number(e.credit), 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it('debits the cash account and credits the mapped account for a credit posting', () => {
    const entries = toJournalEntries([posting({ amount: '10', asset: 'XLM' })])
    const cashRow = entries.find((e) => e.account.startsWith('Assets:Stellar'))!
    expect(cashRow.debit).toBe('10')
    expect(cashRow.credit).toBe('0')
  })

  it('credits the cash account and debits the mapped account for a debit posting', () => {
    const entries = toJournalEntries([posting({ amount: '-10', type: 'payment-out' })])
    const cashRow = entries.find((e) => e.account.startsWith('Assets:Stellar'))!
    expect(cashRow.debit).toBe('0')
    expect(cashRow.credit).toBe('10')
  })
})

describe('CSV export / import round-trip', () => {
  it('round-trips entries through export and import without loss', () => {
    const entries = toJournalEntries([posting({ amount: '25.1234567' }), posting({ id: 'p2', amount: '-3', type: 'payment-out', memo: 'note, with a comma' })])
    const csv = exportJournalCsv(entries)
    const result = parseJournalCsv(csv)
    expect(result.valid).toBe(true)
    expect(result.entries).toHaveLength(entries.length)
    expect(result.entries[0].debit).toBe(entries[0].debit)
  })

  it('escapes memos containing commas and quotes correctly', () => {
    const entries = toJournalEntries([posting({ memo: null, category: 'Cat, with "quotes"' })])
    const csv = exportJournalCsv(entries)
    const result = parseJournalCsv(csv)
    expect(result.valid).toBe(true)
    expect(result.entries[0].memo).toContain('with "quotes"')
  })

  it('rejects a CSV with the wrong header', () => {
    const result = parseJournalCsv('a,b,c\n1,2,3')
    expect(result.valid).toBe(false)
  })

  it('rejects a row with both a non-zero debit and credit', () => {
    const result = parseJournalCsv('date,reference,account,debit,credit,asset,memo\n2026-01-01,ref,acct,5,5,XLM,memo')
    expect(result.valid).toBe(false)
  })

  it('rejects a row with a malformed amount', () => {
    const result = parseJournalCsv('date,reference,account,debit,credit,asset,memo\n2026-01-01,ref,acct,abc,0,XLM,memo')
    expect(result.valid).toBe(false)
  })
})

describe('JSON export / import round-trip', () => {
  it('round-trips through export and import with a matching checksum', async () => {
    const entries = toJournalEntries([posting({ amount: '10' })])
    const exported = await exportJournalJson('period-1', entries)
    const serialized = serializeJournalJson(exported)
    const result = await parseJournalJson(serialized)
    expect(result.valid).toBe(true)
    expect(result.entries).toHaveLength(entries.length)
  })

  it('detects tampering: an edited entry no longer matches the recorded checksum', async () => {
    const entries = toJournalEntries([posting({ amount: '10' })])
    const exported = await exportJournalJson('period-1', entries)
    const tampered = { ...exported, entries: [{ ...exported.entries[0], debit: '999999' }, ...exported.entries.slice(1)] }
    const result = await parseJournalJson(JSON.stringify(tampered))
    expect(result.valid).toBe(false)
    expect(result.issues[0].message).toMatch(/checksum/i)
  })

  it('rejects an unsupported schema version', async () => {
    const result = await parseJournalJson(JSON.stringify({ schemaVersion: 99, entries: [] }))
    expect(result.valid).toBe(false)
  })

  it('rejects malformed JSON without throwing', async () => {
    const result = await parseJournalJson('{ not json')
    expect(result.valid).toBe(false)
  })
})

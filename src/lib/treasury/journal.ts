import { stroopsToAmount, parseAmountToStroops } from './amount'
import { JOURNAL_SCHEMA_VERSION } from '../../types/treasury'
import type { AccountMappingRule, ImportValidationResult, JournalEntry, JournalExport, LedgerPosting, PostingType } from '../../types/treasury'

export const CASH_ACCOUNT_PREFIX = 'Assets:Stellar'

export const DEFAULT_MAPPING_RULES: AccountMappingRule[] = [
  { postingType: 'payment-in', category: null, debitAccount: `${CASH_ACCOUNT_PREFIX}`, creditAccount: 'Income:Payments Received' },
  { postingType: 'payment-out', category: null, debitAccount: 'Expenses:Payments Sent', creditAccount: `${CASH_ACCOUNT_PREFIX}` },
  { postingType: 'fee', category: null, debitAccount: 'Expenses:Network Fees', creditAccount: `${CASH_ACCOUNT_PREFIX}` },
  { postingType: 'trade', category: null, debitAccount: 'Assets:Trading Inventory', creditAccount: `${CASH_ACCOUNT_PREFIX}` },
  { postingType: 'claimable-balance-out', category: null, debitAccount: 'Assets:Claimable Balances (Escrow)', creditAccount: `${CASH_ACCOUNT_PREFIX}` },
  { postingType: 'claimable-balance-in', category: null, debitAccount: `${CASH_ACCOUNT_PREFIX}`, creditAccount: 'Assets:Claimable Balances (Escrow)' },
  { postingType: 'sponsorship', category: null, debitAccount: 'Informational:Sponsorship', creditAccount: 'Informational:Sponsorship' },
  { postingType: 'account-change', category: null, debitAccount: 'Informational:Account Changes', creditAccount: 'Informational:Account Changes' },
  { postingType: 'contract-transfer', category: null, debitAccount: 'Assets:Contract Activity (Unresolved)', creditAccount: `${CASH_ACCOUNT_PREFIX}` },
  { postingType: 'other', category: null, debitAccount: 'Informational:Other', creditAccount: 'Informational:Other' },
]

export function findMappingRule(postingType: PostingType, category: string | null, rules: AccountMappingRule[]): AccountMappingRule | null {
  const withCategory = category ? rules.find((r) => r.postingType === postingType && r.category === category) : undefined
  return withCategory || rules.find((r) => r.postingType === postingType && r.category === null) || null
}

/**
 * Converts postings into balanced double-entry journal rows. Every posting
 * produces exactly one entry: a positive (credit-to-account) posting debits
 * the account's cash ledger and credits the mapped counter-account; a
 * negative (debit-from-account) posting does the reverse. Entry amounts are
 * always non-negative — direction lives in which column is populated, the
 * standard double-entry convention.
 */
function postingMemo(posting: LedgerPosting): string {
  return [posting.category, posting.counterpartyLabel || posting.counterparty, posting.memo].filter(Boolean).join(' | ') || posting.provenance.note
}

function postingToEntryPair(posting: LedgerPosting, mappingRules: AccountMappingRule[]): [JournalEntry, JournalEntry] {
  const rule = findMappingRule(posting.type, posting.category, mappingRules)
  const signedStroops = parseAmountToStroops(posting.amount)
  const magnitude = stroopsToAmount(signedStroops < 0n ? -signedStroops : signedStroops)
  const isCredit = signedStroops >= 0n
  const cashAccount = `${CASH_ACCOUNT_PREFIX}:${posting.asset}`
  const counterAccount = rule ? (isCredit ? rule.creditAccount : rule.debitAccount) : 'Unmapped'
  const memo = postingMemo(posting)
  const base = { date: posting.ledgerCloseTime, reference: posting.id, asset: posting.asset, memo }
  return [
    { ...base, account: cashAccount, debit: isCredit ? magnitude : '0', credit: isCredit ? '0' : magnitude },
    { ...base, account: counterAccount, debit: isCredit ? '0' : magnitude, credit: isCredit ? magnitude : '0' },
  ]
}

export function toJournalEntries(postings: LedgerPosting[], mappingRules: AccountMappingRule[] = DEFAULT_MAPPING_RULES): JournalEntry[] {
  return postings.flatMap((posting) => postingToEntryPair(posting, mappingRules))
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function canonicalEntriesText(entries: JournalEntry[]): string {
  return JSON.stringify(entries)
}

export async function exportJournalJson(periodId: string, entries: JournalEntry[]): Promise<JournalExport> {
  const checksum = await sha256Hex(canonicalEntriesText(entries))
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    format: 'json',
    periodId,
    generatedAt: new Date().toISOString(),
    rowCount: entries.length,
    checksum,
    entries,
  }
}

export function serializeJournalJson(journalExport: JournalExport): string {
  return JSON.stringify(journalExport, null, 2)
}

const CSV_HEADERS = ['date', 'reference', 'account', 'debit', 'credit', 'asset', 'memo'] as const

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function exportJournalCsv(entries: JournalEntry[]): string {
  const rows = [CSV_HEADERS.join(',')]
  for (const entry of entries) {
    rows.push(CSV_HEADERS.map((field) => csvEscape(String(entry[field]))).join(','))
  }
  return rows.join('\n')
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

/** Parses and validates a previously exported CSV journal, proving the export format round-trips. */
export function parseJournalCsv(text: string): ImportValidationResult {
  const issues: ImportValidationResult['issues'] = []
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
  if (!lines.length) return { valid: false, issues: [{ row: 0, message: 'File is empty.' }], entries: [] }

  const header = parseCsvLine(lines[0])
  if (header.join(',') !== CSV_HEADERS.join(',')) {
    issues.push({ row: 0, message: `Unexpected header. Expected: ${CSV_HEADERS.join(',')}` })
    return { valid: false, issues, entries: [] }
  }

  const entries: JournalEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.length !== CSV_HEADERS.length) {
      issues.push({ row: i, message: `Expected ${CSV_HEADERS.length} columns, got ${fields.length}.` })
      continue
    }
    const [date, reference, account, debit, credit, asset, memo] = fields
    try {
      const debitStroops = parseAmountToStroops(debit)
      const creditStroops = parseAmountToStroops(credit)
      if (debitStroops < 0n || creditStroops < 0n) throw new Error('negative')
      if (debitStroops > 0n && creditStroops > 0n) {
        issues.push({ row: i, message: 'A single journal row cannot have both a non-zero debit and a non-zero credit.' })
        continue
      }
    } catch {
      issues.push({ row: i, message: 'debit/credit must be non-negative decimal amounts.' })
      continue
    }
    if (Number.isNaN(Date.parse(date))) {
      issues.push({ row: i, message: 'date must be a valid ISO-8601 timestamp.' })
      continue
    }
    entries.push({ date, reference, account, debit, credit, asset, memo })
  }

  return { valid: issues.length === 0, issues, entries }
}

/** Parses and validates a previously exported JSON journal, including a checksum re-verification against the entries it claims to contain. */
export async function parseJournalJson(text: string): Promise<ImportValidationResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { valid: false, issues: [{ row: 0, message: `Not valid JSON: ${(error as Error).message}` }], entries: [] }
  }
  if (!parsed || typeof parsed !== 'object') return { valid: false, issues: [{ row: 0, message: 'Expected a JSON object.' }], entries: [] }

  const candidate = parsed as Partial<JournalExport>
  if (candidate.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    return { valid: false, issues: [{ row: 0, message: `Unsupported schemaVersion ${candidate.schemaVersion}.` }], entries: [] }
  }
  if (!Array.isArray(candidate.entries)) {
    return { valid: false, issues: [{ row: 0, message: 'Missing or invalid "entries" array.' }], entries: [] }
  }

  const recomputed = await sha256Hex(canonicalEntriesText(candidate.entries as JournalEntry[]))
  if (recomputed !== candidate.checksum) {
    return { valid: false, issues: [{ row: 0, message: 'Checksum mismatch — the entries do not match the recorded checksum (the file may have been edited after export).' }], entries: [] }
  }

  return { valid: true, issues: [], entries: candidate.entries as JournalEntry[] }
}

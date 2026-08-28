/**
 * Versioned CSV/JSON accounting exports + round-trip import, and a
 * configurable "generic ledger" mapping (postings → debit/credit rows an
 * external accounting system can ingest). Mirrors `src/lib/import.ts`'s
 * `SUPPORTED_VERSIONS` allowlist pattern: an explicit `version` field,
 * checked against an allowlist on import, with a validator that returns an
 * error list instead of throwing.
 */

import { exportCsv, exportJson } from '../../utils/export';
import type {
  AccountingMapping,
  AssetBalance,
  Discrepancy,
  GenericLedgerRow,
  LedgerPosting,
  ReconciliationPeriod,
  ReviewRecord,
  TreasuryExportPayload,
} from '../../types/treasury';
import { EXPORT_SCHEMA_VERSION, SUPPORTED_EXPORT_VERSIONS } from '../../types/treasury';
import { parseAmount } from './decimal';

// ─── Building the export payload ─────────────────────────────────────────────────

export function buildExportPayload(
  period: ReconciliationPeriod,
  postings: LedgerPosting[],
  balances: AssetBalance[],
  discrepancies: Discrepancy[],
  review: ReviewRecord[],
  now = new Date()
): TreasuryExportPayload {
  return {
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    period,
    postings,
    balances,
    discrepancies,
    review,
  };
}

export function exportPeriodJson(payload: TreasuryExportPayload, filename = `treasury-${payload.period.id}`): void {
  exportJson(payload, filename);
}

function flattenPostingForCsv(posting: LedgerPosting): Record<string, unknown> {
  return {
    id: posting.id,
    timestamp: posting.timestamp,
    kind: posting.kind,
    asset: posting.asset.code,
    amount: posting.amount,
    counterparty: posting.counterparty ?? '',
    counterpartyLabel: posting.counterpartyLabel ?? '',
    category: posting.category ?? '',
    memo: posting.memo ?? '',
    successful: posting.successful,
    txHash: posting.txHash,
    needsReview: posting.needsReview ?? false,
  };
}

export function exportPeriodCsv(payload: TreasuryExportPayload, filename = `treasury-${payload.period.id}`): void {
  const columns = [
    'id',
    'timestamp',
    'kind',
    'asset',
    'amount',
    'counterparty',
    'counterpartyLabel',
    'category',
    'memo',
    'successful',
    'txHash',
    'needsReview',
  ];
  exportCsv(payload.postings.map(flattenPostingForCsv), filename, columns);
}

// ─── Import + validation ────────────────────────────────────────────────────────

export interface ImportResult {
  ok: boolean;
  error?: string;
  data?: TreasuryExportPayload;
}

export function parseExportPayload(jsonString: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Export file has an unexpected format.' };
  }
  const candidate = parsed as Partial<TreasuryExportPayload>;
  if (typeof candidate.version !== 'number' || !SUPPORTED_EXPORT_VERSIONS.includes(candidate.version)) {
    return {
      ok: false,
      error: `Unsupported export version: ${String(candidate.version)}. Expected one of: ${SUPPORTED_EXPORT_VERSIONS.join(', ')}.`,
    };
  }
  const errors = validateExportPayload(candidate);
  if (errors.length) {
    return { ok: false, error: errors.join(' ') };
  }
  return { ok: true, data: candidate as TreasuryExportPayload };
}

export function validateExportPayload(data: Partial<TreasuryExportPayload>): string[] {
  const errors: string[] = [];
  if (!data.exportedAt) errors.push('Missing exportedAt timestamp.');
  if (!data.period || typeof data.period !== 'object') errors.push('Missing or invalid period section.');
  if (!Array.isArray(data.postings)) errors.push('Missing or invalid postings array.');
  if (!Array.isArray(data.balances)) errors.push('Missing or invalid balances array.');
  if (Array.isArray(data.postings)) {
    for (const [index, posting] of data.postings.entries()) {
      if (!posting || typeof posting !== 'object') {
        errors.push(`Posting at index ${index} is not an object.`);
        continue;
      }
      const p = posting as Partial<LedgerPosting>;
      if (!p.id || !p.txHash || !p.kind || !p.asset || typeof p.amount !== 'string') {
        errors.push(`Posting at index ${index} is missing required fields.`);
      } else {
        try {
          parseAmount(p.amount);
        } catch {
          errors.push(`Posting "${p.id}" has an unparsable amount "${p.amount}".`);
        }
      }
    }
  }
  return errors;
}

/** Round-trips a payload through JSON export/import for tests and integrity checks. */
export function roundTripPayload(payload: TreasuryExportPayload): ImportResult {
  return parseExportPayload(JSON.stringify(payload));
}

// ─── Generic accounting mapping ──────────────────────────────────────────────────

export const DEFAULT_ACCOUNTING_MAPPING: AccountingMapping = {
  id: 'default',
  name: 'Default operational mapping',
  defaultAccountCode: '9999',
  entries: [
    { category: 'network-fee', accountCode: '6100', accountName: 'Network Fees' },
    { category: 'sponsorship', accountCode: '6200', accountName: 'Sponsorship / Reserve Changes' },
  ],
};

export function validateAccountingMapping(mapping: AccountingMapping): string[] {
  const errors: string[] = [];
  if (!mapping.id.trim()) errors.push('Mapping id is required.');
  if (!mapping.name.trim()) errors.push('Mapping name is required.');
  if (!mapping.defaultAccountCode.trim()) errors.push('Default account code is required.');
  const seen = new Set<string>();
  for (const entry of mapping.entries) {
    if (seen.has(entry.category)) errors.push(`Duplicate mapping entry for category "${entry.category}".`);
    seen.add(entry.category);
    if (!entry.accountCode.trim()) errors.push(`Account code is required for category "${entry.category}".`);
  }
  return errors;
}

/**
 * Converts postings into generic debit/credit ledger rows using an
 * accounting mapping. Positive amounts (inflows) post as credits to the
 * mapped account and debits to a counter "Ledger Clearing" account (and
 * vice versa for outflows) — a conventional double-entry shape that any
 * external system's importer can remap to its own chart of accounts.
 */
export function buildGenericLedgerRows(postings: LedgerPosting[], mapping: AccountingMapping): GenericLedgerRow[] {
  const rows: GenericLedgerRow[] = [];
  const findEntry = (category: string | undefined) =>
    mapping.entries.find((entry) => entry.category === category);

  for (const posting of postings) {
    const entry = findEntry(posting.category);
    const accountCode = entry?.accountCode ?? mapping.defaultAccountCode;
    const accountName = entry?.accountName ?? 'Uncategorized';
    const isInflow = !posting.amount.startsWith('-');
    const magnitude = isInflow ? posting.amount : posting.amount.slice(1);
    const description = `${posting.kind}${posting.counterpartyLabel ? ` · ${posting.counterpartyLabel}` : posting.counterparty ? ` · ${posting.counterparty}` : ''}`;

    rows.push({
      date: posting.timestamp,
      accountCode,
      accountName,
      description,
      debit: isInflow ? magnitude : '0',
      credit: isInflow ? '0' : magnitude,
      assetCode: posting.asset.code,
      reference: posting.txHash,
    });
    rows.push({
      date: posting.timestamp,
      accountCode: 'CLEARING',
      accountName: 'Ledger Clearing',
      description,
      debit: isInflow ? '0' : magnitude,
      credit: isInflow ? magnitude : '0',
      assetCode: posting.asset.code,
      reference: posting.txHash,
    });
  }
  return rows;
}

export function exportGenericLedgerCsv(
  postings: LedgerPosting[],
  mapping: AccountingMapping,
  filename = 'treasury-generic-ledger'
): void {
  const rows = buildGenericLedgerRows(postings, mapping);
  exportCsv(
    rows as unknown as Record<string, unknown>[],
    filename,
    ['date', 'accountCode', 'accountName', 'description', 'debit', 'credit', 'assetCode', 'reference']
  );
}

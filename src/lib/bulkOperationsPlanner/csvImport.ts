/**
 * CSV and JSON import with schema mapping, previews, and duplicate detection.
 */

import type {
  BulkCsvImportOptions,
  BulkImportPreview,
  BulkManifest,
  BulkOperationSpec,
} from '../../types/bulkOperationsPlanner';
import { buildManifest } from './planner';
import {
  buildOperationSpec,
  detectDuplicateRows,
  normalizeDecimal,
  parseDependencies,
  sanitizeLabel,
  sanitizeTags,
  validateCsvMapping,
  validateManifestOperations,
} from './validation';

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string, delimiter: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseCsvLine(line, delimiter));
}

function cellValue(row: string[], headers: string[], column?: string): string | undefined {
  if (!column) return undefined;
  const index = headers.indexOf(column);
  if (index < 0) return undefined;
  return row[index];
}

function resolveAsset(codeRaw: string | undefined, issuerRaw: string | undefined) {
  const code = (codeRaw ?? 'XLM').trim().toUpperCase();
  if (code === 'XLM' || code === 'NATIVE') {
    return { code: 'XLM', type: 'native' as const };
  }
  return {
    code,
    issuer: issuerRaw?.trim(),
    type: (code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12') as 'credit_alphanum4' | 'credit_alphanum12',
  };
}

export function importCsvPreview(csvText: string, options: BulkCsvImportOptions): BulkImportPreview {
  const rows = parseCsv(csvText, options.delimiter);
  const headers = options.hasHeader && rows.length > 0 ? rows[0] : options.mapping.id ? Object.values(options.mapping) : [];
  const dataRows = options.hasHeader ? rows.slice(1) : rows;
  const mappingIssues = validateCsvMapping(options.mapping as Record<string, string | undefined>);

  const mappedOperations: BulkOperationSpec[] = [];
  const issues = [...mappingIssues];
  const ids: string[] = [];

  dataRows.forEach((row, index) => {
    if (options.skipEmptyRows && row.every((cell) => !cell.trim())) return;

    const rowNumber = index + (options.hasHeader ? 2 : 1);
    const get = (key: keyof BulkCsvImportOptions['mapping']) =>
      cellValue(row, headers, options.mapping[key]);

    const id = (get('id') ?? `row-${rowNumber}`).trim();
    const family = (get('family') ?? options.defaultFamily ?? 'payment') as BulkOperationSpec['family'];
    const sourceAccount = (get('sourceAccount') ?? options.defaultSourceAccount ?? '').trim();
    const destination = get('destination')?.trim() ?? '';
    const amountRaw = get('amount')?.trim() || '0';
    const asset = resolveAsset(get('assetCode'), get('assetIssuer'));

    ids.push(id);

    let amount = amountRaw;
    try {
      amount = normalizeDecimal(amountRaw);
    } catch {
      issues.push({
        row: rowNumber,
        field: 'amount',
        code: 'INVALID_AMOUNT',
        message: `Invalid amount on row ${rowNumber}`,
        severity: 'error',
      });
    }

    let params: BulkOperationSpec['params'];
    let defaultLabel = `Operation ${id}`;

    switch (family) {
      case 'changeTrust':
        params = { asset, limit: amountRaw && amountRaw !== '0' ? amount : undefined };
        defaultLabel = sanitizeLabel(get('label') ?? `Trustline ${asset.code}`);
        break;
      case 'createAccount':
        params = { destination, startingBalance: amount };
        defaultLabel = sanitizeLabel(get('label') ?? `Create ${destination.slice(0, 8)}`);
        break;
      case 'accountMerge':
        params = { destination };
        defaultLabel = sanitizeLabel(get('label') ?? `Merge to ${destination.slice(0, 8)}`);
        break;
      case 'manageData':
        params = { name: get('memo') ?? id, value: amountRaw, action: 'set' };
        defaultLabel = sanitizeLabel(get('label') ?? `Manage data ${id}`);
        break;
      default:
        params = {
          destination,
          amount,
          asset,
          memo: get('memo'),
        };
        defaultLabel = sanitizeLabel(get('label') ?? `Payment to ${destination.slice(0, 8)}`);
        break;
    }

    const operation = buildOperationSpec({
      id,
      label: defaultLabel,
      family,
      sourceAccount,
      dependencies: parseDependencies(get('dependencies')),
      tags: sanitizeTags(get('tags')),
      params,
    });

    mappedOperations.push(operation);
  });

  const duplicateRowIndexes = detectDuplicateRows(ids);
  const validation = validateManifestOperations(mappedOperations);

  return {
    rowCount: dataRows.length,
    mappedOperations,
    issues: [...issues, ...validation.issues],
    duplicateRowIndexes,
    sampleRows: dataRows.slice(0, 5),
    headers: options.hasHeader ? headers : [],
  };
}

export async function importCsvManifest(
  csvText: string,
  meta: { id: string; name: string; network: string; sourceAccount: string },
  options: BulkCsvImportOptions
): Promise<BulkManifest> {
  const preview = importCsvPreview(csvText, options);
  if (preview.issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`CSV import failed with ${preview.issues.length} issue(s)`);
  }

  return buildManifest({
    id: meta.id,
    name: meta.name,
    network: meta.network,
    sourceAccount: meta.sourceAccount,
    operations: preview.mappedOperations,
  });
}

export async function readBulkImportFile(file: File): Promise<string> {
  return file.text();
}

export async function importJsonManifest(text: string): Promise<BulkManifest> {
  const parsed = JSON.parse(text) as BulkManifest;
  if (!parsed.operations || !Array.isArray(parsed.operations)) {
    throw new Error('Invalid manifest JSON: missing operations array');
  }
  return parsed;
}

export function csvTemplate(): string {
  return [
    'id,label,family,sourceAccount,destination,amount,assetCode,assetIssuer,memo,dependencies,tags',
    'pay-1,Treasury payout,payment,GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN,GBLOBGCLOGBLOGBCLOGBLOGBCLOGBLOGBCLOGBLOGBCLOGBLOGBCLAA,10,XLM,,Monthly stipend,,payroll',
  ].join('\n');
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const counts = [
    { delimiter: ',', count: (firstLine.match(/,/g) ?? []).length },
    { delimiter: ';', count: (firstLine.match(/;/g) ?? []).length },
    { delimiter: '\t', count: (firstLine.match(/\t/g) ?? []).length },
  ];
  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.count ? counts[0].delimiter : ',';
}

export function defaultCsvImportOptions(sourceAccount?: string): BulkCsvImportOptions {
  return {
    delimiter: ',',
    hasHeader: true,
    mapping: {
      id: 'id',
      label: 'label',
      family: 'family',
      sourceAccount: 'sourceAccount',
      destination: 'destination',
      amount: 'amount',
      assetCode: 'assetCode',
      assetIssuer: 'assetIssuer',
      memo: 'memo',
      dependencies: 'dependencies',
      tags: 'tags',
    },
    defaultSourceAccount: sourceAccount,
    defaultFamily: 'payment',
    skipEmptyRows: true,
    trimValues: true,
  };
}

export function remapCsvHeaders(
  csvText: string,
  options: BulkCsvImportOptions,
  headerMap: Record<string, string>
): BulkCsvImportOptions {
  const remapped = { ...options.mapping };
  for (const [from, to] of Object.entries(headerMap)) {
    for (const key of Object.keys(remapped) as Array<keyof BulkCsvImportOptions['mapping']>) {
      if (remapped[key] === from) remapped[key] = to;
    }
  }
  return { ...options, mapping: remapped };
}

export function summarizeImportPreview(preview: BulkImportPreview): string {
  const errorCount = preview.issues.filter((i) => i.severity === 'error').length;
  const warningCount = preview.issues.filter((i) => i.severity === 'warning').length;
  return `${preview.rowCount} rows → ${preview.mappedOperations.length} operations (${errorCount} errors, ${warningCount} warnings)`;
}

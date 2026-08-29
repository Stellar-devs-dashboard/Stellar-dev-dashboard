/**
 * Operation validation, Stellar address checks, and manifest integrity rules.
 */

import type {
  BulkDependencyEdge,
  BulkOperationFamily,
  BulkOperationSpec,
  BulkRowValidationIssue,
  BulkValidationReport,
} from '../../types/bulkOperationsPlanner';
import {
  buildDependencyGraph,
  detectCycle,
  findMissingDependencies,
  summarizeGraph,
  topologicalSort,
} from './dependencyGraph';

const STELLAR_ADDRESS = /^G[A-Z2-7]{54,55}$/;
const DECIMAL_AMOUNT = /^\d+(\.\d+)?$/;
const ASSET_CODE = /^[A-Z0-9]{1,12}$/;

export function isValidStellarAddress(value: string): boolean {
  return STELLAR_ADDRESS.test(value.trim());
}

export function normalizeDecimal(value: string): string {
  const trimmed = value.trim();
  if (!DECIMAL_AMOUNT.test(trimmed)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
}

export function detectDuplicateRows(ids: string[]): number[] {
  const seen = new Map<string, number>();
  const duplicates: number[] = [];

  ids.forEach((id, index) => {
    const key = id.trim();
    if (!key) return;
    if (seen.has(key)) {
      duplicates.push(index + 1);
      duplicates.push(seen.get(key)! + 1);
    } else {
      seen.set(key, index);
    }
  });

  return [...new Set(duplicates)].sort((a, b) => a - b);
}

function issue(
  row: number,
  code: string,
  message: string,
  severity: BulkRowValidationIssue['severity'] = 'error',
  field?: string
): BulkRowValidationIssue {
  return { row, code, message, severity, field };
}

function validateAsset(
  asset: { code: string; issuer?: string; type: string },
  row: number,
  prefix: string
): BulkRowValidationIssue[] {
  const issues: BulkRowValidationIssue[] = [];
  if (asset.type === 'native') {
    if (asset.code && asset.code !== 'XLM') {
      issues.push(issue(row, 'INVALID_NATIVE_ASSET', `${prefix}: native asset code must be XLM`, 'warning', 'assetCode'));
    }
    return issues;
  }

  if (!ASSET_CODE.test(asset.code)) {
    issues.push(issue(row, 'INVALID_ASSET_CODE', `${prefix}: invalid asset code`, 'error', 'assetCode'));
  }
  if (!asset.issuer || !isValidStellarAddress(asset.issuer)) {
    issues.push(issue(row, 'INVALID_ASSET_ISSUER', `${prefix}: issuer must be a valid Stellar address`, 'error', 'assetIssuer'));
  }
  return issues;
}

function validateParams(op: BulkOperationSpec, row: number): BulkRowValidationIssue[] {
  const issues: BulkRowValidationIssue[] = [];

  if (!isValidStellarAddress(op.sourceAccount)) {
    issues.push(issue(row, 'INVALID_SOURCE', 'Source account must be a valid Stellar public key', 'error', 'sourceAccount'));
  }

  switch (op.family) {
    case 'payment': {
      const params = op.params as { destination: string; amount: string; asset: { code: string; issuer?: string; type: string } };
      if (!isValidStellarAddress(params.destination)) {
        issues.push(issue(row, 'INVALID_DESTINATION', 'Payment destination must be a valid Stellar address', 'error', 'destination'));
      }
      try {
        normalizeDecimal(params.amount);
      } catch {
        issues.push(issue(row, 'INVALID_AMOUNT', 'Payment amount must be a positive decimal', 'error', 'amount'));
      }
      issues.push(...validateAsset(params.asset, row, 'Payment asset'));
      break;
    }
    case 'changeTrust': {
      const params = op.params as { asset: { code: string; issuer?: string; type: string }; limit?: string };
      issues.push(...validateAsset(params.asset, row, 'Trustline asset'));
      if (params.limit !== undefined) {
        try {
          normalizeDecimal(params.limit);
        } catch {
          issues.push(issue(row, 'INVALID_LIMIT', 'Trustline limit must be a decimal', 'error', 'limit'));
        }
      }
      break;
    }
    case 'createAccount': {
      const params = op.params as { destination: string; startingBalance: string };
      if (!isValidStellarAddress(params.destination)) {
        issues.push(issue(row, 'INVALID_DESTINATION', 'Create-account destination must be valid', 'error', 'destination'));
      }
      try {
        normalizeDecimal(params.startingBalance);
      } catch {
        issues.push(issue(row, 'INVALID_STARTING_BALANCE', 'Starting balance must be a decimal', 'error', 'startingBalance'));
      }
      break;
    }
    case 'accountMerge': {
      const params = op.params as { destination: string };
      if (!isValidStellarAddress(params.destination)) {
        issues.push(issue(row, 'INVALID_DESTINATION', 'Merge destination must be valid', 'error', 'destination'));
      }
      break;
    }
    case 'setOptions': {
      const params = op.params as { signer?: { key: string; weight: number } };
      if (params.signer && !isValidStellarAddress(params.signer.key)) {
        issues.push(issue(row, 'INVALID_SIGNER', 'Signer key must be a valid Stellar address', 'error', 'signer'));
      }
      break;
    }
    case 'contractInvoke': {
      const params = op.params as { contractId: string; functionName: string };
      if (!params.contractId.trim()) {
        issues.push(issue(row, 'MISSING_CONTRACT', 'Contract id is required', 'error', 'contractId'));
      }
      if (!params.functionName.trim()) {
        issues.push(issue(row, 'MISSING_FUNCTION', 'Contract function name is required', 'error', 'functionName'));
      }
      break;
    }
    case 'manageData': {
      const params = op.params as { name: string; value: string };
      if (!params.name.trim()) {
        issues.push(issue(row, 'MISSING_DATA_NAME', 'Manage-data name is required', 'error', 'name'));
      }
      break;
    }
    case 'pathPayment': {
      const params = op.params as {
        destination: string;
        sendMax: string;
        destAmount: string;
        sendAsset: { code: string; issuer?: string; type: string };
        destAsset: { code: string; issuer?: string; type: string };
      };
      if (!isValidStellarAddress(params.destination)) {
        issues.push(issue(row, 'INVALID_DESTINATION', 'Path payment destination must be valid', 'error', 'destination'));
      }
      for (const field of ['sendMax', 'destAmount'] as const) {
        try {
          normalizeDecimal(params[field]);
        } catch {
          issues.push(issue(row, 'INVALID_AMOUNT', `${field} must be a decimal`, 'error', field));
        }
      }
      issues.push(...validateAsset(params.sendAsset, row, 'Send asset'));
      issues.push(...validateAsset(params.destAsset, row, 'Destination asset'));
      break;
    }
    default:
      break;
  }

  return issues;
}

export function validateOperationSpec(op: BulkOperationSpec, row: number): BulkRowValidationIssue[] {
  const issues: BulkRowValidationIssue[] = [];

  if (!op.id.trim()) {
    issues.push(issue(row, 'MISSING_ID', 'Operation id is required', 'error', 'id'));
  }
  if (!op.label.trim()) {
    issues.push(issue(row, 'MISSING_LABEL', 'Operation label is recommended', 'warning', 'label'));
  }
  if (op.maxRetries < 0 || op.maxRetries > 10) {
    issues.push(issue(row, 'INVALID_RETRIES', 'maxRetries must be between 0 and 10', 'error', 'maxRetries'));
  }
  if (op.timeoutMs < 1_000 || op.timeoutMs > 300_000) {
    issues.push(issue(row, 'INVALID_TIMEOUT', 'timeoutMs must be between 1000 and 300000', 'warning', 'timeoutMs'));
  }

  issues.push(...validateParams(op, row));
  return issues;
}

export function validateManifestOperations(
  operations: BulkOperationSpec[],
  edges: BulkDependencyEdge[] = []
): BulkValidationReport {
  const issues: BulkRowValidationIssue[] = [];
  const warnings: BulkRowValidationIssue[] = [];

  operations.forEach((op, index) => {
    for (const item of validateOperationSpec(op, index + 1)) {
      if (item.severity === 'error') issues.push(item);
      else warnings.push(item);
    }
  });

  const duplicateIds = detectDuplicateIds(operations);
  duplicateIds.forEach((id) => {
    issues.push(issue(0, 'DUPLICATE_ID', `Duplicate operation id: ${id}`, 'error', 'id'));
  });

  const missingDependencies = findMissingDependencies(operations, edges);
  missingDependencies.forEach(({ operationId, missingId }) => {
    issues.push(
      issue(0, 'MISSING_DEPENDENCY', `Operation ${operationId} depends on missing ${missingId}`, 'error', 'dependencies')
    );
  });

  const graph = buildDependencyGraph(operations, edges);
  issues.push(...summarizeGraph(graph));

  const cyclePath = detectCycle(graph);
  const cycleDetected = cyclePath.length > 0;
  if (cycleDetected) {
    issues.push(
      issue(0, 'CYCLE_DETECTED', `Dependency cycle: ${cyclePath.join(' -> ')}`, 'error', 'dependencies')
    );
  }

  let estimatedTransactions = 0;
  if (!cycleDetected && operations.length > 0) {
    try {
      topologicalSort(graph);
      estimatedTransactions = Math.ceil(operations.length / 100);
    } catch {
      estimatedTransactions = 0;
    }
  }

  const estimatedFeeStroops = estimatedTransactions * 100 * Math.max(1, Math.ceil(operations.length / estimatedTransactions || 1));

  return {
    valid: issues.length === 0,
    operationCount: operations.length,
    issues,
    warnings,
    cycleDetected,
    cyclePath,
    duplicateIds,
    missingDependencies,
    estimatedFeeStroops,
    estimatedTransactions: Math.max(estimatedTransactions, operations.length > 0 ? 1 : 0),
  };
}

export function detectDuplicateIds(operations: BulkOperationSpec[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const op of operations) {
    if (seen.has(op.id)) duplicates.add(op.id);
    seen.add(op.id);
  }
  return [...duplicates];
}

export function buildOperationSpec(input: {
  id: string;
  label: string;
  family: BulkOperationFamily;
  sourceAccount: string;
  params: BulkOperationSpec['params'];
  dependencies?: string[];
  tags?: string[];
  priority?: number;
  maxRetries?: number;
  timeoutMs?: number;
  requiresApproval?: boolean;
  metadata?: Record<string, string>;
}): BulkOperationSpec {
  const now = new Date().toISOString();
  return {
    id: input.id,
    label: input.label,
    family: input.family,
    sourceAccount: input.sourceAccount,
    params: input.params,
    dependencies: input.dependencies ?? [],
    tags: input.tags ?? [],
    priority: input.priority ?? 0,
    maxRetries: input.maxRetries ?? 3,
    timeoutMs: input.timeoutMs ?? 30_000,
    requiresApproval: input.requiresApproval ?? false,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeValidationReports(...reports: BulkValidationReport[]): BulkValidationReport {
  const issues = reports.flatMap((r) => r.issues);
  const warnings = reports.flatMap((r) => r.warnings);
  const operationCount = reports.reduce((sum, r) => sum + r.operationCount, 0);
  const cycleDetected = reports.some((r) => r.cycleDetected);
  const cyclePath = reports.find((r) => r.cyclePath.length > 0)?.cyclePath ?? [];
  const duplicateIds = [...new Set(reports.flatMap((r) => r.duplicateIds))];
  const missingDependencies = reports.flatMap((r) => r.missingDependencies);

  return {
    valid: issues.length === 0,
    operationCount,
    issues,
    warnings,
    cycleDetected,
    cyclePath,
    duplicateIds,
    missingDependencies,
    estimatedFeeStroops: reports.reduce((sum, r) => sum + r.estimatedFeeStroops, 0),
    estimatedTransactions: reports.reduce((sum, r) => sum + r.estimatedTransactions, 0),
  };
}

export function filterOperationsByTag(operations: BulkOperationSpec[], tag: string): BulkOperationSpec[] {
  return operations.filter((op) => op.tags.includes(tag));
}

export function sortOperationsByPriority(operations: BulkOperationSpec[]): BulkOperationSpec[] {
  return [...operations].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}

export function validateCsvMapping(mapping: Record<string, string | undefined>): BulkRowValidationIssue[] {
  const issues: BulkRowValidationIssue[] = [];
  if (!mapping.id && !mapping.destination) {
    issues.push(issue(0, 'MAPPING_INCOMPLETE', 'CSV mapping requires at least id or destination column', 'error'));
  }
  return issues;
}

export function sanitizeLabel(value: string): string {
  return value.trim().slice(0, 120);
}

export function sanitizeTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function parseDependencies(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((dep) => dep.trim())
    .filter(Boolean);
}

export function estimateOperationComplexity(op: BulkOperationSpec): number {
  switch (op.family) {
    case 'payment':
    case 'manageData':
      return 1;
    case 'changeTrust':
    case 'createAccount':
    case 'accountMerge':
      return 2;
    case 'setOptions':
    case 'sponsorship':
      return 3;
    case 'pathPayment':
      return 4;
    case 'contractInvoke':
      return 5;
    default:
      return 2;
  }
}

export function validateApprovalRequirements(operations: BulkOperationSpec[]): BulkRowValidationIssue[] {
  const warnings: BulkRowValidationIssue[] = [];
  const requiringApproval = operations.filter((op) => op.requiresApproval);
  if (requiringApproval.length > 0) {
    warnings.push(
      issue(
        0,
        'APPROVAL_REQUIRED',
        `${requiringApproval.length} operation(s) require explicit approval before submission`,
        'warning'
      )
    );
  }
  return warnings;
}

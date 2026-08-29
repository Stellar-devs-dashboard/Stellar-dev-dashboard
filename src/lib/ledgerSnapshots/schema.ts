/**
 * Schema validation and migration for portable ledger snapshots.
 */

import {
  LEDGER_SNAPSHOT_FORMAT_KIND,
  LEDGER_SNAPSHOT_SCHEMA_VERSION,
  REPLAY_RESULT_FORMAT_KIND,
  REPLAY_RESULT_SCHEMA_VERSION,
  type DeterministicReplayResult,
  type PortableLedgerSnapshot,
  type SnapshotValidationIssue,
  type SnapshotValidationReport,
} from '../../types/ledgerSnapshots';
import { verifySnapshotDigest } from './canonicalize';

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{54,55}$/;
const STELLAR_CONTRACT = /^C[A-Z2-7]{54,55}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;

function pushIssue(
  issues: SnapshotValidationIssue[],
  path: string,
  message: string,
  severity: SnapshotValidationIssue['severity'] = 'error'
): void {
  issues.push({ path, message, severity });
}

function validateNetwork(snapshot: PortableLedgerSnapshot, issues: SnapshotValidationIssue[]): void {
  if (!snapshot.network) {
    pushIssue(issues, 'network', 'Network identity is required.');
    return;
  }
  if (!snapshot.network.networkName?.trim()) {
    pushIssue(issues, 'network.networkName', 'Network name is required.');
  }
  if (!snapshot.network.passphrase?.trim()) {
    pushIssue(issues, 'network.passphrase', 'Network passphrase is required.');
  }
  if (!snapshot.network.horizonUrl?.trim()) {
    pushIssue(issues, 'network.horizonUrl', 'Horizon URL is required.');
  }
}

function validateLedger(snapshot: PortableLedgerSnapshot, issues: SnapshotValidationIssue[]): void {
  if (!snapshot.ledger) {
    pushIssue(issues, 'ledger', 'Ledger metadata is required.');
    return;
  }
  if (!Number.isFinite(snapshot.ledger.sequence) || snapshot.ledger.sequence < 0) {
    pushIssue(issues, 'ledger.sequence', 'Ledger sequence must be a non-negative number.');
  }
  if (!snapshot.ledger.hash?.trim()) {
    pushIssue(issues, 'ledger.hash', 'Ledger hash is required.');
  }
}

function validateAccounts(snapshot: PortableLedgerSnapshot, issues: SnapshotValidationIssue[]): void {
  if (!Array.isArray(snapshot.accounts)) {
    pushIssue(issues, 'accounts', 'Accounts must be an array.');
    return;
  }
  snapshot.accounts.forEach((account, index) => {
    if (!STELLAR_PUBLIC_KEY.test(account.accountId)) {
      pushIssue(issues, `accounts[${index}].accountId`, 'Invalid Stellar account ID.');
    }
    if (!/^\d+$/.test(account.sequence)) {
      pushIssue(issues, `accounts[${index}].sequence`, 'Account sequence must be numeric.');
    }
  });
}

function validateEntries(snapshot: PortableLedgerSnapshot, issues: SnapshotValidationIssue[]): void {
  if (!Array.isArray(snapshot.ledgerEntries)) {
    pushIssue(issues, 'ledgerEntries', 'Ledger entries must be an array.');
    return;
  }
  const seen = new Set<string>();
  snapshot.ledgerEntries.forEach((entry, index) => {
    if (!entry.id?.trim()) {
      pushIssue(issues, `ledgerEntries[${index}].id`, 'Entry id is required.');
    }
    if (!entry.key?.trim()) {
      pushIssue(issues, `ledgerEntries[${index}].key`, 'Entry key is required.');
    }
    if (seen.has(entry.id)) {
      pushIssue(issues, `ledgerEntries[${index}].id`, `Duplicate entry id: ${entry.id}.`);
    }
    seen.add(entry.id);
    if (entry.accountId && !STELLAR_PUBLIC_KEY.test(entry.accountId)) {
      pushIssue(issues, `ledgerEntries[${index}].accountId`, 'Invalid account id on entry.');
    }
    if (entry.contractId && !STELLAR_CONTRACT.test(entry.contractId)) {
      pushIssue(issues, `ledgerEntries[${index}].contractId`, 'Invalid contract id on entry.');
    }
  });
}

function validateIntegrity(snapshot: PortableLedgerSnapshot, issues: SnapshotValidationIssue[]): void {
  if (!snapshot.integrity) {
    pushIssue(issues, 'integrity', 'Integrity block is required.');
    return;
  }
  if (snapshot.integrity.algorithm !== 'sha256') {
    pushIssue(issues, 'integrity.algorithm', 'Only sha256 integrity is supported.');
  }
  if (!HEX_SHA256.test(snapshot.integrity.contentDigest)) {
    pushIssue(issues, 'integrity.contentDigest', 'Content digest must be a 64-char hex SHA-256.');
  }
  if (Array.isArray(snapshot.ledgerEntries) && snapshot.integrity.entryCount !== snapshot.ledgerEntries.length) {
    pushIssue(
      issues,
      'integrity.entryCount',
      'Entry count does not match ledgerEntries length.',
      'warning'
    );
  }
}

function validateCompatibility(snapshot: PortableLedgerSnapshot, issues: SnapshotValidationIssue[]): void {
  if (!snapshot.compatibility) {
    pushIssue(issues, 'compatibility', 'Compatibility metadata is required.');
    return;
  }
  if (snapshot.compatibility.diagnosticOnly !== true) {
    pushIssue(issues, 'compatibility.diagnosticOnly', 'Snapshots must be marked diagnostic-only.');
  }
  if (snapshot.compatibility.replayEngineMinVersion > LEDGER_SNAPSHOT_SCHEMA_VERSION) {
    pushIssue(
      issues,
      'compatibility.replayEngineMinVersion',
      'Replay engine minimum version exceeds current schema support.'
    );
  }
}

export function validateSnapshotStructure(snapshot: PortableLedgerSnapshot): SnapshotValidationReport {
  const issues: SnapshotValidationIssue[] = [];

  if (snapshot.formatKind !== LEDGER_SNAPSHOT_FORMAT_KIND) {
    pushIssue(issues, 'formatKind', `Expected ${LEDGER_SNAPSHOT_FORMAT_KIND}.`);
  }
  if (snapshot.schemaVersion !== LEDGER_SNAPSHOT_SCHEMA_VERSION) {
    pushIssue(issues, 'schemaVersion', `Unsupported schema version: ${snapshot.schemaVersion}.`);
  }
  if (!snapshot.snapshotId?.trim()) {
    pushIssue(issues, 'snapshotId', 'Snapshot id is required.');
  }
  if (!snapshot.label?.trim()) {
    pushIssue(issues, 'label', 'Snapshot label is required.');
  }

  validateNetwork(snapshot, issues);
  validateLedger(snapshot, issues);
  validateAccounts(snapshot, issues);
  validateEntries(snapshot, issues);
  validateIntegrity(snapshot, issues);
  validateCompatibility(snapshot, issues);

  if (Array.isArray(snapshot.simulations)) {
    snapshot.simulations.forEach((sim, index) => {
      if (!sim.requestDigest?.trim()) {
        pushIssue(issues, `simulations[${index}].requestDigest`, 'Simulation request digest is required.');
      }
      if (!sim.requestCanonical?.trim() || !sim.responseCanonical?.trim()) {
        pushIssue(issues, `simulations[${index}]`, 'Simulation canonical request/response are required.');
      }
    });
  } else {
    pushIssue(issues, 'simulations', 'Simulations must be an array.');
  }

  return { valid: issues.every((i) => i.severity !== 'error'), issues };
}

export async function validateSnapshotIntegrity(
  snapshot: PortableLedgerSnapshot
): Promise<SnapshotValidationReport> {
  const structural = validateSnapshotStructure(snapshot);
  if (!structural.valid) return structural;

  const digestOk = await verifySnapshotDigest(snapshot);
  if (!digestOk) {
    structural.issues.push({
      path: 'integrity.contentDigest',
      message: 'Content digest does not match snapshot payload — archive may be corrupted.',
      severity: 'error',
    });
    structural.valid = false;
  }
  return structural;
}

export interface MigrationResult {
  ok: true;
  snapshot: PortableLedgerSnapshot;
  migratedFromVersion?: number;
}

export interface MigrationFailure {
  ok: false;
  error: string;
}

export type MigrationOutcome = MigrationResult | MigrationFailure;

export function migrateSnapshot(raw: unknown): MigrationOutcome {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Snapshot payload must be an object.' };
  }

  const candidate = raw as Partial<PortableLedgerSnapshot>;
  if (candidate.schemaVersion === LEDGER_SNAPSHOT_SCHEMA_VERSION) {
    return { ok: true, snapshot: candidate as PortableLedgerSnapshot };
  }

  if (candidate.schemaVersion === undefined || candidate.schemaVersion === null) {
    const upgraded = {
      ...candidate,
      schemaVersion: LEDGER_SNAPSHOT_SCHEMA_VERSION,
      formatKind: LEDGER_SNAPSHOT_FORMAT_KIND,
      compatibility: {
        replayEngineMinVersion: 1,
        unsupportedEntryKinds: candidate.compatibility?.unsupportedEntryKinds ?? [],
        diagnosticOnly: true as const,
      },
    } as PortableLedgerSnapshot;
    return { ok: true, snapshot: upgraded, migratedFromVersion: 0 };
  }

  return {
    ok: false,
    error: `Unsupported snapshot schema version: ${String(candidate.schemaVersion)}. Expected ${LEDGER_SNAPSHOT_SCHEMA_VERSION}.`,
  };
}

export function validateReplayResult(result: DeterministicReplayResult): SnapshotValidationReport {
  const issues: SnapshotValidationIssue[] = [];

  if (result.formatKind !== REPLAY_RESULT_FORMAT_KIND) {
    pushIssue(issues, 'formatKind', `Expected ${REPLAY_RESULT_FORMAT_KIND}.`);
  }
  if (result.schemaVersion !== REPLAY_RESULT_SCHEMA_VERSION) {
    pushIssue(issues, 'schemaVersion', `Unsupported replay result schema: ${result.schemaVersion}.`);
  }
  if (result.diagnosticOnly !== true) {
    pushIssue(issues, 'diagnosticOnly', 'Replay results must be marked diagnostic-only.');
  }
  if (!result.replayId?.trim()) {
    pushIssue(issues, 'replayId', 'Replay id is required.');
  }
  if (!HEX_SHA256.test(result.integrityDigest)) {
    pushIssue(issues, 'integrityDigest', 'Integrity digest must be SHA-256 hex.');
  }

  return { valid: issues.every((i) => i.severity !== 'error'), issues };
}

export function parseSnapshotJson(text: string): MigrationOutcome {
  try {
    const parsed = JSON.parse(text) as unknown;
    return migrateSnapshot(parsed);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${(error as Error).message}` };
  }
}

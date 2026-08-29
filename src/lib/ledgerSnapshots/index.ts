export * from '../../types/ledgerSnapshots';
export * from './canonicalize';
export * from './schema';
export * from './redaction';
export * from './compression';
export * from './captureClient';
export * from './repository';
export * from './replayEngine';
export * from './diffEngine';
export * from './exportImport';
export * from './fixtures';

export class LedgerSnapshotError extends Error {
  code: string;
  retryable: boolean;
  requestId?: string;

  constructor(params: { code: string; message: string; retryable?: boolean; requestId?: string }) {
    super(params.message);
    this.name = 'LedgerSnapshotError';
    this.code = params.code;
    this.retryable = params.retryable ?? false;
    this.requestId = params.requestId;
  }
}

export function toLedgerSnapshotError(error: unknown, requestId?: string): LedgerSnapshotError {
  if (error instanceof LedgerSnapshotError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new LedgerSnapshotError({
    code: 'UNKNOWN',
    message,
    retryable: false,
    requestId,
  });
}

/**
 * Typed errors for bulk operations planner domain and UI surfaces.
 */

export type BulkPlannerErrorCode =
  | 'VALIDATION_FAILED'
  | 'CYCLE_DETECTED'
  | 'MANIFEST_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'IMPORT_FAILED'
  | 'EXPORT_FAILED'
  | 'EXECUTION_FAILED'
  | 'EXECUTION_PAUSED'
  | 'EXECUTION_CANCELLED'
  | 'SCHEMA_MISMATCH'
  | 'DEPENDENCY_BLOCKED'
  | 'SEQUENCE_CONFLICT'
  | 'APPROVAL_REQUIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'STORAGE_ERROR';

export class BulkPlannerError extends Error {
  readonly code: BulkPlannerErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: BulkPlannerErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BulkPlannerError';
    this.code = code;
    this.details = details;
  }
}

export function toBulkPlannerError(error: unknown): BulkPlannerError {
  if (error instanceof BulkPlannerError) return error;
  if (error instanceof Error) {
    return new BulkPlannerError('EXECUTION_FAILED', error.message);
  }
  return new BulkPlannerError('EXECUTION_FAILED', String(error));
}

export function isBulkPlannerError(error: unknown): error is BulkPlannerError {
  return error instanceof BulkPlannerError;
}

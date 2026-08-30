import type { ProfilingApiError, ProfilingErrorCode } from '../../types/resourceProfiling';

export class ProfilingError extends Error implements ProfilingApiError {
  code: ProfilingErrorCode;
  retryable: boolean;
  requestId?: string;

  constructor(error: ProfilingApiError) {
    super(error.message);
    this.name = 'ProfilingError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.requestId = error.requestId;
  }
}

export function requestId(prefix = 'profiling'): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

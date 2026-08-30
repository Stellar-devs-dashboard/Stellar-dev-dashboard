import { simulateContractCall } from '../stellar';
import { getOnlineStatus } from '../../utils/offline';
import { normalizeFromSimulation } from './normalizer';
import { ProfilingError, requestId } from './errors';
import type { CaptureSimulationInput, ResourceProfile } from '../../types/resourceProfiling';

const DEFAULT_TIMEOUT_MS = 20_000;

function summarizeInputs(input: CaptureSimulationInput): string {
  const args = input.args.map((arg) => `${arg.type}:${arg.value}`).join(', ');
  return `${input.functionName}(${args})`;
}

export interface CaptureOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Runs a real Soroban simulation through the dashboard's shared `simulateContractCall` API and
 * normalizes the result into a typed ResourceProfile. This intentionally does not talk to the
 * network directly -- it reuses the same simulation path as the Transaction Simulator and
 * Contract Interaction tabs so profiling never drifts from what those tools report.
 */
export async function captureProfileFromSimulation(input: CaptureSimulationInput, options: CaptureOptions = {}): Promise<ResourceProfile> {
  if (!getOnlineStatus()) {
    throw new ProfilingError({
      code: 'offline',
      message: 'Cannot run a new simulation while offline. Saved baselines remain available.',
      retryable: true,
    });
  }

  if (!input.contractId.trim() || !input.functionName.trim() || !input.sourceAccount.trim()) {
    throw new ProfilingError({
      code: 'invalid-input',
      message: 'Contract id, function name, and a source account are required to capture a profile.',
      retryable: false,
    });
  }

  const id = requestId('capture');
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const result = await simulateContractCall({
      contractId: input.contractId.trim(),
      functionName: input.functionName.trim(),
      args: input.args,
      sourceAccount: input.sourceAccount.trim(),
      network: input.network,
    });

    if (controller.signal.aborted) {
      throw new ProfilingError({ code: 'timeout', message: 'Simulation timed out before resource metrics were captured.', retryable: true, requestId: id });
    }

    return normalizeFromSimulation(result, {
      network: input.network,
      contractId: input.contractId.trim(),
      functionName: input.functionName.trim(),
      inputsSummary: summarizeInputs(input),
      artifactName: input.artifactName,
    });
  } catch (cause) {
    if (cause instanceof ProfilingError) throw cause;
    if (options.signal?.aborted) {
      throw new ProfilingError({ code: 'aborted', message: 'Profile capture was cancelled.', retryable: false, requestId: id });
    }
    if (controller.signal.aborted) {
      throw new ProfilingError({ code: 'timeout', message: 'Simulation timed out before resource metrics were captured.', retryable: true, requestId: id });
    }
    const message = cause instanceof Error ? cause.message : 'Simulation failed for an unknown reason.';
    throw new ProfilingError({ code: 'simulation-failed', message, retryable: true, requestId: id });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Deterministic offline replay engine for captured simulations.
 * Replays recorded responses against immutable snapshots — diagnostic simulation,
 * not consensus-equivalent execution.
 */

import type {
  CapturedSimulation,
  DeterministicReplayResult,
  PortableLedgerSnapshot,
  ReplayRequest,
  ReplaySimulationResult,
  ReplayTimelineEvent,
  UnsupportedFeatureDiagnostic,
} from '../../types/ledgerSnapshots';
import {
  REPLAY_RESULT_FORMAT_KIND,
  REPLAY_RESULT_SCHEMA_VERSION,
} from '../../types/ledgerSnapshots';
import { normalizeSimulationResponse, sha256Hex, stableCanonicalJson } from './canonicalize';

export interface ReplayDependencies {
  now?: () => Date;
  idFactory?: () => string;
}

function createId(factory?: () => string): string {
  if (factory) return factory();
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `replay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function timelineEvent(
  phase: ReplayTimelineEvent['phase'],
  message: string,
  simulationId?: string,
  durationMs?: number
): ReplayTimelineEvent {
  return {
    id: createId(),
    timestamp: new Date(0).toISOString(),
    phase,
    simulationId,
    message,
    deterministic: true,
    durationMs,
  };
}

function detectUnsupportedFeatures(sim: CapturedSimulation): UnsupportedFeatureDiagnostic[] {
  const diagnostics: UnsupportedFeatureDiagnostic[] = [];

  if (!sim.supported) {
    diagnostics.push({
      code: 'SIMULATION_UNSUPPORTED',
      category: 'simulation',
      message: sim.unsupportedReasons?.join('; ') ?? 'Simulation marked unsupported at capture time.',
      remediation: 'Re-capture on a supported protocol version or reduce host function usage.',
      blocking: true,
    });
  }

  try {
    const parsed = JSON.parse(sim.responseCanonical) as Record<string, unknown>;
    if (parsed.error) {
      diagnostics.push({
        code: 'CAPTURED_ERROR_RESPONSE',
        category: 'simulation',
        message: String(parsed.error),
        blocking: false,
      });
    }
    if (parsed.unsupportedHostFunctions && Array.isArray(parsed.unsupportedHostFunctions)) {
      for (const fn of parsed.unsupportedHostFunctions) {
        diagnostics.push({
          code: 'UNSUPPORTED_HOST_FN',
          category: 'host_fn',
          message: `Unsupported host function: ${String(fn)}`,
          remediation: 'Offline replay cannot emulate this host function.',
          blocking: true,
        });
      }
    }
  } catch {
    diagnostics.push({
      code: 'INVALID_RESPONSE_CANONICAL',
      category: 'simulation',
      message: 'Captured response is not valid JSON.',
      blocking: true,
    });
  }

  return diagnostics;
}

function replaySingleSimulation(
  sim: CapturedSimulation,
  strictMode: boolean
): ReplaySimulationResult {
  const events: ReplayTimelineEvent[] = [];
  const start = performance.now?.() ?? Date.now();

  events.push(timelineEvent('prepare', 'Preparing deterministic replay context…', sim.id));
  events.push(timelineEvent('lookup', 'Looking up captured simulation response…', sim.id));

  const unsupportedFeatures = detectUnsupportedFeatures(sim);
  const blocking = unsupportedFeatures.some((d) => d.blocking);

  if (blocking && strictMode) {
    events.push(
      timelineEvent('error', 'Replay blocked due to unsupported features.', sim.id, (performance.now?.() ?? Date.now()) - start)
    );
    return {
      simulationId: sim.id,
      requestDigest: sim.requestDigest,
      matched: false,
      replayedResponseCanonical: '',
      expectedResponseCanonical: sim.responseCanonical,
      diffSummary: 'Blocked by unsupported features in strict mode.',
      unsupportedFeatures,
      timeline: events,
    };
  }

  events.push(timelineEvent('replay', 'Replaying captured simulation response…', sim.id));

  let replayedResponseCanonical: string;
  try {
    const parsed = JSON.parse(sim.responseCanonical);
    replayedResponseCanonical = normalizeSimulationResponse(parsed);
  } catch {
    replayedResponseCanonical = sim.responseCanonical;
  }

  events.push(timelineEvent('validate', 'Validating replay output against capture…', sim.id));

  const matched = replayedResponseCanonical === sim.responseCanonical;
  const diffSummary = matched
    ? undefined
    : `Response mismatch: expected ${sim.responseCanonical.length} bytes, got ${replayedResponseCanonical.length} bytes.`;

  events.push(
    timelineEvent(
      matched ? 'complete' : 'error',
      matched ? 'Replay matched captured response.' : 'Replay did not match captured response.',
      sim.id,
      (performance.now?.() ?? Date.now()) - start
    )
  );

  return {
    simulationId: sim.id,
    requestDigest: sim.requestDigest,
    matched,
    replayedResponseCanonical,
    expectedResponseCanonical: sim.responseCanonical,
    diffSummary,
    unsupportedFeatures,
    timeline: events,
  };
}

export class DeterministicReplayEngine {
  private deps: ReplayDependencies;

  constructor(deps: ReplayDependencies = {}) {
    this.deps = deps;
  }

  async replay(
    snapshot: PortableLedgerSnapshot,
    request: ReplayRequest,
    signal?: AbortSignal
  ): Promise<DeterministicReplayResult> {
    const now = this.deps.now?.() ?? new Date();
    const replayId = createId(this.deps.idFactory);
    const startedAt = now.toISOString();

    const timeline: ReplayTimelineEvent[] = [
      timelineEvent('prepare', `Loading snapshot ${snapshot.snapshotId} for diagnostic replay.`),
    ];

    if (signal?.aborted) {
      return this.buildFailureResult(replayId, request.snapshotId, startedAt, timeline, 'Replay cancelled.');
    }

    const targets =
      request.simulationIds?.length
        ? snapshot.simulations.filter((s) => request.simulationIds!.includes(s.id))
        : snapshot.simulations;

    if (targets.length === 0) {
      timeline.push(timelineEvent('error', 'No simulations found to replay.'));
      return this.buildFailureResult(replayId, request.snapshotId, startedAt, timeline, 'No simulations.');
    }

    const simulationResults: ReplaySimulationResult[] = [];
    const allUnsupported: UnsupportedFeatureDiagnostic[] = [];

    for (const sim of targets) {
      if (signal?.aborted) {
        timeline.push(timelineEvent('error', 'Replay cancelled mid-run.'));
        break;
      }
      const result = replaySingleSimulation(sim, request.strictMode);
      simulationResults.push(result);
      allUnsupported.push(...result.unsupportedFeatures);
      timeline.push(...result.timeline);
    }

    const allMatched = simulationResults.every((r) => r.matched);
    const anyBlocked = simulationResults.some((r) =>
      r.unsupportedFeatures.some((d) => d.blocking)
    );

    const status =
      simulationResults.length === 0
        ? 'failed'
        : allMatched
          ? 'completed'
          : anyBlocked && request.strictMode
            ? 'failed'
            : 'partial';

    const completedAt = (this.deps.now?.() ?? new Date()).toISOString();
    timeline.push(
      timelineEvent(
        status === 'completed' ? 'complete' : 'error',
        `Replay ${status}: ${simulationResults.filter((r) => r.matched).length}/${simulationResults.length} matched.`
      )
    );

    const integrityPayload = {
      replayId,
      snapshotId: request.snapshotId,
      simulationResults: simulationResults.map((r) => ({
        simulationId: r.simulationId,
        matched: r.matched,
        requestDigest: r.requestDigest,
      })),
    };
    const integrityDigest = await sha256Hex(stableCanonicalJson(integrityPayload));

    return {
      formatKind: REPLAY_RESULT_FORMAT_KIND,
      schemaVersion: REPLAY_RESULT_SCHEMA_VERSION,
      replayId,
      snapshotId: request.snapshotId,
      startedAt,
      completedAt,
      status,
      diagnosticOnly: true,
      simulationResults,
      unsupportedFeatures: dedupeDiagnostics(allUnsupported),
      timeline,
      integrityDigest,
    };
  }

  private buildFailureResult(
    replayId: string,
    snapshotId: string,
    startedAt: string,
    timeline: ReplayTimelineEvent[],
    message: string
  ): DeterministicReplayResult {
    timeline.push(timelineEvent('error', message));
    return {
      formatKind: REPLAY_RESULT_FORMAT_KIND,
      schemaVersion: REPLAY_RESULT_SCHEMA_VERSION,
      replayId,
      snapshotId,
      startedAt,
      completedAt: startedAt,
      status: 'failed',
      diagnosticOnly: true,
      simulationResults: [],
      unsupportedFeatures: [],
      timeline,
      integrityDigest: '',
    };
  }
}

function dedupeDiagnostics(items: UnsupportedFeatureDiagnostic[]): UnsupportedFeatureDiagnostic[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const replayEngine = new DeterministicReplayEngine();

export function isReplayDeterministic(
  resultA: DeterministicReplayResult,
  resultB: DeterministicReplayResult
): boolean {
  if (resultA.simulationResults.length !== resultB.simulationResults.length) return false;
  for (let i = 0; i < resultA.simulationResults.length; i += 1) {
    const a = resultA.simulationResults[i];
    const b = resultB.simulationResults[i];
    if (a.matched !== b.matched) return false;
    if (a.replayedResponseCanonical !== b.replayedResponseCanonical) return false;
  }
  return true;
}

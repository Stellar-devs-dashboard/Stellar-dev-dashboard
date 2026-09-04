/**
 * Multi-step Workflow State Machine Types
 *
 * Used by asset issuance, trustline changes, clawbacks, and flag updates
 * to provide dry-run → review → sign → submit → verify pipelines.
 */

import type {
  OperationEnvelope,
  OperationSummary,
  OperationType,
} from './assetControl';

// ─── Workflow Step ───────────────────────────────────────────────────────────

export type WorkflowStepStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  status: WorkflowStepStatus;
  /** Error message if status is 'failed'. */
  error?: string;
}

// ─── Workflow Plan ───────────────────────────────────────────────────────────

export type WorkflowPhase =
  | 'draft'
  | 'readiness_check'
  | 'dry_run'
  | 'review'
  | 'signing'
  | 'submitting'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowPlan<TParams = unknown> {
  id: string;
  operationType: OperationType;
  phase: WorkflowPhase;
  /** Creation timestamp (ISO-8601). */
  createdAt: string;
  /** Last-updated timestamp (ISO-8601). */
  updatedAt: string;
  /** Parameters the user provided for this operation. */
  params: TParams;
  /** Ordered list of steps in the workflow. */
  steps: WorkflowStep[];
  /** Index of the currently active step. */
  activeStepIndex: number;
  /** Dry-run summary before the user signs. */
  dryRunSummary?: OperationSummary;
  /** Unsigned envelope ready for signing. */
  envelope?: OperationEnvelope;
  /** Transaction hash after successful submission. */
  txHash?: string;
  /** Verified successfully after submission? */
  verified?: boolean;
  /** Top-level error if the entire workflow fails. */
  error?: string;
}

// ─── Workflow Actions (used by the reducer/state hook) ───────────────────────

export type WorkflowAction =
  | { type: 'START_READINESS_CHECK' }
  | { type: 'READINESS_PASSED' }
  | { type: 'READINESS_FAILED'; error: string }
  | { type: 'START_DRY_RUN' }
  | { type: 'DRY_RUN_COMPLETE'; summary: OperationSummary; envelope: OperationEnvelope }
  | { type: 'DRY_RUN_FAILED'; error: string }
  | { type: 'ENTER_REVIEW' }
  | { type: 'START_SIGNING' }
  | { type: 'SIGNING_COMPLETE'; signedXdr: string }
  | { type: 'SIGNING_FAILED'; error: string }
  | { type: 'START_SUBMIT' }
  | { type: 'SUBMIT_COMPLETE'; txHash: string }
  | { type: 'SUBMIT_FAILED'; error: string }
  | { type: 'START_VERIFY' }
  | { type: 'VERIFY_COMPLETE'; verified: boolean }
  | { type: 'VERIFY_FAILED'; error: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

// ─── Workflow Checkpoint (for resumability) ──────────────────────────────────

export interface WorkflowCheckpoint {
  workflowId: string;
  phase: WorkflowPhase;
  savedAt: string;
  signedXdr?: string;
}

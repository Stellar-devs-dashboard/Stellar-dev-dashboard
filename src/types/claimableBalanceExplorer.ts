/**
 * TypeScript domain models and AST for Claimable Balance Composer & Lifecycle Explorer.
 */

export type PredicateType =
  | 'unconditional'
  | 'absBefore'
  | 'relBefore'
  | 'and'
  | 'or'
  | 'not';

export interface BasePredicateNode {
  id: string;
  type: PredicateType;
}

export interface UnconditionalPredicateNode extends BasePredicateNode {
  type: 'unconditional';
}

export interface AbsBeforePredicateNode extends BasePredicateNode {
  type: 'absBefore';
  /** Epoch timestamp in seconds (string or number) */
  epochSeconds: number;
  /** Human readable ISO string representation */
  isoDate?: string;
}

export interface RelBeforePredicateNode extends BasePredicateNode {
  type: 'relBefore';
  /** Relative duration in seconds from balance creation */
  durationSeconds: number;
  /** Helper human breakdown (e.g. 86400 -> 1 day) */
  formattedDuration?: string;
}

export interface AndPredicateNode extends BasePredicateNode {
  type: 'and';
  left: PredicateNode;
  right: PredicateNode;
}

export interface OrPredicateNode extends BasePredicateNode {
  type: 'or';
  left: PredicateNode;
  right: PredicateNode;
}

export interface NotPredicateNode extends BasePredicateNode {
  type: 'not';
  inner: PredicateNode;
}

export type PredicateNode =
  | UnconditionalPredicateNode
  | AbsBeforePredicateNode
  | RelBeforePredicateNode
  | AndPredicateNode
  | OrPredicateNode
  | NotPredicateNode;

export interface PredicateValidationIssue {
  nodeId: string;
  code:
    | 'MAX_DEPTH_EXCEEDED'
    | 'INVALID_TIMESTAMP'
    | 'NEGATIVE_DURATION'
    | 'CIRCULAR_REFERENCE'
    | 'EMPTY_BRANCH'
    | 'IMPOSSIBLE_CONDITION'
    | 'TAUTOLOGY'
    | 'STALE_PAST_TIMESTAMP';
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PredicateValidationResult {
  isValid: boolean;
  maxDepth: number;
  nodeCount: number;
  issues: PredicateValidationIssue[];
}

export interface PredicateExplanation {
  summary: string;
  detailedRules: string[];
  unlockWindow?: {
    earliestEpochSeconds?: number;
    latestEpochSeconds?: number;
    isAlwaysValid?: boolean;
    isExpired?: boolean;
  };
}

export interface ClaimantEntry {
  id: string;
  destination: string;
  predicate: PredicateNode;
  isSponsor?: boolean;
  notes?: string;
}

export type AssetType = 'native' | 'credit_alphanum4' | 'credit_alphanum12';

export interface AssetSpecification {
  type: AssetType;
  code: string;
  issuer: string;
}

export interface ClaimableBalanceCreateParams {
  asset: AssetSpecification;
  amount: string;
  claimants: ClaimantEntry[];
  sponsor?: string;
  sourceAccount: string;
}

export interface ReserveRequirementEstimate {
  baseReservePerEntry: number; // e.g. 0.5 XLM
  claimantEntriesCount: number;
  claimantReservesTotal: number;
  claimableBalanceEntryReserve: number;
  totalReserveRequired: number;
  sponsorAddress?: string;
  sponsorAvailableReserve?: number;
  isSponsorSufficient: boolean;
}

export type LifecycleStatus =
  | 'claimable'
  | 'locked_pending_time'
  | 'expired'
  | 'claimed'
  | 'clawed_back'
  | 'unknown';

export interface ClaimantEvaluation {
  destination: string;
  isEligibleNow: boolean;
  status: LifecycleStatus;
  reason: string;
  unlockTime?: Date;
  expirationTime?: Date;
  countdownSeconds?: number;
}

export interface ClaimableBalanceLifecycleRecord {
  id: string;
  asset: string;
  assetCode?: string;
  assetIssuer?: string;
  amount: string;
  sponsor?: string;
  lastModifiedLedger: number;
  lastModifiedTime: string;
  claimants: Array<{
    destination: string;
    predicate: PredicateNode;
    evaluation: ClaimantEvaluation;
  }>;
  overallStatus: LifecycleStatus;
  flags?: {
    clawbackEnabled?: boolean;
  };
  history?: LifecycleEvent[];
}

export interface LifecycleEvent {
  id: string;
  timestamp: string;
  type: 'created' | 'claimed' | 'clawbacked' | 'predicate_evaluated';
  actor?: string;
  txHash?: string;
  ledger: number;
  details: string;
}

export interface PredicateTemplate {
  id: string;
  name: string;
  description: string;
  category: 'vesting' | 'escrow' | 'timelock' | 'conditional' | 'custom';
  predicate: PredicateNode;
  tags: string[];
  parameters?: Array<{
    key: string;
    label: string;
    type: 'date' | 'duration' | 'address';
    defaultValue?: string | number;
  }>;
  createdAt: string;
  version: string;
}

export interface TemplateExportPayload {
  schemaVersion: '1.0.0';
  exportedAt: string;
  templates: PredicateTemplate[];
  signature?: string;
}

import * as StellarSdk from '@stellar/stellar-sdk';
import type {
  PredicateNode,
  PredicateValidationResult,
  PredicateValidationIssue,
  PredicateExplanation,
  UnconditionalPredicateNode,
  AbsBeforePredicateNode,
  RelBeforePredicateNode,
  AndPredicateNode,
  OrPredicateNode,
  NotPredicateNode,
} from '../../types/claimableBalanceExplorer';

/**
 * Generate a unique ID for predicate AST nodes
 */
export function generateNodeId(prefix = 'pred'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export function createUnconditional(): UnconditionalPredicateNode {
  return {
    id: generateNodeId('uncond'),
    type: 'unconditional',
  };
}

export function createAbsBefore(epochSeconds: number): AbsBeforePredicateNode {
  const safeSeconds = Math.max(0, Math.floor(epochSeconds));
  return {
    id: generateNodeId('abs'),
    type: 'absBefore',
    epochSeconds: safeSeconds,
    isoDate: new Date(safeSeconds * 1000).toISOString(),
  };
}

export function createRelBefore(durationSeconds: number): RelBeforePredicateNode {
  const safeSeconds = Math.max(0, Math.floor(durationSeconds));
  return {
    id: generateNodeId('rel'),
    type: 'relBefore',
    durationSeconds: safeSeconds,
    formattedDuration: formatDurationSeconds(safeSeconds),
  };
}

export function createAnd(left?: PredicateNode, right?: PredicateNode): AndPredicateNode {
  return {
    id: generateNodeId('and'),
    type: 'and',
    left: left || createUnconditional(),
    right: right || createUnconditional(),
  };
}

export function createOr(left?: PredicateNode, right?: PredicateNode): OrPredicateNode {
  return {
    id: generateNodeId('or'),
    type: 'or',
    left: left || createUnconditional(),
    right: right || createUnconditional(),
  };
}

export function createNot(inner?: PredicateNode): NotPredicateNode {
  return {
    id: generateNodeId('not'),
    type: 'not',
    inner: inner || createUnconditional(),
  };
}

/**
 * Helper to format duration in seconds into human-readable string
 */
export function formatDurationSeconds(seconds: number): string {
  if (seconds === 0) return '0 seconds';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remSeconds = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
  if (remSeconds > 0 && parts.length === 0) parts.push(`${remSeconds} sec${remSeconds > 1 ? 's' : ''}`);

  return parts.join(' ');
}

/**
 * Deep clone a predicate tree with optional new IDs
 */
export function clonePredicateTree(node: PredicateNode, regenerateIds = false): PredicateNode {
  const newId = regenerateIds ? generateNodeId(node.type) : node.id;
  switch (node.type) {
    case 'unconditional':
      return { id: newId, type: 'unconditional' };
    case 'absBefore':
      return {
        id: newId,
        type: 'absBefore',
        epochSeconds: node.epochSeconds,
        isoDate: node.isoDate,
      };
    case 'relBefore':
      return {
        id: newId,
        type: 'relBefore',
        durationSeconds: node.durationSeconds,
        formattedDuration: node.formattedDuration,
      };
    case 'and':
      return {
        id: newId,
        type: 'and',
        left: clonePredicateTree(node.left, regenerateIds),
        right: clonePredicateTree(node.right, regenerateIds),
      };
    case 'or':
      return {
        id: newId,
        type: 'or',
        left: clonePredicateTree(node.left, regenerateIds),
        right: clonePredicateTree(node.right, regenerateIds),
      };
    case 'not':
      return {
        id: newId,
        type: 'not',
        inner: clonePredicateTree(node.inner, regenerateIds),
      };
    default:
      return createUnconditional();
  }
}

/**
 * Calculate max tree depth and total node count
 */
export function getTreeMetrics(node: PredicateNode): { depth: number; count: number } {
  if (!node) return { depth: 0, count: 0 };
  switch (node.type) {
    case 'unconditional':
    case 'absBefore':
    case 'relBefore':
      return { depth: 1, count: 1 };
    case 'not': {
      const inner = getTreeMetrics(node.inner);
      return { depth: inner.depth + 1, count: inner.count + 1 };
    }
    case 'and':
    case 'or': {
      const left = getTreeMetrics(node.left);
      const right = getTreeMetrics(node.right);
      return {
        depth: Math.max(left.depth, right.depth) + 1,
        count: left.count + right.count + 1,
      };
    }
    default:
      return { depth: 1, count: 1 };
  }
}

/**
 * Validate a predicate tree against depth limits, invalid values, and tautologies
 */
export function validatePredicateTree(
  node: PredicateNode,
  maxDepthLimit = 6,
  nowEpochSeconds = Math.floor(Date.now() / 1000)
): PredicateValidationResult {
  const issues: PredicateValidationIssue[] = [];
  const metrics = getTreeMetrics(node);

  if (metrics.depth > maxDepthLimit) {
    issues.push({
      nodeId: node.id,
      code: 'MAX_DEPTH_EXCEEDED',
      message: `Predicate tree depth (${metrics.depth}) exceeds maximum permitted protocol depth (${maxDepthLimit}).`,
      severity: 'error',
    });
  }

  function traverse(n: PredicateNode, depth: number) {
    if (!n) {
      issues.push({
        nodeId: 'unknown',
        code: 'EMPTY_BRANCH',
        message: 'Empty predicate branch found.',
        severity: 'error',
      });
      return;
    }

    switch (n.type) {
      case 'absBefore':
        if (typeof n.epochSeconds !== 'number' || isNaN(n.epochSeconds) || n.epochSeconds < 0) {
          issues.push({
            nodeId: n.id,
            code: 'INVALID_TIMESTAMP',
            message: 'Absolute timestamp must be a valid positive epoch number in seconds.',
            severity: 'error',
          });
        } else if (n.epochSeconds < nowEpochSeconds - 3600) {
          issues.push({
            nodeId: n.id,
            code: 'STALE_PAST_TIMESTAMP',
            message: `Timestamp ${new Date(n.epochSeconds * 1000).toISOString()} is in the past. Claim may never be valid.`,
            severity: 'warning',
          });
        }
        break;

      case 'relBefore':
        if (typeof n.durationSeconds !== 'number' || isNaN(n.durationSeconds) || n.durationSeconds < 0) {
          issues.push({
            nodeId: n.id,
            code: 'NEGATIVE_DURATION',
            message: 'Relative duration must be a non-negative number of seconds.',
            severity: 'error',
          });
        }
        break;

      case 'not':
        if (!n.inner) {
          issues.push({
            nodeId: n.id,
            code: 'EMPTY_BRANCH',
            message: 'NOT predicate requires a valid inner child.',
            severity: 'error',
          });
        } else {
          // Double NOT warning
          if (n.inner.type === 'not') {
            issues.push({
              nodeId: n.id,
              code: 'TAUTOLOGY',
              message: 'Double NOT (NOT NOT) simplifies to the inner condition.',
              severity: 'info',
            });
          }
          traverse(n.inner, depth + 1);
        }
        break;

      case 'and':
      case 'or':
        if (!n.left || !n.right) {
          issues.push({
            nodeId: n.id,
            code: 'EMPTY_BRANCH',
            message: `${n.type.toUpperCase()} node must have both left and right branches.`,
            severity: 'error',
          });
        } else {
          traverse(n.left, depth + 1);
          traverse(n.right, depth + 1);
        }
        break;
    }
  }

  traverse(node, 1);

  const hasErrors = issues.some((i) => i.severity === 'error');
  return {
    isValid: !hasErrors,
    maxDepth: metrics.depth,
    nodeCount: metrics.count,
    issues,
  };
}

/**
 * Generate human-readable explanation of a predicate node
 */
export function explainPredicate(
  node: PredicateNode,
  options?: { timezone?: string; referenceTime?: Date }
): PredicateExplanation {
  const tz = options?.timezone || 'UTC';
  const detailedRules: string[] = [];

  function formatEpoch(sec: number): string {
    const d = new Date(sec * 1000);
    return `${d.toLocaleString('en-US', { timeZone: tz })} (${tz})`;
  }

  function buildSummary(n: PredicateNode, parentType?: string): string {
    switch (n.type) {
      case 'unconditional':
        return 'Can be claimed at any time without restrictions';
      case 'absBefore':
        return `Can only be claimed before ${formatEpoch(n.epochSeconds)}`;
      case 'relBefore':
        return `Can only be claimed within ${formatDurationSeconds(n.durationSeconds)} after balance creation`;
      case 'not': {
        const innerText = buildSummary(n.inner, 'not');
        if (n.inner.type === 'absBefore') {
          return `Can only be claimed AFTER ${formatEpoch(n.inner.epochSeconds)}`;
        }
        if (n.inner.type === 'relBefore') {
          return `Can only be claimed AFTER ${formatDurationSeconds(n.inner.durationSeconds)} from creation`;
        }
        return `Condition NOT (${innerText})`;
      }
      case 'and': {
        const left = buildSummary(n.left, 'and');
        const right = buildSummary(n.right, 'and');
        const str = `${left} AND ${right}`;
        return parentType && parentType !== 'and' ? `(${str})` : str;
      }
      case 'or': {
        const left = buildSummary(n.left, 'or');
        const right = buildSummary(n.right, 'or');
        const str = `${left} OR ${right}`;
        return parentType && parentType !== 'or' ? `(${str})` : str;
      }
      default:
        return 'Custom predicate rule';
    }
  }

  const summary = buildSummary(node);

  // Collect rules
  function collectRules(n: PredicateNode) {
    if (n.type === 'absBefore') {
      detailedRules.push(`Claim deadline: must claim prior to ${formatEpoch(n.epochSeconds)}.`);
    } else if (n.type === 'relBefore') {
      detailedRules.push(`Relative lock: must claim within ${formatDurationSeconds(n.durationSeconds)} of ledger creation.`);
    } else if (n.type === 'not') {
      if (n.inner.type === 'absBefore') {
        detailedRules.push(`Time-lock unlock: becomes eligible strictly after ${formatEpoch(n.inner.epochSeconds)}.`);
      } else if (n.inner.type === 'relBefore') {
        detailedRules.push(`Relative vesting: unlocks after ${formatDurationSeconds(n.inner.durationSeconds)}.`);
      }
      collectRules(n.inner);
    } else if (n.type === 'and' || n.type === 'or') {
      collectRules(n.left);
      collectRules(n.right);
    }
  }

  collectRules(node);

  return {
    summary,
    detailedRules: detailedRules.length > 0 ? detailedRules : ['No time-bound constraints applied.'],
  };
}

/**
 * Evaluate if a predicate tree satisfies conditions at given timestamp and balance creation time
 */
export function evaluatePredicate(
  node: PredicateNode,
  context: {
    currentEpochSeconds: number;
    createdEpochSeconds?: number;
  }
): { isEligible: boolean; reason: string } {
  const now = context.currentEpochSeconds;
  const createdAt = context.createdEpochSeconds || now;

  function evalNode(n: PredicateNode): boolean {
    switch (n.type) {
      case 'unconditional':
        return true;
      case 'absBefore':
        return now < n.epochSeconds;
      case 'relBefore':
        return now - createdAt < n.durationSeconds;
      case 'not':
        return !evalNode(n.inner);
      case 'and':
        return evalNode(n.left) && evalNode(n.right);
      case 'or':
        return evalNode(n.left) || evalNode(n.right);
      default:
        return false;
    }
  }

  const isEligible = evalNode(node);
  return {
    isEligible,
    reason: isEligible
      ? 'All required predicate conditions are currently satisfied.'
      : 'Predicate conditions are not currently met (may be time-locked or expired).',
  };
}

/**
 * Convert Typed PredicateNode AST into StellarSdk.xdr.ClaimPredicate
 */
export function astToClaimPredicate(node: PredicateNode): StellarSdk.xdr.ClaimPredicate {
  switch (node.type) {
    case 'unconditional':
      return StellarSdk.ClaimPredicate.unconditional();

    case 'absBefore':
      return StellarSdk.ClaimPredicate.beforeAbsoluteTime(String(node.epochSeconds));

    case 'relBefore':
      return StellarSdk.ClaimPredicate.beforeRelativeTime(String(node.durationSeconds));

    case 'not':
      return StellarSdk.ClaimPredicate.not(astToClaimPredicate(node.inner));

    case 'and':
      return StellarSdk.ClaimPredicate.and(
        astToClaimPredicate(node.left),
        astToClaimPredicate(node.right)
      );

    case 'or':
      return StellarSdk.ClaimPredicate.or(
        astToClaimPredicate(node.left),
        astToClaimPredicate(node.right)
      );

    default:
      return StellarSdk.ClaimPredicate.unconditional();
  }
}

/**
 * Convert StellarSdk ClaimPredicate or Horizon JSON predicate into typed PredicateNode AST
 */
export function xdrOrJsonToPredicateAst(predicateJsonOrXdr: any): PredicateNode {
  if (!predicateJsonOrXdr) {
    return createUnconditional();
  }

  // Check if it is already an AST node
  if (predicateJsonOrXdr.id && predicateJsonOrXdr.type) {
    return predicateJsonOrXdr as PredicateNode;
  }

  // Horizon JSON format check
  if (predicateJsonOrXdr.unconditional) {
    return createUnconditional();
  }

  if (predicateJsonOrXdr.abs_before || predicateJsonOrXdr.absBefore) {
    const val = predicateJsonOrXdr.abs_before || predicateJsonOrXdr.absBefore;
    // val can be ISO string or integer string
    const epoch = isNaN(Number(val)) ? Math.floor(new Date(val).getTime() / 1000) : Number(val);
    return createAbsBefore(epoch);
  }

  if (predicateJsonOrXdr.rel_before || predicateJsonOrXdr.relBefore) {
    const val = predicateJsonOrXdr.rel_before || predicateJsonOrXdr.relBefore;
    return createRelBefore(Number(val));
  }

  if (predicateJsonOrXdr.not) {
    return createNot(xdrOrJsonToPredicateAst(predicateJsonOrXdr.not));
  }

  if (predicateJsonOrXdr.and && Array.isArray(predicateJsonOrXdr.and)) {
    const [left, right] = predicateJsonOrXdr.and;
    return createAnd(
      xdrOrJsonToPredicateAst(left),
      right ? xdrOrJsonToPredicateAst(right) : createUnconditional()
    );
  }

  if (predicateJsonOrXdr.or && Array.isArray(predicateJsonOrXdr.or)) {
    const [left, right] = predicateJsonOrXdr.or;
    return createOr(
      xdrOrJsonToPredicateAst(left),
      right ? xdrOrJsonToPredicateAst(right) : createUnconditional()
    );
  }

  return createUnconditional();
}

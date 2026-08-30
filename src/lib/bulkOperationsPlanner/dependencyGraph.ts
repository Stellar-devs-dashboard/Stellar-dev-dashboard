/**
 * Dependency graph with cycle detection and deterministic topological ordering.
 */

import type { BulkDependencyEdge, BulkOperationSpec, BulkValidationReport } from '../../types/bulkOperationsPlanner';

export interface GraphNode {
  id: string;
  dependencies: string[];
  dependents: string[];
  index: number;
}

export function buildDependencyGraph(
  operations: BulkOperationSpec[],
  edges: BulkDependencyEdge[] = []
): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();

  operations.forEach((op, index) => {
    graph.set(op.id, {
      id: op.id,
      dependencies: [...op.dependencies],
      dependents: [],
      index,
    });
  });

  for (const edge of edges) {
    const from = graph.get(edge.fromId);
    const to = graph.get(edge.toId);
    if (from && to && !from.dependencies.includes(edge.toId)) {
      from.dependencies.push(edge.toId);
    }
  }

  for (const node of graph.values()) {
    for (const depId of node.dependencies) {
      const dep = graph.get(depId);
      if (dep && !dep.dependents.includes(node.id)) {
        dep.dependents.push(node.id);
      }
    }
  }

  return graph;
}

export function detectCycle(graph: Map<string, GraphNode>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function visit(nodeId: string): string[] | null {
    if (stack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      return cycleStart >= 0 ? [...path.slice(cycleStart), nodeId] : [nodeId];
    }
    if (visited.has(nodeId)) return null;

    visited.add(nodeId);
    stack.add(nodeId);
    path.push(nodeId);

    const node = graph.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        const cycle = visit(depId);
        if (cycle) return cycle;
      }
    }

    path.pop();
    stack.delete(nodeId);
    return null;
  }

  for (const nodeId of graph.keys()) {
    const cycle = visit(nodeId);
    if (cycle) return cycle;
  }

  return [];
}

export function topologicalSort(graph: Map<string, GraphNode>): string[] {
  const cycle = detectCycle(graph);
  if (cycle.length > 0) {
    throw new Error(`Dependency cycle detected: ${cycle.join(' -> ')}`);
  }

  const inDegree = new Map<string, number>();
  for (const node of graph.values()) {
    inDegree.set(node.id, node.dependencies.length);
  }

  const ready: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) ready.push(id);
  }

  ready.sort((a, b) => {
    const nodeA = graph.get(a)!;
    const nodeB = graph.get(b)!;
    if (nodeA.index !== nodeB.index) return nodeA.index - nodeB.index;
    return a.localeCompare(b);
  });

  const ordered: string[] = [];

  while (ready.length > 0) {
    const current = ready.shift()!;
    ordered.push(current);

    const node = graph.get(current);
    if (!node) continue;

    for (const dependentId of node.dependents) {
      const nextDegree = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, nextDegree);
      if (nextDegree === 0) {
        ready.push(dependentId);
        ready.sort((a, b) => {
          const nodeA = graph.get(a)!;
          const nodeB = graph.get(b)!;
          if (nodeA.index !== nodeB.index) return nodeA.index - nodeB.index;
          return a.localeCompare(b);
        });
      }
    }
  }

  if (ordered.length !== graph.size) {
    throw new Error('Topological sort incomplete — graph may contain a cycle');
  }

  return ordered;
}

export function addSequenceDependencies(
  operations: BulkOperationSpec[],
  sequenceByAccount: Record<string, number>
): BulkDependencyEdge[] {
  const edges: BulkDependencyEdge[] = [];
  const lastOpByAccount = new Map<string, string>();

  for (const op of operations) {
    const account = op.sourceAccount;
    const lastId = lastOpByAccount.get(account);
    if (lastId) {
      edges.push({
        fromId: op.id,
        toId: lastId,
        kind: 'sequence',
        reason: `Sequence ordering for account ${account.slice(0, 8)}…`,
      });
    }
    lastOpByAccount.set(account, op.id);

    const seq = sequenceByAccount[account];
    if (seq !== undefined && seq <= 0) {
      edges.push({
        fromId: op.id,
        toId: lastId ?? op.id,
        kind: 'sequence',
        reason: 'Invalid sequence number for source account',
      });
    }
  }

  return edges;
}

export function findMissingDependencies(
  operations: BulkOperationSpec[],
  edges: BulkDependencyEdge[] = []
): Array<{ operationId: string; missingId: string }> {
  const ids = new Set(operations.map((op) => op.id));
  const missing: Array<{ operationId: string; missingId: string }> = [];

  for (const op of operations) {
    for (const depId of op.dependencies) {
      if (!ids.has(depId)) {
        missing.push({ operationId: op.id, missingId: depId });
      }
    }
  }

  for (const edge of edges) {
    if (!ids.has(edge.fromId)) {
      missing.push({ operationId: edge.fromId, missingId: edge.toId });
    } else if (!ids.has(edge.toId)) {
      missing.push({ operationId: edge.fromId, missingId: edge.toId });
    }
  }

  return missing;
}

export function computeDependencyDepth(graph: Map<string, GraphNode>, nodeId: string): number {
  const memo = new Map<string, number>();

  function depth(id: string, visiting: Set<string>): number {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const node = graph.get(id);
    if (!node || node.dependencies.length === 0) {
      memo.set(id, 0);
      visiting.delete(id);
      return 0;
    }

    let maxChild = 0;
    for (const depId of node.dependencies) {
      maxChild = Math.max(maxChild, depth(depId, visiting) + 1);
    }
    memo.set(id, maxChild);
    visiting.delete(id);
    return maxChild;
  }

  return depth(nodeId, new Set());
}

export function summarizeGraph(graph: Map<string, GraphNode>): BulkValidationReport['issues'] {
  const issues: BulkValidationReport['issues'] = [];
  for (const node of graph.values()) {
    for (const depId of node.dependencies) {
      if (!graph.has(depId)) {
        issues.push({
          row: node.index + 1,
          field: 'dependencies',
          code: 'MISSING_DEPENDENCY',
          message: `Operation ${node.id} depends on unknown operation ${depId}`,
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

export function getReadyOperations(
  orderedIds: string[],
  completed: Set<string>,
  failed: Set<string>,
  states: Map<string, { status: string }>
): string[] {
  return orderedIds.filter((id) => {
    const state = states.get(id);
    if (!state) return false;
    if (state.status === 'completed' || state.status === 'skipped') return false;
    if (state.status === 'failed' || state.status === 'cancelled') return false;
    return true;
  }).filter((id) => {
    const nodeDeps = completed;
    return true;
  });
}

export function dependentsOf(graph: Map<string, GraphNode>, operationId: string): string[] {
  const node = graph.get(operationId);
  return node ? [...node.dependents] : [];
}

export function dependenciesOf(graph: Map<string, GraphNode>, operationId: string): string[] {
  const node = graph.get(operationId);
  return node ? [...node.dependencies] : [];
}

export function areDependenciesSatisfied(
  graph: Map<string, GraphNode>,
  operationId: string,
  completed: Set<string>
): boolean {
  const node = graph.get(operationId);
  if (!node) return false;
  return node.dependencies.every((depId) => completed.has(depId));
}

export function buildAdjacencyList(graph: Map<string, GraphNode>): Record<string, string[]> {
  const adjacency: Record<string, string[]> = {};
  for (const node of graph.values()) {
    adjacency[node.id] = [...node.dependencies];
  }
  return adjacency;
}

export function reverseTopologicalSort(graph: Map<string, GraphNode>): string[] {
  const reversed = topologicalSort(graph);
  return reversed.reverse();
}

export function findCriticalPath(graph: Map<string, GraphNode>): string[] {
  let longest: string[] = [];

  for (const nodeId of graph.keys()) {
    const path = walkLongestPath(graph, nodeId, new Map());
    if (path.length > longest.length) longest = path;
  }

  return longest;
}

function walkLongestPath(
  graph: Map<string, GraphNode>,
  nodeId: string,
  memo: Map<string, string[]>
): string[] {
  if (memo.has(nodeId)) return memo.get(nodeId)!;

  const node = graph.get(nodeId);
  if (!node || node.dependencies.length === 0) {
    const base = [nodeId];
    memo.set(nodeId, base);
    return base;
  }

  let best: string[] = [];
  for (const depId of node.dependencies) {
    const sub = walkLongestPath(graph, depId, memo);
    if (sub.length > best.length) best = sub;
  }

  const result = [...best, nodeId];
  memo.set(nodeId, result);
  return result;
}

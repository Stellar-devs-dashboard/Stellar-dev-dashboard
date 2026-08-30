import { describe, it, expect } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  createUnconditional,
  createAbsBefore,
  createRelBefore,
  createAnd,
  createOr,
  createNot,
  getTreeMetrics,
  validatePredicateTree,
  explainPredicate,
  evaluatePredicate,
  astToClaimPredicate,
  xdrOrJsonToPredicateAst,
} from '../predicateTree';

describe('Predicate AST & Logic Engine', () => {
  it('creates basic predicate nodes', () => {
    const uncond = createUnconditional();
    expect(uncond.type).toBe('unconditional');
    expect(uncond.id).toBeTruthy();

    const abs = createAbsBefore(1800000000);
    expect(abs.type).toBe('absBefore');
    expect(abs.epochSeconds).toBe(1800000000);

    const rel = createRelBefore(86400);
    expect(rel.type).toBe('relBefore');
    expect(rel.durationSeconds).toBe(86400);
  });

  it('measures tree depth and node count correctly', () => {
    const simple = createUnconditional();
    expect(getTreeMetrics(simple)).toEqual({ depth: 1, count: 1 });

    const complex = createAnd(
      createNot(createAbsBefore(1700000000)),
      createOr(createRelBefore(3600), createUnconditional())
    );
    // Tree structure:
    // AND (depth 3)
    //   Left: NOT -> AbsBefore (depth 2)
    //   Right: OR -> RelBefore, Unconditional (depth 2)
    const metrics = getTreeMetrics(complex);
    expect(metrics.depth).toBe(3);
    expect(metrics.count).toBe(6);
  });

  it('validates depth limits', () => {
    let deepNode = createUnconditional();
    for (let i = 0; i < 8; i++) {
      deepNode = createNot(deepNode) as any;
    }
    const result = validatePredicateTree(deepNode, 6);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MAX_DEPTH_EXCEEDED')).toBe(true);
  });

  it('generates human readable explanations', () => {
    const timelock = createNot(createRelBefore(86400));
    const explanation = explainPredicate(timelock);
    expect(explanation.summary).toContain('Can only be claimed AFTER 1 day');
  });

  it('evaluates eligibility correctly given timestamps', () => {
    const futureEpoch = 1900000000;
    const now = 1800000000;

    const absNode = createAbsBefore(futureEpoch);
    const evalBefore = evaluatePredicate(absNode, { currentEpochSeconds: now });
    expect(evalBefore.isEligible).toBe(true);

    const evalAfter = evaluatePredicate(absNode, { currentEpochSeconds: futureEpoch + 100 });
    expect(evalAfter.isEligible).toBe(false);
  });

  it('converts to and from Stellar SDK ClaimPredicate', () => {
    const node = createAnd(
      createAbsBefore(1800000000),
      createRelBefore(3600)
    );
    const sdkPredicate = astToClaimPredicate(node);
    expect(sdkPredicate).toBeDefined();

    // Round-trip test from JSON
    const horizonJson = {
      and: [
        { abs_before: '1800000000' },
        { rel_before: '3600' },
      ],
    };
    const reconstructed = xdrOrJsonToPredicateAst(horizonJson);
    expect(reconstructed.type).toBe('and');
  });
});

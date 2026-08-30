/**
 * Demo fixtures for offline bulk operations planner flows and E2E tests.
 */

import type { BulkManifest, BulkOperationSpec } from '../../types/bulkOperationsPlanner';
import { buildManifest } from './planner';
import { buildOperationSpec } from './validation';

export const DEMO_SOURCE_ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
export const DEMO_VENDOR_A = 'GBLOBGCLOGBLOGBCLOGBLOGBCLOGBLOGBCLOGBLOGBCLOGBLOGBCLAA';
export const DEMO_VENDOR_B = 'GVENDVENDVENDVENDVENDVENDVENDVENDVENDVENDVENDVENDVENAAA';

export const DEMO_CSV_PAYMENTS = [
  'id,label,family,sourceAccount,destination,amount,assetCode,assetIssuer,memo,dependencies,tags',
  `pay-vendor-a,Vendor A stipend,payment,${DEMO_SOURCE_ACCOUNT},${DEMO_VENDOR_A},25,XLM,,Monthly vendor A,,vendors`,
  `pay-vendor-b,Vendor B stipend,payment,${DEMO_SOURCE_ACCOUNT},${DEMO_VENDOR_B},15,XLM,,Monthly vendor B,pay-vendor-a,vendors`,
  `trust-demo,Ensure trustline,changeTrust,${DEMO_SOURCE_ACCOUNT},,,DEMO,${DEMO_VENDOR_A},,,assets`,
].join('\n');

export function buildDemoOperations(): BulkOperationSpec[] {
  const now = new Date().toISOString();
  return [
    buildOperationSpec({
      id: 'demo-pay-1',
      label: 'Treasury payout A',
      family: 'payment',
      sourceAccount: DEMO_SOURCE_ACCOUNT,
      params: {
        destination: DEMO_VENDOR_A,
        amount: '10',
        asset: { code: 'XLM', type: 'native' },
        memo: 'Demo payout',
      },
      tags: ['demo', 'payroll'],
    }),
    buildOperationSpec({
      id: 'demo-pay-2',
      label: 'Treasury payout B',
      family: 'payment',
      sourceAccount: DEMO_SOURCE_ACCOUNT,
      dependencies: ['demo-pay-1'],
      params: {
        destination: DEMO_VENDOR_B,
        amount: '5',
        asset: { code: 'XLM', type: 'native' },
      },
      tags: ['demo', 'payroll'],
    }),
    buildOperationSpec({
      id: 'demo-trust-1',
      label: 'Add DEMO trustline',
      family: 'changeTrust',
      sourceAccount: DEMO_SOURCE_ACCOUNT,
      dependencies: ['demo-pay-2'],
      params: {
        asset: { code: 'DEMO', issuer: DEMO_VENDOR_A, type: 'credit_alphanum4' },
        limit: '1000000',
      },
      tags: ['demo', 'trust'],
    }),
    buildOperationSpec({
      id: 'demo-data-1',
      label: 'Write reconciliation marker',
      family: 'manageData',
      sourceAccount: DEMO_SOURCE_ACCOUNT,
      dependencies: ['demo-trust-1'],
      params: {
        name: 'bulk_demo_marker',
        value: 'ready',
        action: 'set',
      },
      tags: ['demo'],
    }),
  ].map((op) => ({ ...op, createdAt: now, updatedAt: now }));
}

export async function buildDemoManifest(): Promise<BulkManifest> {
  const operations = buildDemoOperations();
  return buildManifest({
    id: 'demo-bulk-manifest',
    name: 'Demo bulk payroll manifest',
    description: 'Deterministic demo manifest for offline simulation and E2E tests',
    network: 'testnet',
    sourceAccount: DEMO_SOURCE_ACCOUNT,
    operations,
    edges: [
      { fromId: 'demo-pay-2', toId: 'demo-pay-1', kind: 'hard', reason: 'Vendor B after Vendor A' },
      { fromId: 'demo-trust-1', toId: 'demo-pay-2', kind: 'soft', reason: 'Trustline after payouts' },
    ],
    tags: ['demo', 'offline'],
  });
}

export function buildLargeDemoOperations(count: number): BulkOperationSpec[] {
  const operations: BulkOperationSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    operations.push(
      buildOperationSpec({
        id: `demo-bulk-${i + 1}`,
        label: `Synthetic payment ${i + 1}`,
        family: 'payment',
        sourceAccount: DEMO_SOURCE_ACCOUNT,
        dependencies: i === 0 ? [] : [`demo-bulk-${i}`],
        params: {
          destination: i % 2 === 0 ? DEMO_VENDOR_A : DEMO_VENDOR_B,
          amount: String(1 + (i % 10)),
          asset: { code: 'XLM', type: 'native' },
        },
        tags: ['demo', 'synthetic'],
      })
    );
  }
  return operations;
}

export async function buildStressManifest(operationCount = 120): Promise<BulkManifest> {
  return buildManifest({
    id: 'demo-stress-manifest',
    name: 'Stress test manifest',
    description: 'Large manifest to exercise packing and checkpointing',
    network: 'testnet',
    sourceAccount: DEMO_SOURCE_ACCOUNT,
    operations: buildLargeDemoOperations(operationCount),
    tags: ['demo', 'stress'],
  });
}

export const DEMO_SEQUENCE_NUMBERS: Record<string, number> = {
  [DEMO_SOURCE_ACCOUNT]: 1_000_001,
};

/**
 * Deterministic fixture data used two ways: (1) as the graceful fallback
 * when live ledger data can't be reached (mirrors `fraudDetection`'s
 * `state: 'simulation'` pattern), and (2) as the basis for unit/E2E test
 * expectations. Every value here is fixed — no randomness, no current-time
 * dependence beyond the caller-supplied `now`.
 */

import type { LedgerPosting, ReconciliationPeriod } from '../../types/treasury';
import { NATIVE_ASSET } from '../../types/treasury';

const CREDIT_ASSET = { kind: 'credit' as const, code: 'USDC:GDEMOISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', issuer: 'GDEMOISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', decimals: 7 };

export function buildDemoPeriod(accountId: string, network: string, start: string, end: string): ReconciliationPeriod {
  return {
    id: `${accountId}:${start}:${end}`,
    accountId,
    network,
    start,
    end,
    status: 'open',
    createdAt: `${start}T00:00:00Z`,
  };
}

export function buildDemoPostings(period: ReconciliationPeriod): LedgerPosting[] {
  const day = period.start.slice(0, 10);
  return [
    {
      id: 'demo-pay-1',
      txHash: 'demo-tx-1',
      operationId: 'demo-op-1',
      ledger: 1000001,
      timestamp: `${day}T09:00:00Z`,
      kind: 'payment',
      asset: NATIVE_ASSET,
      amount: '500.0000000',
      counterparty: 'GDEMOCOUNTERPARTYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      category: undefined,
      successful: true,
      provenance: { sourceType: 'operation', sourceId: 'demo-op-1' },
    },
    {
      id: 'demo-fee-1',
      txHash: 'demo-tx-1',
      ledger: 1000001,
      timestamp: `${day}T09:00:00Z`,
      kind: 'fee',
      asset: NATIVE_ASSET,
      amount: '-0.0000100',
      successful: true,
      provenance: { sourceType: 'transaction-fee', sourceId: 'demo-tx-1' },
    },
    {
      id: 'demo-payment-2',
      txHash: 'demo-tx-2',
      operationId: 'demo-op-2',
      ledger: 1000050,
      timestamp: `${day}T14:30:00Z`,
      kind: 'payment',
      asset: CREDIT_ASSET,
      amount: '-120.5000000',
      counterparty: 'GDEMOVENDORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      memo: 'invoice-2024-001',
      successful: true,
      provenance: { sourceType: 'operation', sourceId: 'demo-op-2' },
    },
    {
      id: 'demo-trade-1',
      txHash: 'demo-tx-3',
      operationId: 'demo-trade-op-1',
      ledger: 1000075,
      timestamp: `${day}T16:00:00Z`,
      kind: 'trade',
      asset: NATIVE_ASSET,
      amount: '-50.0000000',
      counterparty: 'GDEMOTRADERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      successful: true,
      provenance: { sourceType: 'trade', sourceId: 'demo-trade-op-1' },
    },
    {
      id: 'demo-trade-2',
      txHash: 'demo-tx-3',
      operationId: 'demo-trade-op-1',
      ledger: 1000075,
      timestamp: `${day}T16:00:00Z`,
      kind: 'trade',
      asset: CREDIT_ASSET,
      amount: '25.0000000',
      counterparty: 'GDEMOTRADERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      successful: true,
      provenance: { sourceType: 'trade', sourceId: 'demo-trade-op-1' },
    },
    {
      id: 'demo-contract-transfer-1',
      txHash: 'demo-tx-4',
      operationId: 'demo-op-4',
      ledger: 1000090,
      timestamp: `${day}T18:00:00Z`,
      kind: 'contract_transfer',
      asset: { kind: 'contract', code: 'DEMOTOKEN', decimals: 7 },
      amount: '-10.0000000',
      counterparty: 'CDEMOCONTRACTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      successful: true,
      provenance: { sourceType: 'operation', sourceId: 'demo-op-4', note: 'balance-change:transfer' },
    },
  ];
}

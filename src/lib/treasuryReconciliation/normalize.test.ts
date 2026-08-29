import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeEffects,
  normalizeOperations,
  normalizeTrades,
  normalizeTransactionFees,
  resetPostingIdSequence,
} from './normalize';

const ACCOUNT = 'GACCOUNTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const COUNTERPARTY = 'GCOUNTERPARTYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ISSUER = 'GISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

beforeEach(() => {
  resetPostingIdSequence();
});

function op(overrides: Record<string, unknown>) {
  return {
    id: 'op-1',
    paging_token: 'op-1',
    source_account: ACCOUNT,
    created_at: '2024-01-15T10:00:00Z',
    transaction_hash: 'tx-1',
    transaction_successful: true,
    ...overrides,
  } as unknown as Parameters<typeof normalizeOperations>[1][number];
}

describe('normalizeOperations — payments', () => {
  it('records an outgoing payment as a negative amount', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({ type: 'payment', from: ACCOUNT, to: COUNTERPARTY, amount: '100.0000000', asset_type: 'native' }),
    ]);
    expect(posting.kind).toBe('payment');
    expect(posting.amount).toBe('-100.0000000');
    expect(posting.counterparty).toBe(COUNTERPARTY);
    expect(posting.provenance).toEqual({ sourceType: 'operation', sourceId: 'op-1' });
  });

  it('records an incoming payment as a positive amount', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({ type: 'payment', from: COUNTERPARTY, to: ACCOUNT, amount: '50.0000000', asset_type: 'native' }),
    ]);
    expect(posting.amount).toBe('50.0000000');
    expect(posting.counterparty).toBe(COUNTERPARTY);
  });

  it('groups a credit asset by code:issuer', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({ type: 'payment', from: ACCOUNT, to: COUNTERPARTY, amount: '10', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER }),
    ]);
    expect(posting.asset.code).toBe(`USDC:${ISSUER}`);
    expect(posting.asset.kind).toBe('credit');
  });

  it('marks a posting from a failed transaction as unsuccessful', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({ type: 'payment', from: ACCOUNT, to: COUNTERPARTY, amount: '1', asset_type: 'native', transaction_successful: false }),
    ]);
    expect(posting.successful).toBe(false);
  });
});

describe('normalizeOperations — path payments', () => {
  it('normalizes path_payment_strict_send as an outflow for the sender', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({ type: 'path_payment_strict_send', from: ACCOUNT, to: COUNTERPARTY, amount: '20', asset_type: 'native' }),
    ]);
    expect(posting.kind).toBe('path_payment');
    expect(posting.amount).toBe('-20');
  });

  it('normalizes path_payment_strict_receive as an inflow for the receiver', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({ type: 'path_payment_strict_receive', from: COUNTERPARTY, to: ACCOUNT, amount: '15', asset_type: 'native' }),
    ]);
    expect(posting.amount).toBe('15');
  });
});

describe('normalizeOperations — claimable balances', () => {
  it('records create_claimable_balance as an outflow', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({ type: 'create_claimable_balance', asset: 'native', amount: '30', claimants: [{ destination: COUNTERPARTY }] }),
    ]);
    expect(posting.kind).toBe('claimable_balance_create');
    expect(posting.amount).toBe('-30');
    expect(posting.counterparty).toBe(COUNTERPARTY);
  });

  it('flags a bare claim_claimable_balance operation for review (amount resolved via effects)', () => {
    const [posting] = normalizeOperations(ACCOUNT, [op({ type: 'claim_claimable_balance', balance_id: 'bal-1', claimant: ACCOUNT })]);
    expect(posting.kind).toBe('claimable_balance_claim');
    expect(posting.amount).toBe('0');
    expect(posting.needsReview).toBe(true);
  });
});

describe('normalizeOperations — sponsorship', () => {
  it('normalizes begin_sponsoring_future_reserves as a zero-amount marker with the sponsored account as counterparty', () => {
    const [posting] = normalizeOperations(ACCOUNT, [op({ type: 'begin_sponsoring_future_reserves', sponsored_id: COUNTERPARTY })]);
    expect(posting.kind).toBe('sponsorship');
    expect(posting.amount).toBe('0');
    expect(posting.counterparty).toBe(COUNTERPARTY);
  });
});

describe('normalizeOperations — contract transfers', () => {
  it('normalizes an outgoing SAC transfer from asset_balance_changes', () => {
    const [posting] = normalizeOperations(ACCOUNT, [
      op({
        type: 'invoke_host_function',
        asset_balance_changes: [
          { type: 'transfer', from: ACCOUNT, to: COUNTERPARTY, amount: '5.5000000', asset_type: 'native' },
        ],
      }),
    ]);
    expect(posting.kind).toBe('contract_transfer');
    expect(posting.amount).toBe('-5.5000000');
  });

  it('ignores invoke_host_function calls that do not touch this account', () => {
    const postings = normalizeOperations(ACCOUNT, [
      op({
        type: 'invoke_host_function',
        asset_balance_changes: [
          { type: 'transfer', from: COUNTERPARTY, to: ISSUER, amount: '1', asset_type: 'native' },
        ],
      }),
    ]);
    expect(postings).toHaveLength(0);
  });

  it('ignores balance-change entries that are not transfer/mint/burn/clawback', () => {
    const postings = normalizeOperations(ACCOUNT, [
      op({
        type: 'invoke_host_function',
        asset_balance_changes: [{ type: 'unknown_kind', from: ACCOUNT, to: COUNTERPARTY, amount: '1', asset_type: 'native' }],
      }),
    ]);
    expect(postings).toHaveLength(0);
  });
});

describe('normalizeOperations — account changes', () => {
  it('records create_account funding as an outflow for the funder', () => {
    const [posting] = normalizeOperations(ACCOUNT, [op({ type: 'create_account', account: COUNTERPARTY, funder: ACCOUNT, starting_balance: '2' })]);
    expect(posting.amount).toBe('-2');
    expect(posting.counterparty).toBe(COUNTERPARTY);
  });

  it('ignores operation types with no traceable balance effect (e.g. manage_sell_offer)', () => {
    const postings = normalizeOperations(ACCOUNT, [op({ type: 'manage_sell_offer' })]);
    expect(postings).toHaveLength(0);
  });
});

describe('normalizeTransactionFees', () => {
  function tx(overrides: Record<string, unknown>) {
    return {
      hash: 'tx-1',
      ledger_attr: 500,
      created_at: '2024-01-15T10:00:00Z',
      source_account: ACCOUNT,
      fee_charged: '100',
      successful: true,
      ...overrides,
    } as unknown as Parameters<typeof normalizeTransactionFees>[1][number];
  }

  it('converts stroops fee_charged into a negative 7-decimal amount', () => {
    const [posting] = normalizeTransactionFees(ACCOUNT, [tx({})]);
    expect(posting.kind).toBe('fee');
    expect(posting.amount).toBe('-0.0000100');
    expect(posting.ledger).toBe(500);
  });

  it('flags the fee posting for review when the transaction failed', () => {
    const [posting] = normalizeTransactionFees(ACCOUNT, [tx({ successful: false })]);
    expect(posting.needsReview).toBe(true);
    expect(posting.reviewReason).toMatch(/failed transaction/i);
  });

  it('skips transactions not sourced by this account', () => {
    const postings = normalizeTransactionFees(ACCOUNT, [tx({ source_account: COUNTERPARTY })]);
    expect(postings).toHaveLength(0);
  });

  it('skips zero-fee transactions', () => {
    const postings = normalizeTransactionFees(ACCOUNT, [tx({ fee_charged: '0' })]);
    expect(postings).toHaveLength(0);
  });
});

describe('normalizeTrades', () => {
  function trade(overrides: Record<string, unknown>) {
    return {
      id: 'trade-1',
      paging_token: 'trade-1',
      ledger_close_time: '2024-01-15T12:00:00Z',
      base_account: ACCOUNT,
      base_amount: '10',
      base_asset_type: 'native',
      counter_account: COUNTERPARTY,
      counter_amount: '5',
      counter_asset_type: 'credit_alphanum4',
      counter_asset_code: 'USDC',
      counter_asset_issuer: ISSUER,
      base_is_seller: true,
      ...overrides,
    } as unknown as Parameters<typeof normalizeTrades>[1][number];
  }

  it('emits two legs for an account trading as the base/seller: an outflow of the sold asset and an inflow of the bought asset', () => {
    const postings = normalizeTrades(ACCOUNT, [trade({})]);
    expect(postings).toHaveLength(2);
    const sold = postings.find((p) => p.asset.kind === 'native');
    const bought = postings.find((p) => p.asset.kind === 'credit');
    expect(sold?.amount).toBe('-10');
    expect(bought?.amount).toBe('5');
  });

  it('flips direction when the account is the counter side and a buyer', () => {
    const postings = normalizeTrades(ACCOUNT, [
      trade({ base_account: COUNTERPARTY, counter_account: ACCOUNT, base_is_seller: false }),
    ]);
    const nativeLeg = postings.find((p) => p.asset.kind === 'native');
    const creditLeg = postings.find((p) => p.asset.kind === 'credit');
    // base_is_seller=false means the counter side (this account) sold the counter asset.
    expect(creditLeg?.amount).toBe('-5');
    expect(nativeLeg?.amount).toBe('10');
  });

  it('ignores trades that do not involve this account', () => {
    const postings = normalizeTrades(ACCOUNT, [trade({ base_account: COUNTERPARTY, counter_account: ISSUER })]);
    expect(postings).toHaveLength(0);
  });

  it('every trade posting is marked successful and carries trade provenance', () => {
    const postings = normalizeTrades(ACCOUNT, [trade({})]);
    for (const posting of postings) {
      expect(posting.successful).toBe(true);
      expect(posting.provenance.sourceType).toBe('trade');
    }
  });
});

describe('normalizeEffects', () => {
  function effect(overrides: Record<string, unknown>) {
    return {
      id: 'eff-1',
      paging_token: 'eff-1',
      account: ACCOUNT,
      created_at: '2024-01-15T13:00:00Z',
      ...overrides,
    } as unknown as Parameters<typeof normalizeEffects>[1][number];
  }

  it('normalizes a sponsorship effect into a zero-amount posting with the sponsor as counterparty', () => {
    const [posting] = normalizeEffects(ACCOUNT, [effect({ type: 'account_sponsorship_created', sponsor: COUNTERPARTY })]);
    expect(posting.kind).toBe('sponsorship');
    expect(posting.counterparty).toBe(COUNTERPARTY);
  });

  it('normalizes a claimable_balance_claimed effect with its real amount and asset', () => {
    const [posting] = normalizeEffects(ACCOUNT, [
      effect({ type: 'claimable_balance_claimed', amount: '77.5000000', asset_type: 'native' }),
    ]);
    expect(posting.kind).toBe('claimable_balance_claim');
    expect(posting.amount).toBe('77.5000000');
    expect(posting.needsReview).toBeUndefined();
  });

  it('ignores effects for a different account', () => {
    const postings = normalizeEffects(ACCOUNT, [effect({ account: COUNTERPARTY, type: 'account_sponsorship_created' })]);
    expect(postings).toHaveLength(0);
  });

  it('ignores effect types outside the sponsorship/claim allowlist', () => {
    const postings = normalizeEffects(ACCOUNT, [effect({ type: 'signer_created' })]);
    expect(postings).toHaveLength(0);
  });
});

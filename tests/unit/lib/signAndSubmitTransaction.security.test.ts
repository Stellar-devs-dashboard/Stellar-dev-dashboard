import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import { SecretKeyHandle } from '../../../src/lib/SecretKeyHandle';
import { signAndSubmitTransaction } from '../../../src/lib/transactionBuilder';

const recordCustomMetric = vi.fn();
const measureAsync = vi.fn(async (_name, fn) => fn());
const submitTransaction = vi.fn();

vi.mock('../../../src/lib/performanceMonitoring', () => ({
  recordCustomMetric: (...args: unknown[]) => recordCustomMetric(...args),
  measureAsync: (...args: unknown[]) => measureAsync(...args),
}));

vi.mock('../../../src/lib/stellar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/stellar')>();
  return {
    ...actual,
    getServer: () => ({
      submitTransaction,
    }),
  };
});

function collectSerialized(values: unknown[]): string {
  return JSON.stringify(values);
}

describe('signAndSubmitTransaction security', () => {
  const source = StellarSdk.Keypair.random();
  const secret = source.secret();

  beforeEach(() => {
    vi.clearAllMocks();
    submitTransaction.mockResolvedValue({
      hash: 'deadbeef',
      ledger: 42,
      successful: true,
    });
  });

  it('does not leak the secret key in the returned result or metrics metadata', async () => {
    const account = new StellarSdk.Account(source.publicKey(), '1');
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: StellarSdk.Keypair.random().publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(180)
      .build();

    const handle = SecretKeyHandle.fromSecret(secret);
    let result: { hash: string; ledger: number; successful: boolean };

    try {
      result = await signAndSubmitTransaction(transaction, handle, 'testnet');
    } finally {
      handle.destroy();
    }

    expect(result).toEqual({
      hash: 'deadbeef',
      ledger: 42,
      successful: true,
    });

    const serialized = collectSerialized([
      result,
      ...recordCustomMetric.mock.calls,
      ...measureAsync.mock.calls,
    ]);

    expect(serialized).not.toContain(secret);
    expect(Object.keys(result).sort()).toEqual(['hash', 'ledger', 'successful']);
  });

  it('rejects plain-string secret keys', async () => {
    const account = new StellarSdk.Account(source.publicKey(), '1');
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: StellarSdk.Keypair.random().publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(180)
      .build();

    await expect(
      signAndSubmitTransaction(transaction, secret as unknown as SecretKeyHandle, 'testnet'),
    ).rejects.toThrow('SecretKeyHandle');
  });
});

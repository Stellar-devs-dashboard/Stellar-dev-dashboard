import { describe, expect, it } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import { SecretKeyHandle } from '../../../src/lib/SecretKeyHandle';

describe('SecretKeyHandle', () => {
  it('zeroes the secret buffer immediately after Keypair derivation', () => {
    const keypair = StellarSdk.Keypair.random();
    const handle = SecretKeyHandle.fromSecret(keypair.secret());

    expect(handle.isBufferCleared()).toBe(false);

    const derived = handle.getKeypair();
    expect(derived.publicKey()).toBe(keypair.publicKey());
    expect(handle.isBufferCleared()).toBe(true);
  });

  it('rejects invalid secret seeds at construction', () => {
    expect(() => SecretKeyHandle.fromSecret('not-a-valid-secret')).toThrow(
      'Invalid secret key',
    );
  });

  it('cannot be used after destroy()', () => {
    const handle = SecretKeyHandle.fromSecret(StellarSdk.Keypair.random().secret());
    handle.getKeypair();
    handle.destroy();

    expect(() => handle.getKeypair()).toThrow('destroyed');
  });
});

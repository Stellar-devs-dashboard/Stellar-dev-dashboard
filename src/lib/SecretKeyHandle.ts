import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * Holds a Stellar secret seed in a mutable byte buffer that is zeroed after the
 * Keypair is derived. The raw secret string is never exposed after construction.
 */
export class SecretKeyHandle {
  private buffer: Uint8Array | null;
  private keypair: StellarSdk.Keypair | null = null;
  private destroyed = false;

  private constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }

  static fromSecret(secretKey: string): SecretKeyHandle {
    const trimmed = secretKey.trim();
    if (!StellarSdk.StrKey.isValidEd25519SecretSeed(trimmed)) {
      throw new Error('Invalid secret key');
    }
    return new SecretKeyHandle(new TextEncoder().encode(trimmed));
  }

  /** Derive the Keypair once, then zero the underlying secret buffer. */
  getKeypair(): StellarSdk.Keypair {
    if (this.destroyed) {
      throw new Error('Secret key handle has been destroyed');
    }
    if (!this.keypair) {
      if (!this.buffer) {
        throw new Error('Secret material is unavailable');
      }
      const secret = new TextDecoder().decode(this.buffer);
      this.keypair = StellarSdk.Keypair.fromSecret(secret);
      this.zeroBuffer();
    }
    return this.keypair;
  }

  destroy(): void {
    this.zeroBuffer();
    this.keypair = null;
    this.destroyed = true;
  }

  /** @internal Test helper — true after destroy() or once buffer is zeroed post-derivation. */
  isBufferCleared(): boolean {
    return this.buffer === null;
  }

  private zeroBuffer(): void {
    if (this.buffer) {
      this.buffer.fill(0);
      this.buffer = null;
    }
  }
}

/**
 * LOBSTR Wallet connector for Stellar.
 */

import * as StellarSdk from '@stellar/stellar-sdk';

const LOBSTR_EXTENSION_KEY = 'lobstrWalletConnect';
const SEP7_CALLBACK_STORAGE_KEY = 'lobstr-sep7-pending-xdr';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getLobstrWallet(): WalletExtensionApi | undefined {
  return window[LOBSTR_EXTENSION_KEY] as WalletExtensionApi | undefined;
}

export function isLobstrInstalled(): boolean {
  return typeof window !== 'undefined' && typeof getLobstrWallet() !== 'undefined';
}

export async function connectLobstr(): Promise<{ publicKey: string; mode: 'extension' | 'sep7' }> {
  const lobstrWallet = getLobstrWallet();
  if (lobstrWallet) {
    try {
      const result = await lobstrWallet.connect();
      if (!result?.publicKey) throw new Error('LOBSTR did not return a public key.');
      return { publicKey: result.publicKey, mode: 'extension' };
    } catch (error) {
      throw new Error(`LOBSTR extension connection failed: ${errorMessage(error)}`);
    }
  }

  throw new Error(
    'LOBSTR browser extension not found. On mobile, enter your public key above and ' +
    'connect in watch-only mode — signing will open the LOBSTR app automatically.'
  );
}

export async function signTransactionWithLobstr(
  xdr: string,
  network: 'PUBLIC' | 'TESTNET' = 'TESTNET'
): Promise<string> {
  const lobstrWallet = getLobstrWallet();
  if (lobstrWallet?.signXDR) {
    try {
      const result = await lobstrWallet.signXDR(xdr, { network });
      if (typeof result === 'object' && result && 'error' in result && result.error) {
        throw new Error(String(result.error));
      }
      if (typeof result === 'object' && result && 'signedXDR' in result && result.signedXDR) {
        return String(result.signedXDR);
      }
      return String(result);
    } catch (error) {
      throw new Error(`LOBSTR signing failed: ${errorMessage(error)}`);
    }
  }
  return signWithSEP7(xdr, network);
}

export function signWithSEP7(
  xdr: string,
  network: 'PUBLIC' | 'TESTNET' = 'TESTNET'
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('SEP-0007 signing requires a browser environment.');
  }

  try {
    sessionStorage.setItem(SEP7_CALLBACK_STORAGE_KEY, xdr);
  } catch {
    // sessionStorage unavailable — continue anyway
  }

  const networkParam = network === 'PUBLIC' ? 'public' : 'testnet';
  const encodedXdr = encodeURIComponent(xdr);
  const callbackUrl = encodeURIComponent(window.location.href);

  const sep7Uri =
    `web+stellar:tx?xdr=${encodedXdr}` +
    `&network_passphrase=${encodeURIComponent(
      network === 'PUBLIC'
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015'
    )}` +
    `&callback=url:${callbackUrl}`;

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = sep7Uri;
  } else {
    const labUrl =
      `https://laboratory.stellar.org/#txsigner?xdr=${encodedXdr}&network=${networkParam}`;
    window.open(labUrl, '_blank', 'noopener,noreferrer');
  }

  return Promise.resolve('SEP7_PENDING');
}

export function buildSocialRecoveryConfig(guardianPublicKeys: string[], threshold = 1) {
  if (!Array.isArray(guardianPublicKeys) || guardianPublicKeys.length === 0) {
    throw new Error('At least one guardian public key is required.');
  }
  if (threshold < 1 || threshold > guardianPublicKeys.length) {
    throw new Error(`Threshold must be between 1 and ${guardianPublicKeys.length}.`);
  }

  const signers = guardianPublicKeys.map((key) => ({
    publicKey: key,
    weight: 1,
    type: 'ed25519PublicKey',
  }));

  return {
    signers,
    thresholds: {
      low: threshold,
      med: threshold,
      high: threshold,
    },
    recoveryMode: 'social',
    guardianCount: guardianPublicKeys.length,
    threshold,
  };
}

export function readPendingSEP7Xdr(): string | null {
  try {
    return sessionStorage.getItem(SEP7_CALLBACK_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function clearPendingSEP7Xdr(): void {
  try {
    sessionStorage.removeItem(SEP7_CALLBACK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { StellarSdk };

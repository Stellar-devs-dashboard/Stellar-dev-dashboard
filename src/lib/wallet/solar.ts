/**
 * Solar Wallet connector for Stellar.
 */

const SOLAR_EXTENSION_KEY = 'solarWallet';
const SEP7_PENDING_KEY = 'solar-sep7-pending-xdr';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getSolarWallet(): WalletExtensionApi | undefined {
  return window[SOLAR_EXTENSION_KEY] as WalletExtensionApi | undefined;
}

export function isSolarInstalled(): boolean {
  return typeof window !== 'undefined' && typeof getSolarWallet() !== 'undefined';
}

export async function connectSolar(): Promise<{ publicKey: string; mode: 'extension' | 'sep7' }> {
  const solarWallet = getSolarWallet();
  if (solarWallet) {
    try {
      const result = await solarWallet.connect();
      if (!result?.publicKey) throw new Error('Solar did not return a public key.');
      return { publicKey: result.publicKey, mode: 'extension' };
    } catch (error) {
      throw new Error(`Solar extension connection failed: ${errorMessage(error)}`);
    }
  }

  throw new Error(
    'Solar extension not found. On mobile, enter your public key and connect in ' +
    'watch-only mode — signing will open the Solar app automatically.'
  );
}

export async function signTransactionWithSolar(
  xdr: string,
  network: 'PUBLIC' | 'TESTNET' = 'TESTNET'
): Promise<string> {
  const solarWallet = getSolarWallet();
  if (solarWallet?.signXDR) {
    try {
      const result = await solarWallet.signXDR(xdr, { network });
      if (typeof result === 'object' && result && 'error' in result && result.error) {
        throw new Error(String(result.error));
      }
      if (typeof result === 'object' && result && 'signedXDR' in result && result.signedXDR) {
        return String(result.signedXDR);
      }
      return String(result);
    } catch (error) {
      throw new Error(`Solar signing failed: ${errorMessage(error)}`);
    }
  }
  return signWithSolarSEP7(xdr, network);
}

export function signWithSolarSEP7(
  xdr: string,
  network: 'PUBLIC' | 'TESTNET' = 'TESTNET'
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('SEP-0007 signing requires a browser environment.');
  }

  try {
    sessionStorage.setItem(SEP7_PENDING_KEY, xdr);
  } catch {
    // ignore
  }

  const networkPassphrase =
    network === 'PUBLIC'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';

  const sep7Uri =
    `web+stellar:tx?xdr=${encodeURIComponent(xdr)}` +
    `&network_passphrase=${encodeURIComponent(networkPassphrase)}` +
    `&callback=url:${encodeURIComponent(window.location.href)}`;

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = sep7Uri;
  } else {
    const labNetwork = network === 'PUBLIC' ? 'public' : 'testnet';
    window.open(
      `https://laboratory.stellar.org/#txsigner?xdr=${encodeURIComponent(xdr)}&network=${labNetwork}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  return Promise.resolve('SEP7_PENDING');
}

export function readPendingSolarXdr(): string | null {
  try {
    return sessionStorage.getItem(SEP7_PENDING_KEY) || null;
  } catch {
    return null;
  }
}

export function clearPendingSolarXdr(): void {
  try {
    sessionStorage.removeItem(SEP7_PENDING_KEY);
  } catch {
    // ignore
  }
}

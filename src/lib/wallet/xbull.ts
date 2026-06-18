/**
 * xBull Wallet connector for Stellar.
 */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isXBullInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.xBullWalletConnect !== 'undefined';
}

export async function connectXBull(): Promise<{ publicKey: string }> {
  if (isXBullInstalled()) {
    try {
      const result = await window.xBullWalletConnect!.connect();
      if (!result?.publicKey) {
        throw new Error('xBull did not return a public key.');
      }
      return { publicKey: result.publicKey };
    } catch (error) {
      throw new Error(`xBull connection failed: ${errorMessage(error)}`);
    }
  }

  try {
    const mod = (await new Function('s', 'return import(s)')(
      '@creit.tech/xbull-wallet-connect'
    )) as {
      XBullWalletConnect: new () => { connect: () => Promise<string> };
    };
    const { XBullWalletConnect } = mod;
    const xbull = new XBullWalletConnect();
    const publicKey = await xbull.connect();
    if (!publicKey) throw new Error('xBull connector did not return a public key.');
    return { publicKey };
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes('@creit.tech')) {
      throw new Error(
        'xBull wallet is not installed and the connector library is missing. ' +
        'Install xBull from https://xbull.app or run: npm install @creit.tech/xbull-wallet-connect'
      );
    }
    throw new Error(`xBull connection failed: ${message}`);
  }
}

export async function signTransactionWithXBull(
  xdr: string,
  network = 'TESTNET'
): Promise<string> {
  if (isXBullInstalled()) {
    try {
      const result = await window.xBullWalletConnect!.signXDR(xdr, { network });
      if (typeof result === 'object' && result && 'error' in result && result.error) {
        throw new Error(String(result.error));
      }
      if (typeof result === 'object' && result && 'signedXDR' in result && result.signedXDR) {
        return String(result.signedXDR);
      }
      return String(result);
    } catch (error) {
      throw new Error(`xBull signing failed: ${errorMessage(error)}`);
    }
  }

  try {
    const mod = (await new Function('s', 'return import(s)')(
      '@creit.tech/xbull-wallet-connect'
    )) as {
      XBullWalletConnect: new () => { sign: (params: { xdr: string; network: string }) => Promise<string> };
    };
    const { XBullWalletConnect } = mod;
    const xbull = new XBullWalletConnect();
    return await xbull.sign({ xdr, network });
  } catch (error) {
    throw new Error(`xBull signing failed: ${errorMessage(error)}`);
  }
}

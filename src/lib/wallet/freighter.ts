/**
 * Freighter wallet connector for Stellar.
 */

const FREIGHTER_API_URL = 'https://cdn.jsdelivr.net/npm/@stellar/freighter-api/dist/index.min.js';

let freighterApi: FreighterApi | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getFreighterApi(): Promise<FreighterApi | null> {
  if (freighterApi) return freighterApi;
  if (typeof window !== 'undefined' && window.freighterApi) {
    freighterApi = window.freighterApi;
    return freighterApi;
  }
  return null;
}

export async function isFreighterInstalled(): Promise<boolean> {
  const api = await getFreighterApi();
  if (!api) return false;
  try {
    const result = await api.isConnected();
    return result.isConnected === true;
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<{ publicKey: string | undefined; network: string }> {
  const api = await getFreighterApi();
  if (!api) {
    throw new Error('Freighter wallet extension is not installed. Please install it from https://freighter.app');
  }

  try {
    const accessResult = await api.requestAccess();
    if (accessResult.error) {
      throw new Error(accessResult.error);
    }

    const addressResult = await api.getAddress();
    if (addressResult.error) {
      throw new Error(addressResult.error);
    }

    const networkResult = await api.getNetwork();

    return {
      publicKey: addressResult.address,
      network: networkResult.network || 'TESTNET',
    };
  } catch (error) {
    throw new Error(`Freighter connection failed: ${errorMessage(error)}`);
  }
}

export async function signTransactionWithFreighter(
  xdr: string,
  network = 'TESTNET'
): Promise<string> {
  const api = await getFreighterApi();
  if (!api) {
    throw new Error('Freighter wallet is not available');
  }

  try {
    const result = await api.signTransaction(xdr, { network });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.signedTxXdr || String(result);
  } catch (error) {
    throw new Error(`Transaction signing failed: ${errorMessage(error)}`);
  }
}

export async function getFreighterNetwork(): Promise<string | null> {
  const api = await getFreighterApi();
  if (!api) return null;
  try {
    const result = await api.getNetwork();
    return result.network || null;
  } catch {
    return null;
  }
}

export { FREIGHTER_API_URL };

/**
 * WalletConnect v2 connector for Stellar.
 */

const WC_PROJECT_ID = 'YOUR_WALLETCONNECT_PROJECT_ID';
const STELLAR_NAMESPACE = 'stellar';
const STELLAR_CHAIN_MAINNET = 'stellar:pubnet';
const STELLAR_CHAIN_TESTNET = 'stellar:testnet';

interface WCSession {
  topic: string;
  namespaces?: Record<string, { accounts?: string[] }>;
}

interface WCModal {
  openModal: (opts: { uri: string }) => void;
  closeModal: () => void;
}

interface WCClient {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  connect: (opts: {
    requiredNamespaces: Record<string, { methods: string[]; chains: string[]; events: string[] }>;
  }) => Promise<{ uri?: string; approval: () => Promise<WCSession> }>;
  request: (opts: { topic: string; chainId: string; request: { method: string; params: Record<string, string> } }) => Promise<unknown>;
  disconnect: (opts: { topic: string; reason: { code: number; message: string } }) => Promise<void>;
  session: { get: (topic: string) => WCSession };
}

let _wcClient: WCClient | null = null;
let _wcSession: WCSession | null = null;
let _wcModal: WCModal | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function dynamicImport<T>(specifier: string): Promise<T> {
  try {
    return await new Function('s', 'return import(s)')(specifier) as Promise<T>;
  } catch {
    throw new Error(
      `Optional dependency "${specifier}" is not installed. ` +
      `Run: npm install @walletconnect/sign-client @walletconnect/modal`
    );
  }
}

export function getActiveWCSession(): WCSession | null {
  return _wcSession;
}

export function clearWCSession(): void {
  _wcSession = null;
  _wcClient = null;
}

export async function connectWalletConnect(
  network: 'mainnet' | 'testnet' = 'testnet'
): Promise<{ publicKey: string; session: WCSession }> {
  const chain = network === 'mainnet' ? STELLAR_CHAIN_MAINNET : STELLAR_CHAIN_TESTNET;

  const { SignClient } = await dynamicImport<{ SignClient: { init: (opts: Record<string, unknown>) => Promise<WCClient> } }>(
    '@walletconnect/sign-client'
  );
  const { WalletConnectModal } = await dynamicImport<{ WalletConnectModal: new (opts: Record<string, unknown>) => WCModal }>(
    '@walletconnect/modal'
  );

  _wcClient = await SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: {
      name: 'Stellar Dev Dashboard',
      description: 'Stellar network development dashboard',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
      icons: ['https://stellar.org/favicon.ico'],
    },
  });

  _wcModal = new WalletConnectModal({
    projectId: WC_PROJECT_ID,
    chains: [chain],
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    const done = (err: Error | null, value?: { publicKey: string; session: WCSession }) => {
      if (settled) return;
      settled = true;
      _wcModal?.closeModal();
      if (err) reject(err);
      else resolve(value!);
    };

    _wcClient!.on('session_update', (...args: unknown[]) => {
      const { topic, params } = args[0] as { topic: string; params: { namespaces: WCSession['namespaces'] } };
      const { namespaces } = params;
      const currentSession = _wcClient!.session.get(topic);
      _wcSession = { ...currentSession, namespaces };
    });

    _wcClient!.on('session_delete', () => {
      clearWCSession();
    });

    _wcClient!
      .connect({
        requiredNamespaces: {
          [STELLAR_NAMESPACE]: {
            methods: ['stellar_signXDR', 'stellar_getPublicKey'],
            chains: [chain],
            events: [],
          },
        },
      })
      .then(({ uri, approval }) => {
        if (uri) {
          _wcModal!.openModal({ uri });
        }
        return approval();
      })
      .then((session) => {
        _wcSession = session;
        const accounts = session.namespaces?.[STELLAR_NAMESPACE]?.accounts ?? [];
        if (!accounts.length) {
          return done(new Error('No accounts returned from WalletConnect session.'));
        }
        const publicKey = accounts[0].split(':')[2];
        if (!publicKey) {
          return done(new Error('Could not parse public key from WalletConnect session.'));
        }
        done(null, { publicKey, session });
      })
      .catch((err: unknown) => {
        done(new Error(`WalletConnect connection failed: ${errorMessage(err)}`));
      });
  });
}

export async function signXdrWithWalletConnect(
  xdr: string,
  network: 'mainnet' | 'testnet' = 'testnet'
): Promise<string> {
  if (!_wcClient || !_wcSession) {
    throw new Error('WalletConnect session not active. Please reconnect.');
  }

  const chain = network === 'mainnet' ? STELLAR_CHAIN_MAINNET : STELLAR_CHAIN_TESTNET;

  try {
    const result = await _wcClient.request({
      topic: _wcSession.topic,
      chainId: chain,
      request: {
        method: 'stellar_signXDR',
        params: { xdr },
      },
    });

    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      const shaped = result as { signedXDR?: string; signedTxXdr?: string };
      if (shaped.signedXDR) return shaped.signedXDR;
      if (shaped.signedTxXdr) return shaped.signedTxXdr;
    }
    throw new Error('Unexpected response shape from WalletConnect wallet.');
  } catch (error) {
    const shaped = error as { code?: number; message?: string };
    if (shaped.code === 5000 || shaped.message?.toLowerCase().includes('rejected')) {
      throw new Error('Transaction rejected by the mobile wallet.');
    }
    throw new Error(`WalletConnect signing failed: ${errorMessage(error)}`);
  }
}

export async function disconnectWalletConnect(): Promise<void> {
  if (_wcClient && _wcSession) {
    try {
      await _wcClient.disconnect({
        topic: _wcSession.topic,
        reason: { code: 6000, message: 'User disconnected' },
      });
    } catch {
      // Already disconnected
    }
  }
  clearWCSession();
}

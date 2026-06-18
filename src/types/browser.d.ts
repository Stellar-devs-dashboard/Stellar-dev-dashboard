interface FreighterApi {
  isConnected(): Promise<{ isConnected: boolean }>;
  requestAccess(): Promise<{ error?: string }>;
  getAddress(): Promise<{ error?: string; address?: string }>;
  getNetwork(): Promise<{ network?: string }>;
  signTransaction(
    xdr: string,
    opts: { network: string }
  ): Promise<{ error?: string; signedTxXdr?: string }>;
}

interface XBullWalletConnect {
  connect(): Promise<{ publicKey?: string }>;
  signXDR(
    xdr: string,
    opts: { network: string }
  ): Promise<{ error?: string; signedXDR?: string } | string>;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ServiceWorkerRegistration {
  readonly sync?: SyncManager;
}

interface WalletExtensionApi {
  connect(): Promise<{ publicKey?: string; error?: string }>;
  signXDR?(
    xdr: string,
    opts: { network: string }
  ): Promise<{ error?: string; signedXDR?: string } | string>;
}

interface Window {
  freighterApi?: FreighterApi;
  xBullWalletConnect?: XBullWalletConnect;
  solarWallet?: WalletExtensionApi;
  lobstrWalletConnect?: WalletExtensionApi;
  [key: string]: unknown;
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  glob(
    pattern: string,
    options?: { eager?: boolean }
  ): Record<string, () => Promise<Record<string, unknown>>>;
}

interface Navigator {
  usb?: object;
  hid?: object;
}

interface Performance {
  memory?: PerformanceMemory;
}

interface NotificationOptions {
  vibrate?: number | number[];
}

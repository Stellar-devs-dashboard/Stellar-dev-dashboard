/**
 * Ledger hardware wallet connector for Stellar.
 */

import * as StellarSdk from '@stellar/stellar-sdk';

const LEDGER_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const;

const DERIVATION_PATH = "44'/148'/0'";

type LedgerStatus = (typeof LEDGER_STATUS)[keyof typeof LEDGER_STATUS];

interface LedgerTransport {
  close: () => void;
}

interface StellarLedgerApp {
  getPublicKey: (path: string) => Promise<{ publicKey: string }>;
  signTransaction: (path: string, signatureBase: string) => Promise<{ signature: Buffer | Uint8Array }>;
}

let ledgerStatus: LedgerStatus = LEDGER_STATUS.DISCONNECTED;
let _activeStellarApp: StellarLedgerApp | null = null;
let _activePublicKey: string | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function signatureBaseToLedgerPayload(signatureBase: Buffer | Uint8Array | string): string {
  if (typeof signatureBase === 'string') return signatureBase;
  return Buffer.from(signatureBase).toString('hex');
}

export function getActiveLedgerSession(): {
  stellarApp: StellarLedgerApp | null;
  publicKey: string | null;
} {
  return { stellarApp: _activeStellarApp, publicKey: _activePublicKey };
}

export function clearLedgerSession(): void {
  _activeStellarApp = null;
  _activePublicKey = null;
}

export function getLedgerStatus(): LedgerStatus {
  return ledgerStatus;
}

export async function isLedgerSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.usb !== 'undefined' || typeof navigator.hid !== 'undefined';
}

async function dynamicImport<T>(specifier: string): Promise<T> {
  try {
    return await new Function('s', 'return import(s)')(specifier) as Promise<T>;
  } catch {
    throw new Error(
      `Optional dependency "${specifier}" is not installed. ` +
      `Run: npm install @ledgerhq/hw-transport-webusb @stellar/ledger`
    );
  }
}

export async function connectLedger(derivationPath = DERIVATION_PATH): Promise<{
  publicKey: string;
  transport: LedgerTransport;
  stellarApp: StellarLedgerApp;
  derivationPath: string;
}> {
  const supported = await isLedgerSupported();
  if (!supported) {
    throw new Error(
      'WebUSB/WebHID is not supported in this browser. ' +
      'Please use Chrome or a Chromium-based browser.'
    );
  }

  ledgerStatus = LEDGER_STATUS.CONNECTING;

  try {
    try {
      const TransportWebUSB = (await dynamicImport<{ default: { create: () => Promise<LedgerTransport> } }>(
        '@ledgerhq/hw-transport-webusb'
      )).default;
      const transport = await TransportWebUSB.create();
      return await _finishConnect(transport, derivationPath);
    } catch {
      const TransportWebHID = (await dynamicImport<{ default: { create: () => Promise<LedgerTransport> } }>(
        '@ledgerhq/hw-transport-webhid'
      )).default;
      const transport = await TransportWebHID.create();
      return await _finishConnect(transport, derivationPath);
    }
  } catch (error) {
    ledgerStatus = LEDGER_STATUS.ERROR;
    throw new Error(`Ledger connection failed: ${errorMessage(error)}`);
  }
}

async function _finishConnect(
  transport: LedgerTransport,
  derivationPath = DERIVATION_PATH
): Promise<{
  publicKey: string;
  transport: LedgerTransport;
  stellarApp: StellarLedgerApp;
  derivationPath: string;
}> {
  let StellarLedger: new (transport: LedgerTransport) => StellarLedgerApp;
  try {
    StellarLedger = (await dynamicImport<{ default: new (transport: LedgerTransport) => StellarLedgerApp }>(
      '@stellar/ledger'
    )).default;
  } catch (err) {
    transport.close();
    throw err;
  }

  const stellarApp = new StellarLedger(transport);
  const result = await stellarApp.getPublicKey(derivationPath);

  ledgerStatus = LEDGER_STATUS.CONNECTED;
  _activeStellarApp = stellarApp;
  _activePublicKey = result.publicKey;

  return {
    publicKey: result.publicKey,
    transport,
    stellarApp,
    derivationPath,
  };
}

export async function signTransactionWithLedger(
  transaction: StellarSdk.Transaction,
  stellarApp: StellarLedgerApp
): Promise<Buffer | Uint8Array> {
  if (!stellarApp) {
    throw new Error('Ledger is not connected. Connect the device first.');
  }

  try {
    const result = await stellarApp.signTransaction(
      DERIVATION_PATH,
      signatureBaseToLedgerPayload(transaction.signatureBase())
    );
    return result.signature;
  } catch (error) {
    throw new Error(`Ledger signing failed: ${errorMessage(error)}`);
  }
}

export async function signXdrWithLedger(
  xdr: string,
  networkPassphrase: string,
  stellarApp: StellarLedgerApp,
  publicKey: string
): Promise<string> {
  if (!stellarApp) {
    throw new Error('Ledger is not connected. Connect the device first.');
  }

  if (!xdr || !xdr.trim()) {
    throw new Error('Transaction XDR is required.');
  }

  let parsed: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction;
  try {
    parsed = StellarSdk.TransactionBuilder.fromXDR(xdr.trim(), networkPassphrase);
  } catch {
    throw new Error('Invalid transaction XDR. Make sure you pasted the full unsigned envelope.');
  }

  const txToSign =
    parsed instanceof StellarSdk.FeeBumpTransaction
      ? parsed.innerTransaction
      : parsed;

  let signatureBytes: Buffer | Uint8Array;
  try {
    const result = await stellarApp.signTransaction(
      DERIVATION_PATH,
      signatureBaseToLedgerPayload(txToSign.signatureBase())
    );
    signatureBytes = result.signature;
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes('0x6985') || message.toLowerCase().includes('denied')) {
      throw new Error('Transaction was rejected on the Ledger device.');
    }
    if (message.includes('0x6b0c') || message.toLowerCase().includes('locked')) {
      throw new Error('Ledger device is locked. Unlock it and open the Stellar app.');
    }
    if (message.includes('0x6d00') || message.toLowerCase().includes('not open')) {
      throw new Error('Stellar app is not open on the Ledger device.');
    }
    throw new Error(`Ledger signing failed: ${message}`);
  }

  const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
  txToSign.addSignature(keypair.publicKey(), signatureBytes.toString('base64'));

  return txToSign.toEnvelope().toXDR('base64');
}

export function disconnectLedger(transport: LedgerTransport | null | undefined): void {
  if (transport) {
    try {
      transport.close();
    } catch {
      // Already closed
    }
  }
  _activeStellarApp = null;
  _activePublicKey = null;
  ledgerStatus = LEDGER_STATUS.DISCONNECTED;
}

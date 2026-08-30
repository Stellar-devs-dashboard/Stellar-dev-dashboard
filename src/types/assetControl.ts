/**
 * Asset Issuance & Trustline Administration — Domain Types
 *
 * Covers issuer state, trustline authorization, clawback, flag management,
 * reserve modelling, and serialisation contracts.
 *
 * All persistent/exported JSON shapes carry a `schemaVersion` for
 * forward-compatible migration.
 */

// ─── Schema Version ──────────────────────────────────────────────────────────

/** Current schema version for persisted/exported artefacts. */
export const ASSET_CONTROL_SCHEMA_VERSION = 1 as const;

// ─── Account Flags ───────────────────────────────────────────────────────────

/** Stellar account flags (SET_OPTIONS operation). */
export interface AccountFlags {
  authRequired: boolean;
  authRevocable: boolean;
  authImmutable: boolean;
  authClawbackEnabled: boolean;
}

/** Which flags should be set/cleared in one operation. */
export interface FlagChangeRequest {
  setFlags?: Partial<AccountFlags>;
  clearFlags?: Partial<AccountFlags>;
}

/** Identifies why a flag change is dangerous or blocked. */
export interface FlagRisk {
  flag: keyof AccountFlags;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  irreversible: boolean;
}

// ─── Issuer & Distributor ────────────────────────────────────────────────────

/** Signer weight configuration for readiness checks. */
export interface SignerWeights {
  masterWeight: number;
  lowThreshold: number;
  medThreshold: number;
  highThreshold: number;
}

/** Summary of an issuer account's readiness. */
export interface IssuerReadiness {
  /** Can we issue assets from this account right now? */
  ready: boolean;
  /** Individual check results (always populated). */
  checks: ReadinessCheck[];
}

export interface ReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'error';
  detail: string;
}

/** Full view of the issuer account used by the control center. */
export interface IssuerState {
  address: string;
  flags: AccountFlags;
  signers: SignerWeights;
  homeDomain: string | null;
  balances: AssetBalance[];
  reserves: ReserveState;
  /** Detected risks with the current configuration. */
  risks: FlagRisk[];
}

/** A distributor account that receives issued supply. */
export interface DistributorInfo {
  address: string;
  hasTrustline: boolean;
  balance: string;
  limit: string;
}

// ─── Assets ──────────────────────────────────────────────────────────────────

/** Unique identifier for a Stellar asset (native XLM has no issuer). */
export interface AssetIdentifier {
  code: string;
  issuer: string;
}

/** Balance entry from Horizon. */
export interface AssetBalance {
  assetCode: string;
  assetIssuer: string;
  balance: string;
  limit?: string;
  isAuthorized?: boolean;
  isAuthorizedToMaintainLiabilities?: boolean;
  isClawbackEnabled?: boolean;
}

/** Minimal holder entry for the asset-holder table. */
export interface AssetHolder {
  address: string;
  balance: string;
  limit: string;
  authorized: boolean;
  authorizedToMaintainLiabilities: boolean;
  lastModified: number;
}

// ─── Trustline ───────────────────────────────────────────────────────────────

export type TrustlineAuthState =
  | 'authorized'
  | 'authorized_to_maintain_liabilities'
  | 'deauthorized';

export interface TrustlineModel {
  holderAddress: string;
  asset: AssetIdentifier;
  balance: string;
  limit: string;
  authState: TrustlineAuthState;
  isClawbackEnabled: boolean;
  lastModifiedLedger: number;
}

export interface TrustlineChangeRequest {
  holderAddress: string;
  asset: AssetIdentifier;
  targetState: TrustlineAuthState;
}

// ─── Clawback ────────────────────────────────────────────────────────────────

export interface ClawbackRequest {
  from: string;
  asset: AssetIdentifier;
  amount: string;
}

export interface ClawbackResult {
  success: boolean;
  hash?: string;
  error?: string;
  clawedAmount: string;
  remainingBalance: string;
}

// ─── Issuance ────────────────────────────────────────────────────────────────

export interface IssuanceRequest {
  destination: string;
  asset: AssetIdentifier;
  amount: string;
  memo?: string;
}

export interface IssuanceResult {
  success: boolean;
  hash?: string;
  error?: string;
  issuedAmount: string;
}

// ─── Reserve Calculations ────────────────────────────────────────────────────

export interface ReserveState {
  baseReserve: string;
  /** Total XLM needed to keep the account alive. */
  requiredReserve: string;
  /** XLM available for operations. */
  availableBalance: string;
  /** Number of entries consuming reserves. */
  subentryCount: number;
}

// ─── Operation Envelope (for offline / hardware signing) ─────────────────────

export interface OperationEnvelope {
  /** Schema version for forward compatibility. */
  schemaVersion: typeof ASSET_CONTROL_SCHEMA_VERSION;
  /** ISO-8601 timestamp of envelope creation. */
  createdAt: string;
  /** Base-64 encoded XDR of the unsigned transaction. */
  xdr: string;
  /** Human-readable summary for review. */
  summary: OperationSummary;
  /** Required signers to submit (public keys). */
  requiredSigners: string[];
  /** Network passphrase the tx was built against. */
  networkPassphrase: string;
  /** Sequence number sourced from this account. */
  sourceAccount: string;
}

export interface OperationSummary {
  type: OperationType;
  description: string;
  /** Warnings about irreversible / dangerous effects. */
  warnings: string[];
  /** Fields to display, with any sensitive values already redacted. */
  fields: Record<string, string>;
}

export type OperationType =
  | 'set_flags'
  | 'clear_flags'
  | 'change_trust'
  | 'allow_trust'
  | 'set_trust_line_flags'
  | 'payment'
  | 'clawback'
  | 'lock_issuer';

// ─── Audit Export ────────────────────────────────────────────────────────────

export interface AssetControlAuditEntry {
  schemaVersion: typeof ASSET_CONTROL_SCHEMA_VERSION;
  timestamp: string;
  operationType: OperationType;
  actor: string;
  target: string;
  asset: AssetIdentifier;
  detail: Record<string, string>;
  txHash?: string;
  success: boolean;
}

export interface AssetControlExport {
  schemaVersion: typeof ASSET_CONTROL_SCHEMA_VERSION;
  exportedAt: string;
  entries: AssetControlAuditEntry[];
}

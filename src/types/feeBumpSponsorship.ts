/**
 * TypeScript definitions and models for Fee-Bump and Sponsored-Transaction Composition Studio.
 */

export type SponsorshipOperationType =
  | 'beginSponsoringFutureReserves'
  | 'endSponsoringFutureReserves'
  | 'revokeSponsorship'
  | 'payment'
  | 'createAccount'
  | 'changeTrust'
  | 'manageData'
  | 'manageSellOffer'
  | 'manageBuyOffer'
  | 'createClaimableBalance'
  | 'claimClaimableBalance'
  | 'setOptions';

export type RevokeTargetType =
  | 'account'
  | 'trustline'
  | 'offer'
  | 'data'
  | 'claimableBalance'
  | 'signer';

export interface RevokeSponsorshipParams {
  type: RevokeTargetType;
  account?: string;
  assetCode?: string;
  assetIssuer?: string;
  offerId?: string;
  dataName?: string;
  claimableBalanceId?: string;
  signerKey?: string;
}

export interface SponsoredOperationEntry {
  id: string;
  type: SponsorshipOperationType;
  params: Record<string, any>;
  sourceAccount?: string;
  sponsorId?: string;
  isSponsored?: boolean;
}

export interface SponsorshipBoundary {
  id: string;
  sponsor: string;
  sponsoredAccount: string;
  startIndex: number;
  endIndex: number;
  operations: SponsoredOperationEntry[];
  isValid: boolean;
  validationError?: string;
}

export interface InnerTransactionModel {
  sourceAccount: string;
  sequenceNumber: string;
  baseFee: string;
  memo?: {
    type: 'text' | 'id' | 'hash' | 'return' | 'none';
    value: string;
  };
  timeBounds?: {
    minTime?: string;
    maxTime?: string;
  };
  operations: SponsoredOperationEntry[];
  signatures: Array<{
    publicKey: string;
    signatureHex: string;
  }>;
}

export interface FeeBumpEnvelopeModel {
  isFeeBump: boolean;
  feeSource: string;
  maxFee: string;
  innerTransaction: InnerTransactionModel;
  outerSignatures: Array<{
    publicKey: string;
    signatureHex: string;
  }>;
}

export interface ReserveImpactItem {
  entryType: 'account' | 'trustline' | 'offer' | 'data' | 'claimableBalance' | 'signer';
  name: string;
  reserveAmountXLM: number;
  responsibleAccount: string; // Sponsor if sponsored, else source
  isSponsored: boolean;
}

export interface ReserveRequirementBreakdown {
  baseReservePerEntry: number; // 0.5 XLM
  totalEntriesCount: number;
  totalReserveRequiredXLM: number;
  sponsorObligations: Record<
    string,
    {
      sponsorAddress: string;
      sponsoredEntriesCount: number;
      totalReserveXLM: number;
      availableBalanceXLM?: number;
      isSufficient: boolean;
    }
  >;
  impactItems: ReserveImpactItem[];
}

export interface SignerRequirement {
  account: string;
  role: 'inner_source' | 'operation_source' | 'fee_source' | 'sponsor' | 'revokee';
  requiredWeight: number;
  availableWeight: number;
  signers: Array<{
    key: string;
    weight: number;
    hasSigned: boolean;
  }>;
  isSatisfied: boolean;
}

export interface FeeBumpSimulationResult {
  success: boolean;
  simulatedLedger: number;
  estimatedFeeCharged: string;
  cpuInstructionsUsed?: number;
  memoryBytesUsed?: number;
  signerRequirements: SignerRequirement[];
  reserveBreakdown: ReserveRequirementBreakdown;
  xdrEnvelope: string;
  warnings: string[];
  error?: string;
}

export interface PostLedgerVerificationRecord {
  txHash: string;
  ledgerSequence: number;
  feeSourceCharged: string;
  actualFeePaid: string;
  innerTxSuccess: boolean;
  sponsorshipsEstablished: number;
  sponsorshipsRevoked: number;
  verifiedAt: string;
}

export interface FeeBumpTemplate {
  id: string;
  name: string;
  description: string;
  category: 'onboarding' | 'sponsored_trustline' | 'fee_delegation' | 'sponsorship_revocation' | 'custom';
  envelope: FeeBumpEnvelopeModel;
  version: string;
  createdAt: string;
  tags: string[];
}

export interface FeeBumpExportPayload {
  schemaVersion: '1.0.0';
  exportedAt: string;
  templates: FeeBumpTemplate[];
}

export const MANIFEST_SCHEMA_VERSION = 1 as const
export const ATTESTATION_SCHEMA_VERSION = 1 as const

export interface RepositoryRef {
  url: string
  commit: string
  subdir: string | null
}

export interface ToolchainRef {
  rustc: string
  cargo: string
  sorobanCli: string | null
  target: string
}

export interface VerificationManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION
  id: string
  contractId: string
  network: string
  repository: RepositoryRef
  toolchain: ToolchainRef
  features: string[]
  lockfileHash: string | null
  buildCommand: string
  expectedWasmHash: string
  createdAt: string
  notes: string | null
}

export interface ValidationIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

export type WasmSectionKind = 'standard' | 'custom'

export interface WasmSection {
  id: number
  kind: WasmSectionKind
  name: string
  sizeBytes: number
  sectionHash: string
  deterministic: boolean
}

export interface NormalizedWasmArtifact {
  sourceLabel: string
  totalBytes: number
  normalizedBytes: number
  rawHash: string
  normalizedHash: string
  sections: WasmSection[]
  strippedSectionNames: string[]
}

export type SectionDiffStatus = 'match' | 'added' | 'removed' | 'content-changed'

export interface SectionDiffEntry {
  key: string
  name: string
  status: SectionDiffStatus
  candidateSizeBytes: number | null
  onChainSizeBytes: number | null
}

export interface DiffResult {
  rawHashMatch: boolean
  normalizedHashMatch: boolean
  sections: SectionDiffEntry[]
  summary: string
}

export interface DependencyRecord {
  name: string
  version: string
  source: string | null
  checksum: string | null
}

export interface DependencyInventory {
  packageCount: number
  dependencies: DependencyRecord[]
  parseWarnings: string[]
}

export type BuildWorkerRequestStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'rejected'

export interface BuildWorkerResult {
  status: BuildWorkerRequestStatus
  wasmBase64: string | null
  logs: string[]
  durationMs: number
  workerOrigin: string
  simulated: boolean
  error: string | null
}

export interface SourceCandidate {
  id: string
  label: string
  manifest: VerificationManifest
  artifact: NormalizedWasmArtifact | null
  buildResult: BuildWorkerResult | null
  diff: DiffResult | null
  createdAt: string
}

export type VerificationStatus = 'unverified' | 'match' | 'mismatch' | 'error'

export interface Attestation {
  schemaVersion: typeof ATTESTATION_SCHEMA_VERSION
  id: string
  contractId: string
  network: string
  manifestId: string
  candidateLabel: string
  normalizedHash: string
  rawHash: string
  onChainHash: string
  status: VerificationStatus
  generatedAt: string
  payloadHash: string
  signature: string
  publicKeyJwk: JsonWebKey
}

export interface AttestationVerificationResult {
  valid: boolean
  reasons: string[]
}

export interface VerificationRecord {
  id: string
  contractId: string
  network: string
  manifest: VerificationManifest
  status: VerificationStatus
  diff: DiffResult | null
  attestation: Attestation | null
  onChainHash: string | null
  createdAt: string
}

export interface WasmVerificationApiError {
  code:
    | 'invalid-contract'
    | 'not-found'
    | 'not-wasm'
    | 'timeout'
    | 'unavailable'
    | 'origin-rejected'
    | 'oversized'
    | 'aborted'
  message: string
  retryable: boolean
}

export { normalizeWasm, compareArtifacts, WasmParseError, MAX_WASM_BYTES, NON_DETERMINISTIC_SECTION_NAMES } from './wasm'
export { validateManifest, parseManifestJson, createEmptyManifestDraft, MAX_MANIFEST_JSON_BYTES } from './manifest'
export { parseCargoLock, MAX_LOCKFILE_BYTES } from './dependencies'
export {
  generateAttestation,
  verifyAttestation,
  exportAttestationJson,
  canonicalStringify,
  resetSessionKeyPairForTests,
} from './attestation'
export type { AttestationInput } from './attestation'
export { requestBuild, simulateBuild, DEFAULT_TIMEOUT_MS, MAX_RESPONSE_BYTES } from './buildWorker'
export type { BuildWorkerConfig } from './buildWorker'
export { fetchOnChainWasm, OnChainFetchError } from './onChain'
export type { OnChainWasmResult } from './onChain'
export {
  saveVerificationRecord,
  getVerificationRecords,
  deleteVerificationRecord,
  clearAllVerificationRecords,
} from './records'
export { redactSecrets, redactLogLines } from './redaction'

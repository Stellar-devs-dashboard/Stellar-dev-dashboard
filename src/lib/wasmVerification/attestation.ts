import { ATTESTATION_SCHEMA_VERSION } from '../../types/wasmVerification'
import type { Attestation, AttestationVerificationResult, VerificationStatus } from '../../types/wasmVerification'

const SIGN_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const

let sessionKeyPair: CryptoKeyPair | null = null

/**
 * Lazily generates one non-extractable-private-key ECDSA keypair per browser
 * session. This proves "this browser session observed X" — it is explicitly
 * NOT a trusted third-party signature, a code audit, or proof of identity.
 * See docs/wasm-verification.md for the threat model.
 */
async function getSessionKeyPair(): Promise<CryptoKeyPair> {
  if (sessionKeyPair) return sessionKeyPair
  sessionKeyPair = (await crypto.subtle.generateKey(SIGN_ALGORITHM, true, ['sign', 'verify'])) as CryptoKeyPair
  return sessionKeyPair
}

/** Resets the session attestation key. Exposed for tests; not used by the UI. */
export function resetSessionKeyPairForTests(): void {
  sessionKeyPair = null
}

/** Deterministic JSON stringification (recursively sorted keys) so the same payload always hashes/signs identically. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface AttestationInput {
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
}

function attestationPayload(input: AttestationInput): Record<string, unknown> {
  return {
    schemaVersion: ATTESTATION_SCHEMA_VERSION,
    id: input.id,
    contractId: input.contractId,
    network: input.network,
    manifestId: input.manifestId,
    candidateLabel: input.candidateLabel,
    normalizedHash: input.normalizedHash,
    rawHash: input.rawHash,
    onChainHash: input.onChainHash,
    status: input.status,
    generatedAt: input.generatedAt,
  }
}

/** Signs a verification result into a downloadable, independently re-verifiable attestation document. */
export async function generateAttestation(input: AttestationInput): Promise<Attestation> {
  const keyPair = await getSessionKeyPair()
  const payload = attestationPayload(input)
  const payloadHash = await sha256Hex(canonicalStringify(payload))
  const signatureBuffer = await crypto.subtle.sign(SIGN_PARAMS, keyPair.privateKey, new TextEncoder().encode(payloadHash))
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

  return {
    ...(payload as Omit<Attestation, 'payloadHash' | 'signature' | 'publicKeyJwk'>),
    payloadHash,
    signature: bytesToBase64(signatureBuffer),
    publicKeyJwk,
  }
}

const REQUIRED_FIELDS: (keyof Attestation)[] = [
  'schemaVersion', 'id', 'contractId', 'network', 'manifestId', 'candidateLabel',
  'normalizedHash', 'rawHash', 'onChainHash', 'status', 'generatedAt',
  'payloadHash', 'signature', 'publicKeyJwk',
]

/**
 * Re-verifies a (possibly re-uploaded, possibly tampered) attestation
 * document: recomputes the payload hash from its claimed fields and checks
 * the embedded signature against the embedded public key. Any field mutated
 * after generation — including the hash or signature itself — is detected.
 */
export async function verifyAttestation(candidate: unknown): Promise<AttestationVerificationResult> {
  const reasons: string[] = []

  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, reasons: ['Attestation is not a JSON object.'] }
  }
  const attestation = candidate as Partial<Attestation>
  for (const field of REQUIRED_FIELDS) {
    if (attestation[field] === undefined || attestation[field] === null) {
      reasons.push(`Missing required field "${field}".`)
    }
  }
  if (reasons.length) return { valid: false, reasons }

  if (attestation.schemaVersion !== ATTESTATION_SCHEMA_VERSION) {
    reasons.push(`Unsupported schema version ${attestation.schemaVersion}.`)
    return { valid: false, reasons }
  }

  const payload = attestationPayload(attestation as AttestationInput)
  const recomputedHash = await sha256Hex(canonicalStringify(payload))
  if (recomputedHash !== attestation.payloadHash) {
    reasons.push('Payload hash does not match the attested fields — the document was modified after signing.')
    return { valid: false, reasons }
  }

  try {
    const publicKey = await crypto.subtle.importKey('jwk', attestation.publicKeyJwk as JsonWebKey, SIGN_ALGORITHM, true, ['verify'])
    const signatureValid = await crypto.subtle.verify(
      SIGN_PARAMS,
      publicKey,
      base64ToBytes(attestation.signature as string) as BufferSource,
      new TextEncoder().encode(attestation.payloadHash as string)
    )
    if (!signatureValid) {
      reasons.push('Signature does not match the payload hash and embedded public key.')
      return { valid: false, reasons }
    }
  } catch {
    reasons.push('Signature or public key is malformed and could not be verified.')
    return { valid: false, reasons }
  }

  return { valid: true, reasons: [] }
}

export function exportAttestationJson(attestation: Attestation): string {
  return JSON.stringify(attestation, null, 2)
}

import { isValidContractId } from '../stellar'
import { MANIFEST_SCHEMA_VERSION } from '../../types/wasmVerification'
import type { RepositoryRef, ToolchainRef, ValidationIssue, ValidationResult, VerificationManifest } from '../../types/wasmVerification'

export const MAX_MANIFEST_JSON_BYTES = 64 * 1024
const MAX_SHORT_STRING = 256
const MAX_LONG_STRING = 2_000
const MAX_FEATURES = 50
const MAX_FEATURE_LENGTH = 100
const HEX40 = /^[0-9a-f]{7,40}$/i
const HEX64 = /^[0-9a-f]{64}$/i

/** Keys that must never appear in untrusted JSON before it is treated as a plain object. */
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function issue(path: string, message: string, severity: ValidationIssue['severity'] = 'error'): ValidationIssue {
  return { path, message, severity }
}

/** True if the string contains any C0 control character or DEL — checked by code point, never by regex, so no control bytes need to live in this source file. */
function containsControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/** Recursively rejects prototype-pollution-shaped payloads before any property access happens. */
function findDangerousKey(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findDangerousKey(value[i], `${path}[${i}]`)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) return `${path}.${key}`
      const found = findDangerousKey((value as Record<string, unknown>)[key], `${path}.${key}`)
      if (found) return found
    }
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function checkString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: { required?: boolean; maxLength?: number; pattern?: RegExp; patternMessage?: string } = {}
): string | null {
  const { required = true, maxLength = MAX_SHORT_STRING, pattern, patternMessage } = options
  if (value === undefined || value === null || value === '') {
    if (required) issues.push(issue(path, 'is required.'))
    return null
  }
  if (typeof value !== 'string') {
    issues.push(issue(path, 'must be a string.'))
    return null
  }
  if (value.length > maxLength) {
    issues.push(issue(path, `must be ${maxLength} characters or fewer (got ${value.length}).`))
    return null
  }
  if (containsControlCharacters(value)) {
    issues.push(issue(path, 'must not contain control characters.'))
    return null
  }
  if (pattern && !pattern.test(value)) {
    issues.push(issue(path, patternMessage || 'has an invalid format.'))
    return null
  }
  return value
}

function checkRepository(value: unknown, issues: ValidationIssue[]): RepositoryRef | null {
  if (!isPlainObject(value)) {
    issues.push(issue('repository', 'must be an object.'))
    return null
  }
  const url = checkString(value.url, 'repository.url', issues, { maxLength: MAX_LONG_STRING })
  const commit = checkString(value.commit, 'repository.commit', issues, {
    maxLength: 40,
    pattern: HEX40,
    patternMessage: 'must be a 7-40 character hex commit SHA.',
  })
  const subdir = value.subdir == null ? null : checkString(value.subdir, 'repository.subdir', issues, { required: false, maxLength: MAX_SHORT_STRING })

  if (url) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') {
        issues.push(issue('repository.url', 'must use https:// — other schemes are rejected for safety.'))
        return null
      }
      if (parsed.username || parsed.password) {
        issues.push(issue('repository.url', 'must not embed credentials in the URL.'))
        return null
      }
    } catch {
      issues.push(issue('repository.url', 'is not a valid URL.'))
      return null
    }
  }

  if (!url || !commit) return null
  return { url, commit, subdir }
}

function checkToolchain(value: unknown, issues: ValidationIssue[]): ToolchainRef | null {
  if (!isPlainObject(value)) {
    issues.push(issue('toolchain', 'must be an object.'))
    return null
  }
  const rustc = checkString(value.rustc, 'toolchain.rustc', issues, { maxLength: 100 })
  const cargo = checkString(value.cargo, 'toolchain.cargo', issues, { maxLength: 100 })
  const sorobanCli = value.sorobanCli == null ? null : checkString(value.sorobanCli, 'toolchain.sorobanCli', issues, { required: false, maxLength: 100 })
  const target = checkString(value.target, 'toolchain.target', issues, { maxLength: 100 })
  if (!rustc || !cargo || !target) return null
  return { rustc, cargo, sorobanCli, target }
}

function checkFeatures(value: unknown, issues: ValidationIssue[]): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    issues.push(issue('features', 'must be an array of strings.'))
    return []
  }
  if (value.length > MAX_FEATURES) {
    issues.push(issue('features', `must contain at most ${MAX_FEATURES} entries (got ${value.length}).`))
    return []
  }
  const features: string[] = []
  value.forEach((entry, index) => {
    const checked = checkString(entry, `features[${index}]`, issues, { maxLength: MAX_FEATURE_LENGTH })
    if (checked) features.push(checked)
  })
  return features
}

/**
 * Validates an already-parsed manifest object field by field, collecting
 * every problem rather than throwing on the first one so the UI can show a
 * complete, actionable list. Never trusts the input's shape — every field is
 * type- and length-checked before use.
 */
export function validateManifest(raw: unknown): ValidationResult & { manifest: VerificationManifest | null } {
  const issues: ValidationIssue[] = []

  const dangerousKey = findDangerousKey(raw)
  if (dangerousKey) {
    return {
      valid: false,
      issues: [issue(dangerousKey, 'contains a disallowed key (__proto__/prototype/constructor).')],
      manifest: null,
    }
  }

  if (!isPlainObject(raw)) {
    return { valid: false, issues: [issue('$', 'must be a JSON object.')], manifest: null }
  }

  if (raw.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    issues.push(issue('schemaVersion', `must be ${MANIFEST_SCHEMA_VERSION} (got ${JSON.stringify(raw.schemaVersion)}).`))
  }

  const id = checkString(raw.id, 'id', issues, { maxLength: 100 })
  const contractId = checkString(raw.contractId, 'contractId', issues, { maxLength: 100 })
  if (contractId && !isValidContractId(contractId)) {
    issues.push(issue('contractId', 'is not a valid Soroban contract ID.'))
  }
  const network = checkString(raw.network, 'network', issues, { maxLength: 40 })
  const repository = checkRepository(raw.repository, issues)
  const toolchain = checkToolchain(raw.toolchain, issues)
  const features = checkFeatures(raw.features, issues)
  const lockfileHash =
    raw.lockfileHash == null
      ? null
      : checkString(raw.lockfileHash, 'lockfileHash', issues, { required: false, maxLength: 64, pattern: HEX64, patternMessage: 'must be a 64-character hex SHA-256 hash.' })
  const buildCommand = checkString(raw.buildCommand, 'buildCommand', issues, { maxLength: MAX_LONG_STRING })
  const expectedWasmHash = checkString(raw.expectedWasmHash, 'expectedWasmHash', issues, {
    maxLength: 64,
    pattern: HEX64,
    patternMessage: 'must be a 64-character hex SHA-256 hash.',
  })
  const createdAt = checkString(raw.createdAt, 'createdAt', issues, { maxLength: 40 })
  if (createdAt && Number.isNaN(Date.parse(createdAt))) {
    issues.push(issue('createdAt', 'must be a valid ISO-8601 timestamp.'))
  }
  const notes = raw.notes == null ? null : checkString(raw.notes, 'notes', issues, { required: false, maxLength: MAX_LONG_STRING })

  const valid = issues.filter((i) => i.severity === 'error').length === 0
  if (!valid || !id || !contractId || !network || !repository || !toolchain || !buildCommand || !expectedWasmHash || !createdAt) {
    return { valid: false, issues, manifest: null }
  }

  return {
    valid: true,
    issues,
    manifest: {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id,
      contractId,
      network,
      repository,
      toolchain,
      features,
      lockfileHash,
      buildCommand,
      expectedWasmHash,
      createdAt,
      notes,
    },
  }
}

/** Parses untrusted manifest JSON text with a byte-size ceiling enforced before parsing. */
export function parseManifestJson(text: string): ValidationResult & { manifest: VerificationManifest | null } {
  const byteLength = new TextEncoder().encode(text).length
  if (byteLength > MAX_MANIFEST_JSON_BYTES) {
    return {
      valid: false,
      issues: [issue('$', `Manifest JSON is ${byteLength} bytes, which exceeds the ${MAX_MANIFEST_JSON_BYTES}-byte limit.`)],
      manifest: null,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      valid: false,
      issues: [issue('$', `Manifest is not valid JSON: ${(error as Error).message}`)],
      manifest: null,
    }
  }

  return validateManifest(parsed)
}

export function createEmptyManifestDraft(contractId: string, network: string): VerificationManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `manifest-${Date.now()}`,
    contractId,
    network,
    repository: { url: '', commit: '', subdir: null },
    toolchain: { rustc: '', cargo: '', sorobanCli: null, target: 'wasm32-unknown-unknown' },
    features: [],
    lockfileHash: null,
    buildCommand: 'soroban contract build',
    expectedWasmHash: '',
    createdAt: new Date().toISOString(),
    notes: null,
  }
}

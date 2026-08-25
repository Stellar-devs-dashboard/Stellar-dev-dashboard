import { WASMProcessor } from '../deployment/WASMProcessor'
import type { DiffResult, NormalizedWasmArtifact, SectionDiffEntry, WasmSection } from '../../types/wasmVerification'

export const MAX_WASM_BYTES = 20 * 1024 * 1024
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]
const WASM_VERSION = [0x01, 0x00, 0x00, 0x00]
const HEADER_LENGTH = 8

/**
 * Custom sections known to carry build-environment metadata (absolute debug
 * paths, compiler/linker version strings) rather than program semantics.
 * Stripping these before hashing is what lets two builds on different
 * machines/toolchain patch versions still prove they compiled the same code.
 * This list is intentionally conservative — sections that could plausibly
 * affect execution (e.g. "target_features") are never stripped.
 */
export const NON_DETERMINISTIC_SECTION_NAMES = ['producers', 'name']
const NON_DETERMINISTIC_PREFIXES = ['.debug_']

export class WasmParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WasmParseError'
  }
}

function isStrippable(name: string): boolean {
  return (
    NON_DETERMINISTIC_SECTION_NAMES.includes(name) ||
    NON_DETERMINISTIC_PREFIXES.some((prefix) => name.startsWith(prefix))
  )
}

/** Reads an unsigned LEB128 varint starting at `offset`. Returns the value and the offset just past it. */
function readULEB128(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0
  let shift = 0
  let pos = offset
  for (;;) {
    if (pos >= bytes.length) throw new WasmParseError('Unexpected end of file while reading a section length.')
    const byte = bytes[pos]
    pos += 1
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
    if (shift > 35) throw new WasmParseError('Malformed varint (exceeds 32 bits).')
  }
  return { value: result >>> 0, next: pos }
}

interface RawSection {
  id: number
  fullStart: number
  fullEnd: number
  payloadStart: number
  payloadEnd: number
  name: string
}

const STANDARD_SECTION_NAMES: Record<number, string> = {
  1: 'type', 2: 'import', 3: 'function', 4: 'table', 5: 'memory', 6: 'global',
  7: 'export', 8: 'start', 9: 'element', 10: 'code', 11: 'data', 12: 'data-count',
}

function parseRawSections(bytes: Uint8Array): RawSection[] {
  if (bytes.length < HEADER_LENGTH) throw new WasmParseError('File is too small to be a WASM module.')
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== WASM_MAGIC[i]) throw new WasmParseError('Missing WASM magic bytes (0x00 0x61 0x73 0x6d).')
  }
  for (let i = 0; i < 4; i++) {
    if (bytes[4 + i] !== WASM_VERSION[i]) throw new WasmParseError('Unsupported WASM binary version.')
  }

  const sections: RawSection[] = []
  let offset = HEADER_LENGTH
  while (offset < bytes.length) {
    const fullStart = offset
    const id = bytes[offset]
    offset += 1
    const { value: size, next } = readULEB128(bytes, offset)
    offset = next
    const payloadStart = offset
    const payloadEnd = payloadStart + size
    if (payloadEnd > bytes.length) throw new WasmParseError(`Section ${id} at offset ${fullStart} overruns the file.`)

    let name = STANDARD_SECTION_NAMES[id] || `section-${id}`
    if (id === 0) {
      const { value: nameLen, next: afterNameLen } = readULEB128(bytes, payloadStart)
      const nameEnd = afterNameLen + nameLen
      if (nameEnd > payloadEnd) throw new WasmParseError(`Custom section at offset ${fullStart} has a malformed name length.`)
      name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(afterNameLen, nameEnd))
    }

    sections.push({ id, fullStart, fullEnd: payloadEnd, payloadStart, payloadEnd, name })
    offset = payloadEnd
  }
  return sections
}

/**
 * Parses, strips non-deterministic metadata, and hashes a WASM binary.
 * Produces both the raw (unmodified) hash and the normalized hash so the UI
 * can distinguish "byte-identical" from "semantically identical, differs
 * only in embedded build metadata".
 */
export async function normalizeWasm(bytes: Uint8Array, sourceLabel: string): Promise<NormalizedWasmArtifact> {
  if (bytes.length > MAX_WASM_BYTES) {
    throw new WasmParseError(`Artifact is ${bytes.length} bytes, which exceeds the ${MAX_WASM_BYTES}-byte limit.`)
  }
  const rawSections = parseRawSections(bytes)
  const rawHash = await WASMProcessor.hashBytes(bytes)

  const sections: WasmSection[] = await Promise.all(
    rawSections.map(async (section) => {
      const payload = bytes.slice(section.payloadStart, section.payloadEnd)
      const sectionHash = await WASMProcessor.hashBytes(payload)
      const deterministic = !(section.id === 0 && isStrippable(section.name))
      return {
        id: section.id,
        kind: section.id === 0 ? 'custom' : 'standard',
        name: section.name,
        sizeBytes: section.payloadEnd - section.payloadStart,
        sectionHash,
        deterministic,
      }
    })
  )

  const strippedSectionNames = sections.filter((s) => !s.deterministic).map((s) => s.name)
  const keptRanges = rawSections.filter((_, i) => sections[i].deterministic)
  const normalizedParts: Uint8Array[] = [bytes.slice(0, HEADER_LENGTH), ...keptRanges.map((s) => bytes.slice(s.fullStart, s.fullEnd))]
  const normalizedBytes = concatBytes(normalizedParts)
  const normalizedHash = await WASMProcessor.hashBytes(normalizedBytes)

  return {
    sourceLabel,
    totalBytes: bytes.length,
    normalizedBytes: normalizedBytes.length,
    rawHash,
    normalizedHash,
    sections,
    strippedSectionNames,
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function sectionKey(section: WasmSection): string {
  return section.kind === 'custom' ? `custom:${section.name}` : `standard:${section.id}`
}

/**
 * Byte/section-level diff between a locally-built candidate artifact and the
 * on-chain artifact. Sections are matched by (kind, id-or-name) so reordered
 * or added/removed sections are reported explicitly rather than shifting
 * every subsequent comparison out of alignment.
 */
export function compareArtifacts(candidate: NormalizedWasmArtifact, onChain: NormalizedWasmArtifact): DiffResult {
  const candidateByKey = new Map(candidate.sections.map((s) => [sectionKey(s), s]))
  const onChainByKey = new Map(onChain.sections.map((s) => [sectionKey(s), s]))
  const allKeys = new Set([...candidateByKey.keys(), ...onChainByKey.keys()])

  const sections: SectionDiffEntry[] = Array.from(allKeys)
    .sort()
    .map((key) => {
      const c = candidateByKey.get(key)
      const o = onChainByKey.get(key)
      let status: SectionDiffEntry['status']
      if (c && !o) status = 'added'
      else if (!c && o) status = 'removed'
      else if (c && o && c.sectionHash === o.sectionHash) status = 'match'
      else status = 'content-changed'
      return {
        key,
        name: (c || o)?.name || key,
        status,
        candidateSizeBytes: c?.sizeBytes ?? null,
        onChainSizeBytes: o?.sizeBytes ?? null,
      }
    })

  const normalizedHashMatch = candidate.normalizedHash === onChain.normalizedHash
  const rawHashMatch = candidate.rawHash === onChain.rawHash
  const changed = sections.filter((s) => s.status !== 'match')

  const summary = normalizedHashMatch
    ? rawHashMatch
      ? 'Byte-for-byte identical to the on-chain artifact.'
      : 'Reproducible match: identical after stripping non-deterministic build metadata.'
    : changed.length
      ? `Mismatch in ${changed.length} section(s): ${changed.map((s) => s.name).join(', ')}.`
      : 'Mismatch detected, but no individual section differs — check for section ordering differences.'

  return { rawHashMatch, normalizedHashMatch, sections, summary }
}

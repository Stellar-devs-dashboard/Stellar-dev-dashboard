import type { DependencyInventory, DependencyRecord } from '../../types/wasmVerification'

export const MAX_LOCKFILE_BYTES = 2 * 1024 * 1024
const MAX_PACKAGES = 5_000

const FIELD_PATTERNS: Record<'name' | 'version' | 'source' | 'checksum', RegExp> = {
  name: /^name\s*=\s*"([^"]*)"\s*$/,
  version: /^version\s*=\s*"([^"]*)"\s*$/,
  source: /^source\s*=\s*"([^"]*)"\s*$/,
  checksum: /^checksum\s*=\s*"([^"]*)"\s*$/,
}

/**
 * Minimal, purpose-built Cargo.lock (TOML) reader — not a general TOML
 * parser. It only extracts the four fields verification cares about from
 * `[[package]]` blocks, so it stays simple to audit and cannot be tricked
 * into evaluating arbitrary TOML/expressions. Malformed blocks are recorded
 * as warnings rather than aborting the whole parse.
 */
export function parseCargoLock(text: string): DependencyInventory {
  const byteLength = new TextEncoder().encode(text).length
  if (byteLength > MAX_LOCKFILE_BYTES) {
    return {
      packageCount: 0,
      dependencies: [],
      parseWarnings: [`Lockfile is ${byteLength} bytes, which exceeds the ${MAX_LOCKFILE_BYTES}-byte limit.`],
    }
  }

  const lines = text.split(/\r?\n/)
  const dependencies: DependencyRecord[] = []
  const parseWarnings: string[] = []

  let current: Partial<Record<'name' | 'version' | 'source' | 'checksum', string>> | null = null
  let blockIndex = 0

  const flush = () => {
    if (!current) return
    blockIndex += 1
    if (!current.name || !current.version) {
      parseWarnings.push(`[[package]] block #${blockIndex} is missing a name or version and was skipped.`)
      current = null
      return
    }
    if (dependencies.length >= MAX_PACKAGES) {
      parseWarnings.push(`Lockfile declares more than ${MAX_PACKAGES} packages; remaining entries were truncated.`)
      current = null
      return
    }
    dependencies.push({
      name: current.name,
      version: current.version,
      source: current.source || null,
      checksum: current.checksum || null,
    })
    current = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '[[package]]') {
      flush()
      current = {}
      continue
    }
    if (!current) continue
    if (line.startsWith('[') && line !== '[[package]]') {
      // Entered a different table (e.g. [[patch.unused]]) — close the current package.
      flush()
      continue
    }
    for (const [field, pattern] of Object.entries(FIELD_PATTERNS) as [keyof typeof FIELD_PATTERNS, RegExp][]) {
      const match = pattern.exec(line)
      if (match) current[field] = match[1]
    }
  }
  flush()

  return { packageCount: dependencies.length, dependencies, parseWarnings }
}

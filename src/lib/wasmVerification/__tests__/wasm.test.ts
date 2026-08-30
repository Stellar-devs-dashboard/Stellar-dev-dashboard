import { describe, expect, it } from 'vitest'
import { compareArtifacts, MAX_WASM_BYTES, normalizeWasm, WasmParseError } from '../wasm'

const MAGIC = [0x00, 0x61, 0x73, 0x6d]
const VERSION = [0x01, 0x00, 0x00, 0x00]

function customSection(name: string, content: number[]): number[] {
  const nameBytes = Array.from(new TextEncoder().encode(name))
  const payload = [nameBytes.length, ...nameBytes, ...content]
  return [0, payload.length, ...payload]
}

function standardSection(id: number, payload: number[]): number[] {
  return [id, payload.length, ...payload]
}

function buildModule(sections: number[][]): Uint8Array {
  return new Uint8Array([...MAGIC, ...VERSION, ...sections.flat()])
}

describe('normalizeWasm', () => {
  it('parses a minimal empty module', async () => {
    const bytes = buildModule([])
    const artifact = await normalizeWasm(bytes, 'empty')
    expect(artifact.sections).toHaveLength(0)
    expect(artifact.rawHash).toBe(artifact.normalizedHash)
    expect(artifact.totalBytes).toBe(8)
  })

  it('rejects a file missing the WASM magic bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await expect(normalizeWasm(bytes, 'bad')).rejects.toBeInstanceOf(WasmParseError)
  })

  it('rejects a truncated file', async () => {
    const bytes = new Uint8Array([...MAGIC, ...VERSION, 1, 5, 0, 0])
    await expect(normalizeWasm(bytes, 'truncated')).rejects.toBeInstanceOf(WasmParseError)
  })

  it('rejects an oversized artifact before parsing', async () => {
    const bytes = new Uint8Array(MAX_WASM_BYTES + 1)
    await expect(normalizeWasm(bytes, 'huge')).rejects.toThrow(/exceeds/)
  })

  it('strips producers and name custom sections but keeps standard sections', async () => {
    const bytes = buildModule([
      standardSection(1, [0]), // empty type section
      customSection('producers', [1, 2, 3]),
      customSection('name', [4, 5]),
      customSection('my-notes', [9, 9]),
    ])
    const artifact = await normalizeWasm(bytes, 'candidate')
    const strippedNames = artifact.strippedSectionNames.sort()
    expect(strippedNames).toEqual(['name', 'producers'])
    const kept = artifact.sections.filter((s) => s.deterministic).map((s) => s.name)
    expect(kept).toEqual(expect.arrayContaining(['type', 'my-notes']))
    expect(artifact.rawHash).not.toBe(artifact.normalizedHash)
  })

  it('produces the same normalized hash for two modules that differ only in producers metadata', async () => {
    const a = buildModule([standardSection(1, [0]), customSection('producers', [1, 2, 3])])
    const b = buildModule([standardSection(1, [0]), customSection('producers', [9, 9, 9, 9, 9])])
    const artifactA = await normalizeWasm(a, 'a')
    const artifactB = await normalizeWasm(b, 'b')
    expect(artifactA.rawHash).not.toBe(artifactB.rawHash)
    expect(artifactA.normalizedHash).toBe(artifactB.normalizedHash)
  })

  it('gives modules with a genuine code difference different normalized hashes', async () => {
    const a = buildModule([standardSection(1, [0])])
    const b = buildModule([standardSection(1, [1, 0, 0])])
    const artifactA = await normalizeWasm(a, 'a')
    const artifactB = await normalizeWasm(b, 'b')
    expect(artifactA.normalizedHash).not.toBe(artifactB.normalizedHash)
  })
})

describe('compareArtifacts', () => {
  it('reports a full match when normalized hashes are identical', async () => {
    const bytes = buildModule([standardSection(1, [0]), customSection('producers', [1])])
    const a = await normalizeWasm(bytes, 'a')
    const b = await normalizeWasm(bytes, 'b')
    const diff = compareArtifacts(a, b)
    expect(diff.normalizedHashMatch).toBe(true)
    expect(diff.rawHashMatch).toBe(true)
    expect(diff.sections.every((s) => s.status === 'match')).toBe(true)
  })

  it('reports content-changed for a section whose bytes differ', async () => {
    const a = buildModule([standardSection(1, [0])])
    const b = buildModule([standardSection(1, [1, 0, 0])])
    const artifactA = await normalizeWasm(a, 'candidate')
    const artifactB = await normalizeWasm(b, 'on-chain')
    const diff = compareArtifacts(artifactA, artifactB)
    expect(diff.normalizedHashMatch).toBe(false)
    const typeSection = diff.sections.find((s) => s.name === 'type')
    expect(typeSection?.status).toBe('content-changed')
  })

  it('reports added and removed for sections present in only one artifact', async () => {
    const a = buildModule([standardSection(1, [0]), customSection('extra', [1])])
    const b = buildModule([standardSection(1, [0])])
    const artifactA = await normalizeWasm(a, 'candidate')
    const artifactB = await normalizeWasm(b, 'on-chain')
    const diff = compareArtifacts(artifactA, artifactB)
    const extra = diff.sections.find((s) => s.name === 'extra')
    expect(extra?.status).toBe('added')
  })

  it('ignores stripped sections when reporting matches (they are excluded from the section list entirely if identical strip status)', async () => {
    const a = buildModule([standardSection(1, [0]), customSection('producers', [1, 2, 3])])
    const b = buildModule([standardSection(1, [0]), customSection('producers', [9, 9])])
    const artifactA = await normalizeWasm(a, 'candidate')
    const artifactB = await normalizeWasm(b, 'on-chain')
    const diff = compareArtifacts(artifactA, artifactB)
    expect(diff.normalizedHashMatch).toBe(true)
    const producers = diff.sections.find((s) => s.name === 'producers')
    // Still reported (so the UI can show what was stripped), but overall match holds.
    expect(producers?.status).toBe('content-changed')
    expect(diff.summary).toMatch(/Reproducible match/)
  })
})

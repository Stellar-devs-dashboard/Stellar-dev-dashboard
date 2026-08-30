import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { clearAllVerificationRecords, deleteVerificationRecord, getVerificationRecords, saveVerificationRecord } from '../records'
import type { VerificationManifest, VerificationRecord } from '../../../types/wasmVerification'

const manifest: VerificationManifest = {
  schemaVersion: 1,
  id: 'm1',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  network: 'testnet',
  repository: { url: 'https://github.com/example/repo', commit: 'abc1234', subdir: null },
  toolchain: { rustc: '1.79.0', cargo: '1.79.0', sorobanCli: null, target: 'wasm32-unknown-unknown' },
  features: [],
  lockfileHash: null,
  buildCommand: 'soroban contract build',
  expectedWasmHash: 'a'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
  notes: null,
}

function record(id: string, overrides: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    id,
    contractId: manifest.contractId,
    network: manifest.network,
    manifest,
    status: 'match',
    diff: null,
    attestation: null,
    onChainHash: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('verification records store', () => {
  beforeEach(async () => {
    await clearAllVerificationRecords()
  })

  it('saves and retrieves records scoped to contract + network', async () => {
    await saveVerificationRecord(record('r1'))
    await saveVerificationRecord(record('r2', { network: 'mainnet' }))
    const testnetRecords = await getVerificationRecords(manifest.contractId, 'testnet')
    expect(testnetRecords).toHaveLength(1)
    expect(testnetRecords[0].id).toBe('r1')
  })

  it('returns records newest first', async () => {
    await saveVerificationRecord(record('older', { createdAt: '2026-01-01T00:00:00.000Z' }))
    await saveVerificationRecord(record('newer', { createdAt: '2026-06-01T00:00:00.000Z' }))
    const records = await getVerificationRecords(manifest.contractId, 'testnet')
    expect(records.map((r) => r.id)).toEqual(['newer', 'older'])
  })

  it('deletes a single record by id', async () => {
    await saveVerificationRecord(record('to-delete'))
    await deleteVerificationRecord('to-delete')
    const records = await getVerificationRecords(manifest.contractId, 'testnet')
    expect(records).toHaveLength(0)
  })

  it('returns an empty array for a contract with no records', async () => {
    const records = await getVerificationRecords('CUNKNOWNCONTRACTIDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'testnet')
    expect(records).toEqual([])
  })

  it('prunes old records beyond the retention cap', async () => {
    for (let i = 0; i < 105; i++) {
      await saveVerificationRecord(record(`r-${i}`, { createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString() }))
    }
    const records = await getVerificationRecords(manifest.contractId, 'testnet')
    expect(records.length).toBeLessThanOrEqual(100)
  }, 60_000)
})

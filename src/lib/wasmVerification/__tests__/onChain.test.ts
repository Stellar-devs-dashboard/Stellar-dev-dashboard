import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import * as StellarSdk from '@stellar/stellar-sdk'
import { fetchOnChainWasm, OnChainFetchError } from '../onChain'
import { getSorobanServer } from '../../stellar'

vi.mock('../../stellar', async () => {
  const actual = await vi.importActual<typeof import('../../stellar')>('../../stellar')
  return { ...actual, getSorobanServer: vi.fn() }
})

const CONTRACT_ID = StellarSdk.StrKey.encodeContract(new Uint8Array(32).fill(3) as unknown as Buffer)
const CONTRACT_ADDRESS = StellarSdk.Address.fromString(CONTRACT_ID).toScAddress()
const EXT_ZERO = new (StellarSdk.xdr.ExtensionPoint as unknown as new (_value: number) => StellarSdk.xdr.ExtensionPoint)(0)
const WASM_BYTES = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
// Soroban content-addresses contract code by its SHA-256 hash, and fetchOnChainWasm
// now cross-checks that — so the fixture hash must be the real hash of the fixture bytes.
const WASM_HASH = createHash('sha256').update(WASM_BYTES).digest()

function buildInstanceEntry(executable: StellarSdk.xdr.ContractExecutable) {
  const instance = new StellarSdk.xdr.ScContractInstance({ executable, storage: [] })
  return StellarSdk.xdr.LedgerEntryData.contractData(
    new StellarSdk.xdr.ContractDataEntry({
      ext: EXT_ZERO,
      contract: CONTRACT_ADDRESS,
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
      val: StellarSdk.xdr.ScVal.scvContractInstance(instance),
    })
  )
}

function buildCodeEntry(hash: Buffer, code: Buffer) {
  return StellarSdk.xdr.LedgerEntryData.contractCode(
    new StellarSdk.xdr.ContractCodeEntry({
      ext: new (StellarSdk.xdr.ContractCodeEntryExt as unknown as new (_value: number) => StellarSdk.xdr.ContractCodeEntryExt)(0),
      hash,
      code,
    })
  )
}

describe('fetchOnChainWasm', () => {
  let mockServer: { getLedgerEntries: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockServer = { getLedgerEntries: vi.fn() }
    vi.mocked(getSorobanServer).mockReturnValue(mockServer as never)
  })

  it('rejects an invalid contract ID before making any network call', async () => {
    await expect(fetchOnChainWasm('not-a-contract', 'testnet')).rejects.toMatchObject({ code: 'invalid-contract' })
    expect(mockServer.getLedgerEntries).not.toHaveBeenCalled()
  })

  it('fetches the instance then the code entry and returns the wasm bytes and hash', async () => {
    mockServer.getLedgerEntries
      .mockResolvedValueOnce({ entries: [{ val: buildInstanceEntry(StellarSdk.xdr.ContractExecutable.contractExecutableWasm(WASM_HASH)) }], latestLedger: 100 })
      .mockResolvedValueOnce({ entries: [{ val: buildCodeEntry(WASM_HASH, WASM_BYTES) }], latestLedger: 101 })

    const result = await fetchOnChainWasm(CONTRACT_ID, 'testnet')
    expect(result.wasmHashHex).toBe(WASM_HASH.toString('hex'))
    expect(Array.from(result.bytes)).toEqual(Array.from(WASM_BYTES))
    expect(result.latestLedger).toBe(101)
  })

  it('throws not-found when the contract instance does not exist', async () => {
    mockServer.getLedgerEntries.mockResolvedValueOnce({ entries: [], latestLedger: 50 })
    await expect(fetchOnChainWasm(CONTRACT_ID, 'testnet')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('throws not-wasm for a Stellar Asset Contract (no wasm executable)', async () => {
    mockServer.getLedgerEntries.mockResolvedValueOnce({
      entries: [{ val: buildInstanceEntry(StellarSdk.xdr.ContractExecutable.contractExecutableStellarAsset()) }],
      latestLedger: 100,
    })
    await expect(fetchOnChainWasm(CONTRACT_ID, 'testnet')).rejects.toMatchObject({ code: 'not-wasm' })
  })

  it('throws not-found when the wasm hash has no corresponding code entry', async () => {
    mockServer.getLedgerEntries
      .mockResolvedValueOnce({ entries: [{ val: buildInstanceEntry(StellarSdk.xdr.ContractExecutable.contractExecutableWasm(WASM_HASH)) }], latestLedger: 100 })
      .mockResolvedValueOnce({ entries: [], latestLedger: 101 })
    await expect(fetchOnChainWasm(CONTRACT_ID, 'testnet')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('maps an unexpected network error to a retryable unavailable error', async () => {
    mockServer.getLedgerEntries.mockRejectedValueOnce(new Error('network down'))
    const error: OnChainFetchError = await fetchOnChainWasm(CONTRACT_ID, 'testnet').catch((e) => e)
    expect(error).toBeInstanceOf(OnChainFetchError)
    expect(error.code).toBe('unavailable')
    expect(error.retryable).toBe(true)
  })
})

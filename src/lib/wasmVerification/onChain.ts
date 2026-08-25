import * as StellarSdk from '@stellar/stellar-sdk'
import { getSorobanServer, isValidContractId, type NetworkName } from '../stellar'
import { WASMProcessor } from '../deployment/WASMProcessor'
import { MAX_WASM_BYTES } from './wasm'
import type { WasmVerificationApiError } from '../../types/wasmVerification'

const DEFAULT_TIMEOUT_MS = 15_000

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class OnChainFetchError extends Error implements WasmVerificationApiError {
  code: WasmVerificationApiError['code']
  retryable: boolean
  constructor(error: WasmVerificationApiError) {
    super(error.message)
    this.name = 'OnChainFetchError'
    this.code = error.code
    this.retryable = error.retryable
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new OnChainFetchError({ code: 'timeout', message: onTimeoutMessage, retryable: true })), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new OnChainFetchError({ code: 'aborted', message: 'On-chain fetch was cancelled.', retryable: false })
  }
}

export interface OnChainWasmResult {
  bytes: Uint8Array
  wasmHashHex: string
  latestLedger: number
}

/**
 * Fetches the WASM bytecode currently deployed for a contract: first reads
 * the contract instance to find its wasm hash, then reads the code ledger
 * entry for that hash. Two round-trips are unavoidable — the instance entry
 * only stores the hash, not the code itself.
 */
export async function fetchOnChainWasm(
  contractId: string,
  network: NetworkName,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<OnChainWasmResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const { signal } = options
  if (!isValidContractId(contractId)) {
    throw new OnChainFetchError({ code: 'invalid-contract', message: `"${contractId}" is not a valid Soroban contract ID.`, retryable: false })
  }
  assertNotAborted(signal)

  const server = getSorobanServer(network)
  const instanceKey = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: StellarSdk.Address.fromString(contractId).toScAddress(),
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  )

  let instanceResponse
  try {
    instanceResponse = await withTimeout(
      server.getLedgerEntries(instanceKey),
      timeoutMs,
      `Timed out fetching the contract instance for ${contractId}.`
    )
  } catch (error) {
    if (error instanceof OnChainFetchError) throw error
    throw new OnChainFetchError({ code: 'unavailable', message: `Unable to reach the network: ${(error as Error).message}`, retryable: true })
  }

  const instanceEntry = instanceResponse.entries?.[0]
  if (!instanceEntry) {
    throw new OnChainFetchError({ code: 'not-found', message: `No contract instance found for ${contractId} on ${network}.`, retryable: false })
  }

  // `wasmHash` comes back as the SDK's bundled Buffer polyfill, not the Node
  // global — this module must stay browser-safe, so it's only ever read as
  // bytes (never via the global `Buffer`, which does not exist in a browser).
  let wasmHash: Uint8Array
  try {
    const instance = instanceEntry.val.contractData().val().instance()
    const executable = instance.executable()
    if (executable.switch().name !== 'contractExecutableWasm') {
      throw new OnChainFetchError({ code: 'not-wasm', message: `${contractId} is not backed by a WASM executable.`, retryable: false })
    }
    wasmHash = new Uint8Array(executable.wasmHash())
  } catch (error) {
    if (error instanceof OnChainFetchError) throw error
    throw new OnChainFetchError({ code: 'unavailable', message: `Could not decode the contract instance: ${(error as Error).message}`, retryable: false })
  }
  const wasmHashHex = bytesToHex(wasmHash)
  assertNotAborted(signal)

  const codeKey = StellarSdk.xdr.LedgerKey.contractCode(
    new StellarSdk.xdr.LedgerKeyContractCode({ hash: wasmHash as unknown as Buffer })
  )

  let codeResponse
  try {
    codeResponse = await withTimeout(
      server.getLedgerEntries(codeKey),
      timeoutMs,
      `Timed out fetching the contract code for ${contractId}.`
    )
  } catch (error) {
    if (error instanceof OnChainFetchError) throw error
    throw new OnChainFetchError({ code: 'unavailable', message: `Unable to reach the network: ${(error as Error).message}`, retryable: true })
  }

  const codeEntry = codeResponse.entries?.[0]
  if (!codeEntry) {
    throw new OnChainFetchError({ code: 'not-found', message: `Contract code for hash ${wasmHashHex} was not found (it may have been evicted).`, retryable: false })
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(codeEntry.val.contractCode().code())
  } catch (error) {
    throw new OnChainFetchError({ code: 'unavailable', message: `Could not decode the contract code entry: ${(error as Error).message}`, retryable: false })
  }
  if (bytes.length > MAX_WASM_BYTES) {
    throw new OnChainFetchError({ code: 'unavailable', message: `On-chain artifact is ${bytes.length} bytes, which exceeds the ${MAX_WASM_BYTES}-byte limit.`, retryable: false })
  }

  // Soroban addresses contract code by content hash, so the code entry we
  // just fetched should hash to exactly the wasm hash the instance
  // declared. The SDK's own `getContractWasmByContractId` convenience
  // method skips this check; verifying it here catches ledger
  // inconsistencies before they get compared against a candidate build and
  // misreported as a build mismatch.
  const actualHashHex = await WASMProcessor.hashBytes(bytes)
  if (actualHashHex.length === 64 && actualHashHex !== wasmHashHex) {
    throw new OnChainFetchError({
      code: 'unavailable',
      message: `Integrity check failed: fetched code hashes to ${actualHashHex}, but the contract instance declares wasm hash ${wasmHashHex}.`,
      retryable: false,
    })
  }

  return { bytes, wasmHashHex, latestLedger: codeResponse.latestLedger ?? instanceResponse.latestLedger ?? 0 }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NetworkName } from '../lib/stellar'
import { fetchOnChainWasm, OnChainFetchError } from '../lib/wasmVerification/onChain'
import { normalizeWasm, compareArtifacts } from '../lib/wasmVerification/wasm'
import { requestBuild, simulateBuild } from '../lib/wasmVerification/buildWorker'
import { generateAttestation } from '../lib/wasmVerification/attestation'
import { getVerificationRecords, saveVerificationRecord } from '../lib/wasmVerification/records'
import { redactSecrets } from '../lib/wasmVerification/redaction'
import type {
  Attestation,
  BuildWorkerResult,
  NormalizedWasmArtifact,
  SourceCandidate,
  VerificationManifest,
  VerificationRecord,
  VerificationStatus,
} from '../types/wasmVerification'

interface OnChainState {
  loading: boolean
  error: OnChainFetchError | null
  artifact: NormalizedWasmArtifact | null
  wasmHashHex: string | null
  latestLedger: number | null
}

const IDLE_ON_CHAIN: OnChainState = { loading: false, error: null, artifact: null, wasmHashHex: null, latestLedger: null }

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function statusFromDiff(diff: { normalizedHashMatch: boolean } | null): VerificationStatus {
  if (!diff) return 'unverified'
  return diff.normalizedHashMatch ? 'match' : 'mismatch'
}

export default function useWasmVerification(contractId: string, network: NetworkName) {
  const [onChain, setOnChain] = useState<OnChainState>(IDLE_ON_CHAIN)
  const [candidates, setCandidates] = useState<SourceCandidate[]>([])
  const [history, setHistory] = useState<VerificationRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const controller = useRef<AbortController | null>(null)

  const loadHistory = useCallback(async () => {
    if (!contractId) {
      setHistory([])
      setHistoryLoading(false)
      return
    }
    setHistoryLoading(true)
    try {
      const records = await getVerificationRecords(contractId, network)
      setHistory(records)
    } finally {
      setHistoryLoading(false)
    }
  }, [contractId, network])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const refreshOnChain = useCallback(async () => {
    controller.current?.abort()
    const requestController = new AbortController()
    controller.current = requestController
    setOnChain((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const result = await fetchOnChainWasm(contractId, network, { signal: requestController.signal })
      if (requestController.signal.aborted) return
      const artifact = await normalizeWasm(result.bytes, 'on-chain')
      setOnChain({ loading: false, error: null, artifact, wasmHashHex: result.wasmHashHex, latestLedger: result.latestLedger })
    } catch (error) {
      if (requestController.signal.aborted) return
      setOnChain({
        loading: false,
        error:
          error instanceof OnChainFetchError
            ? error
            : new OnChainFetchError({
                code: 'unavailable',
                message: `Unable to load the on-chain artifact: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
                retryable: true,
              }),
        artifact: null,
        wasmHashHex: null,
        latestLedger: null,
      })
    }
  }, [contractId, network])

  useEffect(() => {
    void refreshOnChain()
    return () => controller.current?.abort()
  }, [refreshOnChain])

  const addCandidateFromFile = useCallback(async (manifest: VerificationManifest, file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const artifact = await normalizeWasm(bytes, file.name)
    const buildResult: BuildWorkerResult = {
      status: 'succeeded', wasmBase64: null, logs: [`Loaded ${file.name} directly (no build worker invoked).`],
      durationMs: 0, workerOrigin: 'local-file', simulated: false, error: null,
    }
    const candidate: SourceCandidate = {
      id: manifest.id, label: file.name, manifest, artifact, buildResult, diff: null, createdAt: new Date().toISOString(),
    }
    setCandidates((prev) => [candidate, ...prev.filter((c) => c.id !== candidate.id)])
    return candidate
  }, [])

  const addCandidateFromBuildWorker = useCallback(
    async (manifest: VerificationManifest, options: { workerOrigin?: string; simulate?: boolean } = {}) => {
      const buildResult = options.workerOrigin
        ? await requestBuild(manifest, { origin: options.workerOrigin })
        : simulateBuild(manifest, '')

      let artifact: NormalizedWasmArtifact | null = null
      if (buildResult.status === 'succeeded' && buildResult.wasmBase64) {
        const bytes = base64ToBytes(buildResult.wasmBase64)
        artifact = await normalizeWasm(bytes, manifest.repository.commit.slice(0, 12))
      }
      const candidate: SourceCandidate = {
        id: manifest.id, label: `${manifest.repository.commit.slice(0, 12)} (${options.workerOrigin || 'simulated'})`,
        manifest, artifact, buildResult, diff: null, createdAt: new Date().toISOString(),
      }
      setCandidates((prev) => [candidate, ...prev.filter((c) => c.id !== candidate.id)])
      return candidate
    },
    []
  )

  const removeCandidate = useCallback((id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const runVerification = useCallback(
    async (candidateId: string, options: { attest?: boolean } = {}) => {
      if (!onChain.artifact) throw new Error('On-chain artifact is not loaded yet.')
      const candidate = candidates.find((c) => c.id === candidateId)
      if (!candidate || !candidate.artifact) throw new Error('Candidate artifact is not available yet.')

      const diff = compareArtifacts(candidate.artifact, onChain.artifact)
      const status = statusFromDiff(diff)

      let attestation: Attestation | null = null
      if (options.attest) {
        attestation = await generateAttestation({
          id: `${candidate.id}-${Date.now()}`,
          contractId,
          network,
          manifestId: candidate.manifest.id,
          candidateLabel: candidate.label,
          normalizedHash: candidate.artifact.normalizedHash,
          rawHash: candidate.artifact.rawHash,
          onChainHash: onChain.artifact.normalizedHash,
          status,
          generatedAt: new Date().toISOString(),
        })
      }

      const record: VerificationRecord = {
        id: `${candidateId}-${Date.now()}`,
        contractId,
        network,
        manifest: candidate.manifest,
        status,
        diff,
        attestation,
        onChainHash: onChain.artifact.normalizedHash,
        createdAt: new Date().toISOString(),
      }

      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, diff } : c)))
      await saveVerificationRecord(record)
      await loadHistory()
      return record
    },
    [candidates, onChain.artifact, contractId, network, loadHistory]
  )

  return {
    onChain,
    candidates,
    history,
    historyLoading,
    refreshOnChain,
    addCandidateFromFile,
    addCandidateFromBuildWorker,
    removeCandidate,
    runVerification,
  }
}

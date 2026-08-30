import { useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, Download, RefreshCw, ShieldCheck, Upload, XCircle } from 'lucide-react'
import useWasmVerification from '../../hooks/useWasmVerification'
import { useStore } from '../../lib/store'
import type { NetworkName } from '../../lib/stellar'
import { createEmptyManifestDraft, parseManifestJson, validateManifest } from '../../lib/wasmVerification/manifest'
import { parseCargoLock } from '../../lib/wasmVerification/dependencies'
import { verifyAttestation, exportAttestationJson } from '../../lib/wasmVerification/attestation'
import { isValidContractId } from '../../lib/stellar'
import type {
  Attestation,
  AttestationVerificationResult,
  DependencyInventory,
  SourceCandidate,
  ValidationIssue,
  VerificationManifest,
  VerificationRecord,
  VerificationStatus,
} from '../../types/wasmVerification'

type View = 'onchain' | 'manifest' | 'candidates' | 'diff' | 'dependencies' | 'attestations' | 'history' | 'methodology'

const panel: CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18 }
const button: CSSProperties = { minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }
const input: CSSProperties = { ...button, cursor: 'text', justifyContent: 'flex-start' }
const label: CSSProperties = { display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }

const STATUS_COLOR: Record<VerificationStatus, string> = {
  unverified: 'var(--text-secondary)', match: 'var(--green)', mismatch: 'var(--red)', error: 'var(--red)',
}

function StatusPill({ status }: { status: VerificationStatus }) {
  return (
    <span style={{ color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}`, borderRadius: 999, padding: '3px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
      {status}
    </span>
  )
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null
  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
      {issues.map((issue, index) => (
        <li key={`${issue.path}-${index}`} style={{ fontSize: 11, color: issue.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>
          <strong>{issue.path}</strong>: {issue.message}
        </li>
      ))}
    </ul>
  )
}

function OnChainView({ graph, contractId }: { graph: ReturnType<typeof useWasmVerification>; contractId: string }) {
  if (!contractId) {
    return <div role="status" style={{ ...panel, color: 'var(--text-secondary)' }}>Enter a contract ID above to load its on-chain WASM artifact.</div>
  }
  if (graph.onChain.loading) {
    return <div role="status" style={panel}><RefreshCw size={14} /> Fetching the deployed WASM from the network…</div>
  }
  if (graph.onChain.error) {
    return (
      <div role="alert" style={{ ...panel, display: 'grid', gap: 10 }}>
        <strong style={{ color: 'var(--red)' }}><AlertTriangle size={15} /> {graph.onChain.error.message}</strong>
        {graph.onChain.error.retryable && <button type="button" onClick={() => void graph.refreshOnChain()} style={{ ...button, width: 'fit-content' }}>Retry</button>}
      </div>
    )
  }
  const artifact = graph.onChain.artifact
  if (!artifact) return <div style={{ ...panel, color: 'var(--text-secondary)' }}>No on-chain artifact loaded.</div>
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Deployed WASM</h2>
        <div style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>Wasm hash: <code>{graph.onChain.wasmHashHex}</code></span>
          <span>Raw SHA-256: <code>{artifact.rawHash}</code></span>
          <span>Normalized SHA-256: <code>{artifact.normalizedHash}</code></span>
          <span>Size: {artifact.totalBytes.toLocaleString()} bytes ({artifact.sections.length} sections)</span>
          <span>Latest ledger observed: {graph.onChain.latestLedger}</span>
        </div>
      </div>
      <div style={panel}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Sections</h3>
        <div style={{ display: 'grid', gap: 4 }}>
          {artifact.sections.map((section) => (
            <div key={`${section.kind}-${section.id}-${section.name}`} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px', gap: 8, fontSize: 11, borderTop: '1px solid var(--border)', padding: '6px 0' }}>
              <span>{section.name}</span>
              <span>{section.sizeBytes.toLocaleString()} B</span>
              <span style={{ color: section.deterministic ? 'var(--text-secondary)' : 'var(--amber)' }}>{section.deterministic ? 'kept' : 'stripped'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ManifestView({
  contractId, network, draft, setDraft, jsonText, setJsonText, issues, onLoadFile, onAddFromWorker, workerOrigin, setWorkerOrigin,
}: {
  contractId: string
  network: string
  draft: VerificationManifest
  setDraft: (_m: VerificationManifest) => void
  jsonText: string
  setJsonText: (_t: string) => void
  issues: ValidationIssue[]
  onLoadFile: (_manifest: VerificationManifest, _file: File) => void
  onAddFromWorker: (_manifest: VerificationManifest, _origin: string | undefined) => void
  workerOrigin: string
  setWorkerOrigin: (_v: string) => void
}) {
  const parsedFromJson = useMemo(() => (jsonText.trim() ? parseManifestJson(jsonText) : null), [jsonText])
  const effectiveManifest = parsedFromJson?.manifest || draft
  const effectiveIssues = parsedFromJson ? parsedFromJson.issues : issues

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Build manifest</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: '0 0 10px' }}>
          Describe the repository, commit, toolchain, and build command that should reproduce this contract&apos;s WASM. Paste a manifest as JSON, or fill in the fields below.
        </p>
        <label style={label}>
          Manifest JSON (optional — overrides the fields below when present)
          <textarea
            aria-label="Manifest JSON"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={6}
            style={{ ...input, width: '100%', fontFamily: 'monospace', fontSize: 11 }}
            placeholder={`{\n  "schemaVersion": 1,\n  "contractId": "${contractId || 'C...'}",\n  ...\n}`}
          />
        </label>
        <IssueList issues={effectiveIssues} />
        {!jsonText.trim() && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
            <label style={label}>Repository URL
              <input aria-label="Repository URL" style={input} value={draft.repository.url}
                onChange={(e) => setDraft({ ...draft, repository: { ...draft.repository, url: e.target.value } })} />
            </label>
            <label style={label}>Commit SHA
              <input aria-label="Commit SHA" style={input} value={draft.repository.commit}
                onChange={(e) => setDraft({ ...draft, repository: { ...draft.repository, commit: e.target.value } })} />
            </label>
            <label style={label}>rustc version
              <input aria-label="rustc version" style={input} value={draft.toolchain.rustc}
                onChange={(e) => setDraft({ ...draft, toolchain: { ...draft.toolchain, rustc: e.target.value } })} />
            </label>
            <label style={label}>cargo version
              <input aria-label="cargo version" style={input} value={draft.toolchain.cargo}
                onChange={(e) => setDraft({ ...draft, toolchain: { ...draft.toolchain, cargo: e.target.value } })} />
            </label>
            <label style={label}>Build command
              <input aria-label="Build command" style={input} value={draft.buildCommand}
                onChange={(e) => setDraft({ ...draft, buildCommand: e.target.value })} />
            </label>
            <label style={label}>Expected WASM hash (sha256)
              <input aria-label="Expected WASM hash" style={input} value={draft.expectedWasmHash}
                onChange={(e) => setDraft({ ...draft, expectedWasmHash: e.target.value })} />
            </label>
          </div>
        )}
      </div>
      <div style={{ ...panel, display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>Add a source candidate</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: 0 }}>
          Either upload a WASM file you already built locally, or request a build from a configured worker. The browser never executes the build command itself.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...button, cursor: 'pointer' }}>
            <Upload size={13} /> Upload built .wasm
            <input
              type="file"
              accept=".wasm,application/wasm"
              aria-label="Upload built WASM file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file && effectiveManifest) onLoadFile(effectiveManifest, file)
                e.target.value = ''
              }}
            />
          </label>
          <label style={label}>
            Build worker origin (optional)
            <input aria-label="Build worker origin" style={{ ...input, width: 220 }} value={workerOrigin} onChange={(e) => setWorkerOrigin(e.target.value)} placeholder="https://build-worker.example.com" />
          </label>
          <button type="button" style={button} onClick={() => effectiveManifest && onAddFromWorker(effectiveManifest, workerOrigin.trim() || undefined)}>
            Request build
          </button>
        </div>
        {!network && <span style={{ fontSize: 10, color: 'var(--amber)' }}>Select a network first.</span>}
      </div>
    </div>
  )
}

function CandidatesView({ candidates, onVerify, onRemove, onSelect, canVerify }: {
  candidates: SourceCandidate[]
  onVerify: (_id: string, _attest: boolean) => void
  onRemove: (_id: string) => void
  onSelect: (_id: string) => void
  canVerify: boolean
}) {
  if (!candidates.length) {
    return <div role="status" style={{ ...panel, color: 'var(--text-secondary)' }}>No source candidates yet — add one from the Manifest tab.</div>
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {candidates.map((candidate) => (
        <article key={candidate.id} style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 13 }}>{candidate.label}</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{candidate.manifest.repository.url} @ {candidate.manifest.repository.commit.slice(0, 12)}</div>
            </div>
            {candidate.diff && <StatusPill status={candidate.diff.normalizedHashMatch ? 'match' : 'mismatch'} />}
          </div>
          {candidate.buildResult && candidate.buildResult.status !== 'succeeded' && (
            <div role="alert" style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{candidate.buildResult.error}</div>
          )}
          {candidate.artifact && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
              Normalized hash: <code>{candidate.artifact.normalizedHash}</code>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" style={button} disabled={!canVerify || !candidate.artifact} onClick={() => onVerify(candidate.id, false)}>Verify</button>
            <button type="button" style={button} disabled={!canVerify || !candidate.artifact} onClick={() => onVerify(candidate.id, true)}><ShieldCheck size={13} /> Verify &amp; attest</button>
            {candidate.diff && <button type="button" style={button} onClick={() => onSelect(candidate.id)}>View diff</button>}
            <button type="button" style={{ ...button, color: 'var(--red)' }} onClick={() => onRemove(candidate.id)}>Remove</button>
          </div>
        </article>
      ))}
    </div>
  )
}

function DiffView({ candidate }: { candidate: SourceCandidate | undefined }) {
  if (!candidate) return <div style={{ ...panel, color: 'var(--text-secondary)' }}>Select a candidate from the Candidates tab to view its diff.</div>
  if (!candidate.diff) return <div style={{ ...panel, color: 'var(--text-secondary)' }}>This candidate has not been verified yet.</div>
  const { diff } = candidate
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {diff.normalizedHashMatch ? <CheckCircle2 size={18} color="var(--green)" /> : <XCircle size={18} color="var(--red)" />}
          <strong>{diff.summary}</strong>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
          Raw byte match: {diff.rawHashMatch ? 'yes' : 'no'} · Normalized match: {diff.normalizedHashMatch ? 'yes' : 'no'}
        </div>
      </div>
      <div style={panel}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Section-level diff</h3>
        <div role="table" aria-label="Section diff" style={{ display: 'grid', gap: 4 }}>
          {diff.sections.map((section) => (
            <div key={section.key} role="row" style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 100px', gap: 8, fontSize: 11, borderTop: '1px solid var(--border)', padding: '7px 0' }}>
              <span>{section.name}</span>
              <span style={{ color: section.status === 'match' ? 'var(--text-secondary)' : section.status === 'added' ? 'var(--cyan)' : section.status === 'removed' ? 'var(--amber)' : 'var(--red)' }}>{section.status}</span>
              <span>{section.candidateSizeBytes ?? '—'}</span>
              <span>{section.onChainSizeBytes ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DependenciesView({ lockfileText, setLockfileText, inventory }: { lockfileText: string; setLockfileText: (_v: string) => void; inventory: DependencyInventory | null }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Dependency inventory</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: '0 0 10px' }}>Paste a Cargo.lock to inspect the exact dependency versions and sources a build used.</p>
        <textarea aria-label="Cargo.lock contents" value={lockfileText} onChange={(e) => setLockfileText(e.target.value)} rows={8} style={{ ...input, width: '100%', fontFamily: 'monospace', fontSize: 11 }} />
      </div>
      {inventory && (
        <div style={panel}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>{inventory.packageCount} packages</h3>
          {inventory.parseWarnings.map((warning) => <div key={warning} style={{ color: 'var(--amber)', fontSize: 11, marginBottom: 4 }}>{warning}</div>)}
          <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflow: 'auto' }}>
            {inventory.dependencies.map((dep) => (
              <div key={`${dep.name}-${dep.version}`} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 8, fontSize: 11, borderTop: '1px solid var(--border)', padding: '6px 0' }}>
                <span>{dep.name}</span>
                <span>{dep.version}</span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dep.source || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AttestationsView({ attestations, uploadText, setUploadText, verifyResult, onVerifyUpload }: {
  attestations: Attestation[]
  uploadText: string
  setUploadText: (_v: string) => void
  verifyResult: AttestationVerificationResult | null
  onVerifyUpload: () => void
}) {
  const download = (attestation: Attestation) => {
    const blob = new Blob([exportAttestationJson(attestation)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attestation-${attestation.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Generated attestations</h2>
        {attestations.length ? attestations.map((attestation) => (
          <div key={attestation.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: 12 }}>{attestation.candidateLabel}</strong>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{attestation.status} · {new Date(attestation.generatedAt).toLocaleString()}</div>
            </div>
            <button type="button" style={button} onClick={() => download(attestation)}><Download size={13} /> Download</button>
          </div>
        )) : <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>None yet — generate one from the Candidates tab (&quot;Verify &amp; attest&quot;).</span>}
      </div>
      <div style={panel}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Check an attestation for tampering</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11, margin: '0 0 8px' }}>
          Paste an attestation JSON document to independently re-verify its signature and payload hash. This proves the document was not modified after signing — it is not proof of code correctness or a security audit.
        </p>
        <textarea aria-label="Attestation JSON to verify" value={uploadText} onChange={(e) => setUploadText(e.target.value)} rows={6} style={{ ...input, width: '100%', fontFamily: 'monospace', fontSize: 11 }} />
        <button type="button" style={{ ...button, marginTop: 8 }} onClick={onVerifyUpload}>Check attestation</button>
        {verifyResult && (
          <div role="status" style={{ marginTop: 10, color: verifyResult.valid ? 'var(--green)' : 'var(--red)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            {verifyResult.valid ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {verifyResult.valid ? 'Attestation is intact and its signature is valid.' : verifyResult.reasons.join(' ')}
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryView({ records, loading }: { records: VerificationRecord[]; loading: boolean }) {
  if (loading) return <div role="status" style={{ ...panel, color: 'var(--text-secondary)' }}><RefreshCw size={14} /> Loading verification history…</div>
  if (!records.length) return <div style={{ ...panel, color: 'var(--text-secondary)' }}>No past verification records for this contract on this network yet.</div>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {records.map((record) => (
        <div key={record.id} style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 12 }}>{record.manifest.repository.commit.slice(0, 12)}</strong>
            <StatusPill status={record.status} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{new Date(record.createdAt).toLocaleString()} · {record.manifest.repository.url}</div>
        </div>
      ))}
    </div>
  )
}

function MethodologyView() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>How verification works</h2>
        <ul style={{ color: 'var(--text-secondary)', fontSize: 11, margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>The on-chain artifact is read directly from the network&apos;s Soroban RPC endpoint (contract instance → wasm hash → contract code entry).</li>
          <li>Both artifacts are parsed at the WASM section level; the &quot;producers&quot;, &quot;name&quot;, and any &quot;.debug_*&quot; custom sections are stripped before hashing, since those carry build-environment metadata rather than program semantics.</li>
          <li>A match on the normalized hash means the compiled code is identical; a match on the raw hash means the files are byte-for-byte identical, including metadata.</li>
          <li>Attestations are signed with a per-browser-session ECDSA key generated locally. They prove &quot;this browser session observed this result&quot; — not a trusted third-party signature, code audit, or security certification of the contract.</li>
          <li>The build worker integration only ever performs a single bounded HTTPS request to an origin you configure. The browser never executes a build command itself.</li>
        </ul>
      </div>
      <div style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>Known limitations</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>No build worker service ships with this feature — configure your own via the origin field, or upload a WASM file you built yourself. A verified match is evidence of reproducibility, not a guarantee the source code is free of vulnerabilities.</p>
      </div>
    </div>
  )
}

export default function WasmVerificationDashboard() {
  const { network } = useStore()
  const [contractIdInput, setContractIdInput] = useState('')
  const [activeContractId, setActiveContractId] = useState('')
  const graph = useWasmVerification(activeContractId, network as NetworkName)
  const [view, setView] = useState<View>('onchain')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [draft, setDraft] = useState<VerificationManifest>(() => createEmptyManifestDraft('', network))
  const [jsonText, setJsonText] = useState('')
  const [workerOrigin, setWorkerOrigin] = useState('')
  const [lockfileText, setLockfileText] = useState('')
  const [uploadAttestationText, setUploadAttestationText] = useState('')
  const [attestationVerifyResult, setAttestationVerifyResult] = useState<AttestationVerificationResult | null>(null)

  const draftIssues = useMemo(() => validateManifest({ ...draft, id: draft.id }).issues, [draft])
  const dependencyInventory = useMemo(() => (lockfileText.trim() ? parseCargoLock(lockfileText) : null), [lockfileText])
  const attestations = useMemo(() => graph.history.map((r) => r.attestation).filter((a): a is NonNullable<typeof a> => Boolean(a)), [graph.history])
  const selectedCandidate = graph.candidates.find((c) => c.id === selectedCandidateId)

  const handleContractSubmit = () => {
    const trimmed = contractIdInput.trim()
    if (!isValidContractId(trimmed)) return
    setActiveContractId(trimmed)
    setDraft((prev) => ({ ...prev, contractId: trimmed, network }))
  }

  const handleVerifyUpload = () => {
    try {
      const parsed = JSON.parse(uploadAttestationText)
      void verifyAttestation(parsed).then(setAttestationVerifyResult)
    } catch {
      setAttestationVerifyResult({ valid: false, reasons: ['Not valid JSON.'] })
    }
  }

  return (
    <section aria-labelledby="wasm-verification-title" style={{ display: 'grid', gap: 16 }}>
      <header style={{ ...panel, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>REPRODUCIBLE BUILDS · {network.toUpperCase()}</div>
          <h1 id="wasm-verification-title" style={{ margin: '6px 0', fontSize: 25 }}>WASM build verification</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, maxWidth: 650 }}>
            Prove that a published source and build produce the exact on-chain WASM, or see precisely where they diverge.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={label}>
            Contract ID
            <div style={{ display: 'flex', gap: 6 }}>
              <input aria-label="Contract ID" style={{ ...input, width: 260 }} value={contractIdInput} onChange={(e) => setContractIdInput(e.target.value)} placeholder="C..." />
              <button type="button" style={button} onClick={handleContractSubmit}>Load</button>
            </div>
          </label>
        </div>
      </header>

      <nav aria-label="WASM verification views" style={{ display: 'flex', gap: 5, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {(['onchain', 'manifest', 'candidates', 'diff', 'dependencies', 'attestations', 'history', 'methodology'] as View[]).map((item) => (
          <button type="button" key={item} aria-current={view === item ? 'page' : undefined} onClick={() => setView(item)}
            style={{ ...button, border: 0, borderBottom: view === item ? '2px solid var(--cyan)' : '2px solid transparent', borderRadius: 0, background: 'transparent', textTransform: 'capitalize' }}>
            {item}
          </button>
        ))}
      </nav>

      {view === 'onchain' && <OnChainView graph={graph} contractId={activeContractId} />}
      {view === 'manifest' && (
        <ManifestView
          contractId={activeContractId} network={network} draft={draft} setDraft={setDraft} jsonText={jsonText} setJsonText={setJsonText}
          issues={draftIssues} workerOrigin={workerOrigin} setWorkerOrigin={setWorkerOrigin}
          onLoadFile={(manifest, file) => void graph.addCandidateFromFile(manifest, file)}
          onAddFromWorker={(manifest, origin) => void graph.addCandidateFromBuildWorker(manifest, { workerOrigin: origin })}
        />
      )}
      {view === 'candidates' && (
        <CandidatesView
          candidates={graph.candidates}
          canVerify={Boolean(graph.onChain.artifact)}
          onVerify={(id, attest) => void graph.runVerification(id, { attest })}
          onRemove={graph.removeCandidate}
          onSelect={(id) => { setSelectedCandidateId(id); setView('diff') }}
        />
      )}
      {view === 'diff' && <DiffView candidate={selectedCandidate} />}
      {view === 'dependencies' && <DependenciesView lockfileText={lockfileText} setLockfileText={setLockfileText} inventory={dependencyInventory} />}
      {view === 'attestations' && (
        <AttestationsView
          attestations={attestations} uploadText={uploadAttestationText} setUploadText={setUploadAttestationText}
          verifyResult={attestationVerifyResult} onVerifyUpload={handleVerifyUpload}
        />
      )}
      {view === 'history' && <HistoryView records={graph.history} loading={graph.historyLoading} />}
      {view === 'methodology' && <MethodologyView />}
    </section>
  )
}

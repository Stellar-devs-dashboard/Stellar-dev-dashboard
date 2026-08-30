# Reproducible Builds & On-Chain WASM Verification

## Purpose

Let anyone prove that a published source repository, commit, toolchain, and build command reproduce the exact WASM currently deployed for a Soroban contract — or see precisely which sections diverge when they don't. This is decision support and evidence for investigation, not a security audit, and not proof the source code itself is free of vulnerabilities.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain types | `src/types/wasmVerification.ts` | Manifests, normalized artifacts, diffs, dependencies, attestations, records |
| WASM parsing | `src/lib/wasmVerification/wasm.ts` | Section-level parsing, non-deterministic-section stripping, hashing, diffing |
| Manifest validation | `src/lib/wasmVerification/manifest.ts` | Field-by-field validation, prototype-pollution and size-limit defenses |
| Dependency parsing | `src/lib/wasmVerification/dependencies.ts` | Minimal, purpose-built Cargo.lock reader |
| Attestations | `src/lib/wasmVerification/attestation.ts` | ECDSA signing/verification, canonical hashing, tamper detection |
| Build worker client | `src/lib/wasmVerification/buildWorker.ts` | Origin-restricted, timeout-bounded, size-capped HTTPS protocol client |
| On-chain fetch | `src/lib/wasmVerification/onChain.ts` | Soroban RPC contract-instance → contract-code lookup with an integrity check |
| Persistence | `src/lib/wasmVerification/records.ts` | Dedicated, versioned IndexedDB store for verification records |
| Redaction | `src/lib/wasmVerification/redaction.ts` | Shared secret-scrubbing helper used by logs, errors, and exports |
| Hook | `src/hooks/useWasmVerification.ts` | Orchestrates on-chain fetch, candidates, verification runs, and history |
| UI | `src/components/wasm-verification/WasmVerificationDashboard.tsx` | Lazy `/wasmVerification` route ("Build Verification" in the sidebar) |

This mirrors the layering already used by `src/lib/fraudDetection` and `src/lib/networkGraph` (types → algorithms → client/persistence → hook → UI), wired into `App.tsx`'s lazy-tab registry and `Sidebar.tsx`'s nav rather than shipped as isolated demo code.

## How verification works

1. **On-chain artifact.** `onChain.ts` reads the contract instance ledger entry to get the deployed wasm hash, then reads the contract-code ledger entry for that hash. It then re-hashes the fetched bytes and checks that they match the hash the instance declared — an integrity check the SDK's own `getContractWasmByContractId` convenience method does not perform, which is why this module implements the two-step lookup manually instead of using it directly.
2. **Normalization.** `wasm.ts` parses both the on-chain artifact and the locally-built (or uploaded) candidate at the WASM section level. The `producers` and `name` custom sections, and any `.debug_*` custom section, are stripped before hashing — these carry build-environment metadata (embedded absolute paths, compiler/linker version strings), not program semantics. Sections that could plausibly affect execution (e.g. `target_features`) are never stripped. Both a raw hash (unmodified bytes) and a normalized hash (after stripping) are computed, so the UI can distinguish "byte-identical" from "reproducible, differs only in build metadata".
3. **Diffing.** `compareArtifacts` matches sections by kind+id (standard sections) or kind+name (custom sections) and reports `match` / `added` / `removed` / `content-changed` per section, plus overall raw/normalized hash match flags.
4. **Attestation.** On request, `attestation.ts` signs the verification result (contract, network, manifest, both hashes, status) with an ECDSA P-256 key generated once per browser session, and exports a versioned, downloadable JSON document. `verifyAttestation` independently recomputes the payload hash and checks the signature — any field changed after signing, including the hash or signature itself, is detected and reported.
5. **Persistence.** Each verification run is saved as an immutable `VerificationRecord` (manifest + diff + on-chain hash + optional attestation) in a dedicated IndexedDB database, keyed by contract ID and network, capped at 100 records per contract with oldest-first pruning.

## Threat model

- **The browser never executes a build command.** `buildWorker.ts` only ever performs a single bounded HTTPS `fetch` to an origin the user explicitly configures (rejecting non-`https://` origins, origins with embedded credentials, and origins with a path component). There is no code path from a manifest's `buildCommand` string to actual execution anywhere in this feature — it is stored and displayed, never run.
- **A verified match is not a security audit.** UI copy throughout (Methodology tab, attestation-check panel) explicitly states this: reproducibility proves the deployed bytecode came from the stated source and build, not that the source is free of vulnerabilities.
- **Attestations prove session observation, not identity.** The signing key is generated fresh per browser session and never leaves the browser; it is not tied to any real-world identity or trusted CA. An attestation says "this browser session, at this time, observed this comparison result" — nothing more. This is stated in the UI and in `AttestationInput`'s doc comment.
- **Malicious manifests are rejected, not merely warned about.** `parseManifestJson` enforces a byte ceiling before calling `JSON.parse`; `validateManifest` rejects `__proto__`/`prototype`/`constructor` keys anywhere in the structure before any property access, rejects non-`https://` repository URLs and URLs with embedded credentials, caps every string field's length, and rejects control characters. Every problem is collected and reported rather than throwing on the first one, so the UI can show a complete, actionable list — see `manifest.test.ts` for the adversarial cases covered.
- **Oversized artifacts are rejected, not silently truncated or OOM'd.** `MAX_WASM_BYTES` (20MB, shared with the existing contract-deployment `WASMProcessor`) is enforced before parsing a WASM file, and `buildWorker.ts` enforces its response-size cap by reading the stream incrementally and aborting mid-transfer the moment the cap is exceeded — it does not trust (or wait for) a `Content-Length` header, so a worker cannot exhaust browser memory by lying about or omitting it.
- **Secrets are redacted by default.** `redaction.ts` strips bearer-token-shaped strings, URL userinfo, and `key:`/`token:`-style fields from build-worker logs and error messages before they reach the UI, console, or any stored/exported record. Manifest validation independently rejects repository URLs with embedded credentials at the input boundary.

## Persistence format & versioning

Both the manifest (`schemaVersion: 1`) and the attestation (`schemaVersion: 1`) are explicit, versioned JSON contracts. `validateManifest` and `verifyAttestation` both check the schema version and reject anything they don't recognize with a clear message rather than guessing at a shape — the pattern any future `schemaVersion: 2` migration should extend (add a version branch, keep old-version parsing working, never silently coerce). Verification records carry the manifest they were generated from unmodified, so a record from an older manifest schema stays fully inspectable even after the manifest format evolves.

Verification records live in their own IndexedDB database (`stellar-wasm-verification`, independently versioned) rather than a new object store bolted onto the shared `stellar-dev-dashboard` database used by `src/lib/storage.ts`. That database's version/migration path is shared by many unrelated features; owning a dedicated, independently versioned database keeps this feature's future schema changes from ever risking a migration bug in the rest of the app.

## Known limitations

- **No build worker service ships with this feature.** The issue's scope calls for "secure integration with a local or remote build worker" — this PR delivers the client-side protocol (origin restrictions, timeouts, streamed size limits, redaction) against a worker you configure yourself, or an explicit "upload a WASM you already built" path. Standing up an actual containerized Soroban build service is backend infrastructure outside a frontend PR's scope; `docs/wasm-verification.md`'s Follow-up section proposes it.
- **Dependency parsing covers Cargo.lock only**, via a minimal purpose-built reader (not a general TOML parser), sufficient for the four fields verification cares about (name/version/source/checksum).
- **The on-chain fetch depends on the configured Soroban RPC endpoint's retention.** Evicted contract code (temporary storage that expired) surfaces as a clear "not found" error, not a crash.
- Section-level diffing identifies which named/standard sections changed, not a byte-level diff *within* a changed section (e.g. it won't point at which function in the Code section differs) — see Follow-up.

## Follow-up work

1. A `services/wasm-build-worker` reference implementation (containerized, sandboxed `soroban contract build` runner speaking the protocol `buildWorker.ts` already expects) so a real worker is a documented deployment away rather than bespoke for every operator.
2. Byte-offset-level diffing inside a changed section (e.g. disassembling the Code section) for deeper failure diagnostics.
3. Multi-network batch verification (verify the same manifest against a contract's testnet and mainnet deployments in one pass).
4. Optional server-side attestation co-signing for operators who want a persistent, cross-session key rather than the current per-session ECDSA key.

## Extending

1. To strip an additional non-deterministic custom section, add its name (or a prefix) to `NON_DETERMINISTIC_SECTION_NAMES` / the prefix list in `wasm.ts` and cover it in `wasm.test.ts`'s "differ only in metadata" style test.
2. To add a new manifest field, extend `VerificationManifest` in `types/wasmVerification.ts`, add its check in `manifest.ts`'s `validateManifest`, and bump `MANIFEST_SCHEMA_VERSION` if the change isn't backward compatible.
3. To add a new attestation field, extend `AttestationInput`/`Attestation`, update `attestationPayload` and `REQUIRED_FIELDS` in `attestation.ts` together (the payload hash covers exactly the payload fields, so both must move in lockstep), and bump `ATTESTATION_SCHEMA_VERSION` if older attestations would fail to parse.

## Troubleshooting

- **"Contract not found" on the On-Chain tab** — the contract ID is well-formed but has no instance on the selected network; double check the network selector matches where the contract is actually deployed.
- **"Integrity check failed"** — the fetched contract code's hash doesn't match what the contract instance declares. This should not happen against a healthy RPC endpoint; it indicates either a misbehaving/stale RPC node or ledger inconsistency worth reporting to the RPC operator.
- **A candidate never gets past "loading"** — if using a build worker, check its origin is reachable over HTTPS and returns within the configured timeout; if uploading a file, confirm it's an actual `.wasm` binary (the parser rejects anything without the WASM magic bytes).
- **An attestation fails the tamper check after a copy/paste round-trip** — most often stray whitespace/newline normalization from an editor changed the JSON text such that `JSON.parse` reconstructs different key ordering *values* (not just order, which canonicalization handles) — always copy the full document via the "Download" button rather than retyping it.

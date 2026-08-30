# Portable Ledger Snapshots and Deterministic Offline Replay

## Purpose

Portable ledger snapshots freeze network identity, ledger metadata, accounts, contract storage, TTLs, and captured simulation responses so bug reports and regression tests can be reproduced without a live network.

**Important:** Offline replay is **diagnostic simulation** — it replays recorded simulation responses against immutable snapshot state. It is **not** consensus-equivalent Soroban or classic execution.

## Architecture

| Layer | Location |
|-------|----------|
| Types | `src/types/ledgerSnapshots.ts` |
| Domain logic | `src/lib/ledgerSnapshots/` |
| React hook | `src/hooks/useLedgerSnapshots.ts` |
| UI workspace | `src/components/ledger-snapshots/` |
| E2E | `tests/e2e/ledger-snapshots.spec.ts` |

### Domain modules

- **canonicalize.ts** — Stable JSON ordering and SHA-256 integrity digests
- **schema.ts** — Validation, migration, import parsing
- **captureClient.ts** — Footprint-driven live capture with progress and cancellation
- **repository.ts** — IndexedDB library with compare, prune, tagging, pinning
- **replayEngine.ts** — Deterministic replay of captured simulations
- **diffEngine.ts** — Ledger entry diff and inspection helpers
- **exportImport.ts** — Safe JSON/compressed import/export and sanitized bundles
- **redaction.ts** — Privacy-first redaction for exports and errors
- **fixtures.ts** — Deterministic demo data for offline exploration and tests

## Data model

Snapshots use format kind `stellar-dev-dashboard/ledger-snapshot` at schema version `1`. Integrity is SHA-256 over a canonical payload excluding timestamps and provenance noise.

Replay results use format kind `stellar-dev-dashboard/replay-result` and include a timeline, per-simulation match results, and unsupported-feature diagnostics.

## User workflow

1. Open **Ledger Snapshots** from the sidebar.
2. Browse the IndexedDB library or load the deterministic demo snapshot when offline.
3. **Capture** a footprint-limited snapshot from the connected account (never includes secret keys).
4. **Inspect** accounts, ledger entries, and captured simulations.
5. **Compare** two snapshots for ledger entry diffs.
6. **Replay** captured simulations deterministically (diagnostic mode).
7. **Export** sanitized bundles for sharing.

## Privacy and security

- Secret keys are never captured, persisted, or exported.
- Standard redaction masks account/contract identifiers; strict redaction removes them entirely.
- Import validates schema version and SHA-256 integrity before persistence.
- UI errors and logs pass through redaction helpers.

## Compatibility and migration

- Schema version `1` is current.
- Imports missing `schemaVersion` are upgraded to v1 with explicit diagnostic-only compatibility flags.
- Unsupported newer schema versions are rejected with actionable errors.

## Known limitations

- Offline replay returns captured simulation responses; it does not execute Soroban host functions.
- Live capture requires reachable Horizon (and Soroban RPC for contract storage).
- Compression uses `CompressionStream` when available; otherwise exports uncompressed JSON.

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Integrity mismatch on import | Re-export from source; do not hand-edit snapshot JSON |
| Unsupported schema version | Upgrade dashboard or request migration support |
| Replay blocked in strict mode | Review unsupported feature diagnostics; re-capture or disable strict mode |
| Empty library offline | Click **Explore offline demo snapshot** or import a JSON file |

## Maintainer notes

- Follow treasury reconciliation and resource profiling layering conventions.
- Inject clock/ID factories in tests for determinism.
- Add MSW Horizon/Soroban handlers when extending capture tests.
- Register new E2E specs in `test:e2e:critical` when promoting to required CI.

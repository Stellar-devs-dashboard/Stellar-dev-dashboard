# Stellar Protocol and Soroban RPC Compatibility

The compatibility workspace at `/compatibility` turns protocol support into an evidence-backed domain decision instead of discovering incompatibilities during transaction or contract execution. It correlates the dashboard's installed Stellar SDK/XDR capability with the selected network, observed RPC API surface, retention, limits, saved artifacts, and temporary maintainer decisions.

## Goals and guarantees

The feature is designed around five guarantees:

1. **Unknown is not compatible.** A protocol outside the reviewed matrix, a missing observation, an expired probe, or an undecodable response remains gated.
2. **Every decision has evidence and freshness.** The assessment and every feature gate reference probe/matrix/override evidence and an explicit expiry.
3. **Hard failure differs from degraded mode.** Missing identity, required RPC, or SDK/XDR support disables a workflow. Missing optional enrichment keeps the workflow available with an explanation.
4. **Endpoint identity comes before availability.** A healthy endpoint with a different passphrase or contradictory protocol evidence is a critical contradiction, not a failover candidate.
5. **Secrets are not compatibility data.** Authentication headers are request-only. Errors, persistence, UI, and exports are redacted by default.

## Architecture

The implementation separates domain logic, infrastructure, state transitions, and presentation.

| Boundary           | Modules                                                   | Responsibility                                                                                                              |
| ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Typed contracts    | `src/types/compatibility.ts`                              | Versioned matrix, probe, evidence, feature gate, comparison, audit, override, and export contracts                          |
| Reviewed matrix    | `src/lib/compatibility/matrix.ts`                         | Protocol 20–27 release mapping, SDK/XDR requirements, RPC method catalog, dashboard feature requirements, matrix validation |
| Probe service      | `src/lib/compatibility/probe.ts`                          | Bounded cancellable Horizon/RPC observation, safe method probes, retention/limit extraction, correlation warnings           |
| Decision engine    | `src/lib/compatibility/assessment.ts`                     | Freshness, feature gates, overall status, contradictions, active overrides, endpoint comparison                             |
| Upgrade audit      | `src/lib/compatibility/audit.ts`                          | Typed inventory import/discovery and deterministic artifact readiness rules                                                 |
| Persistence/export | `src/lib/compatibility/{persistence,export,redaction}.ts` | Version checks, bounded JSON, local cache, override storage, recursive redaction, stable JSON export                        |
| React state        | `src/hooks/useCompatibility.ts`                           | Cancellation lifecycle, cache/offline behavior, retries, comparison probes, audit and override transitions                  |
| Presentation       | `src/components/compatibility/*`                          | Status, compare, audit, history, override, loading/error/empty/degraded/offline workflows                                   |

The probe depends on the `ProbeService` interface. Tests supply deterministic HTTP fixtures without a hidden live-network dependency. The hook accepts an alternate service for component or embedding integrations.

## Matrix lifecycle

`COMPATIBILITY_MATRIX` uses two independent version concepts:

- `schemaVersion` controls the serialized TypeScript/JSON shape and migration handling.
- `matrixVersion` uses `YYYY.MM.REVISION` and identifies the reviewed protocol knowledge.

A release entry connects:

- protocol number and lifecycle;
- minimum reviewed `@stellar/stellar-sdk` line;
- matching XDR label and protocol range;
- required identity RPC methods and optional methods;
- dashboard workflows available in that protocol;
- behavior-changing release notes.

The installed build has its own `INSTALLED_SDK_PROFILE`. A matrix entry for a newer protocol documents the required upgrade; it does not claim that the currently installed SDK can decode that protocol.

### Updating the matrix

1. Read the official [Stellar software version table](https://developers.stellar.org/docs/networks/software-versions), protocol release notes, XDR release, and [RPC changelog](https://github.com/stellar/stellar-rpc/blob/main/CHANGELOG.md).
2. Update the protocol release, minimum SDK/XDR line, method changes, and feature requirements together.
3. Add old/current/future and malformed-evidence fixtures.
4. Run `validateMatrix` and all compatibility tests.
5. Exercise saved envelopes, transaction metadata, events, contract entries, and simulations with deterministic fixtures for the new protocol.
6. Bump `matrixVersion`. Bump `schemaVersion` only if persisted/exported shapes change.
7. Document migration and invalidate any cached result whose semantics changed.

A proposed future protocol must remain unreviewed until its final network/RPC/XDR behavior is known. Preview support can use a matrix entry with lifecycle `preview`; it is still subject to the installed SDK range.

## Probe behavior

A network target contains a label, Horizon URL, Soroban RPC URL, expected passphrase, and optional request headers. Headers never enter `NetworkProbeResult`.

The browser probe performs:

- Horizon root identity and latest-ledger queries;
- `getHealth`, `getNetwork`, `getLatestLedger`, `getFeeStats`, and `getVersionInfo` no-parameter calls;
- bounded read-only capability calls for ledger entries, transactions, and events;
- intentionally invalid XDR input for `simulateTransaction` and `sendTransaction` so method recognition can be distinguished from method absence without executing or submitting anything;
- correlation of protocol and ledger evidence from multiple sources;
- retention extraction from transaction/event responses;
- reported-limit extraction without optimistic defaulting;
- allow-listed vendor response headers and version fields.

A JSON-RPC `-32601` response means the method is missing. Other structured JSON-RPC errors mean the method exists but rejected the probe input. Malformed response shapes remain unknown.

### Network safety

- Every request shares caller cancellation.
- Each request has a bounded timeout (8 seconds in the hook, clamped to 0.5–30 seconds in the service).
- Responses larger than 2 MB are rejected.
- Imported documents are limited to 1 MB and 1,000 artifacts.
- Comparison endpoints do not inherit primary endpoint authentication headers.
- No probe sends a valid signed transaction or executable envelope.
- Error objects keep redacted endpoint context and retry classification.

## Status model

| Status          | Meaning                                                                              | Default feature behavior                                              |
| --------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `compatible`    | Direct evidence satisfies protocol, SDK/XDR, and required methods                    | Enabled                                                               |
| `degraded`      | Required behavior works but optional evidence/capability is missing                  | Enabled with visible explanation                                      |
| `incompatible`  | Reviewed hard requirement fails, installed SDK is too old, or protocol is unreviewed | Disabled                                                              |
| `unknown`       | Required evidence is missing, malformed, or expired                                  | Disabled                                                              |
| `contradictory` | Sources/endpoints disagree on identity or protocol                                   | Writes should pause; features are gated by their underlying decisions |
| `offline`       | No fresh endpoint observation was possible                                           | Cached evidence shown as informational; fresh validation required     |

Overall status uses the worst feature state, then elevates offline, contradiction, unknown protocol, unreviewed protocol, installed SDK mismatch, and expired evidence as applicable.

## Dashboard workflow

### Status

The Status view displays:

- overall compatibility, action, and freshness;
- observed protocol and installed SDK range;
- network passphrase and server build versions;
- latest/oldest ledger and estimated retention;
- per-method support and latency;
- reported limits;
- every dashboard feature gate with required/optional methods;
- expandable evidence ledger.

### Compare

The Compare view holds up to five probes in memory. It reports critical identity/protocol differences and warning-level ledger, retention, or optional-method drift. Do not configure a contradictory endpoint as automatic failover.

### Upgrade audit

The audit accepts locally discovered records or a versioned import:

```json
{
  "schemaVersion": 1,
  "kind": "upgrade-audit-inventory",
  "exportedAt": "2026-08-28T12:00:00.000Z",
  "artifacts": []
}
```

Rules cover:

- **saved envelopes:** explicit XDR/protocol provenance and Soroban rebuild/re-simulation;
- **snapshots:** protocol match and seven-day freshness policy;
- **contract artifacts:** WASM digest, SDK, interface, and protocol provenance;
- **plugins:** bounded `minimumProtocol`/`maximumProtocol` manifest declaration;
- **custom networks:** Horizon, RPC, and passphrase presence plus active identity assessment;
- **cached data:** schema, protocol, and timestamp provenance.

An empty inventory still runs matrix/SDK readiness. An unreviewed protocol or target XDR newer than the installed SDK blocks readiness before artifact-level conclusions.

### Change history

The Change History view presents the matrix release entries in reverse order. This is operational context, not a substitute for release-note review.

### Maintainer overrides

Overrides are:

- target-specific;
- feature-specific or global;
- attributed;
- reasoned (minimum 10 characters);
- limited to 30 days;
- stored in a versioned local document;
- visible in feature evidence and exports;
- discarded after expiry.

Prefer a reviewed matrix update for generally supported behavior. A compatible override can enable a gate, so maintainers should cite a reproducible vendor fixture and keep the expiry short.

## Persistence and migration

### Keys

- probes: `stellar:compatibility:probe:v1:<target-id>`;
- overrides: `stellar:compatibility:overrides:v1`.

Probe cache defaults to five minutes. Cache validation checks the outer and inner schema, required fields, size, and target identity. Invalid/obsolete cache records are deleted. Future schema versions are rejected rather than partially interpreted.

When schema 2 is introduced:

1. keep a parser for schema 1 if a lossless migration exists;
2. construct a new schema-2 value instead of mutating parsed untrusted input;
3. reapply redaction after migration;
4. add round-trip, malformed, and forward-version tests;
5. update cache key suffix and the import/export documentation;
6. invalidate schema-1 data if semantic evidence cannot be preserved.

No migration currently exists because schema 1 is the first release.

## Export contract

Compatibility report exports use:

```json
{
  "schemaVersion": 1,
  "kind": "compatibility-report",
  "exportedAt": "ISO-8601",
  "redacted": true,
  "matrixVersion": "2026.08.1",
  "assessment": {},
  "comparison": null,
  "audit": null
}
```

The export is recursively redacted immediately before serialization. Authentication headers are absent by construction. Query credentials, bearer values, secret-like keys, and Stellar secret seeds are redacted. Artifact payloads are represented only by audit findings and safe provenance.

## Security and privacy threat model

### Assets

- custom RPC/Horizon endpoint identity;
- request-only authorization headers;
- network passphrases and public server metadata;
- saved transaction/contract provenance;
- maintainer decisions;
- availability of transaction submission workflows.

### Threats and controls

| Threat                                            | Control                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Wrong-network endpoint substitution               | Expected/observed passphrase comparison; critical endpoint contradiction          |
| RPC claims health while methods are absent        | Per-method JSON-RPC evidence; required vs optional gates                          |
| Future protocol decoded as an older known version | Exact matrix lookup and installed SDK/XDR range check                             |
| Stale cached success reused during outage         | Explicit expiry, offline state, cached confidence, fresh validation action        |
| Secret leakage in errors/storage/export           | Header omission, endpoint/text/recursive redaction, allow-listed response headers |
| Oversized or malformed input                      | Byte/record limits, shape validation, schema rejection                            |
| Hanging network/UI                                | AbortController lifecycle and per-request timeout                                 |
| Override silently weakening a gate                | Attribution, reason, expiry, visible evidence, versioned persistence              |
| Valid probe accidentally submits a transaction    | Only invalid XDR is sent to submission/simulation capability probes               |
| Vendor failover crosses networks                  | Comparison passphrase/protocol critical differences                               |

This dashboard is a browser client. Browser extensions, a compromised origin, or malicious dependencies with page access can read page state. Store endpoint secrets only in the existing session-only custom-network mechanism and apply normal browser/origin hardening.

## Accessibility and responsive behavior

- Every view is reachable by keyboard buttons with `aria-current`.
- View changes focus the page heading without scrolling.
- Loading uses `aria-busy` and polite live output.
- Errors use `role=alert`; degraded/offline state uses status messaging.
- Method color indicators include screen-reader text.
- Tables are horizontally scrollable while retaining semantic markup.
- Controls meet minimum touch sizing and have visible `:focus-visible` outlines.
- Layout collapses at 900 px and 560 px.
- `prefers-reduced-motion` reduces animations and transitions.
- Unit and Playwright axe checks cover a complete and degraded result.

## Testing

Deterministic coverage includes:

- matrix consistency and SDK version comparisons;
- old/current and unknown future protocols;
- required, optional, missing, and unknown methods;
- contradictory protocol/passphrase/ledger/retention evidence;
- stale cache, malformed persistence, forward schemas, and active/expired overrides;
- timeout, cancellation, malformed/structured JSON-RPC behavior, and offline mode;
- every audit artifact category and bounded import validation;
- React rendering and WCAG 2.1 AA checks;
- Chromium/Firefox/WebKit/mobile workflows through Playwright;
- a stable Chromium visual baseline.

Run:

```bash
npm ci
npm run lint
npm run format:check
npm run type-check
npm run test:coverage
npm run build
npm run test:e2e
npm run test:visual
npm audit --audit-level=high
```

No test contacts a live Stellar endpoint. Unit tests use MSW; E2E tests intercept Horizon/RPC and abort all unrelated remote hosts.

## Troubleshooting and recovery

### Protocol is unknown

Verify that `getNetwork` or `getLatestLedger` returns a numeric/string numeric `protocolVersion`, or that Horizon latest ledger exposes `protocol_version`. Malformed values are intentionally ignored.

### Identity is contradictory

1. Stop transaction submissions.
2. Compare observed passphrases.
3. Verify DNS, proxy, custom profile, and vendor routing.
4. Confirm Horizon and RPC are tracking the same network.
5. Refresh after ledger lag falls below the five-ledger warning threshold.

### Endpoint times out

Check CORS, connectivity, proxy policy, and RPC health. The probe will report timeout with redacted endpoint context. Retry does not reuse a failed in-flight request.

### Offline cache appears

Cached evidence is informational. Reconnect and use **Refresh evidence**. If identity changed, discard cached data and run the upgrade audit again.

### SDK is too old

Use the matrix entry's reviewed SDK version, update the lockfile, rebuild, and rerun all gates. Recreate saved Soroban envelopes and simulations after the SDK/XDR upgrade.

### Browser storage is blocked

The live observation remains available for the current component lifetime and a warning appears. Overrides and offline recovery need working local storage. Do not weaken browser privacy controls solely to persist compatibility results.

### Rollback

The feature is isolated behind the lazy `compatibility` tab. Operational rollback is:

1. stop routing users to `/compatibility`;
2. revert the feature commit;
3. remove `stellar:compatibility:*` local keys if desired (the rest of the dashboard ignores them);
4. rebuild and rerun the same CI gates.

Compatibility code does not migrate or mutate existing transaction, contract, plugin, network-profile, or cache records.

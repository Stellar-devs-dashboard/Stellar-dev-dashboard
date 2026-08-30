# Privacy-safe diagnostics and guided incident troubleshooting

The dashboard exposes a local incident workspace at `/diagnostics`. It records a small, redacted history of browser-side behavior, runs bounded read-only checks, and creates reviewable JSON bundles. The feature has no telemetry or upload transport. A bundle leaves the page only after the user selects **Download JSON**.

## User workflow

1. Open **Diagnostics** without connecting a wallet or account.
2. Review **Status** for capture, redaction, storage, environment, and endpoint state.
3. Open **Guided checks** and choose the incident class that matches the symptom.
4. Apply a documented non-destructive remediation and run the flow again.
5. In **Bundle preview**, choose each included section and optional field.
6. Generate a preview and inspect its counts, omissions, expiry, and SHA-256 manifest.
7. Optionally save up to five unexpired bundles in browser storage or download JSON.
8. Import an earlier verified bundle in **Compare** to see evidence deltas locally.
9. Use **Clear local data** to remove capture, previews, runs, comparisons, and saved bundles.

The route is public because endpoint, rendering, storage, and worker incidents can prevent account connection. It does not request a wallet account, public key, signature, or transaction.

## Architecture

The implementation deliberately separates trust boundaries:

| Boundary            | Location                                 | Responsibility                                                            |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Contracts           | `src/types/diagnostics.ts`               | Versioned events, problems, flows, manifests, repository and service APIs |
| Redaction           | `src/lib/diagnostics/redaction.ts`       | Deterministic redact-before-capture traversal and bounds                  |
| Capture             | `src/lib/diagnostics/collector.ts`       | Event/breadcrumb rings, causal requests, browser and fetch observation    |
| Environment         | `src/lib/diagnostics/environment.ts`     | Coarse browser, storage, feature and service-worker metadata              |
| Guided checks       | `src/lib/diagnostics/troubleshooting.ts` | Cancellable, timed, non-destructive probes and remediation mapping        |
| Bundles             | `src/lib/diagnostics/bundle.ts`          | Inclusion, preview, SHA-256, import validation, comparison and download   |
| Persistence         | `src/lib/diagnostics/persistence.ts`     | Versioned local envelope, bounds, expiry, migration and memory fallback   |
| State orchestration | `src/hooks/useDiagnostics.ts`            | React lifecycle, state transitions, cancellation and workflow actions     |
| Presentation        | `src/components/diagnostics/`            | Accessible status, guide, preview, comparison and privacy workflows       |

No presentation component reads or writes browser storage directly. No domain module depends on React. The troubleshooting service accepts typed clock, fetch, storage, event, and abort-signal dependencies so tests do not need live endpoints.

## Versioned event contract

`DiagnosticEvent.schemaVersion` is currently `1`. Categories cover:

- `request`: bounded fetch lifecycle and connectivity;
- `stream`: subscription/connect/disconnect behavior;
- `wallet`: bridge availability and connection behavior;
- `signing`: signing lifecycle without XDR or signatures;
- `storage`: storage/cache availability and failure;
- `rendering`: mount, theme, boundary, and runtime evidence;
- `performance`: coarse duration and budget evidence;
- `service-worker`: registration, control and normalized cache metadata;
- `navigation`: reproducible feature transitions;
- `runtime`: initialization, unhandled errors, and guide results.

Every event includes a monotonic sequence, timestamp, severity, outcome, source, redaction count, and truncation state. Optional `requestId`, `correlationId`, and `causationId` fields link request start/completion without retaining request bodies or credentials. A request completion is idempotent: a second finish call adds no evidence.

The collector holds at most 250 events and 100 breadcrumbs by default. Configuration is clamped to 1,000 events, 500 breadcrumbs, and 256 KiB per event. The normal per-event ceiling is 32 KiB. Evicted event counts remain visible; cleared values do not.

## Privacy and redaction

Redaction occurs synchronously before an event or breadcrumb enters the ring. Bundle construction applies the same boundary again, and import verifies that content is already a fixed point of that contract.

Built-in detection covers:

- Stellar secret seeds, account IDs, muxed IDs, and contract IDs;
- bearer tokens, JWT-like tokens, and credential query parameters;
- signature, signed-payload, proof, XDR, envelope, WASM and bytecode fields;
- URL fields and URLs embedded in text;
- emails, UUIDs, local home-directory names and local identifier fields;
- authorization, cookies, API keys, passwords, passphrases and mnemonic fields;
- binary buffers and blobs.

URLs are replaced with a protocol/host classification when parsing succeeds; paths, queries, fragments, credentials, and ports are omitted. Sensitive structured fields receive typed replacement markers such as `[REDACTED_XDR]` or `[REDACTED_ACCOUNT_ID]`.

Users can define up to 20 session-only literal rules. Each literal is 3–128 characters and is treated as plain text rather than executable regular expression input. Rule IDs are validated and unique. Literal values remain only in memory, are rendered as password inputs, are not displayed after creation, and are excluded from exported or persisted data.

Traversal is deterministic and defensive:

- object keys are sorted for stable output;
- cyclic references become `[CIRCULAR]`;
- hostile getters become `[UNREADABLE_PROPERTY]`;
- prototype mutation keys are skipped or rejected on import;
- depth, node, string, array, object-key, event and total byte limits apply;
- non-finite numbers, functions, symbols, errors, dates and binary inputs have explicit forms.

### Threat model

The design protects against accidental support-data disclosure, oversized/cyclic application objects, storage denial, malicious imported JSON, and unnoticed bundle modification. It also prevents this feature from silently transmitting diagnostics.

The boundary does not encrypt exports, attest their author, or defend page memory from a compromised same-origin script or privileged browser extension. Keep secret keys outside the dashboard. Review the preview and use an appropriate support channel for a downloaded file.

## Browser capture

`installBrowserDiagnosticCapture()` is installed before React renders and is idempotent. It observes:

- browser error and unhandled-rejection summaries;
- online/offline transitions;
- service-worker message type only;
- fetch method, redacted URL classification, same/remote-origin class, body presence, status, response type and duration.

It does **not** retain headers, request or response bodies, wallet values, raw endpoint URLs, response content, signatures, XDR, or form input. The wrapper rethrows original fetch failures and returns original responses, so it does not change request semantics. Cleanup restores the original fetch implementation and removes listeners.

## Environment and worker metadata

Environment capture is coarse: application version/mode, browser family, platform class, online/cookie state, viewport dimensions, optionally language/timezone, and bucketed storage usage/quota. It omits user agent strings, IP addresses, device labels and high-precision capacity.

Service-worker capture reports support, control, lifecycle state, same-origin scope classification, and normalized cache names. It never reads cache entries, unregisters a worker, activates a waiting worker, or deletes a cache.

## Guided checks

Every individual asynchronous check has a timeout of 500–4,000 ms and shares the caller's `AbortSignal`. Flows execute sequentially so cancellation prevents later probes.

| Flow                   | Checks                                                           | Explicit exclusions                                     |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Endpoint connectivity  | `navigator.onLine`, Horizon root `GET`, Soroban RPC `getHealth`  | No account query or transaction RPC                     |
| Wallet connection      | online state, injected bridge presence, redacted recent evidence | No account request, connect popup or signature          |
| Transaction submission | online state, RPC health, redacted lifecycle evidence            | No build, simulation, sign or submission                |
| Rendering failure      | mounted root, required CSS tokens, redacted runtime evidence     | No DOM or theme mutation                                |
| Storage failure        | temporary write/read/delete, cache-name listing, evidence        | No clearing or reading application values/cache entries |
| Offline/service worker | online state, registration/controller state, cache-name listing  | No unregister, skip-waiting or cache deletion           |

A temporary storage check uses only `__stellar_diagnostic_roundtrip__` and removes it after success or failure. Remediation records carry `destructive: false`, step-by-step guidance, and a stable documentation anchor. A failed, skipped, warning, resolved or cancelled run remains distinguishable.

### Remediation guide

- **Browser offline:** restore the network, confirm the browser is no longer in offline mode, then rerun endpoint connectivity.
- **Horizon or RPC failure:** verify the selected network/profile, compare status outside the dashboard, remove local proxy/VPN interference, then rerun. Do not paste API credentials into evidence.
- **Wallet bridge absent:** unlock/enable the expected extension for this origin, reload once, and use the normal Wallet workspace. The guide itself never opens the extension.
- **Rendering tokens missing:** reload static assets, confirm the deployed CSS matches the application build, and inspect the redacted runtime event names.
- **Storage unavailable:** permit site storage or continue in memory-only mode. Download a reviewed bundle before closing the tab if evidence is needed.
- **Worker waiting or missing:** use HTTPS/localhost, reload once, verify browser worker permissions, and continue online if worker support is unavailable.

## Bundle contract

An export has `kind: "stellar-dashboard-diagnostic-bundle"` and `schemaVersion: 1`.

The manifest contains:

- canonical `SHA-256` digest of the version, identity, timestamps, manifest fields, inclusion choices, and content (excluding the digest field itself);
- generated and expiry timestamps;
- event, breadcrumb and redaction counts;
- canonical content byte length;
- the exact field/category inclusion selection.

Exports expire after 7 days by default; builders clamp expiry to 1–30 days. Imports are limited to 2 MiB, 1,000 events, 500 breadcrumbs, and 50 guide runs. They reject malformed JSON, prohibited prototype keys, excessive nesting/counts, unsupported schema versions, invalid manifests, count/size mismatch, digest mismatch, unsafe values requiring further redaction, and expiry (unless an internal comparison explicitly permits expired evidence).

Forward versions are rejected with an unsupported-schema result instead of being guessed. A legacy local storage key is migrated only when its bundle candidates already match the v1 contract. Malformed, expired, oversized or forward-versioned local envelopes are cleared with a visible warning.

Local persistence retains no more than five unique unexpired bundles and no more than 3 MiB total. When local storage throws (including private/hardened browsing and quota failures), the repository transitions to `memory-only` and preserves bounded data for the current tab.

Comparison verifies both manifests, then reports event/breadcrumb deltas, category changes, new/resolved failure names, coarse environment changes, and latest flow-status changes. Imported bundles are never automatically saved or uploaded.

## State and accessibility behavior

The React hook exposes explicit `loading`, `empty`, `success`, `error`, `degraded`, and `offline` states. Initialization and operation errors carry a contextual code and retry decision. Storage fallback and captured failure evidence produce degraded status without hiding available data.

The workspace provides labeled regions, semantic tables/lists/forms, live status and error regions, visible focus, 42 px controls, initial dialog focus, Escape dismissal, keyboard-operable tabs and forms, light/dark contrast tokens, reduced-motion behavior, forced-color borders, and single-column mobile layouts. Automated axe, Chromium workflow and committed visual baselines cover the primary experiences.

## Maintainer integration

Capture a domain event through the singleton only after defining a stable event name:

```ts
import { diagnosticCollector } from './lib/diagnostics';

diagnosticCollector.capture({
  category: 'stream',
  name: 'ledger.stream.reconnected',
  message: 'Ledger stream reconnected.',
  outcome: 'success',
  details: { attempt: 2 }, // never pass raw event payloads
  feature: 'network',
});
```

For a request lifecycle:

```ts
const request = diagnosticCollector.beginRequest('soroban.simulate', {
  method: 'simulateTransaction',
});
try {
  const result = await simulate();
  request.finish('success', 'Simulation completed.', { resultPresent: Boolean(result) });
} catch (error) {
  request.finish('failure', 'Simulation failed.', { error }, 'error');
  throw error;
}
```

Prefer status/count/boolean evidence over raw values. Never add a telemetry endpoint, analytics bridge, background sync, or automatic download to this boundary. New categories or serialized fields require a schema decision, redaction review, negative tests, import validation, migration/forward handling, documentation and E2E coverage.

## Compatibility

The core implementation requires browser APIs already used by the dashboard: `AbortController`, `TextEncoder`, Blob downloads, Local Storage, Fetch, and Web Crypto `subtle.digest`. Service Worker, CacheStorage and storage estimates are optional and produce explicit warning/unknown states. The UI is lazy-loaded and does not add the diagnostics chunk to initial route execution beyond the small capture boundary.

If Web Crypto SHA-256 is unavailable, preview/export fails with a retryable integrity error; an unverifiable bundle is never created. Hardened storage contexts retain in-memory functionality. Endpoint probes use the active Mainnet, Testnet, Futurenet, Local or Custom profile through the existing network configuration.

## Testing

Targeted coverage lives in:

- `src/lib/diagnostics/__tests__/redaction.test.ts`;
- `src/lib/diagnostics/__tests__/collector.test.ts`;
- `src/lib/diagnostics/__tests__/bundle.test.ts`;
- `src/lib/diagnostics/__tests__/persistence.test.ts`;
- `src/lib/diagnostics/__tests__/troubleshooting.test.ts`;
- `src/components/diagnostics/__tests__/DiagnosticsDashboard.test.tsx`;
- `tests/e2e/diagnostics.spec.ts`;
- `tests/e2e/diagnostics.visual.spec.ts` and its committed baselines.

The tests cover secrets and structured sensitive fields, literal-pattern escaping, huge/cyclic/hostile objects, ring eviction, causal IDs, pause/resume, observer isolation, inclusion, integrity/tamper/expiry/version failures, redaction-bypass imports, storage/private-mode fallback, read-only requests, cleanup, cancellation, complete UI states, confirmation focus, download structure, offline recovery and accessibility. All endpoint test responses are deterministic route doubles; no diagnostic test requires a live network.

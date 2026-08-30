# Privacy-safe diagnostic bundles and guided incident troubleshooting

## Summary

This PR adds a production-grade, public `/diagnostics` incident workspace. It captures bounded evidence through a deterministic redact-before-memory boundary, runs six cancellable non-destructive troubleshooting flows, and creates field-selectable, expiring SHA-256 bundles for explicit local download/import/comparison. Diagnostics adds no telemetry, upload API, automatic sharing, wallet prompt, signature request, transaction submission, worker mutation, or cache deletion.

## Design decisions

- **Separate trust boundary:** typed contracts, redaction, collection, environment capture, guided probes, bundle validation, persistence, React state, and presentation have independent modules and injectable interfaces.
- **Redact first:** built-in protocol/credential/identity patterns and session-only literal rules execute before events enter the ring; bundle construction repeats the boundary and import requires a redaction-contract fixed point.
- **Bound every input:** event/breadcrumb rings, traversal depth/nodes/strings/collections/bytes, saved count/bytes/expiry, imported bytes/records/nesting, and per-check time are finite.
- **Causal evidence:** start/completion events share request and correlation IDs; completion references its start and is idempotent.
- **Read-only guides:** endpoint checks use only Horizon root `GET` and Soroban `getHealth`; wallet checks inspect bridge presence; rendering/worker/cache checks read state; storage uses one temporary key and cleans it in `finally`.
- **Stable local artifacts:** schema v1 bundles include canonical SHA-256 envelope integrity (all metadata and content except the digest field), exact inclusion controls, counts, size, expiry, strict import validation and meaningful comparison deltas.
- **Graceful degradation:** unavailable/private/quota-blocked storage becomes bounded memory-only state; optional worker/cache/browser capabilities produce warning/unknown results.
- **Accessible complete workflow:** loading, empty, success, retryable error, degraded and offline states; keyboard/focus dialog behavior; live regions; responsive/reduced-motion/forced-color/light-theme contrast; axe and visual coverage.

## Threat model

Mitigated risks include accidental disclosure of Stellar seeds/accounts/contracts, tokens, signatures, XDR, URLs, local names/IDs, hostile/cyclic/oversized values, malicious imported JSON, private-mode storage denial, silent bundle tampering, and diagnostics telemetry. Import rejects prototype keys, forward/legacy unsupported formats, unsafe values requiring redaction, integrity/count/size mismatch and expiry.

Same-origin compromised scripts or privileged extensions can still inspect page memory. Downloads are integrity-protected but are not encrypted or author-attested. Users must review the preview and choose their normal secure support channel.

## Compatibility and performance

- Uses existing browser Fetch, AbortController, Web Crypto, Local Storage, Blob and optional Service Worker/CacheStorage APIs.
- Supports the existing Mainnet/Testnet/Futurenet/Local/Custom profiles without new server infrastructure.
- The dashboard UI is lazy-loaded; only the small idempotent capture boundary initializes at startup.
- Normal bounds: 250 events, 100 breadcrumbs, 32 KiB/event, 5 stored bundles, 3 MiB persistence, 2 MiB import, 1–30 day expiry.
- Network checks are sequential, cancellable and individually limited to 500–4,000 ms.
- Adds more than 5,000 meaningful production TypeScript/React/CSS lines, excluding tests, docs, snapshots and generated output.

## Observable behavior

1. `/diagnostics` works without an account connection.
2. Status shows capture/redaction/buffer/persistence and already-redacted evidence.
3. Six incident guides return pass/warning/fail/skipped states and documented non-destructive remediation.
4. Bundle controls allow section, optional environment field and event-category selection.
5. Preview exposes counts, omissions, expiry, SHA-256 and transport `none` before download.
6. Imports are validated and verified; comparisons show category, failure, environment and flow changes.
7. Clear requires confirmation; Escape preserves evidence.
8. Offline and storage-denied cases retain usable local evidence.

## Test evidence

Targeted checks added:

- redaction bypasses, custom literal escaping, huge/cyclic/hostile values;
- bounded rings, deep snapshot isolation, causal request IDs and pause/resume;
- inclusion, SHA verification, tamper, expiry, oversized/malformed/future/malicious imports and comparisons;
- durable persistence, expiry cleanup, private/quota failure and forward storage schema;
- deterministic read-only endpoint/RPC, storage cleanup, offline/wallet, rendering and cancellation flows;
- component loading/error/retry/success/dialog/accessibility coverage;
- six deterministic Chromium workflows including export content, malicious import, offline state and axe;
- two committed visual baselines for overview and guide catalog.

Final verification results and exact commands are recorded in `VERIFICATION.md` after the target branch update.

## Known limitations

- URL redaction retains protocol and hostname classification for endpoint diagnosis while removing credentials, port, path, query and fragment.
- SHA-256 detects modification but does not encrypt or establish authorship.
- Imported older schemas are rejected for regeneration because no pre-v1 integrity contract exists.
- A tab close discards memory-only evidence unless the user explicitly downloads a reviewed bundle.
- Optional Service Worker and CacheStorage capability varies by browser and security context.

## Documentation

`docs/diagnostics.md` covers architecture, serialized formats, privacy/security boundary, compatibility, user workflows, remediation, migration/forward handling, maintainer integration and tests.

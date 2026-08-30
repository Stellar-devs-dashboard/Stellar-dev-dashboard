# Resource Profiling Lab

## Purpose

The Resource Profiling Lab (`/resourceProfiling`) lets contract authors capture, save, compare, and budget the real classic-fee and Soroban resource cost of a transaction or contract invocation: CPU instructions, memory, read/write bytes, ledger footprint entries, event sizes, return value size, transaction size, and fees. It exists to answer "did this change get more expensive, and by how much, against our own history" with deterministic thresholds — not to predict fees with a model.

**This is evidence-based profiling and regression detection, not fee prediction.** It never estimates what a future transaction *will* cost; it only measures what a captured simulation or confirmed transaction *did* cost and compares that against baselines you've saved. It intentionally does not duplicate or overlap with the AI-assisted fee optimization work tracked in issue #36.

## Architecture

Following the same layering as the dashboard's other tooling workspaces (contract testing, network intelligence):

- **Typed domain contracts** — `src/types/resourceProfiling.ts`: `ResourceProfile`, `Baseline`, `ResourceBudget`, `ComparisonResult`, `ProfilingExportDocument`, and the `ResourceMetricKey` union covering every tracked metric.
- **Deterministic, framework-independent engine** — `src/lib/resourceProfiling/`:
  - `metrics.ts` — canonical metric metadata (label, unit, category).
  - `normalizer.ts` — turns a raw simulation result or confirmed-transaction lookup into a typed `ResourceProfile`, recording anything it can't extract in `missingMetrics` instead of guessing.
  - `validation.ts` — rejects non-finite, negative, or implausibly large metric values (a `METRIC_SANITY_CEILING` guards against a corrupt RPC response poisoning a baseline).
  - `statistics.ts` — mean/median/stddev/percentiles per metric, plus a coefficient-of-variation noise check.
  - `comparisonEngine.ts` — deterministic candidate-vs-baseline comparison with absolute/percentage thresholds and regression classification (`regression` / `improvement` / `neutral` / `noise` / `insufficient-data`).
  - `budgetEngine.ts` — evaluates a candidate against a named budget, with per-contract/per-function threshold overrides.
  - `redaction.ts` — strips addresses and strkey-shaped tokens from provenance and free-text input summaries.
  - `baselineStore.ts` — IndexedDB persistence (its own `stellar-dev-dashboard-resource-profiling` database) with schema-version migration for imported/legacy documents.
  - `simulationCapture.ts` — cancellable, timeout-bounded capture that calls the *existing* `simulateContractCall` in `src/lib/stellar.ts` (the same function the Transaction Simulator and Contract Interaction tabs use) rather than a second invocation path.
  - `exportService.ts` — versioned JSON export/import, plus a minimal CI-gate summary shape.
  - `sampleFixtures.ts` — deterministic sample baseline/candidates used by tests and the in-app "load sample data" shortcut.
- **React state** — `src/hooks/useResourceBaselines.ts`, `useResourceBudgets.ts` (persistence CRUD), `useProfileCapture.ts` (a single cancellable capture slot), and `useResourceProfilingLab.ts` (composes the above plus derived comparison/budget-evaluation state for the dashboard).
- **The lazy-loaded `/resourceProfiling` workspace** — `src/components/resource-profiling/`: Capture, Baselines, Compare, Resource View (a `recharts` `Treemap` breakdown), Timeline, Hot Paths (footprint entries ranked by size), Budgets, and Export/CI tabs.

### Shared simulation API, not a duplicate one

Per the issue's integration boundary, profiling reuses `simulateContractCall` from `src/lib/stellar.ts` for every live capture. The only change to that shared file is additive: the Soroban simulation response's budgeted `instructions`/`readBytes`/`writeBytes` (decoded from `SorobanTransactionData`) are now included on `ContractSimulationResult.footprint.resources` so profiling (and any other caller) can read them without a second simulation call. Decoding is wrapped in a `try/catch` that degrades to `null` so an SDK shape change can't break simulation for existing callers.

## Metric extraction and "missing metrics"

A `ResourceProfile` never silently defaults an unavailable metric to zero. `normalizeFromSimulation` and `normalizeFromConfirmedTransaction` record every metric they couldn't extract in `missingMetrics`:

- A simulation-sourced profile always leaves `inclusionFeeStroops`/`totalFeeStroops` missing (the inclusion fee isn't finalized until the transaction is actually submitted).
- A confirmed-transaction-sourced profile (from Horizon) always leaves the Soroban-only metrics (CPU, memory, read/write bytes, footprint counts, event size) missing — Horizon's transaction record doesn't carry them.
- Any metric value that's negative, non-finite, or exceeds a sanity ceiling (100B) is treated as untrustworthy and moved to `missingMetrics` rather than persisted.

This lets comparisons and budgets tell "measured zero" apart from "not captured" instead of producing a false regression or a false pass.

## Comparison and regression classification

`compareProfileToBaseline` is a pure function of its inputs: given the same baseline, candidate, and thresholds, it always returns the same classification. For each metric it takes the baseline's mean (or median, by option) as the anchor, computes the candidate's absolute and percentage delta, and classifies it:

- No threshold configured: any non-zero delta in the "worse" direction is a `regression`/`improvement`.
- A threshold is breached only when *both* its configured absolute and percentage bounds are crossed (when both are set) — a percentage-only threshold never fires off a near-zero baseline's noisy percentage swings alone.
- If the baseline's own historical samples for that metric have a coefficient of variation above the noise threshold (15% by default), a would-be regression is classified `noise` instead — the sample-to-sample scatter is too wide to trust a single new measurement.
- A metric missing from both baseline and candidate is left out of the comparison entirely rather than reported as `neutral`.

## Budgets

A `ResourceBudget` is a named set of per-metric thresholds, evaluated against a candidate profile with `evaluateBudget`. Budgets support per-contract and/or per-function **overrides**, applied most-specific-first (contract+function > function-only > contract-only > the budget's base thresholds). One default budget (20% regression on CPU/memory/read/write bytes/transaction size/total fee) is seeded automatically on first use.

## Using the workspace

1. Open **Resource Profiling** (sidebar → Testing, or `/resourceProfiling`).
2. **Capture** a profile from a real simulation (network, contract id, function, source account, typed arguments) — this calls the same simulation path as the Transaction Simulator, so it needs network access. Offline, use **Load bundled sample data** to explore the workspace with deterministic sample data instead.
3. Save a captured profile into a named **Baseline**, or create/import one directly.
4. **Compare** the current candidate against the selected baseline; regressions, improvements, and noise are labeled per metric.
5. **Resource View** shows a treemap-style breakdown of the candidate's weight metrics; **Timeline** plots one metric across a baseline's saved samples; **Hot Paths** ranks the candidate's footprint entries by approximate size.
6. Edit thresholds in **Budgets**, including per-contract/per-function overrides.
7. **Export / CI** downloads a versioned JSON baseline, comparison, or CI-gate summary (`{ pass, budgetName, failures[] }`) — see below.

## CI integration

The **Export CI budget gate** button downloads two files: the full, versioned `ProfilingExportDocument` (`kind: "budget-evaluation"`) and a minimal `{ pass: boolean, budgetName, failures: [{ metric, reason }] }` summary meant for a CI step, e.g.:

```sh
node -e "process.exit(JSON.parse(require('fs').readFileSync('resource-budget-<id>-ci-summary.json')).pass ? 0 : 1)"
```

Regenerate this file every run rather than committing it — it's a snapshot of one evaluation, not a tracked format on its own (unlike baseline/comparison exports, which are schema-versioned for long-term storage).

## Versioning and migration

Baseline and export documents carry a `schemaVersion`. `migrateBaseline` upgrades an older document to the current version in place (e.g. a v1 document's `notes` string becomes `description`, and a missing `tags` array is backfilled to `[]`); a document claiming a schema version newer than the running build supports is rejected with an actionable error instead of being silently corrupted.

## Privacy and security

Everything runs client-side against the network you choose; no profiling data is sent to a third party. Baselines and budgets persist only in the browser's IndexedDB. Contract/account addresses and free-text call-argument summaries are redacted by default everywhere they could leak into the UI, logs, or exports (`redaction.ts`) — full addresses are only kept when a user explicitly disables redaction on an export.

## Known limitations

- Read/write byte counts come from the simulation's *budgeted* Soroban resources (what would be submitted), not a post-hoc instrumented measurement of actual bytes touched.
- Footprint "hot path" sizes are derived from each ledger key's XDR-encoded size, not the full stored entry value, and rank relative weight rather than measure exact on-ledger storage cost.
- Event and return-value sizes are a JSON-serialization approximation of the already-decoded value, not the exact on-wire XDR byte count.
- A confirmed-transaction profile (from Horizon) only ever populates fee and transaction-size metrics; Horizon does not expose CPU/memory/footprint data.
- Regression classification is a statistical heuristic over your own saved samples, not a guarantee — a small number of samples (especially one) gives `insufficient-data` or an unreliable variance estimate.

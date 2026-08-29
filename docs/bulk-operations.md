# Bulk Operations Planner

Resumable, dependency-aware bulk operation planning for Stellar Dev Dashboard. Import CSV manifests, validate operation specs, pack transactions, execute with checkpointed simulated submission, and export reconciliation receipts.

## Architecture

| Layer | Responsibility |
| --- | --- |
| `src/types/bulkOperationsPlanner.ts` | Versioned manifest, plan, checkpoint, and receipt contracts |
| `src/lib/bulkOperationsPlanner/` | Pure domain: validation, dependency graph, packing, executor, CSV import, IndexedDB repository |
| `src/hooks/useBulkOperationsPlanner.ts` | React state orchestration and user actions |
| `src/components/bulk-operations/` | Accessible dashboard and workflow panels |

## Workflow

1. **Import** — Paste CSV or load demo fixtures with column mapping.
2. **Preview** — Inspect mapped operations and validation issues before commit.
3. **Plan** — Build dependency-respecting transaction packs with fee estimates.
4. **Execute** — Run simulated bulk submission with pause/resume/cancel controls.
5. **Receipts** — Review reconciliation output and export JSON/CSV bundles.

## Persistence

IndexedDB database `stellar-dev-dashboard-bulk-operations` stores manifests and run checkpoints/receipts. Manifest checksums use canonical JSON + SHA-256.

## Privacy

Exports redact Stellar addresses and reject secret keys in free text. Simulated execution avoids live Horizon calls by default.

## Limitations

- Simulated executor is diagnostic-only; it does not submit live transactions.
- Contract invoke XDR generation uses placeholder encoding for offline flows.
- Maximum 100 operations per transaction pack (configurable in settings).

## Testing

- Unit: `src/lib/bulkOperationsPlanner/bulkOperationsPlanner.test.ts`
- E2E: `tests/e2e/bulk-operations.spec.ts` (blocked-network offline path)

## Troubleshooting

- **Validation failed** — Check Stellar address lengths and decimal amounts in CSV rows.
- **Cycle detected** — Remove circular dependencies in the `dependencies` column.
- **Nothing to commit in git** — Stage new files before committing; untracked files are lost on branch cleanup.

## Summary

Adds a resumable bulk operations planner with dependency-aware transaction packing, CSV/JSON import, checkpointed simulated execution, IndexedDB persistence, reconciliation exports, and an accessible multi-panel dashboard.

Closes #92.

## Changes

- Domain library under `src/lib/bulkOperationsPlanner/` (validation, graph, packing, executor, repository, redaction)
- React hook and dashboard at `/bulkOperations`
- Unit tests and Playwright E2E coverage
- Documentation in `docs/bulk-operations.md`

## Test plan

- [ ] `npm run type-check`
- [ ] `npm run test -- src/lib/bulkOperationsPlanner/bulkOperationsPlanner.test.ts`
- [ ] `npm run test:e2e -- tests/e2e/bulk-operations.spec.ts --project=chromium`
- [ ] Load demo manifest → plan → execute → verify receipts tab
- [ ] CSV preview/import with demo CSV fixture
- [ ] Export manifest JSON and reconciliation CSV

# Treasury Reconciliation & Accounting Exports

## Purpose

Reconcile Stellar ledger activity for a connected account into auditable reporting periods, with per-asset opening/closing balances, categorized postings, discrepancy detection, and versioned CSV/JSON accounting exports.

**This produces operational records, not tax or accounting advice.** Every value is derived deterministically from actual ledger activity (Horizon operations, transactions, trades, and effects) plus optional user-entered reference prices — never from a prediction or model. It is intentionally independent of, and does not duplicate, the AI portfolio optimizer (#33): reconciliation never estimates future value or recommends trades, it only explains ledger activity that already happened.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain types | `src/types/treasury.ts` | Postings, assets, provenance, rules, periods, balances, discrepancies, snapshots, export contracts |
| Normalization | `src/lib/treasuryReconciliation/normalize.ts` | Raw Horizon operations/transactions/trades/effects → `LedgerPosting[]` |
| Rules | `src/lib/treasuryReconciliation/rules.ts` | Configurable category/counterparty-label matching |
| Cost basis | `src/lib/treasuryReconciliation/costBasis.ts` | User-entered reference prices and operational valuation |
| Reconciliation engine | `src/lib/treasuryReconciliation/reconcile.ts` | Merge sources, compute balances, detect discrepancies |
| Snapshots | `src/lib/treasuryReconciliation/snapshot.ts` | Immutable, checksummed period snapshots with schema versioning |
| Export/import | `src/lib/treasuryReconciliation/exportImport.ts` | Versioned CSV/JSON journals, generic ledger mapping, round-trip import |
| Persistence | `src/lib/treasuryReconciliation/db.ts` | IndexedDB storage for periods, snapshots, rules, cost-basis entries, review state |
| Client | `src/lib/treasuryReconciliation/client.ts` | Paginated Horizon fetch with cancellation, timeout, and a deterministic offline fallback |
| Hook | `src/hooks/useTreasuryReconciliation.ts` | Period lifecycle, rule/cost-basis CRUD, review workflow, export triggers |
| UI | `src/components/treasury/TreasuryReconciliationDashboard.tsx` | Lazy `/treasuryReconciliation` workspace |

Domain logic never imports React or the Stellar SDK client directly beyond `src/lib/stellar.ts`'s typed fetch helpers — every normalization/reconciliation function is a pure, synchronous transformation you can unit test without a network or a browser.

## What gets normalized into a posting

| Ledger activity | Posting `kind` | Source |
| --- | --- | --- |
| `payment` | `payment` | Horizon operation |
| `path_payment_strict_send` / `_receive` | `path_payment` | Horizon operation |
| Executed trades (offers filled, DEX or liquidity pool) | `trade` (two legs: sold + bought asset) | Horizon `/trades` |
| Transaction fee (`fee_charged`) | `fee` | Horizon transaction, attributed to its source account |
| `create_claimable_balance` / `claim_claimable_balance` | `claimable_balance_create` / `claimable_balance_claim` | Operation + `claimable_balance_claimed` effect (the operation alone doesn't carry the claimed amount) |
| Sponsorship changes (`begin/end_sponsoring_future_reserves`, `revoke_sponsorship`, sponsorship effects) | `sponsorship` | Operation and/or effect |
| Soroban token transfers (SAC `transfer`/`mint`/`burn`/`clawback`) | `contract_transfer` | `invoke_host_function`'s `asset_balance_changes` |
| `create_account`, `account_merge`, `set_options`, `change_trust`, etc. | `account_change` | Horizon operation |

Operations with no traceable balance effect (offers, data entries, sequence bumps) are intentionally not turned into postings.

### Known limitation: arbitrary contract calls

Only Soroban invocations that Horizon itself resolves into `asset_balance_changes` (Stellar Asset Contract-shaped transfers/mints/burns/clawbacks) become `contract_transfer` postings. An arbitrary custom contract invocation with no such balance-change record is not decoded from raw XDR and will not appear as a posting — this is a deliberate scope boundary, not a bug, since full ABI-free contract decoding is out of scope for this feature. Deposit/withdraw operations against liquidity pools are similarly not yet normalized into postings.

## Discrepancy detection

`detectDiscrepancies` (in `reconcile.ts`) flags, per period:

- **`paging-gap`** — ingestion hit its per-source page cap before reaching the period start; some early activity may be missing.
- **`unresolved-contract-transfer`** / needs-review items — postings normalization couldn't fully resolve (e.g. a bare `claim_claimable_balance` operation with no matching effect).
- **`rounding`** vs. **`unexplained-delta`** — when an independently-known expected closing balance is supplied, a sub-stroop residual is classified as rounding noise (`info`); anything larger is `critical` and blocks closing the period.
- **`missing-price`** — an asset had activity this period but no cost-basis entry exists for it (XLM is exempt; it's optional to price).
- **`asset-code-collision`** — the same human-readable asset code (e.g. `USDC`) is used by more than one issuer in the period's activity, a common source of reconciliation mistakes.

## Periods, snapshots, and immutability

A period is `open` until explicitly closed. Closing a period with any `critical` discrepancy is blocked. Closing builds a `PeriodSnapshot` (`schemaVersion`, postings, balances, discrepancies, review state, and a deterministic FNV-1a `checksum` over its own contents) and persists it to IndexedDB; `db.saveSnapshot` refuses to overwrite an existing snapshot for the same period, and `verifySnapshotIntegrity`/`loadPeriodSnapshot` detect if a snapshot was hand-edited after the fact. The next period's opening balance is read from the prior period's closing balance automatically.

## Exports

- **JSON** (`exportPeriodJson`) — the full `TreasuryExportPayload` (`version: 1`, period, postings, balances, discrepancies, review state). Re-importing validates the version against `SUPPORTED_EXPORT_VERSIONS` and every posting's amount before accepting the file.
- **CSV** (`exportPeriodCsv`) — one row per posting.
- **Generic accounting ledger** (`exportGenericLedgerCsv`) — postings mapped through a configurable `AccountingMapping` (category → account code/name) into conventional double-entry debit/credit rows against a "Ledger Clearing" counter-account, importable into an external accounting system's own chart of accounts.

## Security & privacy

- Every posting's `provenance` field records exactly which Horizon record (operation id, transaction hash, trade id, or effect id) it was derived from, so every number in an export or the UI is traceable back to source ledger activity.
- All persisted state (periods, snapshots, rules, cost-basis entries, review state) lives in the browser's IndexedDB, scoped to the connected account — nothing is sent to a third-party service.
- No secret keys or signing material are read or required; reconciliation only reads public ledger data for the connected public address.
- Cost-basis prices are entered manually by the user (or left absent, surfacing a `missing-price` discrepancy) — the dashboard never fetches or infers prices automatically.

## Compatibility & migration

- Both the browser storage schema (`db.ts`, its own dedicated `'stellar-dev-dashboard-treasury'` IndexedDB database, currently `DB_VERSION: 1`) and the export file schema (`EXPORT_SCHEMA_VERSION`) are versioned independently. A future breaking change bumps the relevant version and adds a migration step following the same pattern as `src/lib/import.ts`'s `SUPPORTED_VERSIONS` allowlist. This uses its own database rather than sharing `alertRulesDb.ts`'s `'stellar-dev-dashboard'` database: that module's connection never closes on `versionchange`, so a second `indexedDB.open` call against the same name at a higher version would block forever waiting for a close that never happens — a dedicated database avoids that entirely.
- Opening an export file from a newer schema version than this build supports fails with a clear "Unsupported export version" message rather than silently misreading it.

## Troubleshooting

- **"Reconciliation data unavailable"** — Horizon was unreachable within the 15s timeout; use Retry. If the network truly can't be reached (e.g. running fully offline), the dashboard automatically falls back to a labeled deterministic demonstration snapshot instead of a blank page.
- **A period won't close** — check the Unresolved tab for any `critical` discrepancy; these must be resolved (or shown to be explainable) before closing.
- **An asset shows no valuation** — enter a cost-basis price for it on the Cost Basis tab; valuations are never estimated automatically.

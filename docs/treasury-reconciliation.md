# Treasury Reconciliation & Accounting Exports

## Purpose

Turn raw Stellar ledger activity into auditable accounting periods: normalized postings, opening/closing balance reconciliation, discrepancy detection, category rules, cost-basis-driven realized gain/loss, and versioned journal exports. **This is an operational record, not tax or accounting advice** — every figure is deterministic and traceable to either ledger data or a value you provided; nothing is predicted, forecast, or recommended. It does not overlap with the predictive AI Portfolio Optimizer (issue #33) — this feature is retrospective and deterministic by design.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Domain types | `src/types/treasury.ts` | Postings, periods, discrepancies, rules, cost basis, journal, snapshots |
| Amount math | `src/lib/treasury/amount.ts` | Stroop-integer decimal arithmetic (no floating-point rounding error) |
| Normalization | `src/lib/treasury/normalize.ts` | Horizon operation/transaction → account-perspective ledger postings, paging-gap detection |
| Rules | `src/lib/treasury/rules.ts` | Category-rule matching, counterparty labeling |
| Reconciliation | `src/lib/treasury/reconciliation.ts` | Balance waterfall, discrepancy detection, unresolved-item queue, period lifecycle |
| Cost basis | `src/lib/treasury/costBasis.ts` | FIFO realized gain/loss, missing-price handling |
| Journal export | `src/lib/treasury/journal.ts` | Double-entry mapping, versioned CSV/JSON export with round-trip import validation |
| Snapshot | `src/lib/treasury/snapshot.ts` | Immutable, content-hashed period snapshots |
| Persistence | `src/lib/treasury/records.ts` | Dedicated, independently-versioned IndexedDB store |
| Fetch client | `src/lib/treasury/client.ts` | Paginated, cancellable, bounded Horizon fetch via the app's existing Stellar client |
| Fixtures | `src/lib/treasury/fixtures.ts` | Deterministic ledger covering the required edge cases |
| Hook | `src/hooks/useTreasuryReconciliation.ts` | Orchestrates fetch, normalization, rules, periods, cost basis, snapshots |
| UI | `src/components/treasury/TreasuryReconciliationDashboard.tsx` | Lazy `/treasuryReconciliation` route ("Treasury" in the sidebar) |

This mirrors the layering already used by `src/lib/fraudDetection`, `src/lib/networkGraph`, and `src/lib/wasmVerification` (types → algorithms → client/persistence → hook → UI). The fetch client reuses the app's existing `fetchTransactions`/`fetchOperations` Horizon helpers in `src/lib/stellar.ts` rather than duplicating pagination/caching logic, and the persistence layer owns a dedicated IndexedDB database (`stellar-treasury`) rather than a new object store on the shared `stellar-dev-dashboard` database, so this feature's schema changes can never risk a migration bug elsewhere.

## Normalization model

Every operation is read from the connected account's perspective and turned into zero or more signed `LedgerPosting`s (positive = credit, negative = debit), all in a single asset key: native XLM is `"XLM"`; every other asset is `"CODE:ISSUER"` — the **full** issuer, never truncated, so two assets sharing a code under different issuers (a real and common collision risk on Stellar) are never merged into one balance.

- **Payments** and **path payments** map directly from the operation's `amount`/`from`/`to` fields; path payments are classified `trade` (both legs) since they represent a value exchange, not a plain transfer.
- **Fees** are posted once per transaction from the transaction record's `fee_charged`, attributed to the transaction's source account — **including on a failed transaction**, since Stellar consumes the fee for ledger inclusion regardless of whether the inner operations executed. Failed transactions produce no operation-level posting.
- Operation types whose executed amount isn't directly observable in the `/operations` feed — `account_merge` (the transferred amount lives in effects, not the operation record), `claim_claimable_balance` on Horizon versions that omit `amount`/`asset`, `manage_buy_offer`/`manage_sell_offer` (fills aren't in the offer-instruction record), and `invoke_host_function` (Soroban token transfers require parsing contract events) — produce a **zero-amount, clearly-labeled informational posting** instead of a fabricated number, and surface in the Unresolved queue for manual resolution. See Known limitations.

## Reconciliation

`buildPeriod` filters postings to a `[startTime, endTime)` window, computes a per-asset balance waterfall (opening + inflow + outflow + fees = closing), and — when you supply actual closing balances — flags discrepancies beyond a 1-stroop tolerance with a signed difference, percentage, and a short list of likely causes (a missing credit typically means a paging gap; an excess computed balance typically means an unmodeled debit like an account-merge transfer). Closing a period and rolling its computed balances forward as the next period's opening balances (`deriveNextOpeningBalances`) is explicit, not automatic, so a discrepancy is never silently carried forward.

## Cost basis & realized gain/loss

Cost basis is **entirely user-supplied** (manual entry or import) — this module never fetches or predicts a price. Realized gain/loss uses FIFO lot matching (the most auditable, least configuration-dependent convention for a first implementation); a disposal that exceeds tracked lots, or that has no cost-basis entry covering its date, is flagged as `costBasisMissing` rather than assumed to have zero cost. LIFO/specific-identification are noted as follow-up work.

## Journal export

`toJournalEntries` produces a balanced double-entry row pair per posting (debit/credit account chosen by a configurable `AccountMappingRule` list, `DEFAULT_MAPPING_RULES` ships a reasonable generic chart of accounts). Both CSV and JSON exports are versioned (`schemaVersion: 1`); the JSON export additionally carries a SHA-256 checksum over its entries, and `parseJournalJson` recomputes and compares it on import — a document edited after export fails validation with a clear message rather than being silently accepted. Both formats round-trip: `exportJournalCsv` → `parseJournalCsv` and `exportJournalJson` → `parseJournalJson` are covered by dedicated round-trip tests.

## Snapshots

`createPeriodSnapshot` produces an `Object.freeze`d, content-hashed record of a period's full state (postings, waterfall, discrepancies) at the moment it's saved. `verifySnapshotIntegrity` recomputes the hash and reports whether the stored/exported snapshot still matches — the same tamper-evidence pattern used by attestations in `src/lib/wasmVerification`.

## Threat model & data handling

- No network call this feature makes ever sends a private key, seed phrase, or signing material — it only reads public ledger history for the connected (read-only) address.
- Category rules, counterparty labels, and cost-basis entries are stored locally (IndexedDB) and never transmitted anywhere.
- Exported journals contain only what you configured: posting amounts, asset codes, counterparty addresses/labels, and memos already public on the ledger. No screenshots, error messages, or logs from this feature include secret material — there is none to redact, since the feature never touches key material in the first place.
- A discrepancy or an unresolved item is a data-quality signal for the operator to investigate, not evidence of wrongdoing or itself something to report externally.

## Known limitations

- **Account merges, some `claim_claimable_balance` responses, offer fills, and Soroban contract token transfers do not produce balance-affecting postings.** The `/operations` endpoint doesn't carry the executed amount for these cases; a real implementation of full coverage needs the `/effects` endpoint (for merges/claims) and Soroban event parsing (for contract transfers) — both flagged as follow-up work below rather than approximated with a guess.
- Realized gain/loss is FIFO only.
- The generic account mapping ships one reasonable default chart of accounts; per-organization customization beyond editing `DEFAULT_MAPPING_RULES` in code is a documented follow-up (a rules-editor UI for mappings, mirroring the existing category-rules editor).
- `fetchAccountLedgerActivity` bounds pagination to 25 pages (200 records each = up to 5,000 transactions and 5,000 operations) per fetch; a `truncated` flag surfaces when this bound was hit so the UI can tell the operator more history exists. Very large multi-year histories need incremental/background fetching as follow-up work rather than one blocking call.

## Follow-up work

1. Effects-endpoint integration to resolve `account_merge` and `claim_claimable_balance` amounts precisely instead of flagging them.
2. Soroban contract-event parsing for `invoke_host_function` token transfers.
3. LIFO / specific-identification cost-basis methods alongside FIFO.
4. A UI editor for `AccountMappingRule`s (currently code-configured via `DEFAULT_MAPPING_RULES`).
5. Incremental/background history fetching for accounts whose history exceeds the current per-fetch page bound.

## Extending

1. To normalize a new operation type, add a `case` in `normalizeOperation` (`normalize.ts`) and cover it in `normalize.test.ts` — prefer a zero-amount informational posting with a clear note over guessing an amount the operation record doesn't carry.
2. To add a new posting category by default, extend `DEFAULT_CATEGORY_RULES` in `rules.ts`.
3. To change the default chart of accounts, edit `DEFAULT_MAPPING_RULES` in `journal.ts`; every posting type must have a fallback (category `null`) rule so `findMappingRule` never falls through to `"Unmapped"` for a known type.
4. To version a schema change, bump `JOURNAL_SCHEMA_VERSION` or `SNAPSHOT_SCHEMA_VERSION` in `types/treasury.ts` and add a version branch in the corresponding parse/verify function — never silently reinterpret an older document under a new shape.

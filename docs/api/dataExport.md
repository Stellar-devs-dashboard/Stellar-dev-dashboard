# export.js / import.js / useDataExport

Dashboard backup, CSV/JSON export, and restore functionality.

## export.js

### `exportJson(data, filename)`

Serialise `data` to JSON and trigger a browser download as `filename.json`.

### `exportCsv(rows, filename, columns?)`

Convert an array of objects to CSV and download as `filename.csv`. Column order follows the `columns` array, or `Object.keys(rows[0])` if omitted. Values containing commas, quotes, or newlines are properly escaped.

### `exportDashboardBackup(state, filename?)`

Build and download a complete dashboard backup including theme, network, and watched addresses.

### `buildBackupPayload(state)`

Return the backup object without triggering a download. Useful for testing or server-side serialisation.

### `flattenTransaction(tx)`

Flatten a Horizon transaction record to a plain `{ id, hash, ledger, … }` CSV-friendly row.

### `flattenBalance(balance)`

Flatten a Horizon balance record to a plain `{ asset_type, balance, … }` CSV-friendly row.

---

## import.js

### `parseBackup(jsonString)`

Parse and validate a backup JSON string.

**Returns:** `{ ok: true, data } | { ok: false, error: string }`

### `readFileAsText(file)`

Read a `File` object (from `<input type="file">`) and return its text content as a `Promise<string>`.

### `validateBackupPayload(data)`

Check required fields. Returns an array of error strings (empty = valid).

### `applyBackupToStore(data, store)`

Apply whitelisted fields from a backup payload to the Zustand store. Only `theme`, `network`, and `watchedAddresses` are restored (prototype pollution guard).

---

## useDataExport hook

```js
import { useDataExport } from './src/hooks/useDataExport';

const {
  isExporting,
  isImporting,
  exportError,
  importError,
  importSuccess,
  exportDashboard,        // () => void  — downloads JSON backup
  exportTransactions,     // (txs) => void — downloads CSV
  exportBalances,         // (balances) => void — downloads CSV
  importBackup,           // async (File) => void
} = useDataExport();
```

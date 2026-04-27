/**
 * Data export utilities (#114).
 *
 * Converts dashboard data (account info, transactions, assets, settings)
 * to JSON or CSV and triggers a browser download.
 */

/**
 * Trigger a file download in the browser.
 * @param {string} content  - File contents as a string
 * @param {string} filename - Suggested filename
 * @param {string} mimeType - MIME type (default: application/json)
 */
export function downloadFile(content, filename, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export an array of objects to a CSV file.
 * @param {Object[]} rows       - Data rows
 * @param {string}   filename   - Download filename (without extension)
 * @param {string[]} [columns]  - Column names; inferred from first row if omitted
 */
export function exportCsv(rows, filename, columns) {
  if (!rows || rows.length === 0) {
    downloadFile("", `${filename}.csv`, "text/csv");
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    cols.join(","),
    ...rows.map((row) => cols.map((c) => escape(row[c])).join(",")),
  ];
  downloadFile(lines.join("\r\n"), `${filename}.csv`, "text/csv");
}

/**
 * Export any value to a JSON file.
 * @param {*}      data     - Data to serialise
 * @param {string} filename - Download filename (without extension)
 */
export function exportJson(data, filename) {
  downloadFile(JSON.stringify(data, null, 2), `${filename}.json`);
}

/**
 * Build the complete dashboard backup object from live state.
 * @param {Object} state - Zustand store state snapshot
 * @returns {Object}     - Backup payload
 */
export function buildBackupPayload(state) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    account: {
      connectedAddress: state.connectedAddress ?? null,
      network: state.network ?? "testnet",
    },
    watchedAddresses: state.watchedAddresses ?? [],
    customNetworks: state.customNetworks ?? [],
    theme: state.theme ?? "dark",
    activeTab: state.activeTab ?? "overview",
  };
}

/**
 * Flatten a Horizon transaction record to a plain CSV row.
 * @param {Object} tx - Horizon transaction record
 * @returns {Object}
 */
export function flattenTransaction(tx) {
  return {
    id: tx.id,
    hash: tx.hash,
    ledger: tx.ledger,
    created_at: tx.created_at,
    source_account: tx.source_account,
    fee_charged: tx.fee_charged,
    operation_count: tx.operation_count,
    successful: tx.successful,
    memo_type: tx.memo_type ?? "",
    memo: tx.memo ?? "",
  };
}

/**
 * Flatten a Horizon balance object (from account.balances) to a CSV row.
 * @param {Object} balance - Horizon balance record
 * @returns {Object}
 */
export function flattenBalance(balance) {
  return {
    asset_type: balance.asset_type,
    asset_code: balance.asset_code ?? "XLM",
    asset_issuer: balance.asset_issuer ?? "",
    balance: balance.balance,
    limit: balance.limit ?? "",
    buying_liabilities: balance.buying_liabilities ?? "0",
    selling_liabilities: balance.selling_liabilities ?? "0",
  };
}

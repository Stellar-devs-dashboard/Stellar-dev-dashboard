import React from "react";
import { useAnalytics } from "../../hooks/useAnalytics";
import AnalyticsChart from "../charts/AnalyticsChart";
import { StatCard } from "./Card";
import type {
  AnalyticsAccountSnapshot,
  AnalyticsNetworkSnapshot,
  AnalyticsTransactionSnapshot,
  RiskSignal,
} from "./types";

const EMPTY_ACCOUNT: AnalyticsAccountSnapshot = {
  xlmBalance: 0,
  trustlineCount: 0,
  totalAssets: 0,
  nonNativeBalanceCount: 0,
};

const EMPTY_TRANSACTIONS: AnalyticsTransactionSnapshot = {
  totalTransactions: 0,
  successfulTransactions: 0,
  failedTransactions: 0,
  successRate: 0,
  weeklyActivity: 0,
  averageOperationsPerTx: 0,
  opTypeCounts: {},
};

const EMPTY_NETWORK: AnalyticsNetworkSnapshot = {
  latestLedgerSequence: null,
  baseFee: 0,
  p90Fee: 0,
  txSuccessCount: 0,
  txFailedCount: 0,
  operationCount: 0,
  averageCloseSeconds: 0,
};

function normalizeRiskSeverity(severity: string): RiskSignal["severity"] {
  if (severity === "high" || severity === "medium" || severity === "low") {
    return severity;
  }
  return "low";
}

function RiskItem({ signal }: { signal: RiskSignal }) {
  const color =
    signal.severity === "high"
      ? "var(--red)"
      : signal.severity === "medium"
        ? "var(--amber)"
        : "var(--cyan)";

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${signal.active ? color : "var(--border)"}`,
        background: "var(--bg-elevated)",
        color: signal.active ? color : "var(--text-muted)",
        fontSize: "12px",
      }}
    >
      {signal.label}
    </div>
  );
}

export default function Analytics() {
  const analytics = useAnalytics();
  const account: AnalyticsAccountSnapshot = analytics?.account ?? EMPTY_ACCOUNT;
  const tx: AnalyticsTransactionSnapshot = analytics?.transactions ?? EMPTY_TRANSACTIONS;
  const network: AnalyticsNetworkSnapshot = analytics?.network ?? EMPTY_NETWORK;
  const risks: RiskSignal[] = (analytics?.risks ?? []).map((risk) => ({
    id: risk.id,
    label: risk.label,
    active: risk.active,
    severity: normalizeRiskSeverity(risk.severity),
  }));

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700 }}>
        Analytics
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
        <StatCard label="XLM Balance" value={account.xlmBalance.toFixed(2)} accent="var(--cyan)" />
        <StatCard label="Trustlines" value={account.trustlineCount} accent="var(--amber)" />
        <StatCard label="Success Rate" value={`${(tx.successRate * 100).toFixed(1)}%`} accent="var(--green)" />
        <StatCard label="Weekly Activity" value={tx.weeklyActivity} accent="var(--text-primary)" />
      </div>

      <AnalyticsChart data={analytics?.activity || []} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
        <StatCard label="Latest Ledger" value={network.latestLedgerSequence ?? "—"} />
        <StatCard label="Base Fee" value={network.baseFee} />
        <StatCard label="Avg Close Time" value={`${network.averageCloseSeconds.toFixed(2)}s`} />
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontSize: "13px" }}>Risk Signals</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
          {risks.map((risk) => (
            <RiskItem key={risk.id} signal={risk} />
          ))}
        </div>
      </div>
    </div>
  );
}

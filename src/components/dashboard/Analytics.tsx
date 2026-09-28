import React, { useState, useEffect } from "react";
import { useAnalytics } from "../../hooks/useAnalytics";
import AnalyticsChart from "../charts/AnalyticsChart";
import { StatCard } from "./Card";
import EnhancedTable, { type TableDensity, type ColumnPreset } from "../common/EnhancedTable";
import { useTablePresets } from "../../hooks/useTablePresets";
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

const RISK_SIGNAL_COLUMNS = [
  { id: 'label', label: 'Risk Signal', width: '2fr' },
  { id: 'severity', label: 'Severity', width: '1fr' },
  { id: 'status', label: 'Status', width: '1fr' },
];

const OPERATION_TYPE_COLUMNS = [
  { id: 'type', label: 'Operation Type', width: '2fr' },
  { id: 'count', label: 'Count', width: '1fr' },
  { id: 'percentage', label: 'Percentage', width: '1fr' },
];

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

  // Table presets for risk signals
  const riskPresets = useTablePresets('analytics-risk-signals', ['label', 'severity', 'status'], 'comfortable');

  // Table presets for operation types
  const opPresets = useTablePresets('analytics-operation-types', ['type', 'count', 'percentage'], 'comfortable');

  // Convert operation type counts to array for table display
  const operationTypes = Object.entries(tx.opTypeCounts || {}).map(([type, count]) => ({
    id: type,
    type,
    count,
    percentage: tx.totalTransactions > 0 ? ((count / tx.totalTransactions) * 100).toFixed(1) + '%' : '0%',
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

      {/* Risk Signals Table */}
      <EnhancedTable
        columns={RISK_SIGNAL_COLUMNS}
        visibleColumns={riskPresets.visibleColumns}
        onVisibleColumnsChange={riskPresets.setVisibleColumns}
        density={riskPresets.density}
        onDensityChange={riskPresets.setDensity}
        presets={riskPresets.presets}
        onPresetSave={riskPresets.onPresetSave}
        onPresetDelete={riskPresets.onPresetDelete}
        onPresetApply={riskPresets.onPresetApply}
        stickyHeader={true}
        maxHeight="400px"
      >
        {risks.map((risk) => (
          <div
            key={risk.id}
            style={{
              display: 'grid',
              gridTemplateColumns: riskPresets.visibleColumns.map((id) => {
                const col = RISK_SIGNAL_COLUMNS.find((c) => c.id === id);
                return col?.width || '1fr';
              }).join(' '),
              gap: '12px',
              padding: riskPresets.density === 'compact' ? '8px 12px' : riskPresets.density === 'comfortable' ? '12px 18px' : '16px 24px',
              borderBottom: '1px solid var(--border)',
              fontSize: riskPresets.density === 'compact' ? '11px' : riskPresets.density === 'comfortable' ? '12px' : '13px',
              alignItems: 'center',
            }}
          >
            {riskPresets.visibleColumns.includes('label') && (
              <span style={{ color: 'var(--text-primary)' }}>{risk.label}</span>
            )}
            {riskPresets.visibleColumns.includes('severity') && (
              <span style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                background: risk.severity === 'high' ? 'var(--red-glow-sm)' : risk.severity === 'medium' ? 'var(--amber-glow-sm)' : 'var(--cyan-glow-sm)',
                color: risk.severity === 'high' ? 'var(--red)' : risk.severity === 'medium' ? 'var(--amber)' : 'var(--cyan)',
                border: `1px solid ${risk.severity === 'high' ? 'var(--red)' : risk.severity === 'medium' ? 'var(--amber)' : 'var(--cyan)'}`,
              }}>
                {risk.severity}
              </span>
            )}
            {riskPresets.visibleColumns.includes('status') && (
              <span style={{ color: risk.active ? 'var(--green)' : 'var(--text-muted)' }}>
                {risk.active ? 'Active' : 'Inactive'}
              </span>
            )}
          </div>
        ))}
      </EnhancedTable>

      {/* Operation Types Table */}
      {operationTypes.length > 0 && (
        <EnhancedTable
          columns={OPERATION_TYPE_COLUMNS}
          visibleColumns={opPresets.visibleColumns}
          onVisibleColumnsChange={opPresets.setVisibleColumns}
          density={opPresets.density}
          onDensityChange={opPresets.setDensity}
          presets={opPresets.presets}
          onPresetSave={opPresets.onPresetSave}
          onPresetDelete={opPresets.onPresetDelete}
          onPresetApply={opPresets.onPresetApply}
          stickyHeader={true}
          maxHeight="300px"
        >
          {operationTypes.map((op) => (
            <div
              key={op.id}
              style={{
                display: 'grid',
                gridTemplateColumns: opPresets.visibleColumns.map((id) => {
                  const col = OPERATION_TYPE_COLUMNS.find((c) => c.id === id);
                  return col?.width || '1fr';
                }).join(' '),
                gap: '12px',
                padding: opPresets.density === 'compact' ? '8px 12px' : opPresets.density === 'comfortable' ? '12px 18px' : '16px 24px',
                borderBottom: '1px solid var(--border)',
                fontSize: opPresets.density === 'compact' ? '11px' : opPresets.density === 'comfortable' ? '12px' : '13px',
                alignItems: 'center',
              }}
            >
              {opPresets.visibleColumns.includes('type') && (
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{op.type}</span>
              )}
              {opPresets.visibleColumns.includes('count') && (
                <span style={{ color: 'var(--text-secondary)' }}>{op.count}</span>
              )}
              {opPresets.visibleColumns.includes('percentage') && (
                <span style={{ color: 'var(--text-muted)' }}>{op.percentage}</span>
              )}
            </div>
          ))}
        </EnhancedTable>
      )}
    </div>
  );
}

import React from "react";
import { useMonitoring } from "../../hooks/useMonitoring";
import { StatCard } from "./Card";

function AlertRow({ alert, onClear }) {
  const color =
    alert.severity === "critical"
      ? "var(--red)"
      : alert.severity === "warning"
        ? "var(--amber)"
        : "var(--cyan)";

  return (
    <div
      style={{
        border: `1px solid ${color}`,
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
        background: "var(--bg-elevated)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
        <div>
          <div style={{ fontSize: "12px", color, fontWeight: 700 }}>{alert.title}</div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
            {alert.description}
          </div>
        </div>
        <button
          onClick={() => onClear(alert.id)}
          style={{
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            borderRadius: "var(--radius-sm)",
            height: "26px",
            padding: "0 8px",
            fontSize: "11px",
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const { snapshot, score, alerts, errors, clearAlert, resetAlerts } = useMonitoring();
  const memory = snapshot?.memory;

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700 }}>
        System Health
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
        <StatCard label="Health Score" value={`${score}/100`} accent={score < 60 ? "var(--red)" : "var(--green)"} />
        <StatCard label="Online" value={snapshot?.online ? "Yes" : "No"} />
        <StatCard label="Visibility" value={snapshot?.visibility || "unknown"} />
        <StatCard label="Runtime Errors" value={errors.length} accent={errors.length ? "var(--amber)" : "var(--cyan)"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
        <StatCard
          label="Heap Used (MB)"
          value={memory?.usedJSHeapSize ? (memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : "n/a"}
        />
        <StatCard
          label="Heap Total (MB)"
          value={memory?.totalJSHeapSize ? (memory.totalJSHeapSize / (1024 * 1024)).toFixed(2) : "n/a"}
        />
        <StatCard
          label="Load Event (ms)"
          value={snapshot?.navigation?.loadEventMs || "n/a"}
        />
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
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "13px" }}>Alerts</div>
          <button
            onClick={resetAlerts}
            style={{
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              padding: "4px 8px",
            }}
          >
            Clear All
          </button>
        </div>
        {alerts.length === 0 && (
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            No active alerts.
          </div>
        )}
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} onClear={clearAlert} />
        ))}
      </div>
    </div>
  );
}

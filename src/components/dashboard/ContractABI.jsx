import React, { useState } from "react";
import { parseContractWasm } from "../../lib/contractInvoker";
import { useStore } from "../../lib/store";

function Panel({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              marginTop: "4px",
              fontSize: "11px",
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: "18px" }}>{children}</div>
    </div>
  );
}

function textInputStyle() {
  return {
    width: "100%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-bright)",
    borderRadius: "var(--radius-md)",
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: "13px",
    fontFamily: "var(--font-mono)",
    outline: "none",
    transition: "var(--transition)",
    boxSizing: "border-box",
  };
}

function ActionButton({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 16px",
        background: disabled ? "var(--bg-elevated)" : "var(--cyan)",
        color: disabled ? "var(--text-muted)" : "var(--bg-base)",
        border: disabled ? "1px solid var(--border)" : "none",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: "12px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "var(--transition)",
      }}
    >
      {label}
    </button>
  );
}

export default function ContractABI() {
  const { network } = useStore();
  const [contractId, setContractId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contractData, setContractData] = useState(null);

  async function handleFetch() {
    setError("");
    setContractData(null);
    setLoading(true);

    try {
      const data = await parseContractWasm(contractId, network);
      setContractData(data);
    } catch (err) {
      setError(err.message || "Failed to fetch contract");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="animate-in"
      style={{ display: "flex", flexDirection: "column", gap: "24px" }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "22px",
          fontWeight: 700,
        }}
      >
        Contract ABI Parser
      </div>

      <Panel
        title="Contract Lookup"
        subtitle="Fetch and display contract interface information"
      >
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="C... contract address"
            style={{ ...textInputStyle(), flex: 1, minWidth: "280px" }}
          />
          <ActionButton
            label={loading ? "Loading..." : "Fetch ABI"}
            onClick={handleFetch}
            disabled={loading || !contractId.trim()}
          />
        </div>

        {error && (
          <div
            style={{ marginTop: "12px", fontSize: "12px", color: "var(--red)" }}
          >
            {error}
          </div>
        )}
      </Panel>

      {contractData && (
        <Panel
          title="Contract Information"
          subtitle="Parsed contract data and metadata"
        >
          <pre
            style={{
              margin: 0,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "14px",
              fontSize: "11px",
              color: "var(--text-secondary)",
              overflowX: "auto",
              lineHeight: 1.6,
              fontFamily: "var(--font-mono)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(contractData, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  );
}

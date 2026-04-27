import React, { useState } from "react";
import { simulateTransaction } from "../../lib/transactionBuilder";

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

function ResultBlock({ label, data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          fontSize: "11px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}
      >
        {label}
      </div>
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
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function TransactionSimulator({
  transactionParams,
  onSimulate,
}) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSimulate() {
    setLoading(true);
    try {
      const simResult = await simulateTransaction(transactionParams);
      setResult(simResult);
      if (onSimulate) onSimulate(simResult);
    } catch (error) {
      setResult({ success: false, errors: [error.message] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel
      title="Simulation Results"
      subtitle="Preview transaction execution before submission"
    >
      {!result ? (
        <div
          style={{
            textAlign: "center",
            padding: "20px",
            color: "var(--text-muted)",
          }}
        >
          Click "Simulate Transaction" to preview results
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              background: result.success
                ? "var(--green-glow)"
                : "rgba(255, 0, 0, 0.1)",
              border: `1px solid ${result.success ? "var(--green)" : "var(--red)"}`,
              color: result.success ? "var(--green)" : "var(--red)",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            {result.success ? "✓ Simulation Successful" : "✗ Simulation Failed"}
          </div>

          {result.errors && result.errors.length > 0 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                Errors
              </div>
              {result.errors.map((error, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255, 0, 0, 0.1)",
                    border: "1px solid var(--red)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--red)",
                    fontSize: "12px",
                  }}
                >
                  {error}
                </div>
              ))}
            </div>
          )}

          {result.success && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                    }}
                  >
                    Estimated Fee
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--cyan)",
                    }}
                  >
                    {result.fee} stroops
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                    }}
                  >
                    Operations
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {result.operationCount}
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                    }}
                  >
                    Transaction Hash
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {result.hash?.slice(0, 16)}...
                  </div>
                </div>
              </div>

              {result.xdr && (
                <ResultBlock label="Transaction XDR" data={result.xdr} />
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

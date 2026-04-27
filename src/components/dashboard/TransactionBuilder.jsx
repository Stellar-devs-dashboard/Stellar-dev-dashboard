import React, { useState } from "react";
import { useStore } from "../../lib/store";
import { OPERATION_TYPES } from "../../lib/transactionBuilder";

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

function LabeledField({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span
        style={{
          fontSize: "11px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function textInputStyle(hasError = false) {
  return {
    width: "100%",
    background: "var(--bg-elevated)",
    border: `1px solid ${hasError ? "var(--red)" : "var(--border-bright)"}`,
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

function ActionButton({ label, onClick, disabled, tone = "primary" }) {
  const palette =
    tone === "secondary"
      ? {
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-bright)",
        }
      : {
          background: "var(--cyan)",
          color: "var(--bg-base)",
          border: "none",
        };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 16px",
        background: disabled ? "var(--bg-elevated)" : palette.background,
        color: disabled ? "var(--text-muted)" : palette.color,
        border: disabled ? "1px solid var(--border)" : palette.border,
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

export default function TransactionBuilder() {
  const { connectedAddress, network } = useStore();

  const [sourceAccount, setSourceAccount] = useState(connectedAddress || "");
  const [memo, setMemo] = useState("");
  const [memoType, setMemoType] = useState("text");
  const [baseFee, setBaseFee] = useState("100");
  const [operations, setOperations] = useState([
    {
      type: "payment",
      params: { destination: "", amount: "", assetType: "native" },
    },
  ]);

  function addOperation() {
    setOperations([
      ...operations,
      {
        type: "payment",
        params: { destination: "", amount: "", assetType: "native" },
      },
    ]);
  }

  function removeOperation(index) {
    setOperations(operations.filter((_, i) => i !== index));
  }

  function updateOperation(index, field, value) {
    const updated = [...operations];
    if (field === "type") {
      updated[index] = { type: value, params: {} };
    } else {
      updated[index].params[field] = value;
    }
    setOperations(updated);
  }

  function renderOperationFields(op, index) {
    switch (op.type) {
      case "payment":
        return (
          <>
            <LabeledField label="Destination">
              <input
                value={op.params.destination || ""}
                onChange={(e) =>
                  updateOperation(index, "destination", e.target.value)
                }
                placeholder="G... destination address"
                style={textInputStyle()}
              />
            </LabeledField>
            <LabeledField label="Amount">
              <input
                value={op.params.amount || ""}
                onChange={(e) =>
                  updateOperation(index, "amount", e.target.value)
                }
                placeholder="10.5"
                style={textInputStyle()}
              />
            </LabeledField>
          </>
        );

      case "createAccount":
        return (
          <>
            <LabeledField label="Destination">
              <input
                value={op.params.destination || ""}
                onChange={(e) =>
                  updateOperation(index, "destination", e.target.value)
                }
                placeholder="G... new account address"
                style={textInputStyle()}
              />
            </LabeledField>
            <LabeledField label="Starting Balance">
              <input
                value={op.params.startingBalance || ""}
                onChange={(e) =>
                  updateOperation(index, "startingBalance", e.target.value)
                }
                placeholder="1.5"
                style={textInputStyle()}
              />
            </LabeledField>
          </>
        );

      case "changeTrust":
        return (
          <>
            <LabeledField label="Asset Code">
              <input
                value={op.params.assetCode || ""}
                onChange={(e) =>
                  updateOperation(index, "assetCode", e.target.value)
                }
                placeholder="USDC"
                style={textInputStyle()}
              />
            </LabeledField>
            <LabeledField label="Asset Issuer">
              <input
                value={op.params.assetIssuer || ""}
                onChange={(e) =>
                  updateOperation(index, "assetIssuer", e.target.value)
                }
                placeholder="G... issuer address"
                style={textInputStyle()}
              />
            </LabeledField>
          </>
        );

      case "accountMerge":
        return (
          <LabeledField label="Destination">
            <input
              value={op.params.destination || ""}
              onChange={(e) =>
                updateOperation(index, "destination", e.target.value)
              }
              placeholder="G... merge destination"
              style={textInputStyle()}
            />
          </LabeledField>
        );

      case "manageData":
        return (
          <>
            <LabeledField label="Data Name">
              <input
                value={op.params.name || ""}
                onChange={(e) => updateOperation(index, "name", e.target.value)}
                placeholder="key"
                style={textInputStyle()}
              />
            </LabeledField>
            <LabeledField label="Data Value">
              <input
                value={op.params.value || ""}
                onChange={(e) =>
                  updateOperation(index, "value", e.target.value)
                }
                placeholder="value"
                style={textInputStyle()}
              />
            </LabeledField>
          </>
        );

      default:
        return (
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Configure operation parameters
          </div>
        );
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
        Transaction Builder
      </div>

      <Panel
        title="Transaction Settings"
        subtitle="Configure source account and transaction parameters"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "14px",
          }}
        >
          <LabeledField label="Source Account">
            <input
              value={sourceAccount}
              onChange={(e) => setSourceAccount(e.target.value)}
              placeholder={connectedAddress || "G... source account"}
              style={textInputStyle()}
            />
          </LabeledField>

          <LabeledField label="Base Fee (stroops)">
            <input
              value={baseFee}
              onChange={(e) => setBaseFee(e.target.value)}
              placeholder="100"
              style={textInputStyle()}
            />
          </LabeledField>

          <LabeledField label="Memo Type">
            <select
              value={memoType}
              onChange={(e) => setMemoType(e.target.value)}
              style={textInputStyle()}
            >
              <option value="text">Text</option>
              <option value="id">ID</option>
              <option value="hash">Hash</option>
              <option value="return">Return</option>
            </select>
          </LabeledField>

          <LabeledField label="Memo">
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Optional memo"
              style={textInputStyle()}
            />
          </LabeledField>
        </div>
      </Panel>

      <Panel
        title="Operations"
        subtitle="Add and configure transaction operations"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {operations.map((op, index) => (
            <div
              key={index}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "14px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  Operation {index + 1}
                </span>
                <ActionButton
                  label="Remove"
                  onClick={() => removeOperation(index)}
                  disabled={operations.length === 1}
                  tone="secondary"
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                }}
              >
                <LabeledField label="Operation Type">
                  <select
                    value={op.type}
                    onChange={(e) =>
                      updateOperation(index, "type", e.target.value)
                    }
                    style={textInputStyle()}
                  >
                    {OPERATION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </LabeledField>

                {renderOperationFields(op, index)}
              </div>
            </div>
          ))}

          <ActionButton
            label="Add Operation"
            onClick={addOperation}
            tone="secondary"
          />
        </div>
      </Panel>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <ActionButton label="Simulate Transaction" onClick={() => {}} />
        <ActionButton label="Export XDR" onClick={() => {}} tone="secondary" />
      </div>
    </div>
  );
}

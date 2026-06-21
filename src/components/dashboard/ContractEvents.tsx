import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../lib/store";
import {
  fetchContractEvents,
  isValidContractId,
  shortAddress,
  type ContractEventType,
  type DecodedContractEvent,
} from "../../lib/stellar";

const POLL_INTERVAL_MS = 5000;
const PAGE_LIMIT = 50;

const EVENT_TYPE_OPTIONS: { value: ContractEventType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "contract", label: "Contract" },
  { value: "system", label: "System" },
  { value: "diagnostic", label: "Diagnostic" },
];

function textInputStyle(): CSSProperties {
  return {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-bright)",
    borderRadius: "var(--radius-md)",
    padding: "8px 12px",
    color: "var(--text-primary)",
    fontSize: "13px",
    fontFamily: "var(--font-mono)",
    outline: "none",
    boxSizing: "border-box",
  };
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  tone = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}) {
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
        padding: "8px 14px",
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

function typeColor(type: string): string {
  if (type === "contract") return "var(--cyan)";
  if (type === "system") return "var(--amber)";
  return "var(--text-muted)";
}

/** Stringify a decoded topic/value for display and prefix filtering. */
function stringifyDecoded(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Merge newly fetched events into the feed, de-duping by id and sorting newest-first. */
export function mergeEvents(
  existing: DecodedContractEvent[],
  incoming: DecodedContractEvent[],
): DecodedContractEvent[] {
  const byId = new Map<string, DecodedContractEvent>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return Array.from(byId.values()).sort((a, b) => {
    if (b.ledger !== a.ledger) return b.ledger - a.ledger;
    return b.id.localeCompare(a.id);
  });
}

export default function ContractEvents() {
  const { network, contractId: storeContractId, setActiveTab } = useStore();
  const navigate = useNavigate();

  const [contractIdInput, setContractIdInput] = useState(storeContractId || "");
  const [watchedContractId, setWatchedContractId] = useState("");
  const [eventType, setEventType] = useState<ContractEventType | "all">("all");
  const [topicPrefix, setTopicPrefix] = useState("");
  const [live, setLive] = useState(true);

  const [events, setEvents] = useState<DecodedContractEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestLedger, setLatestLedger] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Forward cursor for paging / polling. Held in a ref so the poll loop always
  // reads the freshest value without re-subscribing the interval.
  const cursorRef = useRef<string | null>(null);

  const contractIdValid = isValidContractId(contractIdInput.trim());

  const startWatching = useCallback(async () => {
    const id = contractIdInput.trim();
    if (!isValidContractId(id)) {
      setError("Enter a valid Soroban contract address");
      return;
    }
    setError(null);
    setLoading(true);
    setEvents([]);
    setExpandedId(null);
    cursorRef.current = null;
    setWatchedContractId(id);

    try {
      const result = await fetchContractEvents({
        contractId: id,
        network,
        eventType,
        limit: PAGE_LIMIT,
      });
      cursorRef.current = result.cursor;
      setLatestLedger(result.latestLedger);
      setHasMore(result.events.length >= PAGE_LIMIT);
      setEvents(mergeEvents([], result.events));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contract events");
      setWatchedContractId("");
    } finally {
      setLoading(false);
    }
  }, [contractIdInput, network, eventType]);

  const loadMore = useCallback(async () => {
    if (!watchedContractId || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const result = await fetchContractEvents({
        contractId: watchedContractId,
        network,
        eventType,
        cursor: cursorRef.current,
        limit: PAGE_LIMIT,
      });
      cursorRef.current = result.cursor ?? cursorRef.current;
      setLatestLedger(result.latestLedger);
      setHasMore(result.events.length >= PAGE_LIMIT);
      setEvents((prev) => mergeEvents(prev, result.events));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more events");
    } finally {
      setLoadingMore(false);
    }
  }, [watchedContractId, network, eventType]);

  // Re-fetch from scratch whenever the watched contract, network or server-side
  // event type filter changes.
  useEffect(() => {
    if (!watchedContractId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setEvents([]);
      cursorRef.current = null;
      try {
        const result = await fetchContractEvents({
          contractId: watchedContractId,
          network,
          eventType,
          limit: PAGE_LIMIT,
        });
        if (cancelled) return;
        cursorRef.current = result.cursor;
        setLatestLedger(result.latestLedger);
        setHasMore(result.events.length >= PAGE_LIMIT);
        setEvents(mergeEvents([], result.events));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load contract events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedContractId, network, eventType]);

  // Live polling: fetch newly emitted events using the forward cursor every 5s.
  useEffect(() => {
    if (!live || !watchedContractId) return;
    const interval = window.setInterval(async () => {
      if (!cursorRef.current) return;
      try {
        const result = await fetchContractEvents({
          contractId: watchedContractId,
          network,
          eventType,
          cursor: cursorRef.current,
          limit: PAGE_LIMIT,
        });
        if (result.events.length > 0) {
          cursorRef.current = result.cursor ?? cursorRef.current;
          setEvents((prev) => mergeEvents(prev, result.events));
        }
        setLatestLedger(result.latestLedger);
      } catch {
        // Transient poll failures are ignored; the next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [live, watchedContractId, network, eventType]);

  const filteredEvents = useMemo(() => {
    const prefix = topicPrefix.trim().toLowerCase();
    if (!prefix) return events;
    return events.filter((event) =>
      event.topics.some((topic) => stringifyDecoded(topic).toLowerCase().startsWith(prefix)),
    );
  }, [events, topicPrefix]);

  function handleTxClick(txHash: string | null) {
    if (!txHash) return;
    setActiveTab("transactions");
    navigate("/transactions");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "14px" }}>
            Live Contract Events
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {latestLedger !== null && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                Ledger {latestLedger}
              </span>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Live (5s)
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: live && watchedContractId ? "var(--green)" : "var(--text-muted)",
                  boxShadow: live && watchedContractId ? "0 0 6px var(--green)" : "none",
                }}
              />
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            placeholder="C... contract address to watch"
            value={contractIdInput}
            onChange={(e) => setContractIdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startWatching()}
            style={{ ...textInputStyle(), flex: 1, minWidth: "280px" }}
          />
          <ActionButton
            label={loading ? "Loading..." : "Watch"}
            onClick={startWatching}
            disabled={loading || !contractIdValid}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as ContractEventType | "all")}
            style={textInputStyle()}
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            placeholder="Topic prefix filter..."
            value={topicPrefix}
            onChange={(e) => setTopicPrefix(e.target.value)}
            style={{ ...textInputStyle(), flex: 1, minWidth: "200px" }}
          />
        </div>

        {error && (
          <div style={{ fontSize: "12px", color: "var(--red)" }}>{error}</div>
        )}
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        {!watchedContractId ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            Enter a contract ID and click Watch to stream its events.
          </div>
        ) : loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            {events.length === 0 ? "No events found for this contract." : "No events match the topic filter."}
          </div>
        ) : (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "12px", color: "var(--text-muted)" }}>Ledger</th>
                  <th style={{ padding: "12px", color: "var(--text-muted)" }}>Type</th>
                  <th style={{ padding: "12px", color: "var(--text-muted)" }}>Topics</th>
                  <th style={{ padding: "12px", color: "var(--text-muted)" }}>Value</th>
                  <th style={{ padding: "12px", textAlign: "right", color: "var(--text-muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <React.Fragment key={event.id}>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                        <div>{event.ledger}</div>
                        {event.ledgerClosedAt && (
                          <div style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                            {new Date(event.ledgerClosedAt).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "var(--bg-base)",
                            color: typeColor(event.type),
                            textTransform: "uppercase",
                            fontSize: "10px",
                          }}
                        >
                          {event.type}
                        </span>
                      </td>
                      <td style={{ padding: "12px", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.topics.map((t) => stringifyDecoded(t)).join(", ") || "—"}
                      </td>
                      <td style={{ padding: "12px", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {stringifyDecoded(event.value) || "—"}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                          style={{ background: "transparent", border: "none", color: "var(--cyan)", cursor: "pointer", marginRight: "12px", fontSize: "12px" }}
                        >
                          {expandedId === event.id ? "Hide" : "View"}
                        </button>
                        <button
                          onClick={() => handleTxClick(event.txHash)}
                          disabled={!event.txHash}
                          title={event.txHash || "Transaction hash unavailable"}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: event.txHash ? "var(--text-primary)" : "var(--text-muted)",
                            cursor: event.txHash ? "pointer" : "not-allowed",
                            fontSize: "12px",
                          }}
                        >
                          {event.txHash ? `Tx ${shortAddress(event.txHash, 4)}` : "No Tx"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === event.id && (
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                        <td colSpan={5} style={{ padding: "16px" }}>
                          <div style={{ display: "grid", gap: "12px" }}>
                            <div>
                              <strong style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase" }}>Topics</strong>
                              <pre style={{ margin: "4px 0 0", padding: "10px", background: "var(--bg-base)", borderRadius: "4px", overflowX: "auto" }}>
                                {JSON.stringify(event.topics, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}
                              </pre>
                            </div>
                            <div>
                              <strong style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase" }}>Value</strong>
                              <pre style={{ margin: "4px 0 0", padding: "10px", background: "var(--bg-base)", borderRadius: "4px", overflowX: "auto" }}>
                                {JSON.stringify(event.value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}
                              </pre>
                            </div>
                            {event.txHash && (
                              <div>
                                <strong style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase" }}>Transaction</strong>
                                <div style={{ marginTop: "4px" }}>
                                  <button
                                    onClick={() => handleTxClick(event.txHash)}
                                    style={{ background: "transparent", border: "none", color: "var(--cyan)", cursor: "pointer", fontSize: "12px", padding: 0, wordBreak: "break-all", textAlign: "left" }}
                                  >
                                    {event.txHash}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div style={{ padding: "16px", textAlign: "center", borderTop: "1px solid var(--border)" }}>
                <ActionButton
                  label={loadingMore ? "Loading..." : "Load More"}
                  onClick={loadMore}
                  tone="secondary"
                  disabled={loadingMore}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

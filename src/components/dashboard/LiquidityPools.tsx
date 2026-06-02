import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Droplets, RefreshCw, Search } from "lucide-react";
import { useStore } from "../../lib/store";
import {
  fetchAccountLiquidityPoolHistory,
  fetchAccountLiquidityPoolPositions,
  fetchLiquidityPoolsByAssetPair,
} from "../../lib/dex";
import type { LiquidityPool, LiquidityPosition } from "./types";

const DEFAULT_ASSET_A = "native";
const DEFAULT_ASSET_B = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

function formatNumber(value: string | number, maximumFractionDigits = 7): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-US", { maximumFractionDigits });
}

function assetCode(asset: string): string {
  if (!asset || asset === "native") return "XLM";
  return asset.split(":")[0] || asset;
}

function shortId(value: string): string {
  if (!value) return "—";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function operationAmount(op: Record<string, unknown>): string {
  if (op.type === "liquidity_pool_deposit") {
    const max = [op.max_amount_a, op.max_amount_b].filter(Boolean).join(" / ");
    return max || "Deposit";
  }
  if (op.type === "liquidity_pool_withdraw") {
    const min = [op.min_amount_a, op.min_amount_b].filter(Boolean).join(" / ");
    return (min as string) || (op.shares as string) || "Withdraw";
  }
  return "—";
}

function AssetField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>{label}</span>
      <input
        value={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        placeholder='native or CODE:G...'
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          padding: "9px 10px",
          fontSize: "12px",
          fontFamily: "var(--font-mono)",
        }}
      />
    </label>
  );
}

function PanelHeader({ icon, title, detail, compact = false }: { icon?: ReactNode; title: string; detail?: string; compact?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        marginBottom: compact ? "8px" : "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-display)", fontSize: "13px" }}>
        {icon}
        {title}
      </div>
      <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>{detail}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px" }}>
      <div style={{ color: "var(--text-muted)", fontSize: "10px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", marginTop: "4px", wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--text-muted)", fontSize: "9px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "11px", marginTop: "3px" }}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ padding: "14px 0", color: "var(--text-muted)", fontSize: "12px" }}>{text}</div>;
}

const panelStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "14px",
  minWidth: 0,
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    alignSelf: "end",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    border: "1px solid var(--cyan-dim)",
    background: disabled ? "transparent" : "var(--cyan-glow)",
    color: disabled ? "var(--text-muted)" : "var(--cyan)",
    borderRadius: "var(--radius-sm)",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    padding: "9px 12px",
    cursor: disabled ? "not-allowed" : "pointer",
    minWidth: "94px",
  };
}

export default function LiquidityPools() {
  const { network, connectedAddress } = useStore();
  const [assetA, setAssetA] = useState(DEFAULT_ASSET_A);
  const [assetB, setAssetB] = useState(DEFAULT_ASSET_B);
  const [pools, setPools] = useState<LiquidityPool[]>([]);
  const [positions, setPositions] = useState<LiquidityPosition[]>([]);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedPool = useMemo<LiquidityPool | null>(
    () => pools.find((pool) => pool.id === selectedPoolId) || pools[0] || null,
    [pools, selectedPoolId]
  );

  async function loadPools(nextA = assetA, nextB = assetB) {
    setLoading(true);
    setError("");
    try {
      const records: LiquidityPool[] = await fetchLiquidityPoolsByAssetPair(nextA.trim(), nextB.trim(), network, 20);
      setPools(records);
      setSelectedPoolId(records[0]?.id || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load liquidity pools.");
      setPools([]);
      setSelectedPoolId(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadAccountPools(poolId?: string | null) {
    if (!connectedAddress) {
      setPositions([]);
      setHistory([]);
      return;
    }

    setAccountLoading(true);
    try {
      const [nextPositions, nextHistory] = await Promise.all([
        fetchAccountLiquidityPoolPositions(connectedAddress, network),
        fetchAccountLiquidityPoolHistory(connectedAddress, network, 80, poolId),
      ]);
      setPositions(nextPositions);
      setHistory(nextHistory);
    } catch {
      setPositions([]);
      setHistory([]);
    } finally {
      setAccountLoading(false);
    }
  }

  useEffect(() => {
    const rawPair = sessionStorage.getItem("dex:poolPair");
    if (!rawPair) {
      loadPools();
      return;
    }

    try {
      const pair = JSON.parse(rawPair) as { assetA: string; assetB: string };
      sessionStorage.removeItem("dex:poolPair");
      if (pair.assetA && pair.assetB) {
        setAssetA(pair.assetA);
        setAssetB(pair.assetB);
        loadPools(pair.assetA, pair.assetB);
        return;
      }
    } catch {
      sessionStorage.removeItem("dex:poolPair");
    }

    loadPools();
  }, [network]);

  useEffect(() => {
    loadAccountPools(selectedPoolId);
  }, [connectedAddress, network, selectedPoolId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: "10px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "14px",
        }}
      >
        <AssetField label="Asset A" value={assetA} onChange={setAssetA} />
        <AssetField label="Asset B" value={assetB} onChange={setAssetB} />
        <button
          onClick={() => loadPools()}
          disabled={loading}
          title="Search pools"
          style={buttonStyle(loading)}
        >
          {loading ? <RefreshCw size={15} /> : <Search size={15} />}
          {loading ? "Loading" : "Search"}
        </button>
      </div>

      {error && <div style={{ fontSize: "12px", color: "var(--red)" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 0.9fr)", gap: "12px" }}>
        <div style={panelStyle}>
          <PanelHeader icon={<Droplets size={15} />} title="Pools" detail={`${pools.length} found`} />
          {pools.length === 0 && (
            <EmptyState text={loading ? "Loading pools…" : "No pools found for this pair."} />
          )}
          {pools.map((pool: LiquidityPool) => (
            <button
              key={pool.id}
              onClick={() => setSelectedPoolId(pool.id)}
              style={{
                width: "100%",
                border: `1px solid ${selectedPool?.id === pool.id ? "var(--cyan-dim)" : "var(--border)"}`,
                background: selectedPool?.id === pool.id ? "var(--cyan-glow)" : "transparent",
                color: "var(--text-primary)",
                borderRadius: "var(--radius-md)",
                padding: "12px",
                marginBottom: "8px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: "13px" }}>
                  {pool.assetCodeA}/{pool.assetCodeB}
                </strong>
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                  {pool.feeBps} bp
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "10px" }}>
                <MiniMetric label={assetCode(pool.assetA)} value={formatNumber(pool.reserveA)} />
                <MiniMetric label={assetCode(pool.assetB)} value={formatNumber(pool.reserveB)} />
                <MiniMetric label="Shares" value={formatNumber(pool.totalShares, 2)} />
              </div>
              <div style={{ marginTop: "8px", color: "var(--text-muted)", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
                {shortId(pool.id)}
              </div>
            </button>
          ))}
        </div>

        <div style={panelStyle}>
          <PanelHeader title="Selected Pool" detail={selectedPool ? shortId(selectedPool.id) : "None"} />
          {!selectedPool ? (
            <EmptyState text="Choose a pool to inspect reserves and your LP share." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Stat label={`${selectedPool.assetCodeA} Reserve`} value={formatNumber(selectedPool.reserveA)} />
                <Stat label={`${selectedPool.assetCodeB} Reserve`} value={formatNumber(selectedPool.reserveB)} />
                <Stat label={`${selectedPool.assetCodeA}/${selectedPool.assetCodeB}`} value={formatNumber(selectedPool.priceBperA)} />
                <Stat label={`${selectedPool.assetCodeB}/${selectedPool.assetCodeA}`} value={formatNumber(selectedPool.priceAperB)} />
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                <PanelHeader title="Your Position" detail={accountLoading ? "Refreshing" : connectedAddress ? "Connected" : "No wallet"} compact />
                {!connectedAddress && <EmptyState text="Connect an account to show LP shares and history." />}
                {connectedAddress && positions.filter((position: LiquidityPosition) => position.poolId === selectedPool.id).length === 0 && (
                  <EmptyState text="No LP shares for this pool on the connected account." />
                )}
                {positions
                  .filter((position: LiquidityPosition) => position.poolId === selectedPool.id)
                  .map((position: LiquidityPosition) => (
                    <div key={position.poolId} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <Stat label="LP Shares" value={formatNumber(position.shares || position.balance || "0", 7)} />
                      <Stat label="Pool Ownership" value={`${formatNumber(position.sharePercent, 5)}%`} />
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={panelStyle}>
        <PanelHeader title="Deposit / Withdraw History" detail={connectedAddress ? `${history.length} operations` : "No wallet"} />
        {!connectedAddress && <EmptyState text="Connect an account to show pool deposit and withdrawal history." />}
        {connectedAddress && history.length === 0 && <EmptyState text="No recent deposit or withdrawal operations for this pool." />}
        {history.map((op: Record<string, unknown>) => (
          <div
            key={op.id as string}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "10px",
              borderTop: "1px solid var(--border)",
              padding: "10px 0",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
            }}
          >
            <span style={{ color: op.type === "liquidity_pool_deposit" ? "var(--green)" : "var(--amber)" }}>
              {op.type === "liquidity_pool_deposit" ? "Deposit" : "Withdraw"}
            </span>
            <span>{operationAmount(op)}</span>
            <span>{op.created_at ? new Date(op.created_at as string).toLocaleString() : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

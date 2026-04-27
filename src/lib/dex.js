import * as StellarSdk from "@stellar/stellar-sdk";
import { getServer, NETWORKS } from "./stellar";
import cache from "./cache";

// ─── Cache TTLs ───────────────────────────────────────────────────────────────

const TTL = {
  POOLS: 60_000,        // 1 min
  POOL_DETAIL: 30_000,  // 30 s
  TRADES: 20_000,       // 20 s
  ORDERBOOK: 10_000,    // 10 s
  ASSETS: 300_000,      // 5 min
};

// ─── Order Book ───────────────────────────────────────────────────────────────

export async function fetchOrderBook(sellingAsset, buyingAsset, network = "testnet", limit = 20) {
  const server = getServer(network);
  const key = cache.generateKey("orderbook", { s: sellingAsset.toString(), b: buyingAsset.toString(), network });
  const cached = cache.get(key);
  if (cached) return cached;

  const orderbook = await server.orderbook(sellingAsset, buyingAsset).limit(limit).call();
  const result = {
    bids: orderbook.bids || [],
    asks: orderbook.asks || [],
    base: orderbook.base,
    counter: orderbook.counter,
  };
  cache.set(key, result, TTL.ORDERBOOK);
  return result;
}

export async function fetchTrades(baseAsset, counterAsset, network = "testnet", limit = 50) {
  const server = getServer(network);
  const key = cache.generateKey("trades", { b: baseAsset.toString(), c: counterAsset.toString(), network });
  const cached = cache.get(key);
  if (cached) return cached;

  const trades = await server.trades().forAssetPair(baseAsset, counterAsset).order("desc").limit(limit).call();
  const result = trades.records || [];
  cache.set(key, result, TTL.TRADES);
  return result;
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export async function fetchAllAssets(network = "testnet", limit = 200) {
  const server = getServer(network);
  const key = cache.generateKey("assets", { network, limit });
  const cached = cache.get(key);
  if (cached) return cached;

  const assets = await server.assets().limit(limit).call();
  const result = assets.records || [];
  cache.set(key, result, TTL.ASSETS);
  return result;
}

// ─── Liquidity Pools ─────────────────────────────────────────────────────────

/**
 * Fetch all AMM liquidity pools, optionally filtered by asset.
 */
export async function fetchLiquidityPools(network = "testnet", limit = 50, assetFilter = null) {
  const server = getServer(network);
  const key = cache.generateKey("pools", { network, limit, assetFilter });
  const cached = cache.get(key);
  if (cached) return cached;

  let req = server.liquidityPools().limit(limit);
  if (assetFilter) req = req.forAssets(assetFilter);

  const pools = await req.call();
  const result = (pools.records || []).map(enrichPool);
  cache.set(key, result, TTL.POOLS);
  return result;
}

/**
 * Fetch a single pool by ID with full detail.
 */
export async function fetchPoolById(poolId, network = "testnet") {
  const server = getServer(network);
  const key = cache.generateKey("pool-detail", { poolId, network });
  const cached = cache.get(key);
  if (cached) return cached;

  const pool = await server.liquidityPools().liquidityPoolId(poolId).call();
  const result = enrichPool(pool);
  cache.set(key, result, TTL.POOL_DETAIL);
  return result;
}

/**
 * Fetch trades for a specific liquidity pool.
 */
export async function fetchPoolTrades(poolId, network = "testnet", limit = 50) {
  const server = getServer(network);
  const key = cache.generateKey("pool-trades", { poolId, network, limit });
  const cached = cache.get(key);
  if (cached) return cached;

  const trades = await server.trades().forLiquidityPool(poolId).order("desc").limit(limit).call();
  const result = trades.records || [];
  cache.set(key, result, TTL.TRADES);
  return result;
}

/**
 * Fetch operations (deposits/withdrawals) for a pool.
 */
export async function fetchPoolOperations(poolId, network = "testnet", limit = 50) {
  const server = getServer(network);
  const key = cache.generateKey("pool-ops", { poolId, network, limit });
  const cached = cache.get(key);
  if (cached) return cached;

  const ops = await server.operations().forLiquidityPool(poolId).order("desc").limit(limit).call();
  const result = ops.records || [];
  cache.set(key, result, TTL.TRADES);
  return result;
}

// ─── Pool Enrichment ──────────────────────────────────────────────────────────

/**
 * Add computed fields to a raw Horizon pool record.
 */
export function enrichPool(pool) {
  const reserves = pool.reserves || [];
  const totalShares = parseFloat(pool.total_shares) || 0;
  const totalTrustlines = pool.total_trustlines || 0;

  // Parse reserve amounts
  const reserveA = reserves[0] ? parseFloat(reserves[0].amount) : 0;
  const reserveB = reserves[1] ? parseFloat(reserves[1].amount) : 0;

  // Implied price ratio (A per B)
  const priceAperB = reserveB > 0 ? reserveA / reserveB : 0;
  const priceBperA = reserveA > 0 ? reserveB / reserveA : 0;

  // Fee tier (Stellar AMM uses 30 bps = 0.3%)
  const feeBps = pool.fee_bp || 30;
  const feePercent = feeBps / 100;

  // Composition percentages
  const totalReserveValue = reserveA + reserveB;
  const compositionA = totalReserveValue > 0 ? (reserveA / totalReserveValue) * 100 : 50;
  const compositionB = totalReserveValue > 0 ? (reserveB / totalReserveValue) * 100 : 50;

  return {
    ...pool,
    reserveA,
    reserveB,
    assetA: reserves[0]?.asset || "native",
    assetB: reserves[1]?.asset || "unknown",
    assetCodeA: parseAssetCode(reserves[0]?.asset),
    assetCodeB: parseAssetCode(reserves[1]?.asset),
    totalShares,
    totalTrustlines,
    priceAperB,
    priceBperA,
    feeBps,
    feePercent,
    compositionA,
    compositionB,
    totalReserveValue,
  };
}

function parseAssetCode(assetStr) {
  if (!assetStr || assetStr === "native") return "XLM";
  const parts = assetStr.split(":");
  return parts[0] || assetStr;
}

// ─── Yield / APR Estimation ───────────────────────────────────────────────────

/**
 * Estimate annualised fee APR from 24h trade volume.
 * APR = (24h_fees / TVL) * 365
 *
 * Since Horizon doesn't expose 24h volume directly, we estimate from
 * recent trades fetched separately.
 *
 * @param {object} pool - enriched pool record
 * @param {number} volume24hUsd - estimated 24h volume in USD (or XLM units)
 * @returns {{ feeApr: number, dailyFees: number }}
 */
export function estimatePoolApr(pool, volume24hUsd = 0) {
  const tvl = pool.totalReserveValue; // in native units (XLM-equivalent)
  if (tvl <= 0) return { feeApr: 0, dailyFees: 0 };

  const dailyFees = volume24hUsd * (pool.feePercent / 100);
  const feeApr = tvl > 0 ? (dailyFees / tvl) * 365 * 100 : 0;

  return { feeApr, dailyFees };
}

/**
 * Estimate impermanent loss for a given price change ratio.
 * @param {number} priceRatio - new_price / initial_price
 * @returns {number} IL as a percentage (negative = loss)
 */
export function estimateImpermanentLoss(priceRatio) {
  if (priceRatio <= 0) return 0;
  const sqrtRatio = Math.sqrt(priceRatio);
  const il = (2 * sqrtRatio) / (1 + priceRatio) - 1;
  return il * 100; // as percentage
}

/**
 * Build a series of IL data points across a range of price ratios.
 */
export function buildILCurve(steps = 20) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = 0.1 + (i / steps) * 9.9; // 0.1x to 10x
    points.push({
      priceRatio: parseFloat(ratio.toFixed(2)),
      il: parseFloat(estimateImpermanentLoss(ratio).toFixed(2)),
    });
  }
  return points;
}

/**
 * Build synthetic historical TVL/volume series from pool operations.
 * Groups operations by day and accumulates reserve changes.
 */
export function buildPoolHistorySeries(operations = []) {
  const byDay = new Map();

  for (const op of operations) {
    const day = op.created_at ? op.created_at.slice(0, 10) : null;
    if (!day) continue;

    const entry = byDay.get(day) || { date: day, deposits: 0, withdrawals: 0, txCount: 0 };
    if (op.type === "liquidity_pool_deposit") entry.deposits += 1;
    if (op.type === "liquidity_pool_withdraw") entry.withdrawals += 1;
    entry.txCount += 1;
    byDay.set(day, entry);
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Helpers (re-exported for DEXExplorer) ───────────────────────────────────

export function formatAsset(asset) {
  if (asset.isNative()) return { type: "native", code: "XLM", issuer: null };
  return { type: asset.getAssetType(), code: asset.getCode(), issuer: asset.getIssuer() };
}

export function parseAssetString(assetStr) {
  if (assetStr === "native" || assetStr === "XLM") return { type: "native", code: "XLM" };
  const parts = assetStr.split(":");
  if (parts.length !== 2) throw new Error('Invalid asset format. Use "CODE:ISSUER" or "native"');
  return { type: parts[0].length <= 4 ? "credit_alphanum4" : "credit_alphanum12", code: parts[0], issuer: parts[1] };
}

export function calculateSpread(bids, asks) {
  if (!bids.length || !asks.length) return null;
  const bestBid = parseFloat(bids[0].price);
  const bestAsk = parseFloat(asks[0].price);
  return { absolute: bestAsk - bestBid, percentage: ((bestAsk - bestBid) / bestBid) * 100 };
}

export function aggregateOrderBookDepth(orders, levels = 10) {
  const aggregated = [];
  let cumulativeAmount = 0;
  for (let i = 0; i < Math.min(orders.length, levels); i++) {
    const order = orders[i];
    cumulativeAmount += parseFloat(order.amount);
    aggregated.push({ price: parseFloat(order.price), amount: parseFloat(order.amount), cumulative: cumulativeAmount });
  }
  return aggregated;
}

/**
 * Typed query key factory for TanStack Query.
 *
 * Centralising keys here ensures:
 *  - No typos across query/mutation/invalidation call sites
 *  - Consistent key shape for partial invalidation (e.g. all account queries)
 *  - Easy addition of new domains without hunting for magic strings
 */

import type { NetworkName } from './stellar'

// ─── Account ──────────────────────────────────────────────────────────────────

export const accountKeys = {
  /** All account queries (use to wipe everything on disconnect) */
  all: ['account'] as const,
  /** All queries for one address across all networks */
  byAddress: (address: string) => ['account', address] as const,
  /** Canonical single-account key */
  detail: (address: string, network: NetworkName) =>
    ['account', address, network] as const,
  /** Account creation date */
  createdAt: (address: string, network: NetworkName) =>
    ['account', address, network, 'createdAt'] as const,
  /** Open offers for an account */
  offers: (address: string, network: NetworkName) =>
    ['account', address, network, 'offers'] as const,
  /** Claimable balances */
  claimableBalances: (address: string, network: NetworkName) =>
    ['account', address, network, 'claimableBalances'] as const,
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export const transactionKeys = {
  all: ['transactions'] as const,
  byAddress: (address: string) => ['transactions', address] as const,
  /** Infinite-query key — cursor handled internally by TanStack */
  infinite: (address: string, network: NetworkName, limit: number) =>
    ['transactions', address, network, 'infinite', limit] as const,
  /** Single-page fetch (used by widgets) */
  page: (address: string, network: NetworkName, limit: number) =>
    ['transactions', address, network, 'page', limit] as const,
  /** Transaction detail by hash */
  detail: (hash: string, network: NetworkName) =>
    ['transactions', hash, network, 'detail'] as const,
}

// ─── Operations ───────────────────────────────────────────────────────────────

export const operationKeys = {
  all: ['operations'] as const,
  byAddress: (address: string) => ['operations', address] as const,
  infinite: (address: string, network: NetworkName, limit: number) =>
    ['operations', address, network, 'infinite', limit] as const,
  page: (address: string, network: NetworkName, limit: number) =>
    ['operations', address, network, 'page', limit] as const,
}

// ─── Network ──────────────────────────────────────────────────────────────────

export const networkKeys = {
  all: ['network'] as const,
  stats: (network: NetworkName) => ['network', network, 'stats'] as const,
  probes: () => ['network', 'probes'] as const,
  ledgers: (network: NetworkName) => ['network', network, 'ledgers'] as const,
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export const priceKeys = {
  all: ['prices'] as const,
  xlm: () => ['prices', 'xlm'] as const,
  asset: (code: string, issuer: string) => ['prices', 'asset', code, issuer] as const,
}

// ─── Contracts ────────────────────────────────────────────────────────────────

export const contractKeys = {
  all: ['contracts'] as const,
  detail: (contractId: string, network: NetworkName) =>
    ['contracts', contractId, network] as const,
  storage: (contractId: string, network: NetworkName) =>
    ['contracts', contractId, network, 'storage'] as const,
}

// ─── Comparison ───────────────────────────────────────────────────────────────

export const comparisonKeys = {
  account: (address: string, network: NetworkName) =>
    ['comparison', 'account', address, network] as const,
}

// ─── Faucet ───────────────────────────────────────────────────────────────────

export const faucetKeys = {
  fund: (address: string, network: NetworkName) =>
    ['faucet', address, network] as const,
}

// ─── Asset Control ────────────────────────────────────────────────────────────

export const assetControlKeys = {
  all: ['assetControl'] as const,
  /** Issuer readiness for a given address + network. */
  issuerReadiness: (address: string, network: NetworkName) =>
    ['assetControl', 'issuerReadiness', address, network] as const,
  /** Issuer state (flags, signers, reserves). */
  issuerState: (address: string, network: NetworkName) =>
    ['assetControl', 'issuerState', address, network] as const,
  /** Holders of a specific asset. */
  holders: (assetCode: string, issuer: string, network: NetworkName) =>
    ['assetControl', 'holders', assetCode, issuer, network] as const,
  /** Trustline detail for one holder. */
  trustline: (holder: string, assetCode: string, issuer: string, network: NetworkName) =>
    ['assetControl', 'trustline', holder, assetCode, issuer, network] as const,
}

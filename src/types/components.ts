/**
 * Shared component-prop types reused across the dashboard. Keeping these in a
 * dedicated module avoids circular imports between feature components and
 * lets us evolve a single source of truth as the TS migration progresses.
 */

import type { LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { AssetInfo, AssetSearchFilters, NetworkName } from '../lib/stellar'

export interface CardProps {
  children?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  glow?: boolean
  style?: CSSProperties
  className?: string
}

export interface StatCardProps {
  label: ReactNode
  value?: ReactNode
  sub?: ReactNode
  accent?: string
  loading?: boolean
}

export interface CopyableValueProps {
  value: string
  children?: ReactNode
  title?: string
  textStyle?: CSSProperties
  containerStyle?: CSSProperties
  buttonStyle?: CSSProperties
}

export interface ResponsiveBreakpoints {
  mobile: number
  tablet: number
  desktop: number
}

export interface ResponsiveState {
  windowWidth: number
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  breakpoints: ResponsiveBreakpoints
}

/** Lucide (or similar) icon used in dashboard cards */
export type IconComponent = LucideIcon

export interface AssetCardProps {
  asset: AssetInfo
  network: NetworkName
  onClick?: () => void
}

export interface AssetFiltersState {
  verified_only: boolean
  min_accounts: number | null
  max_accounts: number | null
  has_domain: boolean
  sort_by: string
  order: string
  asset_type: AssetSearchFilters['asset_type'] | ''
  code_pattern: string
  min_volume_24h: number | null
  volatility: string
  reputation_min: number
  verification_level: string
}

export interface AssetFiltersProps {
  filters: AssetFiltersState
  onChange: (patch: Partial<AssetFiltersState>) => void
}

/** Risk signal shown on the analytics dashboard */
export interface RiskSignal {
  id: string
  label: string
  active: boolean
  severity: 'high' | 'medium' | 'low' | 'critical' | 'warning' | 'info'
}

export interface AnalyticsAccountSummary {
  xlmBalance?: number
  trustlineCount?: number
}

export interface AnalyticsTransactionSummary {
  successRate?: number
  weeklyActivity?: number
}

export interface AnalyticsNetworkSummary {
  latestLedgerSequence?: number | null
  baseFee?: number
  averageCloseSeconds?: number
}

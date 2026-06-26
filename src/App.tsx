import React, {
  lazy,
  Suspense,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ComponentType,
  type CSSProperties,
} from 'react'
import { Routes, Route, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { I18nProvider } from './components/I18nProvider'
import './i18n/index'
import './styles/responsive.css';
import './styles/mobile-performance.css';
import { AccessibilityProvider } from './context/AccessibilityContext';



import {
  isValidPublicKey,
  fetchAccount,
  fetchTransactions,
  fetchOperations,
  resolveAddress,
} from './lib/stellar'
import { stellarCacheManager } from './lib/cacheManager'
import { getOnlineStatus } from './utils/offline'
import Sidebar from './components/layout/Sidebar'
import MobileHeader from './components/layout/MobileHeader'
import MobileSidebar from './components/layout/MobileSidebar'
import ConnectPanel from './components/dashboard/ConnectPanel'
import PriceTicker from './components/dashboard/PriceTicker'
import RealTimeNotificationCenter from './components/notifications/RealTimeNotificationCenter'
import { useRealTimeNotifications } from './hooks/useRealTimeNotifications'
import { pruneCaches } from './lib/cacheManager'
import ErrorBoundary from './components/ErrorBoundary'
import { useStore, type StoreState } from './lib/store'
import { useResponsive } from './hooks/useResponsive'
import { initializeErrorReporting, addBreadcrumb } from './lib/errorReporting'
import {
  installSecurityEventListeners,
  trackSecurityEvent,
  SecurityEventType,
} from './lib/securityEvents'
import { TourLauncher } from './components/tutorial'
import SearchBar from './components/layout/SearchBar'
import GlobalSearch from './components/search/GlobalSearch'
import UserPreferences from './components/preferences/UserPreferences'
import NetworkIndicator from './components/layout/NetworkIndicator'
import MobileNavigation from './components/layout/MobileNavigation'
import KeyboardNavigation from './components/accessibility/KeyboardNavigation'
import ThemeToggle from './components/layout/ThemeToggle'
import OfflineBanner from './components/layout/OfflineBanner'
import PWAInstallBanner from './components/PWAInstallBanner'
import { useSwipeGesture } from './hooks/useSwipeGesture'

interface SearchResult {
  type?: string
}

type TabComponent = ComponentType<Record<string, unknown>>

const lazyTab = (loader: () => Promise<{ default: TabComponent }>) =>
  lazy(loader) as unknown as TabComponent

const lazyNamedTab = (
  loader: () => Promise<Record<string, unknown>>,
  exportName: string
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName] as TabComponent,
    }))
  ) as unknown as TabComponent

const Overview = lazyTab(() => import('./components/dashboard/Overview'))

const TABS: Record<string, TabComponent> = {
  overview: Overview,
  account: lazyTab(() => import('./components/dashboard/Account')),
  transactions: lazyTab(() => import('./components/dashboard/Transactions')),
  contracts: lazyTab(() => import('./components/dashboard/Contracts')),
  network: lazyTab(() => import('./components/dashboard/NetworkStats')),
  builder: lazyTab(() => import('./components/dashboard/Builder')),
  faucet: lazyTab(() => import('./components/dashboard/Faucet')),
  compare: lazyTab(() => import('./components/dashboard/AccountComparison')),
  wallet: lazyTab(() => import('./components/dashboard/WalletConnect')),
  signer: lazyTab(() => import('./components/dashboard/TransactionSigner')),
  portfolio: lazyTab(() => import('./components/dashboard/PortfolioValue')),
  txBuilder: lazyTab(() => import('./components/dashboard/TransactionBuilder')),
  contractInteraction: lazyTab(() => import('./components/dashboard/ContractInteraction')),
  contractABI: lazyTab(() => import('./components/dashboard/ContractABI')),
  dex: lazyTab(() => import('./components/dashboard/DEXExplorer')),
  pathExplorer: lazyTab(() => import('./components/dashboard/PathExplorer')),
  explorers: lazyTab(() => import('./components/dashboard/ExplorerEmbed')),
  realtime: lazyTab(() => import('./components/dashboard/RealTimeLedger')),
  charts: lazyTab(() => import('./components/dashboard/ChartsTab')),
  assets: lazyNamedTab(() => import('./components/assets'), 'AssetDiscovery'),
  multisig: lazyNamedTab(() => import('./components/multisig'), 'MultisigManager'),
  analytics: lazyTab(() => import('./components/dashboard/Analytics')),
  systemHealth: lazyTab(() => import('./components/dashboard/SystemHealth')),
  performance: lazyTab(() => import('./components/dashboard/PerformanceMonitor')),
  settings: lazyTab(() => import('./components/dashboard/Settings')),
  audit: lazyTab(() => import('./components/dashboard/AuditLog')),
  anchors: lazyNamedTab(() => import('./components/anchors'), 'AnchorIntegration'),
  search: lazyTab(() => import('./components/dashboard/AdvancedSearch')),
  cacheStats: lazyTab(() => import('./components/dashboard/CacheStats')),
  liveActivity: lazyTab(() => import('./components/dashboard/LiveActivityFeed')),
  claimableBalances: lazyTab(() => import('./components/dashboard/ClaimableBalances')),
  dataExport: lazyTab(() => import('./components/dashboard/DataExport')),
}

function TabLoadingFallback() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{
        minHeight: '420px',
        display: 'grid',
        gap: '16px',
        gridTemplateRows: '32px 120px 1fr',
      }}
    >
      <div style={{ width: '180px', height: '24px', borderRadius: '6px', background: 'var(--bg-elevated)' }} />
      <div style={{ borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)' }} />
      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
        }}
      />
    </div>
  )
}

function NotificationBell({ onClick, bottomOffset = '20px' }: { onClick: () => void; bottomOffset?: string }) {
  const { unreadCount } = useRealTimeNotifications()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      style={{
        position: 'fixed',
        right: '20px',
        bottom: bottomOffset,
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
      }}
    >
      <span aria-hidden="true">🔔</span>
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'var(--cyan, #06b6d4)',
            color: '#0a0a0a',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            minWidth: '18px',
            textAlign: 'center',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}

function DashboardLayout() {
  const navigate = useNavigate()
  const {
    connectedAddress,
    activeTab,
    theme,
    isMobileMenuOpen,
    setMobileMenuOpen,
    setActiveTab,
    preferencesOpen,
    setPreferencesOpen,
  } = useStore()
  const { isMobile, isTablet } = useResponsive()
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false)

  useEffect(() => {
    pruneCaches().catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    initializeErrorReporting({
      enabled: true,
      maxErrorsPerSession: 100,
      batchSize: 5,
      flushInterval: 30000,
    })

    addBreadcrumb('Application initialized', 'info', { theme, isMobile })
    installSecurityEventListeners()
  }, [theme, isMobile])

  useEffect(() => {
    if (!isMobile && isMobileMenuOpen) {
      setMobileMenuOpen(false)
    }
  }, [isMobile, isMobileMenuOpen, setMobileMenuOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setMobileMenuOpen(false)
        addBreadcrumb('Mobile menu closed via escape key', 'user_action')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMobileMenuOpen, setMobileMenuOpen])

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    addBreadcrumb(`Mapsd to ${activeTab} tab`, 'navigation', { activeTab })
    trackSecurityEvent(SecurityEventType.CONFIG_CHANGED, {
      target: 'activeTab',
      metadata: { activeTab },
    })
  }, [activeTab])

  const ActiveComponent: TabComponent = TABS[activeTab] || Overview

  const getMainStyles = (): CSSProperties => {
    const baseStyles: CSSProperties = {
      flex: 1,
      width: '100%',
      transition: 'margin-left var(--transition), padding var(--transition)',
    }

    if (isMobile) {
      return {
        ...baseStyles,
        marginLeft: 0,
        padding: 'var(--content-padding-mobile)',
        paddingTop: 'calc(var(--header-height) + var(--content-padding-mobile) + 16px)',
        maxWidth: '100%',
      }
    }

    if (isTablet) {
      return {
        ...baseStyles,
        marginLeft: 'var(--sidebar-width)',
        padding: 'var(--content-padding-tablet)',
        paddingTop: 'calc(var(--content-padding-tablet) + 16px)',
        maxWidth: '1100px',
      }
    }

    return {
      ...baseStyles,
      marginLeft: 'var(--sidebar-width)',
      padding: 'var(--content-padding)',
      paddingTop: 'calc(var(--content-padding) + 16px)',
      maxWidth: '1100px',
    }
  }

  const handleRetry = async (): Promise<void> => {
    addBreadcrumb('App-level retry attempted', 'user_action')
    window.location.reload()
  }

  const handleSearchResult = (result: SearchResult | null | undefined): void => {
    if (!result) return
    if (result.type === 'transaction' || result.type === 'operation') {
      navigate('/transactions')
      return
    }
    if (result.type === 'account') {
      navigate('/account')
      return
    }
    navigate('/overview')
  }

  // Swipe right from the left edge to open the mobile sidebar
  const swipeAreaRef = useSwipeGesture<HTMLElement>({
    onSwipeRight: useCallback(() => {
      if (isMobile && !isMobileMenuOpen) setMobileMenuOpen(true)
    }, [isMobile, isMobileMenuOpen, setMobileMenuOpen]),
    threshold: 40,
    restraint: 120,
  })

  return (
    <ErrorBoundary onRetry={handleRetry} maxRetries={3}>
      <OfflineBanner />
      <PWAInstallBanner />
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {isMobile && <MobileHeader />}
        {isMobile ? <MobileSidebar /> : <Sidebar />}
        <main style={getMainStyles()} ref={isMobile ? swipeAreaRef : null}>
          <KeyboardNavigation />
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <GlobalSearch onSelectResult={handleSearchResult} />
            </div>
            <ThemeToggle />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <NetworkIndicator />
            </div>
            <CopyLinkButton />
            <button
              onClick={() => setPreferencesOpen(true)}
              title="User Preferences"
              style={{
                width: '36px',
                height: '36px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                flexShrink: 0,
                transition: 'var(--transition)',
              }}
            >
              ⚙
            </button>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <PriceTicker />
          </div>
          <ErrorBoundary onRetry={handleRetry} maxRetries={2}>
            {!connectedAddress ? (
              <ConnectPanel />
            ) : (
              <Suspense fallback={<TabLoadingFallback />}>
                <ActiveComponent />
              </Suspense>
            )}
          </ErrorBoundary>
        </main>
        <TourLauncher />
        <NotificationBell
          onClick={() => setNotificationsOpen(true)}
          bottomOffset={isMobile ? 'calc(60px + 16px)' : '20px'}
        />
        <RealTimeNotificationCenter
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
        />
        {isMobile && <MobileNavigation />}
        {preferencesOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setPreferencesOpen(false) }}
          >
            <UserPreferences onClose={() => setPreferencesOpen(false)} />
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}

// ─── CopyLinkButton ──────────────────────────────────────────────────────────
function CopyLinkButton() {
  const { connectedAddress, network, activeTab } = useStore()
  const [copied, setCopied] = useState(false)

  if (!connectedAddress) return null

  const handleCopy = async () => {
    const url = new URL(window.location.href)
    url.pathname = `/${activeTab}`
    url.searchParams.set('address', connectedAddress)
    url.searchParams.set('network', network)
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for browsers that block clipboard without https
      const ta = document.createElement('textarea')
      ta.value = url.toString()
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={() => void handleCopy()}
      title="Copy shareable link"
      aria-label="Copy shareable link to clipboard"
      data-testid="copy-link-button"
      style={{
        width: '36px',
        height: '36px',
        background: copied ? 'var(--cyan)' : 'var(--bg-elevated)',
        border: `1px solid ${copied ? 'var(--cyan)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        color: copied ? 'var(--bg-base)' : 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '15px',
        flexShrink: 0,
        transition: 'var(--transition)',
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.color = 'var(--text-primary)'
          e.currentTarget.style.background = 'var(--bg-hover)'
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.background = 'var(--bg-elevated)'
        }
      }}
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}

// ─── RouterSync ───────────────────────────────────────────────────────────────
function RouterSync() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    connectedAddress,
    activeTab,
    network,
    setActiveTab,
    setNetwork,
    setConnectedAddress,
    setAccountData,
    setAccountLoading,
    setAccountError,
    setTransactions,
    setTxLoading,
    setTxNextCursor,
    setTxHasMore,
    setOperations,
    setOpsLoading,
    setOpsNextCursor,
    setOpsHasMore,
  } = useStore()

  const pathTab = location.pathname === '/' ? 'overview' : location.pathname.slice(1)

  // ── 1. On initial load, read ?address and ?network from URL ───────────────
  const didAutoConnect = useRef(false)
  useEffect(() => {
    if (didAutoConnect.current) return
    didAutoConnect.current = true

    const urlAddress = searchParams.get('address')
    const urlNetwork = searchParams.get('network') as StoreState['network'] | null

    // Set network first so the account fetch uses the right horizon endpoint
    if (urlNetwork && ['mainnet', 'testnet', 'futurenet', 'local', 'custom'].includes(urlNetwork)) {
      if (urlNetwork !== network) {
        setNetwork(urlNetwork)
      }
    }

    if (urlAddress && isValidPublicKey(urlAddress) && !connectedAddress) {
      const targetNetwork = (
        urlNetwork && ['mainnet', 'testnet', 'futurenet', 'local', 'custom'].includes(urlNetwork)
          ? urlNetwork
          : network
      ) as StoreState['network']

      setAccountLoading(true)
      const controller = new AbortController()
      const { signal } = controller

      resolveAddress(urlAddress, targetNetwork)
        .then(async (resolved) => {
          if (signal.aborted || !resolved) return
          let account
          const online = getOnlineStatus()
          if (!online) {
            const cached = await stellarCacheManager.getWithFallback(
              `account:${resolved.accountId}:${targetNetwork}`,
            )
            if (signal.aborted) return
            if (!cached.value) {
              setAccountError('You are offline and no cached data is available.')
              return
            }
            account = cached.value
          } else {
            account = await fetchAccount(resolved.accountId, targetNetwork, signal)
          }
          if (signal.aborted) return
          setConnectedAddress(resolved.accountId)
          setAccountData(account as Parameters<typeof setAccountData>[0])
          // Navigate to the tab that was in the URL path (not always 'overview')
          if (TABS[pathTab]) {
            setActiveTab(pathTab)
          }
          if (online) {
            stellarCacheManager
              .set(`account:${resolved.accountId}:${targetNetwork}`, account, 300_000, ['account'])
              .catch(() => {})

            const abortFetch = new AbortController()
            setTxLoading(true)
            setOpsLoading(true)
            fetchTransactions(resolved.accountId, targetNetwork, 50, null, abortFetch.signal)
              .then(({ records, nextCursor, hasMore }) => {
                setTransactions(records)
                setTxNextCursor(nextCursor)
                setTxHasMore(hasMore)
              })
              .catch(() => { setTransactions([]); setTxNextCursor(null); setTxHasMore(false) })
              .finally(() => setTxLoading(false))
            fetchOperations(resolved.accountId, targetNetwork, 50, null, abortFetch.signal)
              .then(({ records, nextCursor, hasMore }) => {
                setOperations(records)
                setOpsNextCursor(nextCursor)
                setOpsHasMore(hasMore)
              })
              .catch(() => { setOperations([]); setOpsNextCursor(null); setOpsHasMore(false) })
              .finally(() => setOpsLoading(false))
          }
        })
        .catch((err) => {
          if (!signal.aborted) setAccountError((err as Error)?.message || 'Account not found')
        })
        .finally(() => {
          if (!signal.aborted) setAccountLoading(false)
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 2. Path → tab: when browser navigates (back/forward or direct URL), update store ──
  useEffect(() => {
    if (pathTab === 'connect') return
    if (TABS[pathTab] && pathTab !== activeTab) {
      setActiveTab(pathTab)
    }
  }, [location.pathname])

  // ── 3. Tab → path: when setActiveTab() is called directly (e.g. ConnectPanel
  //    sets 'overview' after connecting), push the matching path into history.
  //    Skip if the path already matches, or if it maps to a different known tab
  //    (meaning the user navigated via the sidebar — let effect 2 own that).
  useEffect(() => {
    if (!connectedAddress) return
    if (!TABS[activeTab]) return
    const expectedPath = `/${activeTab}`
    if (location.pathname !== expectedPath && !TABS[pathTab]) {
      const params = new URLSearchParams(searchParams)
      navigate({ pathname: expectedPath, search: params.toString() }, { replace: false })
    }
  }, [activeTab])

  // ── 4. Redirect guard: no address → /connect, has address → away from /connect ──
  useEffect(() => {
    if (!connectedAddress && pathTab !== 'connect') {
      navigate('/connect', { replace: true })
    } else if (connectedAddress && pathTab === 'connect') {
      const params = new URLSearchParams(searchParams)
      navigate({ pathname: `/${activeTab}`, search: params.toString() }, { replace: true })
    }
  }, [connectedAddress, location.pathname])

  // ── 5. Keep ?address and ?network in URL in sync with store state ─────────
  useEffect(() => {
    if (!connectedAddress) return
    const currentAddress = searchParams.get('address')
    const currentNetwork = searchParams.get('network')
    if (currentAddress !== connectedAddress || currentNetwork !== network) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('address', connectedAddress)
          next.set('network', network)
          return next
        },
        { replace: false },
      )
    }
  // searchParams intentionally omitted: we only want this to run when address/network change,
  // not on every searchParams object reference update (which would cause an infinite loop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, network])

  return null
}

export default function App() {
  return (
    <I18nProvider>
      <AccessibilityProvider>
        <RouterSync />
        <Routes>
          <Route path="/connect" element={<DashboardLayout />} />
          <Route path="/*" element={<DashboardLayout />} />
        </Routes>
      </AccessibilityProvider>
    </I18nProvider>
  )
}

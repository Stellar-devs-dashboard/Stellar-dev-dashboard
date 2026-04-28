import React from 'react'
import Sidebar from './components/layout/Sidebar'
import ConnectPanel from './components/dashboard/ConnectPanel'
import Overview from './components/dashboard/Overview'
import Account from './components/dashboard/Account'
import Transactions from './components/dashboard/Transactions'
import Contracts from './components/dashboard/Contracts'
import NetworkStats from './components/dashboard/NetworkStats'
import Faucet from './components/dashboard/Faucet'
import Builder from './components/dashboard/Builder'
import Compare from './components/dashboard/Compare'
import { PluginProvider, usePluginTabs } from './plugins'
import { samplePlugin } from './plugins'
import { useStore } from './lib/store'

const TABS = {
  overview: Overview,
  account: Account,
  transactions: Transactions,
  contracts: Contracts,
  network: NetworkStats,
  builder: Builder,
  faucet: Faucet,
  compare: Compare,
  wallet: WalletConnect,
  signer: TransactionSigner,
  portfolio: PortfolioValue,
  txBuilder: TransactionBuilder,
  contractInteraction: ContractInteraction,
  contractABI: ContractABI,
  dex: DEXExplorer,
  explorers: ExplorerEmbed,
  realtime: RealTimeLedger,
  charts: ChartsTab,
  assets: AssetDiscovery,
  multisig: MultisigManager,
  analytics: Analytics,
  systemHealth: SystemHealth,
  settings: Settings,
  audit: AuditLog,
  anchors: AnchorIntegration,
  search: AdvancedSearch,
};

function AppShell() {
  const { connectedAddress, activeTab } = useStore()
  const pluginTabs = usePluginTabs()
  const pluginTabMap = pluginTabs.reduce((map, tab) => ({ ...map, [tab.id]: tab.component }), {})
  const ActiveComponent = pluginTabMap[activeTab] || TABS[activeTab] || Overview

  const handleSearchResult = (result) => {
    if (!result) return;
    if (result.type === "transaction" || result.type === "operation") {
      setActiveTab("transactions");
      return;
    }
    if (result.type === "account") {
      setActiveTab("account");
      return;
    }
    setActiveTab("overview");
  };

  return (
    <ErrorBoundary onRetry={handleRetry} maxRetries={3}>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          position: "relative",
          zIndex: 1,
        }}
      >
        {isMobile && <MobileHeader />}
        <Sidebar isMobile={isMobile} />
        <main style={getMainStyles()}>
          <div style={{ marginBottom: "12px" }}>
            <SearchBar onSelectResult={handleSearchResult} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <PriceTicker />
          </div>
          <ErrorBoundary onRetry={handleRetry} maxRetries={2}>
            {!connectedAddress ? <ConnectPanel /> : <ActiveComponent />}
          </ErrorBoundary>
        </main>
        <TourLauncher />
      </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <DashboardLayout />
    </I18nProvider>
  );
}

export default function App() {
  return (
    <PluginProvider initialPlugins={[samplePlugin]}>
      <AppShell />
    </PluginProvider>
  )
}

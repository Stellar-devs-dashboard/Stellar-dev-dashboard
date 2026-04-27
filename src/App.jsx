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
}

function AppShell() {
  const { connectedAddress, activeTab } = useStore()
  const pluginTabs = usePluginTabs()
  const pluginTabMap = pluginTabs.reduce((map, tab) => ({ ...map, [tab.id]: tab.component }), {})
  const ActiveComponent = pluginTabMap[activeTab] || TABS[activeTab] || Overview

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <Sidebar />
      <main style={{
        marginLeft: '220px',
        flex: 1,
        padding: '32px 36px',
        maxWidth: '1100px',
        width: '100%',
      }}>
        {!connectedAddress ? (
          <ConnectPanel />
        ) : (
          <ActiveComponent />
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <PluginProvider initialPlugins={[samplePlugin]}>
      <AppShell />
    </PluginProvider>
  )
}

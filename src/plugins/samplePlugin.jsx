import React from 'react'
import { useStore } from '../lib/store'
import { formatXLM, shortAddress } from '../lib/stellar'

function MarketSnapshotWidget() {
  const { connectedAddress, accountData } = useStore()
  const xlmBalance = accountData?.balances?.find((b) => b.asset_type === 'native')?.balance

  return (
    <div style={{
      display: 'grid',
      gap: '10px',
      padding: '18px',
      borderRadius: '18px',
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      color: 'var(--text-secondary)',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>Market Snapshot</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Connected Account</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {connectedAddress ? shortAddress(connectedAddress) : 'Not connected'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>XLM Balance</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
            {xlmBalance ? formatXLM(xlmBalance) : '—'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        This plugin widget is a demo of how third-party extensions can render custom dashboard content.
      </div>
    </div>
  )
}

function MarketPage() {
  const { connectedAddress } = useStore()

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px' }}>Market Plugin</div>
      <div style={{ padding: '18px', borderRadius: '18px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Plugin integration</div>
        <div style={{ color: 'var(--text-primary)' }}>
          Third-party extensions can add full app pages, integrate with network data, and extend the sidebar navigation.
        </div>
      </div>
      <div style={{ padding: '18px', borderRadius: '18px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Account notice</div>
        <div style={{ color: connectedAddress ? 'var(--cyan)' : 'var(--text-muted)' }}>
          {connectedAddress ? `Showing market details for ${shortAddress(connectedAddress)}.` : 'Connect your wallet to see market context.'}
        </div>
      </div>
    </div>
  )
}

function MarketCtaWidget() {
  return (
    <div style={{
      padding: '16px',
      borderRadius: '18px',
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      color: 'var(--text-secondary)',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>Plugin Extension</div>
      <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.6 }}>
        This widget was added dynamically by the plugin integration layer to show how a plugin can extend itself at runtime.
      </div>
    </div>
  )
}

const samplePlugin = {
  id: 'sample-market-plugin',
  name: 'Market Plugin',
  description: 'Demo plugin enabling a custom dashboard widget and integration hooks.',
  version: '0.1.0',
  widgets: [
    {
      id: 'market-snapshot',
      name: 'Market Snapshot',
      location: 'overview',
      order: 100,
      component: MarketSnapshotWidget,
    },
    {
      id: 'market-page',
      name: 'Market',
      location: 'tab',
      order: 200,
      component: MarketPage,
    },
  ],
  dataSources: [
    {
      id: 'mock-asset-prices',
      name: 'Mock Asset Prices',
      fetch: async () => ({
        XLM: 0.11,
        USDC: 1.0,
      }),
    },
  ],
  integrations: [
    {
      id: 'dynamic-market-widget',
      name: 'Dynamic Market Widget',
      initialize: ({ registerPlugin }) => {
        registerPlugin({
          id: 'sample-market-plugin-extended',
          name: 'Market Plugin Extension',
          description: 'Adds an additional runtime widget through the integration hook.',
          version: '0.1.0',
          widgets: [
            {
              id: 'market-cta',
              name: 'Market CTA',
              location: 'overview',
              order: 110,
              component: MarketCtaWidget,
            },
          ],
          dataSources: [],
          integrations: [],
        })
      },
    },
  ],
}

export default samplePlugin

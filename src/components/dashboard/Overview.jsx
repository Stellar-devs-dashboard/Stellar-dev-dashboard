import React, { useEffect } from 'react'
import { useStore } from '../../lib/store'
import { fetchNetworkStats, formatXLM, shortAddress, fetchXLMPrice, fetchAssetPrice } from '../../lib/stellar'
import { usePluginWidgets } from '../../plugins'
import { StatCard } from './Card'
import { format } from 'date-fns'

export default function Overview() {
  const {
    accountData, transactions, operations, network,
    networkStats, setNetworkStats, statsLoading, setStatsLoading,
    connectedAddress, txLoading, opsLoading,
    xlmPrice, setXLMPrice, assetPrices, setAssetPrice
  } = useStore()

  useEffect(() => {
    setStatsLoading(true)
    fetchNetworkStats(network)
      .then(s => setNetworkStats(s))
      .catch(() => { })
      .finally(() => setStatsLoading(false))

    // Refresh XLM price
    fetchXLMPrice().then(setXLMPrice)
  }, [network, setNetworkStats, setStatsLoading, setXLMPrice])

  useEffect(() => {
    // Refresh asset prices
    if (accountData?.balances) {
      accountData.balances.forEach(asset => {
        if (asset.asset_type !== 'native') {
          const key = `${asset.asset_code}:${asset.asset_issuer}`
          fetchAssetPrice(asset.asset_code, asset.asset_issuer, network)
            .then(price => setAssetPrice(key, price))
        }
      })
    }
  }, [accountData, network, setAssetPrice])

  const xlmBalance = accountData?.balances?.find(b => b.asset_type === 'native')
  const otherAssets = accountData?.balances?.filter(b => b.asset_type !== 'native') || []
  const ledger = networkStats?.latestLedger
  const feeStats = networkStats?.feeStats
  const pluginWidgets = usePluginWidgets('overview')

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        justifyContent: 'space-between',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '16px' : '0'
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            fontFamily: 'var(--font-display)', 
            fontSize: isMobile ? '20px' : '22px', 
            fontWeight: 700,
            marginBottom: '4px'
          }}>
            Dashboard Overview
          </div>
          <CopyableValue
            value={connectedAddress}
            title="Copy connected public key"
            containerStyle={{ 
              fontSize: '12px', 
              color: 'var(--text-muted)', 
              fontFamily: 'var(--font-mono)' 
            }}
            textStyle={{ 
              maxWidth: isMobile ? '200px' : '260px', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap' 
            }}
          >
            {shortAddress(connectedAddress, 8)}
          </CopyableValue>
        </div>

      {/* Account Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <StatCard
          label="XLM Balance"
          value={xlmBalance ? formatXLM(xlmBalance.balance) : '—'}
          sub={xlmPrice && xlmBalance ? `≈ $${(parseFloat(xlmBalance.balance) * xlmPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} est.` : "lumens"}
          accent="var(--cyan)"
        />
        <StatCard
          label="Assets"
          value={otherAssets.length}
          sub="non-native"
          accent="var(--amber)"
        />
        <StatCard
          label="Transactions"
          value={txLoading ? null : transactions.length}
          sub="recent 20"
          loading={txLoading}
        />
        <StatCard
          label="Sequence"
          value={accountData?.sequence ? accountData.sequence.slice(-8) + '…' : '—'}
          sub="ledger seq"
        />
      </div>

      {/* Assets */}
      {otherAssets.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          {/* Network Badge */}
          <div style={{
            padding: '6px 12px',
            background: network === 'testnet' ? 'var(--amber-glow)' : 'var(--green-glow)',
            border: `1px solid ${network === 'testnet' ? 'var(--amber)' : 'var(--green)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            color: network === 'testnet' ? 'var(--amber)' : 'var(--green)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}>
            {network}
          </div>

          {/* Dashboard Controls */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {isEditing && (
              <button
                onClick={() => setShowWidgetSelector(true)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--cyan)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Add widget"
              >
                <span>+</span>
                {!isMobile && 'Add Widget'}
              </button>
            )}

            {isEditing && (
              <button
                onClick={handleResetLayout}
                style={{
                  padding: '8px 12px',
                  background: 'var(--amber)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
                title="Reset to default layout"
              >
                {isMobile ? '↺' : 'Reset'}
              </button>
            )}

            <button
              onClick={toggleEditMode}
              style={{
                padding: '8px 12px',
                background: isEditing ? 'var(--green)' : 'var(--bg-elevated)',
                color: isEditing ? 'white' : 'var(--text-primary)',
                border: `1px solid ${isEditing ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {asset.asset_code || asset.asset_type}
                  </span>
                  {asset.asset_issuer && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>
                      {shortAddress(asset.asset_issuer)}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    {formatXLM(asset.balance)}
                  </div>
                  {(() => {
                    const priceInXlm = assetPrices[`${asset.asset_code}:${asset.asset_issuer}`]
                    if (priceInXlm && xlmPrice) {
                      const usdVal = parseFloat(asset.balance) * priceInXlm * xlmPrice
                      return (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          ≈ ${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} est.
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>Recent Transactions</div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>latest 5</span>
        </div>
        {txLoading ? (
          <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : transactions.slice(0, 5).map((tx, i) => (
          <div key={tx.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 18px',
            borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
            transition: 'var(--transition)',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: tx.successful ? 'var(--green)' : 'var(--red)',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} className="truncate">
                {tx.hash}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {tx.operation_count} op{tx.operation_count !== 1 ? 's' : ''} · {format(new Date(tx.created_at), 'MMM d, HH:mm')}
              </div>
            </div>
            <a
              href={`https://stellar.expert/explorer/${network}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '11px', color: 'var(--cyan)', flexShrink: 0 }}
            >
              <span>{isEditing ? '✓' : '✏️'}</span>
              {!isMobile && (isEditing ? 'Done' : 'Edit')}
            </button>
          </div>
        </div>
      </div>

      {pluginWidgets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
          {pluginWidgets.map((widget) => {
            const WidgetComponent = widget.component
            return (
              <div key={widget.id} style={{ minWidth: 0 }}>
                <WidgetComponent />
              </div>
            )
          })}
        </div>
      )}

      {/* Network stats */}
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '10px' }}>NETWORK STATS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <StatCard
            label="Latest Ledger"
            value={ledger?.sequence?.toLocaleString() ?? '—'}
            loading={statsLoading}
            accent="var(--text-secondary)"
          />
          <StatCard
            label="Base Fee"
            value={feeStats ? feeStats.last_ledger_base_fee + ' stroops' : '—'}
            loading={statsLoading}
            accent="var(--text-secondary)"
          />
          <StatCard
            label="Ledger Close"
            value={ledger ? format(new Date(ledger.closed_at), 'HH:mm:ss') : '—'}
            sub={ledger ? format(new Date(ledger.closed_at), 'MMM d, yyyy') : ''}
            loading={statsLoading}
            accent="var(--text-secondary)"
          />
        </div>
      )}

      {/* Dashboard Grid */}
      <DashboardGrid
        widgets={widgets}
        onLayoutChange={handleLayoutChange}
        onWidgetResize={handleWidgetResize}
        onWidgetRemove={handleWidgetRemove}
        editable={isEditing}
        columns={getColumns()}
        gap={isMobile ? 12 : 16}
        minWidgetHeight={200}
      />

      {/* Widget Selector Modal */}
      <WidgetSelector
        isOpen={showWidgetSelector}
        onClose={() => setShowWidgetSelector(false)}
        onAddWidget={handleAddWidget}
        existingWidgets={widgets}
      />
    </div>
  );
}

import React, { useState } from 'react'
import { useStore } from '../../lib/store'
import { isValidPublicKey, fetchAccount, fetchTransactions, fetchOperations } from '../../lib/stellar'
import { useResponsive } from '../../hooks/useResponsive'
import { ResponsiveGrid } from '../layout/ResponsiveContainer'

export default function ConnectPanel() {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const { isMobile, isTablet } = useResponsive()
  const {
    network, setConnectedAddress, setAccountData,
    setAccountLoading, setTransactions, setTxLoading,
    setOperations, setOpsLoading, setActiveTab,
    setTxNextCursor, setTxHasMore,
    setOpsNextCursor, setOpsHasMore,
  } = useStore()

  async function handleConnect() {
    const addr = input.trim()
    if (!isValidPublicKey(addr)) {
      setError('Invalid Stellar public key')
      return
    }
    setError('')
    setAccountLoading(true)
    try {
      const account = await fetchAccount(addr, network)
      setConnectedAddress(addr)
      setAccountData(account)
      setActiveTab('overview')

      // Fetch tx & ops in background
      setTxLoading(true)
      setOpsLoading(true)
      fetchTransactions(addr, network)
        .then(({ records, nextCursor, hasMore }) => {
          setTransactions(records)
          setTxNextCursor(nextCursor)
          setTxHasMore(hasMore)
        })
        .catch(() => {
          setTransactions([])
          setTxNextCursor(null)
          setTxHasMore(false)
        })
        .finally(() => {
          setTxLoading(false)
        })

      fetchOperations(addr, network)
        .then(({ records, nextCursor, hasMore }) => {
          setOperations(records)
          setOpsNextCursor(nextCursor)
          setOpsHasMore(hasMore)
        })
        .catch(() => {
          setOperations([])
          setOpsNextCursor(null)
          setOpsHasMore(false)
        })
        .finally(() => {
          setOpsLoading(false)
        })
    } catch (e) {
      setError('Account not found on ' + network)
    } finally {
      setAccountLoading(false)
    }
  }

  // Responsive styles
  const containerStyles = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: isMobile ? '50vh' : '60vh',
    gap: isMobile ? '24px' : '32px',
    padding: isMobile ? '20px' : '0',
  }

  const titleStyles = {
    fontFamily: 'var(--font-display)',
    fontSize: isMobile ? '32px' : isTablet ? '36px' : '42px',
    fontWeight: 800,
    color: 'var(--cyan)',
    letterSpacing: '-1px',
    lineHeight: 1,
    marginBottom: '10px',
  }

  const subtitleStyles = {
    fontFamily: 'var(--font-display)',
    fontSize: isMobile ? '16px' : '20px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  }

  const inputContainerStyles = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? '12px' : '10px',
    background: 'var(--bg-card)',
    border: `1px solid ${error ? 'var(--red)' : 'var(--border-bright)'}`,
    borderRadius: 'var(--radius-lg)',
    padding: isMobile ? '16px' : '6px 6px 6px 16px',
    transition: 'var(--transition)',
    width: '100%',
    maxWidth: isMobile ? '100%' : '540px',
  }

  const inputStyles = {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: isMobile ? '16px' : '13px', // Larger on mobile to prevent zoom
    fontFamily: 'var(--font-mono)',
    padding: isMobile ? '0' : '0',
  }

  const buttonStyles = {
    padding: isMobile ? '12px 20px' : '9px 20px',
    background: 'var(--cyan)',
    color: 'var(--bg-base)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: isMobile ? '14px' : '13px',
    cursor: 'pointer',
    transition: 'var(--transition)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    width: isMobile ? '100%' : 'auto',
    minHeight: isMobile ? 'var(--touch-target)' : 'auto',
  }

  return (
    <div style={containerStyles}>
      <div style={{ textAlign: 'center' }}>
        <div style={titleStyles}>✦ STELLAR</div>
        <div style={subtitleStyles}>Developer Dashboard</div>
        <div style={{ 
          fontSize: isMobile ? '13px' : '12px', 
          color: 'var(--text-muted)', 
          marginTop: '8px',
          padding: isMobile ? '0 20px' : '0',
        }}>
          Enter a public key to explore accounts, transactions & contracts
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: isMobile ? '100%' : '540px' }}>
        <div style={inputContainerStyles}>
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="G... public key"
            style={inputStyles}
          />
          <button
            onClick={handleConnect}
            style={buttonStyles}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--cyan-dim)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--cyan)'}
          >
            CONNECT →
          </button>
        </div>
        {error && (
          <div style={{ 
            marginTop: '8px', 
            fontSize: '12px', 
            color: 'var(--red)', 
            paddingLeft: '4px',
            textAlign: isMobile ? 'center' : 'left',
          }}>
            ✗ {error}
          </div>
        )}
      </div>

      <ResponsiveGrid
        columns={{ mobile: 1, tablet: 3, desktop: 3 }}
        gap={{ mobile: '12px', tablet: '12px', desktop: '12px' }}
        style={{ 
          width: '100%', 
          maxWidth: isMobile ? '100%' : '540px',
        }}
      >
        {[
          { icon: '◉', label: 'Account & Balances', desc: 'Assets, sequence number, thresholds' },
          { icon: '⇄', label: 'Transactions', desc: 'Full history, operations, memos' },
          { icon: '◻', label: 'Soroban Contracts', desc: 'Contract data & interaction' },
        ].map(f => (
          <div key={f.label} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: isMobile ? '16px' : '14px',
            textAlign: isMobile ? 'center' : 'left',
          }}>
            <div style={{ 
              fontSize: isMobile ? '24px' : '18px', 
              marginBottom: '6px' 
            }}>{f.icon}</div>
            <div style={{ 
              fontSize: isMobile ? '14px' : '12px', 
              fontWeight: 600, 
              color: 'var(--text-primary)', 
              marginBottom: '3px' 
            }}>{f.label}</div>
            <div style={{ 
              fontSize: isMobile ? '12px' : '11px', 
              color: 'var(--text-muted)', 
              lineHeight: 1.4 
            }}>{f.desc}</div>
          </div>
        ))}
      </ResponsiveGrid>
    </div>
  )
}

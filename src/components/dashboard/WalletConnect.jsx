import React, { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import { isFreighterInstalled, connectFreighter } from '../../lib/wallet/freighter'
import { disconnectLedger } from '../../lib/wallet/ledger'
import { HARDWARE_WALLET_DEVICES, connectHardwareWallet } from '../../lib/wallet/devices'
import {
  appendSecurityAuditLog,
  buildTransactionConfirmationSummary,
  detectPhishingRisk,
  getSessionSecurityPosture,
  readSecurityAuditLog,
} from '../../lib/wallet/security'
import { fetchAccount } from '../../lib/stellar'
import Card from './Card'

const SOFTWARE_WALLETS = [
  {
    id: 'freighter',
    name: 'Freighter',
    icon: '✦',
    description: 'Browser extension wallet',
  },
]

function SecurityBadge({ posture }) {
  const color = posture.tier === 'high' ? 'var(--green)' : posture.tier === 'medium' ? 'var(--amber)' : 'var(--red)'
  return (
    <div style={{
      border: `1px solid ${color}`,
      background: 'var(--bg-elevated)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <div style={{ fontSize: '11px', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        Session Security: {posture.tier}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Score {posture.score}/100</div>
    </div>
  )
}

export default function WalletConnect() {
  const {
    network, walletConnected, walletType, walletPublicKey,
    setWalletConnected, disconnectWallet,
    setConnectedAddress, setAccountData, setAccountLoading, setAccountError,
  } = useStore()

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [ledgerTransport, setLedgerTransport] = useState(null)
  const [manualHardwareKey, setManualHardwareKey] = useState('')
  const [safetyInput, setSafetyInput] = useState('https://stellar.org')
  const [auditLog, setAuditLog] = useState(() => readSecurityAuditLog())

  const phishingState = useMemo(() => detectPhishingRisk(safetyInput), [safetyInput])

  const posture = useMemo(() => getSessionSecurityPosture({
    walletType,
    mode: walletType === 'ledger' ? 'native-signing' : 'watch-only',
    phishingSafe: phishingState.safe,
  }), [phishingState.safe, walletType])

  const refreshAudit = (entry) => {
    setAuditLog(appendSecurityAuditLog(entry))
  }

  const connectCommon = async (type, publicKey, options = {}) => {
    setWalletConnected(true, type, publicKey)
    setConnectedAddress(publicKey)
    refreshAudit({
      action: 'wallet_connected',
      status: 'success',
      details: `${type} connected${options.mode ? ` (${options.mode})` : ''}`,
    })

    setAccountLoading(true)
    try {
      const account = await fetchAccount(publicKey, network)
      setAccountData(account)
      refreshAudit({ action: 'account_loaded', status: 'success', details: `Fetched account ${publicKey.slice(0, 6)}...` })
    } catch (err) {
      setAccountError(err.message)
      refreshAudit({ action: 'account_load_error', status: 'error', details: err.message })
    } finally {
      setAccountLoading(false)
    }
  }

  const handleSoftwareConnect = async () => {
    setConnecting(true)
    setError(null)

    try {
      const installed = await isFreighterInstalled()
      if (!installed) {
        throw new Error('Freighter wallet is not installed. Get it at https://freighter.app')
      }
      const result = await connectFreighter()
      await connectCommon('freighter', result.publicKey)
    } catch (err) {
      setError(err.message)
      refreshAudit({ action: 'wallet_connect_failed', status: 'error', details: err.message })
    } finally {
      setConnecting(false)
    }
  }

  const handleHardwareConnect = async (walletId) => {
    setConnecting(true)
    setError(null)

    try {
      const result = await connectHardwareWallet(walletId, {
        manualPublicKey: manualHardwareKey,
      })

      if (walletId === 'ledger' && result.transport) {
        setLedgerTransport(result.transport)
      }

      await connectCommon(walletId, result.publicKey, { mode: result.mode })
    } catch (err) {
      setError(err.message)
      refreshAudit({ action: 'hardware_connect_failed', status: 'error', details: `${walletId}: ${err.message}` })
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = () => {
    if (walletType === 'ledger' && ledgerTransport) {
      disconnectLedger(ledgerTransport)
      setLedgerTransport(null)
    }

    refreshAudit({ action: 'wallet_disconnected', status: 'info', details: `${walletType || 'wallet'} disconnected` })
    disconnectWallet()
    setConnectedAddress(null)
    setAccountData(null)
  }

  const confirmationSummary = buildTransactionConfirmationSummary({
    network,
    operationCount: 0,
    totalAmount: '0',
    destination: walletPublicKey || 'N/A',
    memo: 'Wallet connect safety preview',
    riskLevel: phishingState.safe ? 'low' : 'high',
  })

  if (walletConnected) {
    return (
      <Card title="Wallet Connected" subtitle={walletType}>
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <SecurityBadge posture={posture} />

          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px',
            background: 'var(--green-glow)',
            border: '1px solid var(--green)',
            borderRadius: 'var(--radius-md)',
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            <span style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {walletType} Connected
            </span>
          </div>

          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Public Key
            </div>
            <div style={{
              fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
              wordBreak: 'break-all', lineHeight: 1.5,
              padding: '10px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
            }}>
              {walletPublicKey}
            </div>
          </div>

          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            padding: '12px',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Confirmation Preview
            </div>
            <pre style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(confirmationSummary, null, 2)}
            </pre>
          </div>

          <button
            onClick={handleDisconnect}
            style={{
              padding: '10px 16px',
              background: 'var(--red-glow)',
              border: '1px solid var(--red)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--red)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
          >
            Disconnect Wallet
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Connect Wallet" subtitle="Software and hardware wallet security suite">
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SecurityBadge posture={posture} />

        {SOFTWARE_WALLETS.map((wallet) => (
          <button
            key={wallet.id}
            onClick={handleSoftwareConnect}
            disabled={connecting}
            style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '16px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              cursor: connecting ? 'wait' : 'pointer',
              transition: 'var(--transition)',
              opacity: connecting ? 0.6 : 1,
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{ fontSize: '24px', opacity: 0.85 }}>{wallet.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px' }}>
                {wallet.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {wallet.description}
              </div>
            </div>
            {connecting && <div className="spinner" style={{ marginLeft: 'auto' }} />}
          </button>
        ))}

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          background: 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Hardware Wallet Support
          </div>
          <input
            value={manualHardwareKey}
            onChange={(event) => setManualHardwareKey(event.target.value)}
            placeholder="Manual public key for watch-only hardware wallets"
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
            }}
          />
          {HARDWARE_WALLET_DEVICES.map((device) => (
            <button
              key={device.id}
              onClick={() => handleHardwareConnect(device.id)}
              disabled={connecting}
              style={{
                padding: '10px 12px',
                textAlign: 'left',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                cursor: connecting ? 'wait' : 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '12px' }}>{device.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{device.description}</div>
            </button>
          ))}
        </div>

        <div style={{
          border: `1px solid ${phishingState.safe ? 'var(--green)' : 'var(--red)'}`,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          padding: '12px',
          display: 'grid',
          gap: '8px',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Phishing Protection
          </div>
          <input
            value={safetyInput}
            onChange={(event) => setSafetyInput(event.target.value)}
            placeholder="Paste site or transaction destination"
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px',
              color: 'var(--text-primary)',
              fontSize: '12px',
            }}
          />
          <div style={{ fontSize: '12px', color: phishingState.safe ? 'var(--green)' : 'var(--red)' }}>
            {phishingState.reason}
          </div>
        </div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          padding: '12px',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Security Audit Log
          </div>
          {auditLog.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No security events yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
              {auditLog.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{entry.action}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>{entry.details}</div>
                  <div style={{ color: 'var(--text-muted)' }}>{new Date(entry.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: 'var(--red-glow)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-md)',
            fontSize: '12px',
            color: 'var(--red)',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}
      </div>
    </Card>
  )
}

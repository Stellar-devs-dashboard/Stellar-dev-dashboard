import React from 'react'
import { useStore } from '../../lib/store'
import { shortAddress, formatXLM, fetchXLMPrice, fetchAssetPrice } from '../../lib/stellar'
import { useEffect } from 'react'

function InfoRow({ label, value, mono = true, accent }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '16px',
      padding: '10px 18px',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: '12px',
        color: accent || 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)',
        wordBreak: 'break-all',
        textAlign: 'right',
      }}>{value ?? '—'}</span>
    </div>
  )
}

export default function Account() {
  const {
    accountData, connectedAddress, network,
    xlmPrice, setXLMPrice, assetPrices, setAssetPrice
  } = useStore()

  useEffect(() => {
    fetchXLMPrice().then(setXLMPrice)
  }, [setXLMPrice])

  useEffect(() => {
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

  if (!accountData) return (
    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No account loaded</div>
  )

  const xlm = accountData.balances?.find(b => b.asset_type === 'native')
  const signers = accountData.signers || []
  const flags = accountData.flags || {}
  const thresholds = accountData.thresholds || {}

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700 }}>Account Detail</div>

      {/* Identity */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>Identity</div>
        <InfoRow label="Public Key" value={connectedAddress} />
        <InfoRow label="Account ID" value={accountData.account_id} />
        <InfoRow label="Sequence" value={accountData.sequence} />
        <InfoRow
          label="XLM Balance"
          value={xlm ? (
            <div style={{ textAlign: 'right' }}>
              <div>{formatXLM(xlm.balance)} XLM</div>
              {xlmPrice && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 400 }}>
                  ≈ ${(parseFloat(xlm.balance) * xlmPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} est.
                </div>
              )}
            </div>
          ) : '—'}
          accent="var(--cyan)"
        />
        <InfoRow label="Subentry Count" value={accountData.subentry_count} />
        <div style={{ padding: '10px 18px' }}>
          <a
            href={`https://stellar.expert/explorer/${network}/account/${connectedAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '12px',
              color: 'var(--cyan)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            View on Stellar Expert ↗
          </a>
        </div>
      </div>

      {/* Asset Balances */}
      {accountData.balances?.filter(b => b.asset_type !== 'native').length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>Asset Balances</div>
          {accountData.balances.filter(b => b.asset_type !== 'native').map((asset, i) => {
            const priceInXlm = assetPrices[`${asset.asset_code}:${asset.asset_issuer}`]
            const usdVal = (priceInXlm && xlmPrice) ? parseFloat(asset.balance) * priceInXlm * xlmPrice : null

            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 18px', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{asset.asset_code}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{shortAddress(asset.asset_issuer)}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{formatXLM(asset.balance)}</div>
                  {usdVal && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      ≈ ${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} est.
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Thresholds */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>Thresholds</div>
        <InfoRow label="Low" value={thresholds.low_threshold} />
        <InfoRow label="Medium" value={thresholds.med_threshold} />
        <InfoRow label="High" value={thresholds.high_threshold} />
      </div>

      {/* Flags */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>Flags</div>
        {Object.entries(flags).map(([key, val]) => (
          <div key={key} style={{
            display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {key.replace(/_/g, ' ')}
            </span>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '3px',
              background: val ? 'var(--green-glow)' : 'var(--bg-elevated)',
              border: `1px solid ${val ? 'var(--green)' : 'var(--border)'}`,
              color: val ? 'var(--green)' : 'var(--text-muted)',
            }}>
              {val ? 'TRUE' : 'FALSE'}
            </span>
          </div>
        ))}
      </div>

      {/* Signers */}
      {signers.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>
            Signers ({signers.length})
          </div>
          {signers.map((s, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 18px', borderBottom: i < signers.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {shortAddress(s.key)}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>weight: {s.weight}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * AssetControlCenter — Main dashboard for Asset Issuance & Trustline
 * Administration.
 *
 * Integrates IssuerConfig, TrustlineManager, IssuanceWorkflow, and
 * ClawbackWorkflow into a tabbed interface.
 */

import React, { useState, useCallback, useId } from 'react';
import { useStore } from '../../lib/store';
import { isValidPublicKey } from '../../lib/stellar';
import IssuerConfig from './IssuerConfig';
import TrustlineManager from './TrustlineManager';
import IssuanceWorkflow from './IssuanceWorkflow';
import ClawbackWorkflow from './ClawbackWorkflow';
import type { AssetIdentifier } from '../../types/assetControl';
import './AssetControlCenter.css';

type SubTab = 'issuer' | 'trustlines' | 'issuance' | 'clawback';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'issuer', label: 'Issuer Config', icon: '⚙' },
  { id: 'trustlines', label: 'Trustlines', icon: '🔗' },
  { id: 'issuance', label: 'Issue Supply', icon: '💰' },
  { id: 'clawback', label: 'Clawback', icon: '🔨' },
];

export default function AssetControlCenter() {
  const connectedAddress = useStore((s) => s.connectedAddress);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('issuer');
  const [issuerAddress, setIssuerAddress] = useState(connectedAddress || '');
  const [assetCode, setAssetCode] = useState('');
  const tablistId = useId();

  // Asset for the TrustlineManager tab
  const trustlineAsset: AssetIdentifier | undefined =
    assetCode && issuerAddress
      ? { code: assetCode, issuer: issuerAddress }
      : undefined;

  const isValidIssuer = issuerAddress && isValidPublicKey(issuerAddress);

  const handleTabChange = useCallback((tab: SubTab) => {
    setActiveSubTab(tab);
  }, []);

  // ─── No connected address (public tab) ──────────────────────────────────

  return (
    <div className="asset-control-center" id="asset-control-center">
      <h2>
        <span className="icon" aria-hidden="true">🏦</span>
        Asset Issuance & Trustline Control Center
      </h2>

      {/* Issuer Address Input */}
      <div className="ac-card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="ac-form-group" style={{ marginBottom: 0, flex: '2 1 300px' }}>
            <label htmlFor="ac-issuer-address">Issuer Account</label>
            <input
              id="ac-issuer-address"
              className="ac-input"
              type="text"
              placeholder="G… (Stellar public key)"
              value={issuerAddress}
              onChange={(e) => setIssuerAddress(e.target.value.trim())}
              autoComplete="off"
              aria-describedby="ac-issuer-hint"
            />
            <span
              id="ac-issuer-hint"
              style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}
            >
              {connectedAddress
                ? 'Pre-filled with your connected address. You can change it.'
                : 'Enter the issuer account public key to get started.'}
            </span>
          </div>

          {/* Asset code for trustline tab */}
          {activeSubTab === 'trustlines' && (
            <div className="ac-form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
              <label htmlFor="ac-asset-code-input">Asset Code</label>
              <input
                id="ac-asset-code-input"
                className="ac-input"
                type="text"
                maxLength={12}
                placeholder="e.g. USDC"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
                autoComplete="off"
              />
            </div>
          )}
        </div>
      </div>

      {/* Validation Error */}
      {issuerAddress && !isValidIssuer && (
        <div className="ac-danger-banner" role="alert">
          <span aria-hidden="true">⚠</span>
          <div>Invalid Stellar public key. Please enter a valid G… address.</div>
        </div>
      )}

      {/* Tabs */}
      {isValidIssuer && (
        <>
          <div
            className="ac-tab-nav"
            role="tablist"
            aria-label="Asset Control sections"
            id={tablistId}
          >
            {SUB_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className="ac-tab-btn"
                id={`ac-tab-${tab.id}`}
                aria-selected={activeSubTab === tab.id}
                aria-controls={`ac-tabpanel-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                tabIndex={activeSubTab === tab.id ? 0 : -1}
                onKeyDown={(e) => {
                  const tabs = SUB_TABS.map((t) => t.id);
                  const idx = tabs.indexOf(activeSubTab);
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    handleTabChange(tabs[(idx + 1) % tabs.length]);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    handleTabChange(tabs[(idx - 1 + tabs.length) % tabs.length]);
                  }
                }}
              >
                <span aria-hidden="true" style={{ marginRight: 4 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Panels */}
          <div
            role="tabpanel"
            id={`ac-tabpanel-${activeSubTab}`}
            aria-labelledby={`ac-tab-${activeSubTab}`}
            tabIndex={0}
          >
            {activeSubTab === 'issuer' && (
              <IssuerConfig issuerAddress={issuerAddress} />
            )}
            {activeSubTab === 'trustlines' && (
              trustlineAsset ? (
                <TrustlineManager
                  issuerAddress={issuerAddress}
                  asset={trustlineAsset}
                />
              ) : (
                <div className="ac-card ac-empty-state">
                  <div className="icon" aria-hidden="true">🔗</div>
                  <p>Enter an asset code above to view and manage trustline holders.</p>
                </div>
              )
            )}
            {activeSubTab === 'issuance' && (
              <IssuanceWorkflow issuerAddress={issuerAddress} />
            )}
            {activeSubTab === 'clawback' && (
              <ClawbackWorkflow issuerAddress={issuerAddress} />
            )}
          </div>
        </>
      )}

      {/* Empty state when no issuer is set */}
      {!issuerAddress && (
        <div className="ac-card ac-empty-state">
          <div className="icon" aria-hidden="true">🏦</div>
          <p>Enter an issuer account address above to get started with asset administration.</p>
        </div>
      )}
    </div>
  );
}

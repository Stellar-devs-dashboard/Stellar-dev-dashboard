import React, { useState } from 'react';
import { useFeeBumpSponsorship } from '../../hooks/useFeeBumpSponsorship';
import EnvelopeBuilderPanel from './EnvelopeBuilderPanel';
import SponsorshipTreePanel from './SponsorshipTreePanel';
import ReserveAnalysisPanel from './ReserveAnalysisPanel';
import SignerRoutingPanel from './SignerRoutingPanel';
import SimulationVerificationPanel from './SimulationVerificationPanel';
import TemplateManagementPanel from './TemplateManagementPanel';

export default function FeeBumpSponsorshipDashboard() {
  const {
    connectedAddress,
    network,
    envelope,
    setEnvelope,
    sponsorshipAnalysis,
    reserveBreakdown,
    signerRequirements,
    validation,
    addOperation,
    updateOperation,
    removeOperation,
    sponsorOperations,
    addRevokeOperation,
    templates,
    applyTemplate,
    saveTemplate,
    exportTemplates,
    importTemplates,
    simulationResult,
    isSimulating,
    runSimulation,
  } = useFeeBumpSponsorship();

  const [activeTab, setActiveTab] = useState<
    'envelope' | 'tree' | 'reserves' | 'signers' | 'simulation' | 'templates'
  >('envelope');

  const tabs: Array<{ id: typeof activeTab; label: string; badge?: string | number }> = [
    { id: 'envelope', label: 'Envelope Config' },
    { id: 'tree', label: 'Operations & Sponsorship', badge: envelope.innerTransaction.operations.length },
    {
      id: 'reserves',
      label: 'Reserve Analysis',
      badge: `${reserveBreakdown.totalReserveRequiredXLM.toFixed(1)} XLM`,
    },
    {
      id: 'signers',
      label: 'Signer Routing',
      badge: signerRequirements.every((r) => r.isSatisfied) ? 'Ready' : 'Pending',
    },
    { id: 'simulation', label: 'Simulation & Verify' },
    { id: 'templates', label: 'Template Vault' },
  ];

  return (
    <div
      className="animate-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '24px 16px',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--text-primary, #fff)',
              letterSpacing: '-0.5px',
            }}
          >
            Fee-Bump & Sponsored-Transaction Studio
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '13px',
              color: 'var(--text-secondary, #94a3b8)',
            }}
          >
            Compose nested sponsorship envelopes, calculate reserve liabilities, route multi-party signatures, and simulate fee-bump transactions on Stellar.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={runSimulation}
            disabled={isSimulating}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#2ecc71',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isSimulating ? 'wait' : 'pointer',
              boxShadow: '0 4px 12px rgba(46, 204, 113, 0.3)',
            }}
          >
            {isSimulating ? 'Simulating...' : 'Simulate Envelope'}
          </button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
            Envelope Type
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: envelope.isFeeBump ? '#3498db' : '#94a3b8',
              marginTop: '4px',
            }}
          >
            {envelope.isFeeBump ? 'Fee-Bump (Outer Wrapper)' : 'Standard Transaction'}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
            Total Reserve Liability
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#3498db', marginTop: '4px' }}>
            {reserveBreakdown.totalReserveRequiredXLM.toFixed(2)} XLM
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
            Sponsorship Boundaries
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: sponsorshipAnalysis.unbalancedErrors.length === 0 ? '#2ecc71' : '#e74c3c',
              marginTop: '4px',
            }}
          >
            {sponsorshipAnalysis.boundaries.length} Block{sponsorshipAnalysis.boundaries.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
            Max Fee Allocation
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#e67e22', marginTop: '4px' }}>
            {envelope.isFeeBump ? `${envelope.maxFee} stroops` : `${envelope.innerTransaction.baseFee} stroops`}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color, #2d3343)',
          gap: '4px',
          flexWrap: 'wrap',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === tab.id ? '2px solid #3498db' : '2px solid transparent',
              color: activeTab === tab.id ? '#3498db' : 'var(--text-secondary, #94a3b8)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: activeTab === tab.id ? '#3498db22' : 'var(--bg-surface, #1e222d)',
                  color: activeTab === tab.id ? '#3498db' : '#64748b',
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active Tab View */}
      {activeTab === 'envelope' && (
        <EnvelopeBuilderPanel
          envelope={envelope}
          onChange={setEnvelope}
          connectedAddress={connectedAddress}
        />
      )}

      {activeTab === 'tree' && (
        <SponsorshipTreePanel
          operations={envelope.innerTransaction.operations}
          boundaries={sponsorshipAnalysis.boundaries}
          unbalancedErrors={sponsorshipAnalysis.unbalancedErrors}
          onAddOperation={addOperation}
          onUpdateOperation={updateOperation}
          onRemoveOperation={removeOperation}
          onSponsorOperations={sponsorOperations}
          onAddRevokeOperation={addRevokeOperation}
        />
      )}

      {activeTab === 'reserves' && (
        <ReserveAnalysisPanel reserveBreakdown={reserveBreakdown} />
      )}

      {activeTab === 'signers' && (
        <SignerRoutingPanel signerRequirements={signerRequirements} />
      )}

      {activeTab === 'simulation' && (
        <SimulationVerificationPanel
          simulationResult={simulationResult}
          isSimulating={isSimulating}
          onRunSimulation={runSimulation}
        />
      )}

      {activeTab === 'templates' && (
        <TemplateManagementPanel
          templates={templates}
          onApplyTemplate={(tpl) => {
            applyTemplate(tpl);
            setActiveTab('envelope');
          }}
          onSaveCurrentAsTemplate={saveTemplate}
          onExportTemplates={exportTemplates}
          onImportTemplates={importTemplates}
        />
      )}
    </div>
  );
}

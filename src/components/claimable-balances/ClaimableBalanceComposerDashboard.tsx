import React, { useState } from 'react';
import { useClaimableBalanceExplorer } from '../../hooks/useClaimableBalanceExplorer';
import LifecycleTimelineExplorer from './LifecycleTimelineExplorer';
import PredicateTemplateLibrary from './PredicateTemplateLibrary';
import ClaimableBalanceCreateModal from './ClaimableBalanceCreateModal';
import ClaimClawbackActionModal from './ClaimClawbackActionModal';
import type { ClaimableBalanceLifecycleRecord } from '../../types/claimableBalanceExplorer';

export default function ClaimableBalanceComposerDashboard() {
  const {
    connectedAddress,
    network,
    balances,
    loading,
    error,
    refreshBalances,
    templates,
    refreshTemplates,
    saveTemplate,
    deleteTemplate,
    importTemplates,
    exportTemplates,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    roleFilter,
    setRoleFilter,
  } = useClaimableBalanceExplorer();

  const [activeTab, setActiveTab] = useState<'explorer' | 'templates' | 'reserves'>('explorer');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    balance: ClaimableBalanceLifecycleRecord | null;
    actionType: 'claim' | 'clawback';
  }>({
    isOpen: false,
    balance: null,
    actionType: 'claim',
  });

  // Calculate metrics
  const totalCount = balances.length;
  const claimableCount = balances.filter((b) => b.overallStatus === 'claimable').length;
  const lockedCount = balances.filter((b) => b.overallStatus === 'locked_pending_time').length;
  const totalXlmLocked = balances
    .filter((b) => b.assetCode === 'XLM' || b.asset === 'native')
    .reduce((acc, curr) => acc + parseFloat(curr.amount || '0'), 0);

  function handleTriggerClaim(balanceId: string) {
    const bal = balances.find((b) => b.id === balanceId);
    if (bal) {
      setActionModal({
        isOpen: true,
        balance: bal,
        actionType: 'claim',
      });
    }
  }

  function handleTriggerClawback(balanceId: string) {
    const bal = balances.find((b) => b.id === balanceId);
    if (bal) {
      setActionModal({
        isOpen: true,
        balance: bal,
        actionType: 'clawback',
      });
    }
  }

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
      {/* Top Banner & Title */}
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
            Claimable Balance Studio & Lifecycle Explorer
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '13px',
              color: 'var(--text-secondary, #94a3b8)',
            }}
          >
            Compose multi-claimant predicate trees, simulate reserves, monitor vesting time-locks, and claim assets on Stellar.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#3498db',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)',
            }}
          >
            + Compose New Balance
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
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
            Total Tracked Balances
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
            {totalCount}
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
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
            Claimable Right Now
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2ecc71', marginTop: '4px' }}>
            {claimableCount}
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
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
            Pending Time-Locks
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1c40f', marginTop: '4px' }}>
            {lockedCount}
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
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
            Total Locked XLM
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#3498db', marginTop: '4px' }}>
            {totalXlmLocked.toLocaleString()} XLM
          </div>
        </div>
      </div>

      {/* Primary Sub-Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color, #2d3343)',
          gap: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('explorer')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'explorer' ? '2px solid #3498db' : '2px solid transparent',
            color: activeTab === 'explorer' ? '#3498db' : 'var(--text-secondary, #94a3b8)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Lifecycle Explorer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'templates' ? '2px solid #3498db' : '2px solid transparent',
            color: activeTab === 'templates' ? '#3498db' : 'var(--text-secondary, #94a3b8)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Predicate Templates Vault
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reserves')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'reserves' ? '2px solid #3498db' : '2px solid transparent',
            color: activeTab === 'reserves' ? '#3498db' : 'var(--text-secondary, #94a3b8)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reserves & Sponsorship Rules
        </button>
      </div>

      {/* Subtab Content */}
      {activeTab === 'explorer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search & Filter Toolbar */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
              background: 'var(--bg-surface, #1e222d)',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #2d3343)',
            }}
          >
            <input
              type="text"
              placeholder="Search by balance ID, asset, or destination G..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                minWidth: '240px',
                padding: '8px 12px',
                background: 'var(--bg-base, #131722)',
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{
                padding: '8px 12px',
                background: 'var(--bg-base, #131722)',
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="claimable">Claimable Now</option>
              <option value="locked">Time-Locked</option>
              <option value="clawbackable">Clawback Enabled</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              style={{
                padding: '8px 12px',
                background: 'var(--bg-base, #131722)',
                border: '1px solid var(--border-color, #2d3343)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
              }}
            >
              <option value="all">Role: All (Claimant & Sponsor)</option>
              <option value="claimant">Role: Claimant Only</option>
              <option value="sponsor">Role: Sponsor Only</option>
            </select>
          </div>

          <LifecycleTimelineExplorer
            balances={balances}
            loading={loading}
            error={error}
            connectedAddress={connectedAddress}
            onRefresh={refreshBalances}
            onOpenCreate={() => setIsCreateModalOpen(true)}
            onClaim={handleTriggerClaim}
            onClawback={handleTriggerClawback}
          />
        </div>
      )}

      {activeTab === 'templates' && (
        <PredicateTemplateLibrary
          templates={templates}
          onSelectTemplate={(tpl) => {
            setIsCreateModalOpen(true);
          }}
          onSaveCustomTemplate={saveTemplate}
          onDeleteTemplate={deleteTemplate}
          onExportTemplates={exportTemplates}
          onImportTemplates={importTemplates}
        />
      )}

      {activeTab === 'reserves' && (
        <div
          style={{
            background: 'var(--bg-surface, #1e222d)',
            border: '1px solid var(--border-color, #2d3343)',
            borderRadius: '8px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            color: 'var(--text-secondary, #94a3b8)',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
        >
          <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>
            Stellar Claimable Balance Reserve Mechanics
          </h3>
          <p>
            Claimable balances allow payments to be transferred conditionally. To prevent ledger spam,
            each claimable balance requires minimum base reserves:
          </p>
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong style={{ color: '#fff' }}>1 Base Reserve (0.5 XLM)</strong> for the ClaimableBalance ledger entry itself.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>1 Base Reserve (0.5 XLM) per Claimant entry</strong> (e.g. 2 claimants = 1.0 XLM).
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Sponsorship Support:</strong> Reserves can be sponsored by a 3rd party sponsor account using <code>beginSponsoringFutureReserves</code>.
            </li>
            <li>
              <strong style={{ color: '#fff' }}>Reserve Refund on Claim:</strong> When a claimant successfully claims the balance, the associated reserves are released and returned to the sponsor/creator.
            </li>
          </ul>
        </div>
      )}

      {/* Creation Modal */}
      <ClaimableBalanceCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        templates={templates}
        onSuccess={() => {
          refreshBalances();
          setIsCreateModalOpen(false);
        }}
      />

      {/* Claim / Clawback Modal */}
      <ClaimClawbackActionModal
        isOpen={actionModal.isOpen}
        balance={actionModal.balance}
        actionType={actionModal.actionType}
        onClose={() => setActionModal({ isOpen: false, balance: null, actionType: 'claim' })}
        onSuccess={() => {
          refreshBalances();
          setActionModal({ isOpen: false, balance: null, actionType: 'claim' });
        }}
      />
    </div>
  );
}

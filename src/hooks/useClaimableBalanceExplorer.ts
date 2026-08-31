import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../lib/store';
import { isValidPublicKey } from '../lib/stellar';
import {
  fetchAccountClaimableBalances,
  fetchClaimableBalanceById,
} from '../lib/claimableBalance/lifecycleManager';
import {
  estimateClaimableBalanceReserves,
  buildCreateClaimableBalanceTransaction,
  buildClaimTransaction,
  buildClawbackClaimableBalanceTransaction,
} from '../lib/claimableBalance/composerEngine';
import {
  loadAllTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  importTemplatesFromJson,
  exportTemplatesToJson,
} from '../lib/claimableBalance/templateStore';
import {
  createUnconditional,
  generateNodeId,
} from '../lib/claimableBalance/predicateTree';
import type {
  ClaimableBalanceLifecycleRecord,
  ClaimantEntry,
  PredicateTemplate,
  PredicateNode,
  ReserveRequirementEstimate,
} from '../types/claimableBalanceExplorer';

export function useClaimableBalanceExplorer() {
  const { connectedAddress, network } = useStore();

  const [balances, setBalances] = useState<ClaimableBalanceRecordOrLifecycle[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<ClaimableBalanceLifecycleRecord | null>(null);

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'claimable' | 'locked' | 'clawbackable'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'claimant' | 'sponsor'>('all');

  // Templates state
  const [templates, setTemplates] = useState<PredicateTemplate[]>([]);

  // Composer Form State
  const [composerAsset, setComposerAsset] = useState<{
    type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
    code: string;
    issuer: string;
  }>({
    type: 'native',
    code: 'XLM',
    issuer: '',
  });
  const [composerAmount, setComposerAmount] = useState<string>('10');
  const [composerSponsor, setComposerSponsor] = useState<string>('');
  const [composerClaimants, setComposerClaimants] = useState<ClaimantEntry[]>([
    {
      id: generateNodeId('claimant'),
      destination: '',
      predicate: createUnconditional(),
    },
  ]);

  // Reserve estimate calculation
  const reserveEstimate: ReserveRequirementEstimate = useMemo(() => {
    return estimateClaimableBalanceReserves(composerClaimants.length, composerSponsor || undefined);
  }, [composerClaimants.length, composerSponsor]);

  // Reload templates
  const refreshTemplates = useCallback(() => {
    setTemplates(loadAllTemplates());
  }, []);

  // Fetch balances
  const refreshBalances = useCallback(async () => {
    if (!connectedAddress || !isValidPublicKey(connectedAddress)) {
      setBalances([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const records = await fetchAccountClaimableBalances(connectedAddress, network, {
        role: roleFilter === 'all' ? 'both' : roleFilter,
      });
      setBalances(records);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch claimable balances');
    } finally {
      setLoading(false);
    }
  }, [connectedAddress, network, roleFilter]);

  useEffect(() => {
    refreshBalances();
    refreshTemplates();
  }, [refreshBalances, refreshTemplates]);

  // Filtered balances calculation
  const filteredBalances = useMemo(() => {
    return balances.filter((b) => {
      // Search match
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        b.id.toLowerCase().includes(search) ||
        b.asset.toLowerCase().includes(search) ||
        (b.sponsor && b.sponsor.toLowerCase().includes(search)) ||
        b.claimants.some((c) => c.destination.toLowerCase().includes(search));

      if (!matchesSearch) return false;

      // Status filter
      if (statusFilter === 'claimable') {
        return b.overallStatus === 'claimable';
      }
      if (statusFilter === 'locked') {
        return b.overallStatus === 'locked_pending_time';
      }
      if (statusFilter === 'clawbackable') {
        return b.flags?.clawbackEnabled;
      }

      return true;
    });
  }, [balances, searchTerm, statusFilter]);

  // Composer Actions
  const addClaimant = useCallback(() => {
    setComposerClaimants((prev) => [
      ...prev,
      {
        id: generateNodeId('claimant'),
        destination: '',
        predicate: createUnconditional(),
      },
    ]);
  }, []);

  const removeClaimant = useCallback((id: string) => {
    setComposerClaimants((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  }, []);

  const updateClaimant = useCallback(
    (id: string, updates: Partial<Omit<ClaimantEntry, 'id'>>) => {
      setComposerClaimants((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const applyTemplateToClaimant = useCallback(
    (claimantId: string, template: PredicateTemplate) => {
      updateClaimant(claimantId, { predicate: template.predicate });
    },
    [updateClaimant]
  );

  return {
    connectedAddress,
    network,
    balances: filteredBalances,
    rawBalances: balances,
    loading,
    error,
    selectedBalance,
    setSelectedBalance,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    roleFilter,
    setRoleFilter,
    refreshBalances,
    templates,
    refreshTemplates,
    saveTemplate: saveCustomTemplate,
    deleteTemplate: deleteCustomTemplate,
    importTemplates: importTemplatesFromJson,
    exportTemplates: () => exportTemplatesToJson(templates),
    // Composer
    composerAsset,
    setComposerAsset,
    composerAmount,
    setComposerAmount,
    composerSponsor,
    setComposerSponsor,
    composerClaimants,
    addClaimant,
    removeClaimant,
    updateClaimant,
    applyTemplateToClaimant,
    reserveEstimate,
  };
}

type ClaimableBalanceRecordOrLifecycle = ClaimableBalanceLifecycleRecord;

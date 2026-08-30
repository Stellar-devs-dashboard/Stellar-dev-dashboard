import { useState, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '../lib/store';
import { isValidPublicKey } from '../lib/stellar';
import type {
  FeeBumpEnvelopeModel,
  SponsoredOperationEntry,
  SponsorshipOperationType,
  FeeBumpSimulationResult,
  FeeBumpTemplate,
  ReserveRequirementBreakdown,
  SponsorshipBoundary,
} from '../types/feeBumpSponsorship';
import {
  validateFeeBumpEnvelope,
  verifyXdrRoundTrip,
} from '../lib/feeBumpSponsorship/envelopeModel';
import {
  analyzeSponsorshipBoundaries,
  wrapWithSponsorship,
  createRevokeSponsorshipOperation,
} from '../lib/feeBumpSponsorship/sponsorshipManager';
import { estimateTransactionReserves } from '../lib/feeBumpSponsorship/reserveEstimator';
import {
  simulateFeeBumpTransaction,
  analyzeSignerRequirements,
} from '../lib/feeBumpSponsorship/simulationEngine';
import {
  loadAllFeeBumpTemplates,
  saveCustomFeeBumpTemplate,
  exportFeeBumpTemplatesToJson,
  importFeeBumpTemplatesFromJson,
} from '../lib/feeBumpSponsorship/templateVault';

export function useFeeBumpSponsorship() {
  const { connectedAddress, network } = useStore();

  const [envelope, setEnvelope] = useState<FeeBumpEnvelopeModel>({
    isFeeBump: true,
    feeSource: '',
    maxFee: '500',
    innerTransaction: {
      sourceAccount: connectedAddress || '',
      sequenceNumber: '1000',
      baseFee: '100',
      memo: { type: 'none', value: '' },
      operations: [
        {
          id: 'op_initial_payment',
          type: 'payment',
          sourceAccount: '',
          params: {
            destination: '',
            amount: '1.0',
            assetType: 'native',
          },
        },
      ],
      signatures: [],
    },
    outerSignatures: [],
  });

  const [templates, setTemplates] = useState<FeeBumpTemplate[]>([]);
  const [simulationResult, setSimulationResult] = useState<FeeBumpSimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Sync connected address if source is blank
  useEffect(() => {
    if (connectedAddress && !envelope.innerTransaction.sourceAccount) {
      setEnvelope((prev) => ({
        ...prev,
        innerTransaction: {
          ...prev.innerTransaction,
          sourceAccount: connectedAddress,
        },
      }));
    }
  }, [connectedAddress]);

  // Load templates on mount
  useEffect(() => {
    setTemplates(loadAllFeeBumpTemplates());
  }, []);

  // Sponsorship analysis
  const sponsorshipAnalysis = useMemo(() => {
    return analyzeSponsorshipBoundaries(envelope.innerTransaction.operations);
  }, [envelope.innerTransaction.operations]);

  // Reserve breakdown
  const reserveBreakdown: ReserveRequirementBreakdown = useMemo(() => {
    return estimateTransactionReserves(
      envelope.innerTransaction.operations,
      envelope.innerTransaction.sourceAccount
    );
  }, [envelope.innerTransaction.operations, envelope.innerTransaction.sourceAccount]);

  // Signer requirements analysis
  const signerRequirements = useMemo(() => {
    return analyzeSignerRequirements(envelope);
  }, [envelope]);

  // Validation
  const validation = useMemo(() => {
    return validateFeeBumpEnvelope(envelope);
  }, [envelope]);

  // Operations CRUD
  const addOperation = useCallback((type: SponsorshipOperationType = 'payment') => {
    const newOp: SponsoredOperationEntry = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      params: type === 'payment' ? { destination: '', amount: '1.0', assetType: 'native' } : {},
    };
    setEnvelope((prev) => ({
      ...prev,
      innerTransaction: {
        ...prev.innerTransaction,
        operations: [...prev.innerTransaction.operations, newOp],
      },
    }));
  }, []);

  const updateOperation = useCallback(
    (id: string, updates: Partial<SponsoredOperationEntry>) => {
      setEnvelope((prev) => ({
        ...prev,
        innerTransaction: {
          ...prev.innerTransaction,
          operations: prev.innerTransaction.operations.map((op) =>
            op.id === id ? { ...op, ...updates } : op
          ),
        },
      }));
    },
    []
  );

  const removeOperation = useCallback((id: string) => {
    setEnvelope((prev) => ({
      ...prev,
      innerTransaction: {
        ...prev.innerTransaction,
        operations:
          prev.innerTransaction.operations.length > 1
            ? prev.innerTransaction.operations.filter((op) => op.id !== id)
            : prev.innerTransaction.operations,
      },
    }));
  }, []);

  // Wrap selected operations in a sponsorship boundary
  const sponsorOperations = useCallback(
    (sponsor: string, sponsoredAccount: string) => {
      setEnvelope((prev) => {
        const wrapped = wrapWithSponsorship(
          prev.innerTransaction.operations,
          sponsor,
          sponsoredAccount
        );
        return {
          ...prev,
          innerTransaction: {
            ...prev.innerTransaction,
            operations: wrapped,
          },
        };
      });
    },
    []
  );

  // Add revoke sponsorship op
  const addRevokeOperation = useCallback(
    (params: any, sourceAccount?: string) => {
      const op = createRevokeSponsorshipOperation(params, sourceAccount);
      setEnvelope((prev) => ({
        ...prev,
        innerTransaction: {
          ...prev.innerTransaction,
          operations: [...prev.innerTransaction.operations, op],
        },
      }));
    },
    []
  );

  // Load a template into the editor
  const applyTemplate = useCallback((template: FeeBumpTemplate) => {
    setEnvelope(JSON.parse(JSON.stringify(template.envelope)));
  }, []);

  // Run simulation
  const runSimulation = useCallback(async () => {
    setIsSimulating(true);
    try {
      const result = await simulateFeeBumpTransaction(envelope, network);
      setSimulationResult(result);
    } catch (err: any) {
      setSimulationResult({
        success: false,
        simulatedLedger: 0,
        estimatedFeeCharged: '0',
        signerRequirements,
        reserveBreakdown,
        xdrEnvelope: '',
        warnings: [],
        error: err.message || 'Simulation execution failed.',
      });
    } finally {
      setIsSimulating(false);
    }
  }, [envelope, network, signerRequirements, reserveBreakdown]);

  return {
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
    saveTemplate: saveCustomFeeBumpTemplate,
    exportTemplates: () => exportFeeBumpTemplatesToJson(templates),
    importTemplates: (json: string) => {
      const res = importFeeBumpTemplatesFromJson(json);
      setTemplates(loadAllFeeBumpTemplates());
      return res;
    },
    simulationResult,
    isSimulating,
    runSimulation,
  };
}

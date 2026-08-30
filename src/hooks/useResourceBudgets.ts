import { useCallback, useEffect, useState } from 'react';
import { deleteBudget as deleteBudgetFromStore, listBudgets, saveBudget as saveBudgetToStore } from '../lib/resourceProfiling/baselineStore';
import { createDefaultBudget } from '../lib/resourceProfiling/budgetEngine';
import { ProfilingError } from '../lib/resourceProfiling/errors';
import type { ResourceBudget } from '../types/resourceProfiling';

export interface UseResourceBudgetsResult {
  budgets: ResourceBudget[];
  loading: boolean;
  error: ProfilingError | null;
  refresh: () => Promise<void>;
  saveBudget: (_budget: ResourceBudget) => Promise<void>;
  createBudget: (_name: string) => Promise<ResourceBudget>;
  deleteBudget: (_id: string) => Promise<void>;
}

/** CRUD boundary over persisted resource budgets, seeded with one default budget on first use. */
export default function useResourceBudgets(): UseResourceBudgetsResult {
  const [budgets, setBudgets] = useState<ResourceBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProfilingError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBudgets(await listBudgets());
    } catch (cause) {
      setError(
        cause instanceof ProfilingError
          ? cause
          : new ProfilingError({ code: 'storage-unavailable', message: 'Unable to load budgets.', retryable: true })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveBudget = useCallback(
    async (budget: ResourceBudget) => {
      await saveBudgetToStore(budget);
      await refresh();
    },
    [refresh]
  );

  const createBudget = useCallback(
    async (name: string) => {
      const budget = await saveBudgetToStore(createDefaultBudget(name));
      await refresh();
      return budget;
    },
    [refresh]
  );

  const deleteBudget = useCallback(
    async (id: string) => {
      await deleteBudgetFromStore(id);
      await refresh();
    },
    [refresh]
  );

  return { budgets, loading, error, refresh, saveBudget, createBudget, deleteBudget };
}

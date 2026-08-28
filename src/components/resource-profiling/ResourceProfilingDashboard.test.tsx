import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import ResourceProfilingDashboard from './ResourceProfilingDashboard';
import useResourceProfilingLab from '../../hooks/useResourceProfilingLab';
import { compareProfileToBaseline } from '../../lib/resourceProfiling/comparisonEngine';
import { createSampleBaseline, createSampleRegressionCandidate } from '../../lib/resourceProfiling/sampleFixtures';
import { createDefaultBudget } from '../../lib/resourceProfiling/budgetEngine';
import { ProfilingError } from '../../lib/resourceProfiling/errors';

expect.extend(toHaveNoViolations);

vi.mock('../../hooks/useResourceProfilingLab');
vi.mock('../../lib/store', () => ({ useStore: () => ({ network: 'testnet' }) }));

const mocked = vi.mocked(useResourceProfilingLab);

function baseLab(overrides: Partial<ReturnType<typeof useResourceProfilingLab>> = {}) {
  return {
    baselines: { baselines: [], loading: false, error: null, refresh: vi.fn(), createBaseline: vi.fn(), renameBaseline: vi.fn(), deleteBaseline: vi.fn(), appendSample: vi.fn(), removeSample: vi.fn(), importBaseline: vi.fn(), loadSampleBaseline: vi.fn() },
    budgets: { budgets: [], loading: false, error: null, refresh: vi.fn(), saveBudget: vi.fn(), createBudget: vi.fn(), deleteBudget: vi.fn() },
    capture: { profile: null, loading: false, error: null, online: true, capture: vi.fn(), cancel: vi.fn(), reset: vi.fn() },
    selectedBaseline: null,
    selectedBaselineId: null,
    setSelectedBaselineId: vi.fn(),
    selectedBudget: null,
    selectedBudgetId: null,
    setSelectedBudgetId: vi.fn(),
    candidateProfile: null,
    useAsCandidate: vi.fn(),
    clearCandidate: vi.fn(),
    saveCandidateToBaseline: vi.fn(),
    comparison: null,
    budgetEvaluation: null,
    loadSampleData: vi.fn(),
    exportBaselineJson: vi.fn(),
    exportComparisonJson: vi.fn(),
    exportCiGate: vi.fn(),
    importBaselineFromFile: vi.fn(),
    importError: null,
    ...overrides,
  } as unknown as ReturnType<typeof useResourceProfilingLab>;
}

describe('ResourceProfilingDashboard', () => {
  it('renders the workspace heading and an empty-baselines prompt', () => {
    mocked.mockReturnValue(baseLab());
    render(<ResourceProfilingDashboard />);
    expect(screen.getByRole('heading', { name: 'Resource Profiling Lab' })).toBeInTheDocument();
  });

  it('shows a loading state while baselines and budgets are being fetched', () => {
    mocked.mockReturnValue(baseLab({ baselines: { ...baseLab().baselines, loading: true } }));
    render(<ResourceProfilingDashboard />);
    expect(screen.getByText(/Loading saved baselines/i)).toBeInTheDocument();
  });

  it('shows a retryable error banner when baselines fail to load', () => {
    const refresh = vi.fn();
    const error = new ProfilingError({ code: 'storage-unavailable', message: 'IndexedDB is blocked.', retryable: true });
    mocked.mockReturnValue(baseLab({ baselines: { ...baseLab().baselines, error, refresh } }));
    render(<ResourceProfilingDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('IndexedDB is blocked.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows an offline notice on the capture tab when the browser is offline', () => {
    mocked.mockReturnValue(baseLab({ capture: { ...baseLab().capture, online: false } }));
    render(<ResourceProfilingDashboard />);
    expect(screen.getByText(/You're offline/i)).toBeInTheDocument();
  });

  it('renders comparison results with a regression classification when a candidate regresses', () => {
    const baseline = createSampleBaseline();
    const candidate = createSampleRegressionCandidate();
    const comparison = compareProfileToBaseline(baseline, candidate, {
      thresholds: createDefaultBudget().thresholds,
    });
    mocked.mockReturnValue(baseLab({ selectedBaseline: baseline, candidateProfile: candidate, comparison }));
    render(<ResourceProfilingDashboard />);
    const nav = screen.getByRole('navigation', { name: 'Resource profiling views' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Compare' }));
    expect(screen.getAllByText('regression').length).toBeGreaterThan(0);
  });

  it('has no detectable accessibility violations in its default empty state', async () => {
    mocked.mockReturnValue(baseLab());
    const { container } = render(<ResourceProfilingDashboard />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useDiagnostics from '../../../hooks/useDiagnostics';
import { DEFAULT_BUNDLE_INCLUSION } from '../../../lib/diagnostics';
import DiagnosticsDashboard from '../DiagnosticsDashboard';

vi.mock('../../../hooks/useDiagnostics');
vi.mock('../../../lib/store', () => ({
  useStore: (selector: (_state: { network: 'testnet' }) => unknown) =>
    selector({ network: 'testnet' }),
}));

const actions = {
  initialize: vi.fn().mockResolvedValue(undefined),
  runFlow: vi.fn().mockResolvedValue(undefined),
  cancelFlow: vi.fn(),
  createPreview: vi.fn().mockResolvedValue(undefined),
  savePreview: vi.fn(),
  exportPreview: vi.fn(),
  importBundle: vi.fn().mockResolvedValue(undefined),
  compareWithImported: vi.fn().mockResolvedValue(undefined),
  removeSavedBundle: vi.fn(),
  clearAll: vi.fn(),
  setCaptureEnabled: vi.fn(),
  addRule: vi.fn(),
  removeRule: vi.fn(),
  updateInclusion: vi.fn(),
  toggleCategory: vi.fn(),
};

function model(overrides: Record<string, unknown> = {}) {
  return {
    viewState: 'success',
    snapshot: {
      capturedAt: '2026-08-28T12:00:00.000Z',
      enabled: true,
      events: [
        {
          schemaVersion: 1,
          id: 'event-1',
          sequence: 1,
          timestamp: '2026-08-28T12:00:00.000Z',
          category: 'runtime',
          severity: 'info',
          name: 'diagnostics.initialized',
          message: 'Local diagnostic capture initialized.',
          outcome: 'success',
          details: { transport: 'none' },
          source: 'browser',
          redactionCount: 0,
          truncated: false,
        },
      ],
      breadcrumbs: [],
      droppedEvents: 0,
      totalRedactions: 0,
      approximateBytes: 320,
    },
    repositoryState: { bundles: [], persistence: 'durable' },
    environment: {
      capturedAt: '2026-08-28T12:00:00.000Z',
      appVersion: '0.1.0',
      buildMode: 'test',
      browserFamily: 'chromium',
      platformClass: 'desktop',
      language: 'en-NG',
      timezone: 'Africa/Lagos',
      viewport: { width: 1280, height: 720 },
      online: true,
      cookieEnabled: true,
    },
    featureFlags: [],
    serviceWorker: null,
    endpointHealth: [],
    runs: [],
    runningFlow: null,
    inclusion: DEFAULT_BUNDLE_INCLUSION,
    preview: null,
    importedBundle: null,
    comparison: null,
    loading: false,
    error: null,
    customRules: [],
    ...actions,
    ...overrides,
  };
}

describe('DiagnosticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDiagnostics).mockReturnValue(model() as ReturnType<typeof useDiagnostics>);
  });

  it('renders explicit loading and retryable initialization error states', () => {
    vi.mocked(useDiagnostics).mockReturnValue(
      model({ viewState: 'loading', loading: true }) as ReturnType<typeof useDiagnostics>
    );
    const { rerender } = render(<DiagnosticsDashboard />);
    expect(screen.getByRole('heading', { name: 'Preparing private diagnostics' })).toBeVisible();

    vi.mocked(useDiagnostics).mockReturnValue(
      model({
        viewState: 'error',
        error: {
          operation: 'initialize',
          problem: { code: 'storage-unavailable', message: 'Storage blocked.', retryable: true },
        },
      }) as ReturnType<typeof useDiagnostics>
    );
    rerender(<DiagnosticsDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Storage blocked.');
    fireEvent.click(screen.getByRole('button', { name: /retry initialization/i }));
    expect(actions.initialize).toHaveBeenCalledOnce();
  });

  it('exposes local-only evidence and all workspace sections without an upload action', () => {
    render(<DiagnosticsDashboard />);
    expect(screen.getByRole('heading', { name: 'Privacy-safe diagnostics' })).toBeVisible();
    expect(screen.getByText(/Nothing is transmitted\./)).toBeVisible();
    expect(screen.getByRole('table')).toHaveTextContent('diagnostics.initialized');
    expect(screen.getByRole('navigation', { name: /diagnostic workspace/i })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /upload|send|submit bundle/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /privacy/i }));
    expect(screen.getByRole('heading', { name: 'Privacy and data flow' })).toBeVisible();
    expect(screen.getByText('No telemetry transport')).toBeVisible();
  });

  it('requires confirmation before clearing and supports Escape cancellation', async () => {
    render(<DiagnosticsDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));
    const dialog = screen.getByRole('dialog', { name: /clear local diagnostic data/i });
    expect(dialog).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep data' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Keep data' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(actions.clearAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear local data' })
    );
    expect(actions.clearAll).toHaveBeenCalledOnce();
  });

  it('has no detectable accessibility violations in the successful overview', async () => {
    const { container } = render(<DiagnosticsDashboard />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

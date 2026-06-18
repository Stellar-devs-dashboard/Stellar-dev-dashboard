import type { DashboardApi } from './PluginManager';

interface EnvironmentConfig {
  environment: string;
  refreshIntervalMs: number;
  enableRealtime: boolean;
  enablePricePolling: boolean;
  maxResults: number;
}

function RuntimeStatusWidget({ api }: { api: DashboardApi | null }) {
  if (!api) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
        Runtime status is initializing.
      </div>
    );
  }

  const state = api.getState();
  const config = api.getConfig() as {
    environment: { environment: string };
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
      {(
        [
          ['Network', state.network || 'unknown'],
          ['Environment', config.environment.environment],
          ['Active tab', state.activeTab || 'overview'],
        ] as Array<[string, string]>
      ).map(([label, value]) => (
        <div
          key={label}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px",
            minWidth: 0,
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: "10px", textTransform: "uppercase" }}>
            {label}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: "13px", marginTop: "4px" }}>
            {String(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function createRuntimeStatusPlugin() {
  let apiRef: DashboardApi | null = null;

  return {
    id: "core.runtime-status",
    name: "Runtime Status",
    initialize(api: DashboardApi) {
      apiRef = api;
      api.logger.info("Runtime status plugin initialized.");
    },
    getWidgets() {
      return [
        {
          id: "core.runtime-status.settings-widget",
          title: "Runtime Status",
          placement: "settings",
          order: 0,
          component: RuntimeStatusWidget,
          props: { api: apiRef },
        },
      ];
    },
    getDataSources() {
      return [
        {
          id: "core.runtime-status.dashboard-state",
          name: "Dashboard State",
          description: "Read-only dashboard state exposed through the plugin API.",
          fetch: async () => apiRef?.getState() || {},
          metadata: { scope: "read-only" },
        },
      ];
    },
  };
}

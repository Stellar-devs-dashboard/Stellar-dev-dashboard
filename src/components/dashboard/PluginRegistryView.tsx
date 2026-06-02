import React, { useEffect, useMemo, useState } from "react";
import { pluginManager, registerActivePlugins } from "../../plugins";
import { PLUGIN_STATUSES } from "../../plugins/PluginManager";

interface PluginWidget {
  id: string
  component: React.ComponentType<Record<string, unknown>>
  pluginName: string
  title: string
  pluginId: string
  props?: Record<string, unknown>
}

interface PluginRecord {
  id: string
  name: string
  status: string
  error?: string
}

interface PluginSnapshot {
  plugins: PluginRecord[]
  widgets: PluginWidget[]
  dataSources: unknown[]
}

interface PluginWidgetFrameProps {
  widget: PluginWidget
}

interface PluginStatusPillProps {
  status: string
}

function PluginWidgetFrame({ widget }: PluginWidgetFrameProps) {
  const Component = widget.component;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
            {widget.pluginName}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700 }}>
            {widget.title}
          </div>
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {widget.pluginId}
        </div>
      </div>
      <Component {...widget.props} />
    </div>
  );
}

function PluginStatusPill({ status }: PluginStatusPillProps) {
  const colorByStatus: Record<string, string> = {
    [PLUGIN_STATUSES.INITIALIZED]: "var(--green)",
    [PLUGIN_STATUSES.REGISTERED]: "var(--cyan)",
    [PLUGIN_STATUSES.FAILED]: "var(--red)",
  };

  return (
    <span
      style={{
        border: "1px solid var(--border)",
        borderRadius: "999px",
        color: colorByStatus[status] || "var(--text-secondary)",
        fontSize: "11px",
        padding: "3px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

export default function PluginRegistryView({ placement = "settings" }: { placement?: string }) {
  const [snapshot, setSnapshot] = useState<PluginSnapshot>(() => ({
    plugins: pluginManager.getPluginRecords(),
    widgets: pluginManager.getWidgets({ placement }),
    dataSources: pluginManager.getDataSources(),
  }));

  useEffect(() => {
    const refresh = () => {
      setSnapshot({
        plugins: pluginManager.getPluginRecords(),
        widgets: pluginManager.getWidgets({ placement }),
        dataSources: pluginManager.getDataSources(),
      });
    };

    refresh();
    return pluginManager.subscribe(refresh);
  }, [placement]);

  useEffect(() => {
    registerActivePlugins().catch((error: Error) => {
      console.error("Plugin registration failed", error);
    });
  }, []);

  const pluginCount = snapshot.plugins.length;
  const dataSourceCount = snapshot.dataSources.length;
  const widgets = useMemo(() => snapshot.widgets, [snapshot.widgets]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Extensions
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700 }}>
              Plugin Registry
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", color: "var(--text-secondary)", fontSize: "12px" }}>
            <span>{pluginCount} plugins</span>
            <span>{widgets.length} widgets</span>
            <span>{dataSourceCount} data sources</span>
          </div>
        </div>

        {snapshot.plugins.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            Plugin discovery is running.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {snapshot.plugins.map((plugin) => (
              <div
                key={plugin.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: "10px",
                  alignItems: "center",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 700 }}>
                    {plugin.name}
                  </div>
                  <div style={{ color: plugin.error ? "var(--red)" : "var(--text-muted)", fontSize: "11px" }}>
                    {plugin.error || plugin.id}
                  </div>
                </div>
                <PluginStatusPill status={plugin.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {widgets.map((widget: PluginWidget) => (
        <PluginWidgetFrame key={widget.id} widget={widget} />
      ))}
    </section>
  );
}

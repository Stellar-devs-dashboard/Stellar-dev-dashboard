import React from "react";
import type { ComponentType } from "react";
import { getEnvironmentConfig, loadConfigProfiles, getActiveProfileName } from "../lib/config";
import { useStore, type StoreState } from "../lib/store";

type DashboardStore = typeof useStore;

type PluginStatus = (typeof PLUGIN_STATUSES)[keyof typeof PLUGIN_STATUSES];

export interface DashboardPlugin {
  id?: string;
  name?: string;
  initialize?: (api: DashboardApi) => void | Promise<void>;
  getWidgets?: () => PluginWidgetInput[];
  getDataSources?: () => PluginDataSourceInput[];
}

interface PluginWidgetInput {
  id?: string;
  title?: string;
  name?: string;
  placement?: string;
  order?: number;
  props?: Record<string, unknown>;
  component?: ComponentType<Record<string, unknown>>;
  Component?: ComponentType<Record<string, unknown>>;
  render?: ComponentType<Record<string, unknown>>;
}

interface PluginDataSourceInput {
  id?: string;
  name?: string;
  description?: string;
  fetch?: () => Promise<unknown>;
  subscribe?: (listener: (data: unknown) => void) => () => void;
  metadata?: Record<string, unknown>;
}

interface PluginRecord {
  id: string;
  name: string;
  plugin: DashboardPlugin;
  status: PluginStatus;
  error: string | null;
  initializedAt: string | null;
}

interface NormalizedWidget {
  id: string;
  pluginId: string;
  pluginName: string;
  title: string;
  placement: string;
  order: number;
  props: Record<string, unknown>;
  component: ComponentType<Record<string, unknown>>;
}

interface NormalizedDataSource {
  id: string;
  pluginId: string;
  pluginName: string;
  name: string;
  description: string;
  fetch: (() => Promise<unknown>) | null;
  subscribe: ((listener: (data: unknown) => void) => () => void) | null;
  metadata: Record<string, unknown>;
}

export interface DashboardApi {
  pluginId: string;
  version: string;
  getState: () => Record<string, unknown>;
  getConfig: () => Record<string, unknown>;
  actions: Record<string, (...args: unknown[]) => unknown>;
  subscribe: (listener: (state: Record<string, unknown>) => void) => () => void;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

const PLUGIN_STATUSES = Object.freeze({
  REGISTERED: "registered",
  INITIALIZED: "initialized",
  FAILED: "failed",
});

const SAFE_STATE_KEYS = Object.freeze([
  "network",
  "theme",
  "activeTab",
  "connectedAddress",
  "accountData",
  "transactions",
  "operations",
  "networkStats",
  "prices",
  "walletConnected",
  "walletType",
  "walletPublicKey",
  "streamStatus",
  "streamLedgers",
]);

const SAFE_ACTION_KEYS = Object.freeze([
  "setActiveTab",
  "setNetwork",
  "setConnectedAddress",
  "setSearchFilters",
  "addNotification",
  "removeNotification",
]);

function freezePlainObject<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezePlainObject)) as T;

  return Object.freeze(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, freezePlainObject(entry)])
    )
  ) as T;
}

function pickSafeState(state: StoreState): Record<string, unknown> {
  return freezePlainObject(
    SAFE_STATE_KEYS.reduce<Record<string, unknown>>((slice, key) => {
      if (state[key as keyof StoreState] !== undefined) {
        slice[key] = state[key as keyof StoreState];
      }
      return slice;
    }, {})
  );
}

function normalizePlugin(rawPlugin: DashboardPlugin | (() => DashboardPlugin)): DashboardPlugin {
  const plugin = (rawPlugin as { default?: DashboardPlugin })?.default || rawPlugin;
  if (typeof plugin === "function") return (plugin as () => DashboardPlugin)();
  return plugin as DashboardPlugin;
}

function normalizeWidget(
  widget: PluginWidgetInput,
  pluginRecord: PluginRecord,
  index: number
): NormalizedWidget | null {
  if (!widget || typeof widget !== "object") return null;

  const Component = widget.component || widget.Component || widget.render;
  if (!Component) return null;

  return {
    id: String(widget.id || `${pluginRecord.id}:widget:${index}`),
    pluginId: pluginRecord.id,
    pluginName: pluginRecord.name,
    title: widget.title || widget.name || pluginRecord.name,
    placement: widget.placement || "settings",
    order: Number.isFinite(widget.order) ? (widget.order as number) : 100,
    props: widget.props || {},
    component: Component,
  };
}

function normalizeDataSource(
  dataSource: PluginDataSourceInput,
  pluginRecord: PluginRecord,
  index: number
): NormalizedDataSource | null {
  if (!dataSource || typeof dataSource !== "object") return null;
  return {
    id: String(dataSource.id || `${pluginRecord.id}:data-source:${index}`),
    pluginId: pluginRecord.id,
    pluginName: pluginRecord.name,
    name: dataSource.name || dataSource.id || `Data source ${index + 1}`,
    description: dataSource.description || "",
    fetch: typeof dataSource.fetch === "function" ? dataSource.fetch : null,
    subscribe: typeof dataSource.subscribe === "function" ? dataSource.subscribe : null,
    metadata: dataSource.metadata || {},
  };
}

function createFallbackPlugin(plugin: DashboardPlugin | null | undefined, reason: string): DashboardPlugin {
  const id = String(plugin?.id || `invalid-plugin-${Date.now()}`);
  const name = String(plugin?.name || id);

  return {
    id,
    name,
    initialize: () => undefined,
    getWidgets: () => [
      {
        id: `${id}:fallback`,
        title: `${name} unavailable`,
        placement: "settings",
        order: 1000,
        component: function PluginFallbackWidget() {
          return React.createElement(
            "div",
            {
              style: {
                color: "var(--red)",
                fontSize: "12px",
                lineHeight: 1.5,
              },
            },
            reason
          );
        },
      },
    ],
    getDataSources: () => [],
  };
}

export class PluginManager {
  store: DashboardStore;
  plugins: Map<string, PluginRecord>;
  listeners: Set<(manager: PluginManager) => void>;
  initializing: Promise<PluginRecord[]> | null;

  constructor({ store = useStore }: { store?: DashboardStore } = {}) {
    this.store = store;
    this.plugins = new Map();
    this.listeners = new Set();
    this.initializing = null;
  }

  createDashboardApi(pluginId: string): DashboardApi {
    const getCurrentState = () => pickSafeState(this.store.getState());

    const actions = SAFE_ACTION_KEYS.reduce<Record<string, (...args: unknown[]) => unknown>>((safeActions, key) => {
      const action = this.store.getState()[key as keyof StoreState];
      if (typeof action === "function") {
        safeActions[key] = (...args: unknown[]) => (action as (...fnArgs: unknown[]) => unknown)(...args);
      }
      return safeActions;
    }, {});

    return Object.freeze({
      pluginId,
      version: "1.0.0",
      getState: getCurrentState,
      getConfig: () =>
        freezePlainObject({
          environment: getEnvironmentConfig(),
          activeProfileName: getActiveProfileName(),
          profiles: loadConfigProfiles(),
        }),
      actions: Object.freeze(actions),
      subscribe: (listener: (state: Record<string, unknown>) => void) => {
        if (typeof listener !== "function") return () => {};
        return this.store.subscribe((state) => listener(pickSafeState(state)));
      },
      logger: Object.freeze({
        info: (...args: unknown[]) => console.info(`[plugin:${pluginId}]`, ...args),
        warn: (...args: unknown[]) => console.warn(`[plugin:${pluginId}]`, ...args),
        error: (...args: unknown[]) => console.error(`[plugin:${pluginId}]`, ...args),
      }),
    }) as DashboardApi;
  }

  register(rawPlugin: DashboardPlugin | (() => DashboardPlugin)): PluginRecord {
    const plugin = normalizePlugin(rawPlugin);
    const validationError = this.validate(plugin);
    const safePlugin = validationError ? createFallbackPlugin(plugin, validationError) : plugin;
    const id = String(safePlugin.id);

    if (this.plugins.has(id)) {
      throw new Error(`Plugin ID conflict: "${id}" is already registered.`);
    }

    const record = {
      id,
      name: String(safePlugin.name || id),
      plugin: safePlugin,
      status: PLUGIN_STATUSES.REGISTERED,
      error: validationError || null,
      initializedAt: null,
    };

    this.plugins.set(id, record);
    this.emitChange();
    return record;
  }

  validate(plugin: DashboardPlugin | null | undefined): string | null {
    if (!plugin || typeof plugin !== "object") return "Plugin export must be an object or factory.";
    if (!plugin.id || typeof plugin.id !== "string") return "Plugin is missing a string id.";
    if (!plugin.name || typeof plugin.name !== "string") return "Plugin is missing a string name.";
    if (plugin.initialize && typeof plugin.initialize !== "function") return "Plugin initialize hook must be a function.";
    if (plugin.getWidgets && typeof plugin.getWidgets !== "function") return "Plugin getWidgets hook must be a function.";
    if (plugin.getDataSources && typeof plugin.getDataSources !== "function") return "Plugin getDataSources hook must be a function.";
    return null;
  }

  async initializeAll(): Promise<PluginRecord[]> {
    if (this.initializing) return this.initializing;

    this.initializing = Promise.all(
      Array.from(this.plugins.values()).map(async (record) => {
        if (record.status === PLUGIN_STATUSES.INITIALIZED) return record;

        try {
          const api = this.createDashboardApi(record.id);
          if (typeof record.plugin.initialize === "function") {
            await record.plugin.initialize(api);
          }
          record.status = PLUGIN_STATUSES.INITIALIZED;
          record.initializedAt = new Date().toISOString();
        } catch (error) {
          record.status = PLUGIN_STATUSES.FAILED;
          record.error = error instanceof Error ? error.message : String(error);
        }
        this.emitChange();
        return record;
      })
    ).finally(() => {
      this.initializing = null;
    });

    return this.initializing;
  }

  getPluginRecords() {
    return Array.from(this.plugins.values()).map((record) => ({
      id: record.id,
      name: record.name,
      status: record.status,
      error: record.error,
      initializedAt: record.initializedAt,
    }));
  }

  getWidgets({ placement }: { placement?: string } = {}): NormalizedWidget[] {
    return Array.from(this.plugins.values())
      .flatMap((record) => {
        try {
          const widgets =
            typeof record.plugin.getWidgets === "function" ? record.plugin.getWidgets() : [];
          return widgets
            .map((widget, index) => normalizeWidget(widget, record, index))
            .filter((widget): widget is NormalizedWidget => widget !== null);
        } catch (error) {
          record.error = error instanceof Error ? error.message : String(error);
          record.status = PLUGIN_STATUSES.FAILED;
          return [];
        }
      })
      .filter((widget) => !placement || widget.placement === placement)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }

  getDataSources(): NormalizedDataSource[] {
    return Array.from(this.plugins.values()).flatMap((record) => {
      try {
        const dataSources =
          typeof record.plugin.getDataSources === "function" ? record.plugin.getDataSources() : [];
        return dataSources
          .map((dataSource, index) => normalizeDataSource(dataSource, record, index))
          .filter((dataSource): dataSource is NormalizedDataSource => dataSource !== null);
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        record.status = PLUGIN_STATUSES.FAILED;
        return [];
      }
    });
  }

  subscribe(listener: (manager: PluginManager) => void): () => void {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitChange() {
    this.listeners.forEach((listener) => listener(this));
  }
}

export const pluginManager = new PluginManager();
export { PLUGIN_STATUSES };

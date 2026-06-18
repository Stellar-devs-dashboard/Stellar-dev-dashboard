import { PluginManager } from "./PluginManager";
import React from "react";
import type { DashboardPlugin } from "./PluginManager";

const pluginModules = import.meta.glob("./**/*Plugin.{js,jsx,ts,tsx}", {
  eager: false,
});

let registrationPromise: Promise<PluginManager> | null = null;

type PluginModule = {
  default?: DashboardPlugin | (() => DashboardPlugin);
  plugin?: DashboardPlugin | (() => DashboardPlugin);
  createPlugin?: DashboardPlugin | (() => DashboardPlugin);
};

function getPluginFactory(module: PluginModule): DashboardPlugin | (() => DashboardPlugin) | null {
  return module?.default || module?.plugin || module?.createPlugin || null;
}

function pathToPluginId(prefix: string, path: string): string {
  return `${prefix}.${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

function registerWithFallback(
  manager: PluginManager,
  plugin: DashboardPlugin | (() => DashboardPlugin),
  path: string
): void {
  try {
    manager.register(plugin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    manager.register({
      id: pathToPluginId("conflict", path),
      name: `${path} registration conflict`,
      initialize: () => undefined,
      getWidgets: () => [
        {
          id: `${pathToPluginId("conflict", path)}.widget`,
          title: "Plugin registration conflict",
          placement: "settings",
          order: 1000,
          component: function PluginConflictWidget() {
            return React.createElement(
              "div",
              { style: { color: "var(--red)", fontSize: "12px" } },
              message
            );
          },
        },
      ],
      getDataSources: () => [],
    });
  }
}

export async function registerActivePlugins(manager: PluginManager = pluginManager): Promise<PluginManager> {
  if (registrationPromise) return registrationPromise;
  registrationPromise = Promise.all(
    Object.entries(pluginModules).map(async ([path, loadModule]) => {
      try {
        const module = await loadModule() as PluginModule;
        const pluginFactory = getPluginFactory(module);
        if (!pluginFactory) {
          registerWithFallback(manager, {
            id: pathToPluginId("invalid", path),
            name: path,
            getWidgets: () => [],
            getDataSources: () => [],
          }, path);
          return;
        }
        registerWithFallback(manager, pluginFactory, path);
      } catch (error) {
        const id = pathToPluginId("failed", path);
        registerWithFallback(manager, {
          id,
          name: path,
          initialize: () => {
            throw error;
          },
          getWidgets: () => [],
          getDataSources: () => [],
        }, path);
      }
    })
  )
    .then(() => manager.initializeAll())
    .then(() => manager);
  return registrationPromise;
}
export const pluginManager = new PluginManager();

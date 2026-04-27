import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const PluginContext = createContext(null)

function normalizePlugin(plugin = {}) {
  return {
    id: String(plugin.id || '').trim(),
    name: String(plugin.name || 'Unnamed Plugin'),
    description: String(plugin.description || ''),
    version: String(plugin.version || '0.1.0'),
    widgets: Array.isArray(plugin.widgets) ? plugin.widgets : [],
    dataSources: Array.isArray(plugin.dataSources) ? plugin.dataSources : [],
    integrations: Array.isArray(plugin.integrations) ? plugin.integrations : [],
  }
}

export function PluginProvider({ children, initialPlugins = [] }) {
  const [plugins, setPlugins] = useState(() => initialPlugins.map(normalizePlugin))
  const initializedIntegrations = useRef(new Set())

  const registerPlugin = useCallback((plugin) => {
    const normalized = normalizePlugin(plugin)
    if (!normalized.id) {
      console.warn('Plugin registration skipped: missing plugin id')
      return
    }

    setPlugins((current) => {
      if (current.some((entry) => entry.id === normalized.id)) {
        return current
      }
      return [...current, normalized]
    })
  }, [])

  const pluginsWithWidgets = useMemo(
    () => plugins.map((plugin) => ({
      ...plugin,
      widgets: plugin.widgets.map((widget) => ({
        ...widget,
        pluginId: plugin.id,
        pluginName: plugin.name,
      })),
    })),
    [plugins]
  )

  const getWidgets = useCallback(
    (location) =>
      pluginsWithWidgets
        .flatMap((plugin) =>
          plugin.widgets
            .filter((widget) => widget.location === location)
            .map((widget) => ({
              ...widget,
              plugin: {
                id: plugin.id,
                name: plugin.name,
                description: plugin.description,
              },
            }))
        )
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [pluginsWithWidgets]
  )

  const getPluginTabs = useCallback(() => getWidgets('tab'), [getWidgets])
  const getPluginWidgets = useCallback((location) => getWidgets(location), [getWidgets])

  const getDataSources = useCallback(
    () =>
      plugins.flatMap((plugin) =>
        plugin.dataSources.map((source) => ({
          ...source,
          plugin: { id: plugin.id, name: plugin.name },
        }))
      ),
    [plugins]
  )

  const getIntegrations = useCallback(
    () =>
      plugins.flatMap((plugin) =>
        plugin.integrations.map((integration) => ({
          ...integration,
          plugin: { id: plugin.id, name: plugin.name },
        }))
      ),
    [plugins]
  )

  useEffect(() => {
    getIntegrations().forEach((integration) => {
      const integrationKey = `${integration.plugin.id}:${integration.id}`
      if (initializedIntegrations.current.has(integrationKey)) {
        return
      }
      initializedIntegrations.current.add(integrationKey)

      if (typeof integration.initialize === 'function') {
        integration.initialize({
          pluginId: integration.plugin.id,
          pluginName: integration.plugin.name,
          registerPlugin,
          getPluginWidgets,
          getPluginTabs,
          getDataSources,
        })
      }
    })
  }, [getIntegrations, getPluginTabs, getPluginWidgets, getDataSources, registerPlugin])

  const value = useMemo(
    () => ({
      plugins,
      registerPlugin,
      getPluginWidgets,
      getPluginTabs,
      getDataSources,
      getIntegrations,
    }),
    [plugins, registerPlugin, getPluginWidgets, getPluginTabs, getDataSources, getIntegrations]
  )

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
}

export function usePlugins() {
  const context = useContext(PluginContext)
  if (!context) {
    throw new Error('usePlugins must be used within a PluginProvider')
  }
  return context
}

export function usePluginWidgets(location) {
  return usePlugins().getPluginWidgets(location)
}

export function usePluginTabs() {
  return usePlugins().getPluginTabs()
}

export function usePluginDataSources() {
  return usePlugins().getDataSources()
}

export function usePluginIntegrations() {
  return usePlugins().getIntegrations()
}

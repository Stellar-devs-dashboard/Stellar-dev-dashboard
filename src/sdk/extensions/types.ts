import type { ComponentType, ReactNode } from "react";

export const EXTENSION_SDK_VERSION = "1.0.0" as const;

export type ExtensionPermission =
  | "dashboard:read"
  | "network:read"
  | "settings:read"
  | "settings:write"
  | "commands:register"
  | "routes:register"
  | "data:query";

export interface ExtensionDependency {
  id: string;
  version: string;
  optional?: boolean;
}

export interface ExtensionManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  sdkVersion: string;
  description?: string;
  entrypoint?: string;
  permissions?: ExtensionPermission[];
  dependencies?: ExtensionDependency[];
  priority?: number;
  settingsVersion?: number;
}

export type ExtensionLifecycleState =
  | "registered"
  | "initializing"
  | "active"
  | "degraded"
  | "failed"
  | "disposed";

export interface ExtensionRoute {
  id: string;
  path: string;
  title: string;
  component: ComponentType;
  navigationLabel?: string;
  order?: number;
  requiresNetwork?: boolean;
}

export interface ExtensionWidgetProps {
  network: string;
  extensionId: string;
  settings: Readonly<Record<string, unknown>>;
}

export interface ExtensionWidget {
  id: string;
  title: string;
  description?: string;
  component: ComponentType<ExtensionWidgetProps>;
  placement: "overview" | "account" | "network" | "settings" | string;
  order?: number;
  minWidth?: number;
  minHeight?: number;
  accessibleLabel: string;
}

export interface ExtensionCommandContext {
  network: string;
  signal: AbortSignal;
  args: Readonly<Record<string, unknown>>;
}

export interface ExtensionCommandResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export interface ExtensionCommand {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  shortcut?: string;
  execute(context: ExtensionCommandContext): Promise<ExtensionCommandResult>;
}

export interface ExtensionDataQuery<TInput = unknown, TOutput = unknown> {
  id: string;
  description?: string;
  timeoutMs?: number;
  validateInput?: (input: unknown) => input is TInput;
  query(input: TInput, context: { network: string; signal: AbortSignal }): Promise<TOutput>;
}

export type ExtensionSettingType = "string" | "number" | "boolean" | "select";

export interface ExtensionSettingDefinition {
  key: string;
  label: string;
  description?: string;
  type: ExtensionSettingType;
  defaultValue: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  sensitive?: boolean;
}

export interface ExtensionEventMap {
  "network:changed": { network: string };
  "extension:state": { extensionId: string; state: ExtensionLifecycleState; error?: string };
  "settings:changed": { extensionId: string; key: string };
  [event: string]: unknown;
}

export interface ExtensionEventBus {
  emit<K extends keyof ExtensionEventMap>(event: K, payload: ExtensionEventMap[K]): void;
  on<K extends keyof ExtensionEventMap>(
    event: K,
    listener: (payload: ExtensionEventMap[K]) => void,
  ): () => void;
}

export interface ExtensionLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface ExtensionContext {
  extensionId: string;
  sdkVersion: string;
  network: string;
  signal: AbortSignal;
  logger: ExtensionLogger;
  events: ExtensionEventBus;
  settings: {
    get(): Readonly<Record<string, unknown>>;
    set(key: string, value: unknown): Promise<void>;
  };
}

export interface DashboardExtension {
  manifest: ExtensionManifest;
  routes?: ExtensionRoute[];
  widgets?: ExtensionWidget[];
  commands?: ExtensionCommand[];
  queries?: ExtensionDataQuery[];
  settings?: ExtensionSettingDefinition[];
  initialize?(context: ExtensionContext): void | Promise<void>;
  dispose?(): void | Promise<void>;
  renderFallback?(error: Error): ReactNode;
}

export interface ExtensionDiagnostic {
  extensionId: string;
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  timestamp: string;
}

export interface ExtensionRecord {
  extension: DashboardExtension;
  state: ExtensionLifecycleState;
  error?: string;
  initializedAt?: string;
  diagnostics: ExtensionDiagnostic[];
}

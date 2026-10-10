import { checkSdkCompatibility, satisfiesDependency } from "./compatibility";
import {
  ExtensionConflictError,
  ExtensionDependencyError,
  ExtensionSdkError,
  ExtensionTimeoutError,
  ExtensionValidationError,
} from "./errors";
import type {
  DashboardExtension,
  ExtensionCommand,
  ExtensionContext,
  ExtensionDataQuery,
  ExtensionDiagnostic,
  ExtensionEventBus,
  ExtensionEventMap,
  ExtensionLogger,
  ExtensionRecord,
  ExtensionRoute,
  ExtensionWidget,
} from "./types";
import { EXTENSION_SDK_VERSION } from "./types";

interface RegistryOptions {
  sdkVersion?: string;
  network: string;
  initializeTimeoutMs?: number;
  logger?: ExtensionLogger;
  loadSettings?: (extensionId: string) => Record<string, unknown>;
  saveSetting?: (extensionId: string, key: string, value: unknown) => Promise<void>;
}

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const PATH_PATTERN = /^\/[a-z0-9/_-]*$/i;

class EventBus implements ExtensionEventBus {
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  emit<K extends keyof ExtensionEventMap>(event: K, payload: ExtensionEventMap[K]): void {
    this.listeners.get(String(event))?.forEach(listener => listener(payload));
  }

  on<K extends keyof ExtensionEventMap>(
    event: K,
    listener: (payload: ExtensionEventMap[K]) => void,
  ): () => void {
    const key = String(event);
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener as (payload: unknown) => void);
    this.listeners.set(key, listeners);
    return () => listeners.delete(listener as (payload: unknown) => void);
  }
}

const consoleLogger: ExtensionLogger = {
  debug: (message, context) => console.debug(message, context ?? {}),
  info: (message, context) => console.info(message, context ?? {}),
  warn: (message, context) => console.warn(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {}),
};

export class ExtensionRegistry {
  private records = new Map<string, ExtensionRecord>();
  private controllers = new Map<string, AbortController>();
  private eventBus = new EventBus();
  private readonly sdkVersion: string;
  private readonly initializeTimeoutMs: number;
  private readonly logger: ExtensionLogger;

  constructor(private readonly options: RegistryOptions) {
    this.sdkVersion = options.sdkVersion ?? EXTENSION_SDK_VERSION;
    this.initializeTimeoutMs = options.initializeTimeoutMs ?? 10_000;
    this.logger = options.logger ?? consoleLogger;
  }

  register(extension: DashboardExtension): ExtensionRecord {
    this.validate(extension);
    const id = extension.manifest.id;
    if (this.records.has(id)) throw new ExtensionConflictError("Extension", id, id);

    const compatibility = checkSdkCompatibility(extension.manifest, this.sdkVersion);
    const record: ExtensionRecord = {
      extension,
      state: compatibility.compatible ? "registered" : "degraded",
      error: compatibility.reason,
      diagnostics: [],
    };
    if (!compatibility.compatible) {
      this.addDiagnostic(record, "warning", "SDK_VERSION_MISMATCH", compatibility.reason!);
    }
    this.records.set(id, record);
    return this.snapshot(record);
  }

  async initializeAll(): Promise<ExtensionRecord[]> {
    const ordered = this.resolveLoadOrder();
    for (const record of ordered) await this.initialize(record);
    return this.list();
  }

  async dispose(extensionId: string): Promise<void> {
    const record = this.requireRecord(extensionId);
    this.controllers.get(extensionId)?.abort();
    try {
      await record.extension.dispose?.();
    } finally {
      record.state = "disposed";
      this.controllers.delete(extensionId);
      this.eventBus.emit("extension:state", { extensionId, state: "disposed" });
    }
  }

  async unregister(extensionId: string): Promise<void> {
    const record = this.requireRecord(extensionId);
    if (record.state !== "disposed") await this.dispose(extensionId);
    this.records.delete(extensionId);
  }

  list(): ExtensionRecord[] {
    return [...this.records.values()]
      .sort((a, b) => this.compareRecords(a, b))
      .map(record => this.snapshot(record));
  }

  getRoutes(): Array<ExtensionRoute & { extensionId: string }> {
    return this.collectResources("routes").map(({ extensionId, resource }) => ({
      ...resource,
      extensionId,
    }));
  }

  getWidgets(): Array<ExtensionWidget & { extensionId: string }> {
    return this.collectResources("widgets")
      .map(({ extensionId, resource }) => ({ ...resource, extensionId }))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));
  }

  getCommands(): Array<ExtensionCommand & { extensionId: string }> {
    return this.collectResources("commands").map(({ extensionId, resource }) => ({
      ...resource,
      extensionId,
    }));
  }

  getQueries(): Array<ExtensionDataQuery & { extensionId: string }> {
    return this.collectResources("queries").map(({ extensionId, resource }) => ({
      ...resource,
      extensionId,
    }));
  }

  async executeCommand(
    commandId: string,
    args: Readonly<Record<string, unknown>> = {},
  ) {
    const command = this.getCommands().find(item => item.id === commandId);
    if (!command) throw new ExtensionSdkError("COMMAND_NOT_FOUND", `Command "${commandId}" was not found`);
    const controller = new AbortController();
    return command.execute({ network: this.options.network, signal: controller.signal, args });
  }

  async query<T = unknown>(queryId: string, input: unknown): Promise<T> {
    const query = this.getQueries().find(item => item.id === queryId);
    if (!query) throw new ExtensionSdkError("QUERY_NOT_FOUND", `Query "${queryId}" was not found`);
    if (query.validateInput && !query.validateInput(input)) {
      throw new ExtensionValidationError(`Invalid input for query "${queryId}"`, query.extensionId);
    }

    const controller = new AbortController();
    const timeoutMs = query.timeoutMs ?? 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await query.query(input, {
        network: this.options.network,
        signal: controller.signal,
      }) as T;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ExtensionTimeoutError(`Query "${queryId}"`, timeoutMs, query.extensionId);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async initialize(record: ExtensionRecord): Promise<void> {
    if (record.state === "active" || record.state === "failed") return;
    if (record.state === "degraded") return;

    const extensionId = record.extension.manifest.id;
    const missing = this.missingRequiredDependencies(record.extension);
    if (missing.length) {
      record.state = "degraded";
      record.error = `Missing dependencies: ${missing.join(", ")}`;
      this.addDiagnostic(record, "warning", "DEPENDENCY_MISSING", record.error);
      return;
    }

    const controller = new AbortController();
    this.controllers.set(extensionId, controller);
    record.state = "initializing";
    this.eventBus.emit("extension:state", { extensionId, state: "initializing" });

    try {
      const context = this.createContext(record, controller.signal);
      await this.withTimeout(
        Promise.resolve(record.extension.initialize?.(context)),
        this.initializeTimeoutMs,
        extensionId,
      );
      record.state = "active";
      record.initializedAt = new Date().toISOString();
      this.addDiagnostic(record, "info", "INITIALIZED", "Extension initialized successfully");
      this.eventBus.emit("extension:state", { extensionId, state: "active" });
    } catch (error) {
      record.state = "failed";
      record.error = error instanceof Error ? error.message : String(error);
      this.addDiagnostic(record, "error", "INITIALIZATION_FAILED", record.error);
      this.eventBus.emit("extension:state", {
        extensionId,
        state: "failed",
        error: record.error,
      });
    }
  }

  private createContext(record: ExtensionRecord, signal: AbortSignal): ExtensionContext {
    const extensionId = record.extension.manifest.id;
    const childLogger: ExtensionLogger = {
      debug: (message, context) => this.logger.debug(message, { extensionId, ...context }),
      info: (message, context) => this.logger.info(message, { extensionId, ...context }),
      warn: (message, context) => this.logger.warn(message, { extensionId, ...context }),
      error: (message, context) => this.logger.error(message, { extensionId, ...context }),
    };

    return Object.freeze({
      extensionId,
      sdkVersion: this.sdkVersion,
      network: this.options.network,
      signal,
      logger: childLogger,
      events: this.eventBus,
      settings: {
        get: () => Object.freeze({ ...(this.options.loadSettings?.(extensionId) ?? {}) }),
        set: async (key: string, value: unknown) => {
          await this.options.saveSetting?.(extensionId, key, value);
          this.eventBus.emit("settings:changed", { extensionId, key });
        },
      },
    });
  }

  private resolveLoadOrder(): ExtensionRecord[] {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: ExtensionRecord[] = [];

    const visit = (record: ExtensionRecord, path: string[]) => {
      const id = record.extension.manifest.id;
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new ExtensionDependencyError(`Dependency cycle: ${[...path, id].join(" -> ")}`, id);
      }
      visiting.add(id);
      const dependencies = [...(record.extension.manifest.dependencies ?? [])]
        .filter(dependency => !dependency.optional)
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const dependency of dependencies) {
        const dependencyRecord = this.records.get(dependency.id);
        if (dependencyRecord) visit(dependencyRecord, [...path, id]);
      }
      visiting.delete(id);
      visited.add(id);
      ordered.push(record);
    };

    [...this.records.values()].sort((a, b) => this.compareRecords(a, b)).forEach(record => visit(record, []));
    return ordered;
  }

  private collectResources<K extends "routes" | "widgets" | "commands" | "queries">(
    key: K,
  ): Array<{
    extensionId: string;
    resource: NonNullable<DashboardExtension[K]>[number];
  }> {
    const seen = new Set<string>();
    const resources: Array<{
      extensionId: string;
      resource: NonNullable<DashboardExtension[K]>[number];
    }> = [];
    for (const record of this.records.values()) {
      if (record.state !== "active") continue;
      for (const resource of record.extension[key] ?? []) {
        if (seen.has(resource.id)) {
          this.addDiagnostic(
            record,
            "error",
            "RESOURCE_CONFLICT",
            `${key} identifier "${resource.id}" conflicts with another extension`,
          );
          continue;
        }
        seen.add(resource.id);
        resources.push({ extensionId: record.extension.manifest.id, resource });
      }
    }
    return resources;
  }

  private missingRequiredDependencies(extension: DashboardExtension): string[] {
    return (extension.manifest.dependencies ?? [])
      .filter(dependency => !dependency.optional)
      .filter(dependency => {
        const installed = this.records.get(dependency.id)?.extension.manifest.version;
        return !installed || !satisfiesDependency(installed, dependency.version);
      })
      .map(dependency => `${dependency.id}@${dependency.version}`);
  }

  private validate(extension: DashboardExtension): void {
    if (!extension || typeof extension !== "object") throw new ExtensionValidationError("Extension must be an object");
    const manifest = extension.manifest;
    if (!manifest || manifest.schemaVersion !== 1) throw new ExtensionValidationError("Manifest schemaVersion must be 1");
    if (!ID_PATTERN.test(manifest.id)) throw new ExtensionValidationError("Manifest id must be a stable reverse-domain token", manifest.id);
    if (!manifest.name?.trim()) throw new ExtensionValidationError("Manifest name is required", manifest.id);
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new ExtensionValidationError("Manifest version must use semantic versioning", manifest.id);

    const localIds = new Set<string>();
    for (const [kind, resources] of Object.entries({
      route: extension.routes ?? [],
      widget: extension.widgets ?? [],
      command: extension.commands ?? [],
      query: extension.queries ?? [],
    })) {
      for (const resource of resources) {
        if (!ID_PATTERN.test(resource.id)) throw new ExtensionValidationError(`${kind} id "${resource.id}" is invalid`, manifest.id);
        const scoped = `${kind}:${resource.id}`;
        if (localIds.has(scoped)) throw new ExtensionValidationError(`Duplicate ${kind} id "${resource.id}"`, manifest.id);
        localIds.add(scoped);
      }
    }
    for (const route of extension.routes ?? []) {
      if (!PATH_PATTERN.test(route.path) || route.path === "/") {
        throw new ExtensionValidationError(`Route path "${route.path}" is invalid or reserved`, manifest.id);
      }
    }
  }

  private requireRecord(extensionId: string): ExtensionRecord {
    const record = this.records.get(extensionId);
    if (!record) throw new ExtensionSdkError("EXTENSION_NOT_FOUND", `Extension "${extensionId}" was not found`, extensionId);
    return record;
  }

  private compareRecords(a: ExtensionRecord, b: ExtensionRecord): number {
    return (a.extension.manifest.priority ?? 100) - (b.extension.manifest.priority ?? 100)
      || a.extension.manifest.id.localeCompare(b.extension.manifest.id);
  }

  private addDiagnostic(
    record: ExtensionRecord,
    level: ExtensionDiagnostic["level"],
    code: string,
    message: string,
  ): void {
    record.diagnostics.push({
      extensionId: record.extension.manifest.id,
      level,
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private snapshot(record: ExtensionRecord): ExtensionRecord {
    return { ...record, diagnostics: [...record.diagnostics] };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, extensionId: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ExtensionTimeoutError("Extension initialization", timeoutMs, extensionId)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

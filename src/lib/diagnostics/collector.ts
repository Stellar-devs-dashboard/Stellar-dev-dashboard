import {
  DIAGNOSTIC_SCHEMA_VERSION,
  type DiagnosticBreadcrumb,
  type DiagnosticBreadcrumbInput,
  type DiagnosticCollectorConfig,
  type DiagnosticEvent,
  type DiagnosticEventInput,
  type DiagnosticRequestContext,
  type DiagnosticSeverity,
  type DiagnosticSnapshot,
  type RedactionRule,
} from '../../types/diagnostics';
import { diagnosticByteLength, redactDiagnosticValue, validateRedactionRules } from './redaction';

const DEFAULT_CONFIG: DiagnosticCollectorConfig = {
  maxEvents: 250,
  maxBreadcrumbs: 100,
  maxEventBytes: 32 * 1024,
  enabled: true,
  customRules: [],
};

type DiagnosticSubscriber = (_snapshot: DiagnosticSnapshot) => void;

function cloneCapturedValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function normalizeConfig(input: Partial<DiagnosticCollectorConfig>): DiagnosticCollectorConfig {
  return {
    maxEvents: Math.max(
      10,
      Math.min(1_000, Math.floor(input.maxEvents ?? DEFAULT_CONFIG.maxEvents))
    ),
    maxBreadcrumbs: Math.max(
      10,
      Math.min(500, Math.floor(input.maxBreadcrumbs ?? DEFAULT_CONFIG.maxBreadcrumbs))
    ),
    maxEventBytes: Math.max(
      2_048,
      Math.min(256 * 1024, Math.floor(input.maxEventBytes ?? DEFAULT_CONFIG.maxEventBytes))
    ),
    enabled: input.enabled ?? DEFAULT_CONFIG.enabled,
    customRules: validateRedactionRules(input.customRules ?? DEFAULT_CONFIG.customRules),
  };
}

export class DiagnosticCollector {
  private events: DiagnosticEvent[] = [];
  private breadcrumbs: DiagnosticBreadcrumb[] = [];
  private subscribers = new Set<DiagnosticSubscriber>();
  private sequence = 0;
  private droppedEvents = 0;
  private totalRedactions = 0;
  private config: DiagnosticCollectorConfig;
  private readonly now: () => Date;
  private readonly idFactory: (_prefix: string) => string;

  constructor(
    config: Partial<DiagnosticCollectorConfig> = {},
    now: () => Date = () => new Date(),
    idFactory: (_prefix: string) => string = makeId
  ) {
    this.config = normalizeConfig(config);
    this.now = now;
    this.idFactory = idFactory;
  }

  capture(input: DiagnosticEventInput): DiagnosticEvent | null {
    if (!this.config.enabled) return null;
    const sanitized = redactDiagnosticValue(
      {
        name: String(input.name || 'unnamed-event').slice(0, 120),
        message: String(input.message || 'No diagnostic message.').slice(0, 8_192),
        details: input.details ?? {},
        ...(input.feature ? { feature: input.feature } : {}),
      },
      {
        customRules: this.config.customRules,
        maxOutputBytes: this.config.maxEventBytes,
      }
    );
    const value = sanitized.value as {
      name?: string;
      message?: string;
      details?: unknown;
      feature?: string;
    };
    const sequence = ++this.sequence;
    let event: DiagnosticEvent = {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      id: this.idFactory('event'),
      sequence,
      timestamp: this.now().toISOString(),
      category: input.category,
      severity: input.severity ?? (input.outcome === 'failure' ? 'error' : 'info'),
      name: value.name ?? 'unnamed-event',
      message: value.message ?? 'No diagnostic message.',
      outcome: input.outcome ?? 'success',
      details: value.details ?? {},
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
      ...(value.feature ? { feature: value.feature } : {}),
      ...(typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
        ? { durationMs: Math.max(0, Math.round(input.durationMs)) }
        : {}),
      source: input.source ?? 'dashboard',
      redactionCount: sanitized.replacements,
      truncated: sanitized.truncated,
    };
    if (diagnosticByteLength(event) > this.config.maxEventBytes) {
      event = {
        ...event,
        details: { summary: '[TRUNCATED_EVENT]', byteLimit: this.config.maxEventBytes },
        truncated: true,
      };
    }
    this.events.push(event);
    if (this.events.length > this.config.maxEvents) {
      const removed = this.events.length - this.config.maxEvents;
      this.events.splice(0, removed);
      this.droppedEvents += removed;
    }
    this.totalRedactions += event.redactionCount;
    this.notify();
    return event;
  }

  addBreadcrumb(input: DiagnosticBreadcrumbInput): DiagnosticBreadcrumb | null {
    if (!this.config.enabled) return null;
    const sanitized = redactDiagnosticValue(
      {
        action: input.action,
        detail: input.detail ?? {},
        ...(input.feature ? { feature: input.feature } : {}),
      },
      { customRules: this.config.customRules, maxOutputBytes: 16 * 1024 }
    );
    const value = sanitized.value as { action?: string; detail?: unknown; feature?: string };
    const breadcrumb: DiagnosticBreadcrumb = {
      id: this.idFactory('breadcrumb'),
      sequence: ++this.sequence,
      timestamp: this.now().toISOString(),
      action: value.action ?? 'unknown-action',
      detail: value.detail ?? {},
      ...(value.feature ? { feature: value.feature } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      redactionCount: sanitized.replacements,
    };
    this.breadcrumbs.push(breadcrumb);
    if (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs.splice(0, this.breadcrumbs.length - this.config.maxBreadcrumbs);
    }
    this.totalRedactions += breadcrumb.redactionCount;
    this.notify();
    return breadcrumb;
  }

  beginRequest(
    name: string,
    details: unknown = {},
    options: { correlationId?: string; feature?: string } = {}
  ): DiagnosticRequestContext {
    const requestId = this.idFactory('request');
    const correlationId = options.correlationId ?? this.idFactory('correlation');
    const startedAt = monotonicNow();
    const started = this.capture({
      category: 'request',
      name,
      message: 'Request started.',
      outcome: 'started',
      details,
      requestId,
      correlationId,
      feature: options.feature,
      source: 'browser',
    });
    let finished = false;
    return {
      requestId,
      correlationId,
      startedAt,
      finish: (outcome, message, finishDetails = {}, severity?: DiagnosticSeverity) => {
        if (finished) return null;
        finished = true;
        return this.capture({
          category: 'request',
          name,
          message,
          outcome,
          details: finishDetails,
          requestId,
          correlationId,
          causationId: started?.id,
          feature: options.feature,
          durationMs: monotonicNow() - startedAt,
          severity,
          source: 'browser',
        });
      },
    };
  }

  getSnapshot(): DiagnosticSnapshot {
    const events = cloneCapturedValue(this.events);
    const breadcrumbs = cloneCapturedValue(this.breadcrumbs);
    return {
      capturedAt: this.now().toISOString(),
      enabled: this.config.enabled,
      events,
      breadcrumbs,
      droppedEvents: this.droppedEvents,
      totalRedactions: this.totalRedactions,
      approximateBytes: diagnosticByteLength({ events, breadcrumbs }),
    };
  }

  subscribe(subscriber: DiagnosticSubscriber): () => void {
    this.subscribers.add(subscriber);
    try {
      subscriber(this.getSnapshot());
    } catch {
      // Observer failures are isolated both during subscription and future notifications.
    }
    return () => this.subscribers.delete(subscriber);
  }

  setEnabled(enabled: boolean): void {
    this.config = { ...this.config, enabled };
    this.notify();
  }

  setCustomRules(rules: RedactionRule[]): void {
    const customRules = validateRedactionRules(rules);
    this.config = { ...this.config, customRules };
    this.events = this.events.map((event) => {
      const sanitized = redactDiagnosticValue(
        {
          name: event.name,
          message: event.message,
          details: event.details,
          ...(event.feature ? { feature: event.feature } : {}),
        },
        { customRules, maxOutputBytes: this.config.maxEventBytes }
      );
      const value = sanitized.value as {
        name: string;
        message: string;
        details: unknown;
        feature?: string;
      };
      return {
        ...event,
        name: value.name,
        message: value.message,
        details: value.details,
        ...(value.feature ? { feature: value.feature } : {}),
        redactionCount: event.redactionCount + sanitized.replacements,
        truncated: event.truncated || sanitized.truncated,
      };
    });
    this.breadcrumbs = this.breadcrumbs.map((breadcrumb) => {
      const sanitized = redactDiagnosticValue(
        {
          action: breadcrumb.action,
          detail: breadcrumb.detail,
          ...(breadcrumb.feature ? { feature: breadcrumb.feature } : {}),
        },
        { customRules, maxOutputBytes: 16 * 1024 }
      );
      const value = sanitized.value as { action: string; detail: unknown; feature?: string };
      return {
        ...breadcrumb,
        action: value.action,
        detail: value.detail,
        ...(value.feature ? { feature: value.feature } : {}),
        redactionCount: breadcrumb.redactionCount + sanitized.replacements,
      };
    });
    this.totalRedactions =
      this.events.reduce((total, event) => total + event.redactionCount, 0) +
      this.breadcrumbs.reduce((total, breadcrumb) => total + breadcrumb.redactionCount, 0);
    this.notify();
  }

  getCustomRules(): RedactionRule[] {
    return this.config.customRules.map((rule) => ({ ...rule }));
  }

  clear(): void {
    this.events = [];
    this.breadcrumbs = [];
    this.droppedEvents = 0;
    this.totalRedactions = 0;
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const subscriber of this.subscribers) {
      try {
        subscriber(snapshot);
      } catch {
        // A broken observer must never block local capture.
      }
    }
  }
}

export const diagnosticCollector = new DiagnosticCollector();

let browserCaptureCleanup: (() => void) | null = null;
let originalFetch: typeof fetch | null = null;

function requestMetadata(input: RequestInfo | URL, init?: RequestInit): Record<string, unknown> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const rawUrl = request?.url ?? String(input);
  let endpointKind = 'remote';
  try {
    const url = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : undefined);
    endpointKind =
      typeof window !== 'undefined' && url.origin === window.location.origin
        ? 'same-origin'
        : 'remote';
  } catch {
    endpointKind = 'unknown';
  }
  return {
    method: init?.method ?? request?.method ?? 'GET',
    url: rawUrl,
    endpointKind,
    hasBody: Boolean(init?.body ?? request?.body),
  };
}

export function installDiagnosticFetchCapture(): () => void {
  if (typeof window === 'undefined' || originalFetch) return () => undefined;
  originalFetch = window.fetch.bind(window);
  const capturedFetch: typeof fetch = async (input, init) => {
    const request = diagnosticCollector.beginRequest('browser.fetch', requestMetadata(input, init));
    try {
      const response = await originalFetch!(input, init);
      request.finish(
        response.ok ? 'success' : 'degraded',
        response.ok ? 'Request completed.' : 'Request returned a non-success response.',
        { status: response.status, responseType: response.type },
        response.ok ? 'info' : 'warning'
      );
      return response;
    } catch (cause) {
      request.finish(
        'failure',
        cause instanceof Error ? cause.message : 'Request failed.',
        { error: cause },
        'error'
      );
      throw cause;
    }
  };
  window.fetch = capturedFetch;
  return () => {
    if (originalFetch) window.fetch = originalFetch;
    originalFetch = null;
  };
}

export function installBrowserDiagnosticCapture(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (browserCaptureCleanup) return browserCaptureCleanup;
  const onError = (event: ErrorEvent) => {
    diagnosticCollector.capture({
      category: 'runtime',
      severity: 'error',
      name: 'window.error',
      message: event.message || 'Unhandled browser error.',
      outcome: 'failure',
      details: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
      },
      source: 'browser',
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    diagnosticCollector.capture({
      category: 'runtime',
      severity: 'error',
      name: 'window.unhandledrejection',
      message:
        event.reason instanceof Error ? event.reason.message : 'Unhandled promise rejection.',
      outcome: 'failure',
      details: { reason: event.reason },
      source: 'browser',
    });
  };
  const onOnline = () =>
    diagnosticCollector.capture({
      category: 'request',
      name: 'browser.connectivity',
      message: 'Browser reported online connectivity.',
      outcome: 'success',
      details: { online: true },
      source: 'browser',
    });
  const onOffline = () =>
    diagnosticCollector.capture({
      category: 'request',
      severity: 'warning',
      name: 'browser.connectivity',
      message: 'Browser reported offline connectivity.',
      outcome: 'degraded',
      details: { online: false },
      source: 'browser',
    });
  const onServiceWorkerMessage = (event: MessageEvent) =>
    diagnosticCollector.capture({
      category: 'service-worker',
      name: 'service-worker.message',
      message: 'A service-worker message was observed.',
      details: { type: typeof event.data === 'object' ? event.data?.type : typeof event.data },
      source: 'browser',
    });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
  const uninstallFetch = installDiagnosticFetchCapture();
  diagnosticCollector.capture({
    category: 'runtime',
    name: 'diagnostics.initialized',
    message: 'Local diagnostic capture initialized.',
    outcome: 'success',
    details: { transport: 'none', persistence: 'local-only' },
    source: 'browser',
  });
  browserCaptureCleanup = () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    uninstallFetch();
    browserCaptureCleanup = null;
  };
  return browserCaptureCleanup;
}

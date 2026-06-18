/**
 * Security Event Tracking (#118)
 */

import {
  recordAudit,
  AuditCategory,
  AuditSeverity,
  subscribeAudit,
  type RecordAuditParams,
  type AuditCategoryType,
  type AuditSeverityLevel,
} from '../utils/audit';

export const SecurityEventType = Object.freeze({
  AUTH_LOGIN_SUCCESS:      'auth.login.success',
  AUTH_LOGIN_FAILED:       'auth.login.failed',
  AUTH_LOGOUT:             'auth.logout',
  AUTH_SESSION_EXPIRED:    'auth.session.expired',
  WALLET_CONNECTED:        'wallet.connected',
  WALLET_DISCONNECTED:     'wallet.disconnected',
  WALLET_SIGN_REQUEST:     'wallet.sign.request',
  WALLET_SIGN_REJECTED:    'wallet.sign.rejected',
  WALLET_KEY_EXPORTED:     'wallet.key.exported',
  TX_SUBMITTED:            'tx.submitted',
  TX_FAILED:               'tx.failed',
  TX_HIGH_VALUE:           'tx.high_value',
  TX_SUSPICIOUS:           'tx.suspicious',
  NETWORK_SWITCHED:        'network.switched',
  CONFIG_CHANGED:          'config.changed',
  RATE_LIMIT_HIT:          'security.rate_limit_hit',
  CSP_VIOLATION:           'security.csp_violation',
  XSS_ATTEMPT:             'security.xss_attempt',
  PERMISSION_DENIED:       'security.permission_denied',
  INTEGRITY_VIOLATION:     'security.integrity_violation',
});

export type SecurityEventTypeValue = (typeof SecurityEventType)[keyof typeof SecurityEventType];

const SEVERITY_MAP: Record<SecurityEventTypeValue, AuditSeverityLevel> = {
  [SecurityEventType.AUTH_LOGIN_SUCCESS]:    AuditSeverity.INFO,
  [SecurityEventType.AUTH_LOGIN_FAILED]:     AuditSeverity.MEDIUM,
  [SecurityEventType.AUTH_LOGOUT]:           AuditSeverity.INFO,
  [SecurityEventType.AUTH_SESSION_EXPIRED]:  AuditSeverity.LOW,
  [SecurityEventType.WALLET_CONNECTED]:      AuditSeverity.INFO,
  [SecurityEventType.WALLET_DISCONNECTED]:   AuditSeverity.INFO,
  [SecurityEventType.WALLET_SIGN_REQUEST]:   AuditSeverity.LOW,
  [SecurityEventType.WALLET_SIGN_REJECTED]:  AuditSeverity.LOW,
  [SecurityEventType.WALLET_KEY_EXPORTED]:   AuditSeverity.HIGH,
  [SecurityEventType.TX_SUBMITTED]:          AuditSeverity.INFO,
  [SecurityEventType.TX_FAILED]:             AuditSeverity.LOW,
  [SecurityEventType.TX_HIGH_VALUE]:         AuditSeverity.MEDIUM,
  [SecurityEventType.TX_SUSPICIOUS]:         AuditSeverity.HIGH,
  [SecurityEventType.NETWORK_SWITCHED]:      AuditSeverity.LOW,
  [SecurityEventType.CONFIG_CHANGED]:        AuditSeverity.LOW,
  [SecurityEventType.RATE_LIMIT_HIT]:        AuditSeverity.MEDIUM,
  [SecurityEventType.CSP_VIOLATION]:         AuditSeverity.HIGH,
  [SecurityEventType.XSS_ATTEMPT]:           AuditSeverity.CRITICAL,
  [SecurityEventType.PERMISSION_DENIED]:     AuditSeverity.MEDIUM,
  [SecurityEventType.INTEGRITY_VIOLATION]:   AuditSeverity.CRITICAL,
};

const CATEGORY_MAP: Record<string, AuditCategoryType> = {
  auth:     AuditCategory.AUTH,
  wallet:   AuditCategory.WALLET,
  tx:       AuditCategory.TRANSACTION,
  network:  AuditCategory.NETWORK,
  config:   AuditCategory.CONFIG,
  security: AuditCategory.SECURITY,
};

function categoryFor(eventType: string): AuditCategoryType {
  const prefix = eventType.split('.')[0];
  return CATEGORY_MAP[prefix] ?? AuditCategory.SYSTEM;
}

export interface SecurityAlert extends Record<string, unknown> {
  kind: string;
  actor?: string;
  action?: string;
  count: number;
  windowMs: number;
}

export interface TrackSecurityEventOptions {
  actor?: string | null;
  target?: string | null;
  outcome?: 'success' | 'failure' | 'denied';
  metadata?: Record<string, unknown>;
  severityOverride?: AuditSeverityLevel;
}

type AuditCategoryValue = AuditCategoryType;
type AuditSeverityValue = AuditSeverityLevel;

interface AuditRecordInput {
  action: string;
  category?: AuditCategoryValue;
  severity?: AuditSeverityValue;
  actor?: string | null;
  target?: string | null;
  outcome?: string;
  metadata?: Record<string, unknown>;
}

const _failedAuthByActor = new Map<string, number[]>();
const _ratelimitHitsByAction = new Map<string, number[]>();
const FAILED_AUTH_WINDOW_MS = 5 * 60_000;
const FAILED_AUTH_THRESHOLD = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_THRESHOLD = 10;

const _alertSubscribers = new Set<(alert: SecurityAlert) => void>();

export function subscribeSecurityAlerts(handler: (alert: SecurityAlert) => void) {
  _alertSubscribers.add(handler);
  return () => _alertSubscribers.delete(handler);
}

function emitAlert(alert: SecurityAlert) {
  for (const fn of _alertSubscribers) {
    try { fn(alert); } catch { /* swallow */ }
  }
}

function pruneOlderThan(arr: number[], cutoff: number) {
  return arr.filter((t) => t >= cutoff);
}

function checkAnomalies(eventType: SecurityEventTypeValue, payload: TrackSecurityEventOptions) {
  const now = Date.now();

  if (eventType === SecurityEventType.AUTH_LOGIN_FAILED) {
    const actor = payload.actor || 'anonymous';
    const list = pruneOlderThan(
      _failedAuthByActor.get(actor) ?? [],
      now - FAILED_AUTH_WINDOW_MS,
    );
    list.push(now);
    _failedAuthByActor.set(actor, list);
    if (list.length >= FAILED_AUTH_THRESHOLD) {
      const alert: SecurityAlert = {
        kind: 'brute_force_suspected',
        actor,
        count: list.length,
        windowMs: FAILED_AUTH_WINDOW_MS,
      };
      emitAlert(alert);
      recordAudit({
        action: 'security.alert.brute_force_suspected',
        category: AuditCategory.SECURITY,
        severity: AuditSeverity.CRITICAL,
        actor,
        outcome: 'denied',
        metadata: { ...alert },
      } satisfies AuditRecordInput);
    }
  }

  if (eventType === SecurityEventType.RATE_LIMIT_HIT) {
    const action = String(payload.metadata?.action || 'unknown');
    const list = pruneOlderThan(
      _ratelimitHitsByAction.get(action) ?? [],
      now - RATE_LIMIT_WINDOW_MS,
    );
    list.push(now);
    _ratelimitHitsByAction.set(action, list);
    if (list.length >= RATE_LIMIT_THRESHOLD) {
      const alert: SecurityAlert = {
        kind: 'rate_limit_storm',
        action,
        count: list.length,
        windowMs: RATE_LIMIT_WINDOW_MS,
      };
      emitAlert(alert);
      recordAudit({
        action: 'security.alert.rate_limit_storm',
        category: AuditCategory.SECURITY,
        severity: AuditSeverity.HIGH,
        outcome: 'denied',
        metadata: { ...alert },
      } satisfies AuditRecordInput);
    }
  }
}

export function trackSecurityEvent(
  eventType: SecurityEventTypeValue,
  opts: TrackSecurityEventOptions = {},
) {
  const severity = (opts.severityOverride ?? SEVERITY_MAP[eventType] ?? AuditSeverity.INFO) as AuditSeverityValue;
  const category = categoryFor(eventType) as AuditCategoryValue;

  const promise = recordAudit({
    action: eventType,
    category,
    severity,
    actor: opts.actor ?? null,
    target: opts.target ?? null,
    outcome: opts.outcome ?? 'success',
    metadata: opts.metadata ?? {},
  } satisfies AuditRecordInput);

  checkAnomalies(eventType, opts);

  return promise;
}

let _listenersInstalled = false;

export function installSecurityEventListeners() {
  if (_listenersInstalled || typeof window === 'undefined') return;
  _listenersInstalled = true;

  document.addEventListener('securitypolicyviolation', (e) => {
    trackSecurityEvent(SecurityEventType.CSP_VIOLATION, {
      target: e.violatedDirective,
      outcome: 'denied',
      metadata: {
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
      },
    });
  });
}

export { subscribeAudit, AuditSeverity, AuditCategory };

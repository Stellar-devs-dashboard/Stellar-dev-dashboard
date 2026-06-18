/**
 * Comprehensive Audit Trail System
 * Logs all user actions, API calls, and data changes with security monitoring
 */

import { redactSensitive } from '../utils/security';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditSeverity = 'info' | 'warning' | 'error' | 'high' | 'medium';

export type AuditEventType =
  | 'USER_IDENTIFIED'
  | 'USER_ACTION'
  | 'API_CALL'
  | 'DATA_CHANGE'
  | 'SECURITY_EVENT'
  | 'SECURITY_ALERT'
  | 'ERROR'
  | 'LOGIN_FAILED'
  | 'SUSPICIOUS_OPERATION'
  | 'SYSTEM';

export interface AuditEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  userId: string | null;
  type: AuditEventType | string;
  message: string;
  metadata: Record<string, unknown>;
  severity: AuditSeverity;
  userAgent: string;
  ip: string;
  location: string;
}

export interface SecurityThresholds {
  failedLogins: number;
  apiCallsPerMinute: number;
  suspiciousOperations: number;
}

export interface AuditCounters {
  failedLogins: number;
  apiCalls: number;
  suspiciousOperations: number;
  lastApiCallReset: number;
}

export interface GetEventsOptions {
  type?: string;
  severity?: AuditSeverity | string;
  userId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  search?: string;
}

export type ExportFormat = 'json' | 'csv' | 'txt';

export interface APIResponseInfo {
  status?: number;
  responseTime?: number;
  queued?: boolean;
}

export interface AuditStatistics {
  totalEvents: number;
  last24hEvents: number;
  last7dEvents: number;
  securityAlerts: number;
  errors: number;
  apiCalls: number;
  sessionId: string;
  userId: string | null;
  counters: AuditCounters;
}

export type AuditSubscriber = (event: AuditEvent) => void;

interface StoredAuditData {
  events?: AuditEvent[];
  userId?: string | null;
  lastUpdated?: string;
}

interface SecurityAlert {
  type: string;
  message: string;
  severity: AuditSeverity;
  count: number;
}

class AuditTrail {
  events: AuditEvent[];
  maxEvents: number;
  sessionId: string;
  userId: string | null;
  securityThresholds: SecurityThresholds;
  counters: AuditCounters;
  subscribers: AuditSubscriber[];

  constructor() {
    this.events = [];
    this.maxEvents = 10000; // Maximum events to keep in memory
    this.sessionId = this.generateSessionId();
    this.userId = null;
    this.securityThresholds = {
      failedLogins: 5,
      apiCallsPerMinute: 100,
      suspiciousOperations: 10
    };
    this.counters = {
      failedLogins: 0,
      apiCalls: 0,
      suspiciousOperations: 0,
      lastApiCallReset: Date.now()
    };
    this.subscribers = [];
    this.initStorage();
  }

  generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  initStorage(): void {
    // Load existing events from localStorage if available
    try {
      const stored = localStorage.getItem('stellar_audit_trail');
      if (stored) {
        const data = JSON.parse(stored) as StoredAuditData;
        this.events = data.events || [];
        this.userId = data.userId ?? null;
      }
    } catch (error) {
      console.warn('Failed to load audit trail from storage:', error);
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
    this.logEvent('USER_IDENTIFIED', 'User session identified', { userId });
  }

  logEvent(
    type: AuditEventType | string,
    message: string,
    metadata: Record<string, unknown> = {},
    severity: AuditSeverity = 'info'
  ): string {
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      type,
      message,
      metadata,
      severity,
      userAgent: navigator.userAgent,
      ip: this.getClientIP(),
      location: window.location.href
    };

    this.events.unshift(event);
    
    // Trim events if exceeding max
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    // Update counters
    this.updateCounters(type);

    // Check for security issues
    this.checkSecurityThresholds(event);

    // Notify subscribers
    this.notifySubscribers(event);

    // Persist to storage
    this.persistToStorage();

    return event.id;
  }

  generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getClientIP(): string {
    // In a real implementation, this would come from server headers
    return 'client_ip_unknown';
  }

  updateCounters(type: string): void {
    const now = Date.now();
    
    // Reset API counter every minute
    if (now - this.counters.lastApiCallReset > 60000) {
      this.counters.apiCalls = 0;
      this.counters.lastApiCallReset = now;
    }

    switch (type) {
      case 'LOGIN_FAILED':
        this.counters.failedLogins++;
        break;
      case 'API_CALL':
        this.counters.apiCalls++;
        break;
      case 'SUSPICIOUS_OPERATION':
        this.counters.suspiciousOperations++;
        break;
    }
  }

  checkSecurityThresholds(_event: AuditEvent): void {
    const alerts: SecurityAlert[] = [];

    if (this.counters.failedLogins >= this.securityThresholds.failedLogins) {
      alerts.push({
        type: 'SECURITY_ALERT',
        message: 'Multiple failed login attempts detected',
        severity: 'high',
        count: this.counters.failedLogins
      });
    }

    if (this.counters.apiCalls >= this.securityThresholds.apiCallsPerMinute) {
      alerts.push({
        type: 'SECURITY_ALERT',
        message: 'High API call rate detected',
        severity: 'medium',
        count: this.counters.apiCalls
      });
    }

    if (this.counters.suspiciousOperations >= this.securityThresholds.suspiciousOperations) {
      alerts.push({
        type: 'SECURITY_ALERT',
        message: 'Multiple suspicious operations detected',
        severity: 'high',
        count: this.counters.suspiciousOperations
      });
    }

    alerts.forEach(alert => {
      const { type, message, severity, count } = alert;
      this.logEvent(type, message, { severity, count }, severity);
    });
  }

  // Specific logging methods for different types of actions
  logUserAction(action: string, details: Record<string, unknown> = {}): void {
    this.logEvent('USER_ACTION', `User performed: ${action}`, details);
  }

  logAPICall(
    endpoint: string,
    method: string,
    params: Record<string, unknown> = {},
    response: APIResponseInfo = {}
  ): void {
    const metadata = {
      endpoint,
      method,
      params: this.sanitizeParams(params),
      responseStatus: response.status,
      responseTime: response.responseTime
    };
    
    this.logEvent('API_CALL', `${method} ${endpoint}`, metadata);
  }

  logDataChange(
    entity: string,
    action: string,
    before: unknown,
    after: unknown
  ): void {
    const metadata = {
      entity,
      action,
      before: this.sanitizeData(before),
      after: this.sanitizeData(after)
    };
    
    this.logEvent('DATA_CHANGE', `${entity} ${action}`, metadata);
  }

  logSecurityEvent(event: string, details: Record<string, unknown> = {}): void {
    this.logEvent('SECURITY_EVENT', event, details, 'warning');
  }

  logError(error: Error, context: Record<string, unknown> = {}): void {
    const metadata = {
      error: error.message,
      stack: error.stack,
      context: this.sanitizeData(context)
    };
    
    this.logEvent('ERROR', error.message, metadata, 'error');
  }

  sanitizeParams(params: unknown): unknown {
    return redactSensitive(params);
  }

  sanitizeData(data: unknown): unknown {
    return redactSensitive(data);
  }

  // Query methods
  getEvents(options: GetEventsOptions = {}): AuditEvent[] {
    let filtered = [...this.events];
    
    if (options.type) {
      filtered = filtered.filter(event => event.type === options.type);
    }
    
    if (options.severity) {
      filtered = filtered.filter(event => event.severity === options.severity);
    }
    
    if (options.userId) {
      filtered = filtered.filter(event => event.userId === options.userId);
    }
    
    if (options.startDate) {
      const start = new Date(options.startDate);
      filtered = filtered.filter(event => new Date(event.timestamp) >= start);
    }
    
    if (options.endDate) {
      const end = new Date(options.endDate);
      end.setUTCHours(23, 59, 59, 999);
      filtered = filtered.filter(event => new Date(event.timestamp) <= end);
    }
    
    if (options.search) {
      const search = options.search.toLowerCase();
      filtered = filtered.filter(event => 
        event.message.toLowerCase().includes(search) ||
        JSON.stringify(event.metadata).toLowerCase().includes(search)
      );
    }
    
    return filtered;
  }

  getSecurityAlerts(): AuditEvent[] {
    return this.getEvents({ type: 'SECURITY_ALERT' });
  }

  getErrors(): AuditEvent[] {
    return this.getEvents({ type: 'ERROR' });
  }

  getAPIActivity(): AuditEvent[] {
    return this.getEvents({ type: 'API_CALL' });
  }

  // Export functionality
  exportEvents(format: ExportFormat = 'json', options: GetEventsOptions = {}): string {
    const events = this.getEvents(options);
    
    switch (format) {
      case 'json':
        return this.exportAsJSON(events);
      case 'csv':
        return this.exportAsCSV(events);
      case 'txt':
        return this.exportAsText(events);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  exportAsJSON(events: AuditEvent[]): string {
    const data = {
      exportDate: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      totalEvents: events.length,
      events
    };
    
    return JSON.stringify(data, null, 2);
  }

  exportAsCSV(events: AuditEvent[]): string {
    const escapeCsv = (value: unknown): string => {
      const text = value == null ? '' : String(value);
      const needsQuotes = /[",\n]/.test(text);
      const safe = text.replace(/"/g, '""');
      return needsQuotes ? `"${safe}"` : safe;
    };

    const headers = ['ID', 'Timestamp', 'User ID', 'Type', 'Message', 'Severity', 'Metadata'];
    const rows = events.map(event => [
      event.id,
      event.timestamp,
      event.userId || '',
      event.type,
      event.message,
      event.severity,
      JSON.stringify(event.metadata)
    ]);

    return [headers, ...rows]
      .map(row => row.map(escapeCsv).join(','))
      .join('\n');
  }

  exportAsText(events: AuditEvent[]): string {
    return events.map(event => {
      return `[${event.timestamp}] ${event.severity.toUpperCase()} ${event.type}: ${event.message}
Metadata: ${JSON.stringify(event.metadata, null, 2)}
---`;
    }).join('\n');
  }

  // Subscription system
  subscribe(callback: AuditSubscriber): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  notifySubscribers(event: AuditEvent): void {
    this.subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Audit trail subscriber error:', error);
      }
    });
  }

  // Storage persistence
  persistToStorage(): void {
    try {
      const data: StoredAuditData = {
        events: this.events.slice(0, 1000), // Only store last 1000 events in localStorage
        userId: this.userId,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem('stellar_audit_trail', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to persist audit trail to storage:', error);
    }
  }

  // Cleanup and maintenance
  clearEvents(): void {
    this.events = [];
    this.persistToStorage();
    this.logEvent('SYSTEM', 'Audit trail cleared', {}, 'info');
  }

  clearOldEvents(daysToKeep = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    this.events = this.events.filter(event => 
      new Date(event.timestamp) >= cutoffDate
    );
    
    this.persistToStorage();
    this.logEvent('SYSTEM', `Old audit events cleared (kept ${daysToKeep} days)`, { 
      remainingEvents: this.events.length 
    }, 'info');
  }

  // Statistics
  getStatistics(): AuditStatistics {
    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    const recentEvents = this.events.filter(event => 
      new Date(event.timestamp) >= last24h
    );
    
    const weeklyEvents = this.events.filter(event => 
      new Date(event.timestamp) >= last7d
    );

    return {
      totalEvents: this.events.length,
      last24hEvents: recentEvents.length,
      last7dEvents: weeklyEvents.length,
      securityAlerts: this.getSecurityAlerts().length,
      errors: this.getErrors().length,
      apiCalls: this.getAPIActivity().length,
      sessionId: this.sessionId,
      userId: this.userId,
      counters: { ...this.counters }
    };
  }
}

// Create singleton instance
const auditTrail = new AuditTrail();

export default auditTrail;
export { AuditTrail };

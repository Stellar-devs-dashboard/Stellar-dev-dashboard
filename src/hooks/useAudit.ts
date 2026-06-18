/**
 * Audit Hooks (#118)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAuditEntries,
  getAuditStats,
  recordAudit,
  subscribeAudit,
  type GetAuditEntriesFilters,
  type RecordAuditParams,
} from '../utils/audit';
import {
  trackSecurityEvent,
  subscribeSecurityAlerts,
  type SecurityAlert,
  type SecurityEventTypeValue,
} from '../lib/securityEvents';

export function useAuditLog(filters: GetAuditEntriesFilters = {}, opts: { pollMs?: number } = {}) {
  const { pollMs = 0 } = opts;
  const filterKey = JSON.stringify(filters);
  const stableFilters = useMemo(() => filters, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [entries, setEntries] = useState(() => getAuditEntries(stableFilters));

  const refresh = useCallback(() => {
    setEntries(getAuditEntries(stableFilters));
  }, [stableFilters]);

  useEffect(() => {
    refresh();
    const unsub = subscribeAudit((entry) => {
      if (stableFilters.category && entry.category !== stableFilters.category) return;
      if (stableFilters.severity && entry.severity !== stableFilters.severity) return;
      refresh();
    });

    let interval: ReturnType<typeof setInterval> | undefined;
    if (pollMs > 0) interval = setInterval(refresh, pollMs);

    return () => {
      unsub();
      if (interval) clearInterval(interval);
    };
  }, [refresh, stableFilters, pollMs]);

  return { entries, refresh };
}

export function useAuditAction(action: string, defaults: Partial<RecordAuditParams> = {}) {
  return useCallback(
    (overrides: Partial<RecordAuditParams> = {}) =>
      recordAudit({ action, ...defaults, ...overrides }),
    [action, JSON.stringify(defaults)], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

export function useSecurityEvent(eventType: SecurityEventTypeValue, defaults: Record<string, unknown> = {}) {
  return useCallback(
    (overrides: Record<string, unknown> = {}) => trackSecurityEvent(eventType, { ...defaults, ...overrides }),
    [eventType, JSON.stringify(defaults)], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

interface SecurityMonitorAlert extends SecurityAlert {
  at: number;
}

export function useSecurityMonitor(maxAlerts = 20) {
  const [alerts, setAlerts] = useState<SecurityMonitorAlert[]>([]);

  useEffect(() => {
    const unsub = subscribeSecurityAlerts((alert) => {
      setAlerts((prev) => [{ ...alert, at: Date.now() }, ...prev].slice(0, maxAlerts));
    });
    return () => {
      unsub();
    };
  }, [maxAlerts]);

  const clear = useCallback(() => setAlerts([]), []);

  return { alerts, clear };
}

export function useAuditStats() {
  const [stats, setStats] = useState(() => getAuditStats());

  useEffect(() => {
    const unsub = subscribeAudit(() => setStats(getAuditStats()));
    return () => {
      unsub();
    };
  }, []);

  return stats;
}

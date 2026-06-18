import { useState, useEffect, useMemo } from 'react';

import {
  collectHealthSnapshot,
  collectSystemHealthSnapshot,
  computeHealthScore,
  watchErrors,
  type HealthSnapshot,
  type RuntimeErrorRecord,
} from '../utils/monitoring';
import { alertCenter, evaluateAlertRules, type AlertItem } from '../lib/alerts';
import { dispatchAlert, type AlertPayload } from '../lib/alertsService';

function toAlertPayload(alert: AlertItem): AlertPayload {
  return {
    id: alert.id,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    channel: 'WEBHOOK',
  };
}

export function useMonitoring(pollIntervalMs = 15000) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(() => ({
    ...collectHealthSnapshot(),
    networkHealth: [],
    latencyHistory: [],
  }));
  const [errors, setErrors] = useState<RuntimeErrorRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    const stopErrorWatch = watchErrors((error) => {
      setErrors((prev) => [error, ...prev].slice(0, 30));
    });

    let active = true;

    const refreshSnapshot = async () => {
      setSnapshot((current) => ({
        ...current,
        ...collectHealthSnapshot(),
      }));

      try {
        const systemSnapshot = await collectSystemHealthSnapshot();
        if (!active) return;
        setSnapshot(systemSnapshot);
      } catch (error) {
        if (!active) return;
        console.warn('Unable to refresh system health snapshot:', error);
      }
    };

    refreshSnapshot();
    const id = setInterval(refreshSnapshot, pollIntervalMs);

    const unsubscribeAlerts = alertCenter.subscribe((items) => setAlerts(items));

    return () => {
      active = false;
      stopErrorWatch();
      clearInterval(id);
      unsubscribeAlerts();
    };
  }, [pollIntervalMs]);

  const score = useMemo(() => computeHealthScore(snapshot), [snapshot]);

  useEffect(() => {
    const newAlerts = evaluateAlertRules(snapshot, score);
    alertCenter.push(newAlerts);
    newAlerts.forEach((alert) => {
      void dispatchAlert(toAlertPayload(alert));
    });
  }, [snapshot, score]);

  return {
    snapshot,
    score,
    alerts,
    errors,
    clearAlert: (id: string) => alertCenter.clear(id),
    resetAlerts: () => alertCenter.reset(),
  };
}

export default useMonitoring;

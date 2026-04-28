import { useEffect, useMemo, useState } from "react";
import {
  collectHealthSnapshot,
  computeHealthScore,
  watchErrors,
} from "../utils/monitoring";
import { alertCenter, evaluateAlertRules } from "../lib/alerts";

export function useMonitoring(pollIntervalMs = 15000) {
  const [snapshot, setSnapshot] = useState(() => collectHealthSnapshot());
  const [errors, setErrors] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const stopErrorWatch = watchErrors((error) => {
      setErrors((prev) => [error, ...prev].slice(0, 30));
    });

    const id = setInterval(() => {
      setSnapshot(collectHealthSnapshot());
    }, pollIntervalMs);

    const unsubscribeAlerts = alertCenter.subscribe((items) => setAlerts(items));

    return () => {
      stopErrorWatch();
      clearInterval(id);
      unsubscribeAlerts();
    };
  }, [pollIntervalMs]);

  const score = useMemo(() => computeHealthScore(snapshot), [snapshot]);

  useEffect(() => {
    alertCenter.push(evaluateAlertRules(snapshot, score));
  }, [snapshot, score]);

  return {
    snapshot,
    score,
    alerts,
    errors,
    clearAlert: (id) => alertCenter.clear(id),
    resetAlerts: () => alertCenter.reset(),
  };
}

export default useMonitoring;

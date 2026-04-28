const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
};

export function evaluateAlertRules(snapshot, score) {
  const alerts = [];
  const memory = snapshot?.memory;

  if (!snapshot?.online) {
    alerts.push({
      id: "offline",
      severity: ALERT_SEVERITY.CRITICAL,
      title: "Network disconnected",
      description: "The app is offline. Data may be stale.",
    });
  }

  if (score < 60) {
    alerts.push({
      id: "health-low",
      severity: ALERT_SEVERITY.WARNING,
      title: "System health degraded",
      description: `Current health score is ${score}/100.`,
    });
  }

  if (memory?.jsHeapSizeLimit) {
    const heapRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    if (heapRatio > 0.9) {
      alerts.push({
        id: "heap-critical",
        severity: ALERT_SEVERITY.CRITICAL,
        title: "High memory pressure",
        description: "Memory usage is above 90% of heap limit.",
      });
    }
  }

  return alerts;
}

export class AlertCenter {
  constructor() {
    this.listeners = new Set();
    this.items = [];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.items);
    return () => this.listeners.delete(listener);
  }

  push(alerts = []) {
    const merged = [...alerts, ...this.items]
      .filter((alert, index, array) => {
        return array.findIndex((candidate) => candidate.id === alert.id) === index;
      })
      .slice(0, 50);
    this.items = merged;
    this.listeners.forEach((listener) => listener(this.items));
  }

  clear(alertId) {
    this.items = this.items.filter((item) => item.id !== alertId);
    this.listeners.forEach((listener) => listener(this.items));
  }

  reset() {
    this.items = [];
    this.listeners.forEach((listener) => listener(this.items));
  }
}

export const alertCenter = new AlertCenter();

export { ALERT_SEVERITY };

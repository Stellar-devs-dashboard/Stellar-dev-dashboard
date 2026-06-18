const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;

const ALERT_RULE_TYPE = {
  BALANCE_LOW: "balance_low",
  BALANCE_HIGH: "balance_high",
  PAYMENT_INCOMING: "payment_incoming",
  PAYMENT_OUTGOING: "payment_outgoing",
  TRANSACTION_FAILED: "transaction_failed",
} as const;

const ALERT_CHANNEL = {
  PAYMENTS: "payments",
  EFFECTS: "effects",
  TRANSACTIONS: "transactions",
} as const;

export type AlertSeverity = (typeof ALERT_SEVERITY)[keyof typeof ALERT_SEVERITY];
export type AlertRuleType = (typeof ALERT_RULE_TYPE)[keyof typeof ALERT_RULE_TYPE];
export type AlertChannel = (typeof ALERT_CHANNEL)[keyof typeof ALERT_CHANNEL];

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
}

export interface AlertRule {
  id: string;
  type: AlertRuleType;
  threshold: number;
  assetCode: string;
  channel: AlertChannel;
  account?: string;
}

export interface HealthSnapshot {
  online?: boolean;
  memory?: {
    jsHeapSizeLimit?: number;
    usedJSHeapSize?: number;
  };
}

export interface AccountStreamEvent {
  channel: AlertChannel;
  record: Record<string, unknown>;
}

type AlertListener = (items: AlertItem[]) => void;

export function evaluateAlertRules(snapshot: HealthSnapshot | null | undefined, score: number): AlertItem[] {
  const alerts: AlertItem[] = [];
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
    const heapRatio = memory.usedJSHeapSize! / memory.jsHeapSizeLimit;
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

export function evaluateEventRules(
  incomingEvent: AccountStreamEvent,
  activeRules: AlertRule[],
  watchedAccount: string,
): AlertItem[] {
  const triggeredAlerts: AlertItem[] = [];
  const record = incomingEvent.record;

  for (const rule of activeRules) {
    if (rule.channel !== incomingEvent.channel) {
      continue;
    }
    if (rule.account && rule.account !== watchedAccount) {
      continue;
    }

    switch (rule.type) {
      case ALERT_RULE_TYPE.BALANCE_LOW:
      case ALERT_RULE_TYPE.BALANCE_HIGH: {
        if (incomingEvent.channel === ALERT_CHANNEL.EFFECTS) {
          const type = String(record.type);
          if (type === 'account_credited' || type === 'account_debited') {
            const assetCode = String(record.asset_code || 'XLM');
            if (assetCode === rule.assetCode) {
              const amount = parseFloat(String(record.amount));
              if (rule.type === ALERT_RULE_TYPE.BALANCE_LOW && amount < rule.threshold) {
                triggeredAlerts.push({
                  id: `balance-low-${rule.assetCode}-${rule.id}`,
                  severity: ALERT_SEVERITY.CRITICAL,
                  title: `Low ${rule.assetCode} balance detected`,
                  description: `Transaction amount ${amount} is below threshold ${rule.threshold}.`,
                });
              } else if (rule.type === ALERT_RULE_TYPE.BALANCE_HIGH && amount > rule.threshold) {
                triggeredAlerts.push({
                  id: `balance-high-${rule.assetCode}-${rule.id}`,
                  severity: ALERT_SEVERITY.WARNING,
                  title: `High ${rule.assetCode} balance detected`,
                  description: `Transaction amount ${amount} is above threshold ${rule.threshold}.`,
                });
              }
            }
          }
        }
        break;
      }
      case ALERT_RULE_TYPE.PAYMENT_INCOMING: {
        if (incomingEvent.channel === ALERT_CHANNEL.PAYMENTS) {
          const to = String(record.to);
          if (to === watchedAccount) {
            const amount = parseFloat(String(record.amount));
            const assetCode = String(record.asset_code || 'XLM');
            if (assetCode === rule.assetCode && amount >= rule.threshold) {
              triggeredAlerts.push({
                id: `incoming-payment-${rule.assetCode}-${rule.id}`,
                severity: ALERT_SEVERITY.INFO,
                title: `Incoming ${assetCode} payment received`,
                description: `Received ${amount} ${assetCode} from ${truncateAddr(String(record.from))}.`,
              });
            }
          }
        }
        break;
      }
      case ALERT_RULE_TYPE.PAYMENT_OUTGOING: {
        if (incomingEvent.channel === ALERT_CHANNEL.PAYMENTS) {
          const from = String(record.from);
          if (from === watchedAccount) {
            const amount = parseFloat(String(record.amount));
            const assetCode = String(record.asset_code || 'XLM');
            if (assetCode === rule.assetCode && amount >= rule.threshold) {
              triggeredAlerts.push({
                id: `outgoing-payment-${rule.assetCode}-${rule.id}`,
                severity: ALERT_SEVERITY.INFO,
                title: `Outgoing ${assetCode} payment sent`,
                description: `Sent ${amount} ${assetCode} to ${truncateAddr(String(record.to))}.`,
              });
            }
          }
        }
        break;
      }
      case ALERT_RULE_TYPE.TRANSACTION_FAILED: {
        if (incomingEvent.channel === ALERT_CHANNEL.TRANSACTIONS) {
          const successful = record.successful;
          if (successful === false) {
            triggeredAlerts.push({
              id: `transaction-failed-${rule.id}`,
              severity: ALERT_SEVERITY.CRITICAL,
              title: `Transaction failed`,
              description: `Transaction ${String(record.id).slice(0, 8)}... failed.`,
            });
          }
        }
        break;
      }
    }
  }
  return triggeredAlerts;
}

function truncateAddr(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

export class AlertCenter {
  private listeners = new Set<AlertListener>();
  private items: AlertItem[] = [];

  subscribe(listener: AlertListener) {
    this.listeners.add(listener);
    listener(this.items);
    return () => this.listeners.delete(listener);
  }

  push(alerts: AlertItem[] = []) {
    const merged = [...alerts, ...this.items]
      .filter((alert, index, array) => {
        return array.findIndex((candidate) => candidate.id === alert.id) === index;
      })
      .slice(0, 50);
    this.items = merged;
    this.listeners.forEach((listener) => listener(this.items));
  }

  clear(alertId: string) {
    this.items = this.items.filter((item) => item.id !== alertId);
    this.listeners.forEach((listener) => listener(this.items));
  }

  reset() {
    this.items = [];
    this.listeners.forEach((listener) => listener(this.items));
  }
}

export const alertCenter = new AlertCenter();

export { ALERT_SEVERITY, ALERT_RULE_TYPE, ALERT_CHANNEL };

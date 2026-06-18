/**
 * User analytics and event tracking
 */

interface AnalyticsEvent {
  name: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

const analyticsConfig = {
  enabled: true,
  batchSize: 20,
  flushInterval: 60000,
  endpoint: null as string | null,
  sessionId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
};

const eventQueue: AnalyticsEvent[] = [];

export const trackEvent = (eventName: string, properties: Record<string, unknown> = {}) => {
  if (!analyticsConfig.enabled) return;

  const event: AnalyticsEvent = {
    name: eventName,
    timestamp: new Date().toISOString(),
    properties: {
      ...properties,
      sessionId: analyticsConfig.sessionId,
      url: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
  };

  eventQueue.push(event);

  if (eventQueue.length >= analyticsConfig.batchSize) {
    flushEvents();
  }
};

export const trackPageView = (path: string, title: string | null = null) => {
  trackEvent('page_view', {
    path,
    title: title || (typeof document !== 'undefined' ? document.title : null),
  });
};

export const trackUserAction = (action: string, details: Record<string, unknown> = {}) => {
  trackEvent('user_action', {
    action,
    ...details,
  });
};

export const trackPerformanceMetric = (metricName: string, value: number, unit = 'ms') => {
  trackEvent('performance_metric', {
    metric: metricName,
    value,
    unit,
  });
};

export const trackApiCall = (
  endpoint: string,
  method: string,
  duration: number,
  status: string | number
) => {
  trackEvent('api_call', {
    endpoint,
    method,
    duration,
    status,
  });
};

export const flushEvents = async () => {
  if (eventQueue.length === 0 || !analyticsConfig.endpoint) return;

  const eventsToSend = [...eventQueue];
  eventQueue.length = 0;

  try {
    await fetch(analyticsConfig.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: eventsToSend,
        sessionId: analyticsConfig.sessionId,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error('Analytics flush failed:', error);
    eventQueue.unshift(...eventsToSend);
  }
};

export const setAnalyticsEndpoint = (endpoint: string) => {
  analyticsConfig.endpoint = endpoint;
};

export const setAnalyticsEnabled = (enabled: boolean) => {
  analyticsConfig.enabled = enabled;
};

export const getSessionId = () => analyticsConfig.sessionId;

if (typeof window !== 'undefined') {
  setInterval(flushEvents, analyticsConfig.flushInterval);
  window.addEventListener('beforeunload', flushEvents);
}

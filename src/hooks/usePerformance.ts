import { useEffect, useCallback, useState } from 'react';
import { initPerformanceMonitoring } from '../lib/performanceMonitoring';
import { trackPerformanceMetric, trackPageView } from '../utils/analytics';

export interface PerformanceMetrics {
  domContentLoaded: number;
  loadComplete: number;
  ttfb: number;
  domInteractive: number;
  resourcesCount: number;
  totalResourceSize: number;
}

export const usePerformance = (componentName: string | null = null) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [vitals, setVitals] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    initPerformanceMonitoring();
  }, []);

  const startTimer = useCallback(() => performance.now(), []);

  const endTimer = useCallback((startTime: number, metricName?: string) => {
    const duration = performance.now() - startTime;
    trackPerformanceMetric(metricName || componentName || 'component', duration, 'ms');
    return duration;
  }, [componentName]);

  const measureApiCall = useCallback(async <T>(
    apiFunction: () => Promise<T>,
    endpoint: string,
    method = 'GET'
  ): Promise<T> => {
    const startTime = startTimer();
    try {
      const result = await apiFunction();
      const duration = endTimer(startTime, `api_call_${endpoint}`);
      trackPerformanceMetric(`${method} ${endpoint}`, duration, 'ms');
      return result;
    } catch (error) {
      const duration = endTimer(startTime, `api_call_${endpoint}_error`);
      trackPerformanceMetric(`${method} ${endpoint} (error)`, duration, 'ms');
      throw error;
    }
  }, [startTimer, endTimer]);

  const getMetrics = useCallback((): PerformanceMetrics | null => {
    if (typeof window === 'undefined') return null;

    const perfData = window.performance;
    if (!perfData) return null;

    const navigation = perfData.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!navigation) return null;

    return {
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
      loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
      ttfb: navigation.responseStart - navigation.requestStart,
      domInteractive: navigation.domInteractive - navigation.fetchStart,
      resourcesCount: perfData.getEntriesByType('resource').length,
      totalResourceSize: perfData.getEntriesByType('resource').reduce(
        (sum, entry) => sum + ((entry as PerformanceResourceTiming).transferSize || 0),
        0
      ),
    };
  }, []);

  useEffect(() => {
    const newMetrics = getMetrics();
    setMetrics(newMetrics);

    const interval = setInterval(() => {
      setMetrics(getMetrics());
    }, 5000);

    return () => clearInterval(interval);
  }, [getMetrics]);

  useEffect(() => {
    if (typeof window !== 'undefined' && componentName) {
      trackPageView(window.location.pathname, componentName);
    }
  }, [componentName]);

  return {
    startTimer,
    endTimer,
    measureApiCall,
    metrics,
    vitals,
    getMetrics,
  };
};

export default usePerformance;

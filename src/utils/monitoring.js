function nowIso() {
  return new Date().toISOString();
}

function readMemory() {
  const memory = performance?.memory;
  if (!memory) return null;
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  };
}

function readNavigationTiming() {
  const entry = performance.getEntriesByType("navigation")[0];
  if (!entry) return null;
  return {
    domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
    loadEventMs: Math.round(entry.loadEventEnd),
    responseStartMs: Math.round(entry.responseStart),
  };
}

export function collectHealthSnapshot() {
  return {
    timestamp: nowIso(),
    online: navigator.onLine,
    visibility: document.visibilityState,
    memory: readMemory(),
    navigation: readNavigationTiming(),
  };
}

export function computeHealthScore(snapshot) {
  if (!snapshot) return 0;
  let score = 100;

  if (!snapshot.online) score -= 40;
  if (snapshot.visibility === "hidden") score -= 5;

  if (snapshot.memory?.jsHeapSizeLimit) {
    const ratio =
      snapshot.memory.usedJSHeapSize / snapshot.memory.jsHeapSizeLimit;
    if (ratio > 0.9) score -= 30;
    else if (ratio > 0.8) score -= 20;
    else if (ratio > 0.7) score -= 10;
  }

  if (snapshot.navigation?.loadEventMs > 8000) score -= 20;
  else if (snapshot.navigation?.loadEventMs > 4000) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function watchErrors(onError) {
  function handleError(event) {
    onError?.({
      kind: "runtime-error",
      message: event?.message || "Unknown runtime error",
      timestamp: nowIso(),
    });
  }

  function handleRejection(event) {
    onError?.({
      kind: "promise-rejection",
      message: String(event?.reason || "Unhandled rejection"),
      timestamp: nowIso(),
    });
  }

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
}

export default {
  collectHealthSnapshot,
  computeHealthScore,
  watchErrors,
};

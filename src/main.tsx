import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import { initPerformanceMonitoring } from "./lib/performance";
import { registerServiceWorker } from "./utils/offline";

// Initialize performance monitoring (no RUM endpoint by default)
initPerformanceMonitoring();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Register the service worker after the app has mounted.
// Using window.load ensures the SW registration doesn't compete with initial
// resource fetching and slowing the first paint.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerServiceWorker();
  });
}

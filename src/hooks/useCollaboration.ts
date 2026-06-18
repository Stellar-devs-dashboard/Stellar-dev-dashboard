import { useEffect, useRef, useState, useCallback } from 'react';
import {
  initStateSync,
  destroyStateSync,
  buildShareableURL,
  decodeSessionFromHash,
  broadcastStateChange,
} from '../utils/stateSync';

type SyncStatus = 'idle' | 'active' | 'error';
type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface CollaborationStore {
  getState: () => Record<string, unknown>;
  setState: (partial: Record<string, unknown>) => void;
  subscribe: (
    listener: (state: Record<string, unknown>, prevState: Record<string, unknown>) => void
  ) => () => void;
}

export function useCollaboration(
  store: CollaborationStore | null,
  options: { enableWebSocket?: boolean; wsUrl?: string } = {}
) {
  const { enableWebSocket = false, wsUrl } = options;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [connectedTabs, setConnectedTabs] = useState(1);
  const [shareURL, setShareURL] = useState('');
  const [showPrivacyWarning, setShowPrivacyWarning] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');

  useEffect(() => {
    if (!store) return;

    try {
      initStateSync(store);
      setSyncStatus('active');
    } catch (err) {
      console.warn('[useCollaboration] Could not init stateSync:', err);
      setSyncStatus('error');
    }

    const pingChannel = 'BroadcastChannel' in window ? new BroadcastChannel('stellar-tab-count') : null;

    if (pingChannel) {
      pingChannel.postMessage({ type: 'TAB_OPEN' });

      const tabSet = new Set<string | number>();
      tabSet.add('self');

      pingChannel.onmessage = (e: MessageEvent<{ type?: string; tabId?: string | number }>) => {
        if (e.data?.type === 'TAB_OPEN') {
          tabSet.add(e.data.tabId || Math.random());
          setConnectedTabs(tabSet.size);
          pingChannel.postMessage({ type: 'TAB_ACK', tabId: 'self' });
        } else if (e.data?.type === 'TAB_ACK') {
          tabSet.add(e.data.tabId || Math.random());
          setConnectedTabs(tabSet.size);
        } else if (e.data?.type === 'TAB_CLOSE') {
          tabSet.delete(e.data.tabId ?? '');
          setConnectedTabs(Math.max(1, tabSet.size));
        }
      };

      const handleUnload = () => {
        pingChannel.postMessage({ type: 'TAB_CLOSE', tabId: 'self' });
      };
      window.addEventListener('beforeunload', handleUnload);

      return () => {
        handleUnload();
        pingChannel.close();
        destroyStateSync();
        window.removeEventListener('beforeunload', handleUnload);
      };
    }

    return () => {
      destroyStateSync();
    };
  }, [store]);

  useEffect(() => {
    if (!store) return;
    const sessionState = decodeSessionFromHash(window.location.hash);
    if (sessionState) {
      store.setState(sessionState);
    }
  }, [store]);

  useEffect(() => {
    if (!enableWebSocket || !wsUrl || !store) return;

    setWsStatus('connecting');
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        const state = store.getState();
        ws?.send(JSON.stringify({ type: 'STATE_HELLO', payload: buildShareableURL(state) }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            payload?: Record<string, unknown>;
          };
          if (msg.type === 'STATE_UPDATE' && msg.payload) {
            store.setState(msg.payload);
            broadcastStateChange(msg.payload);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => setWsStatus('disconnected');
    } catch (err) {
      setWsStatus('error');
      console.warn('[useCollaboration] WebSocket error:', err);
    }

    return () => {
      if (ws && ws.readyState < 2) ws.close();
      wsRef.current = null;
    };
  }, [enableWebSocket, wsUrl, store]);

  const generateShareLink = useCallback(() => {
    if (!store) return '';
    const state = store.getState();
    const url = buildShareableURL(state);
    setShareURL(url);

    if (state.connectedAddress) {
      setShowPrivacyWarning(true);
    } else {
      setShowPrivacyWarning(false);
    }

    return url;
  }, [store]);

  const copyShareLink = useCallback(async () => {
    const url = generateShareLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      console.warn('[useCollaboration] Clipboard write failed');
    }
  }, [generateShareLink]);

  const dismissPrivacyWarning = useCallback(() => {
    setShowPrivacyWarning(false);
  }, []);

  return {
    syncStatus,
    connectedTabs,
    shareURL,
    generateShareLink,
    copyShareLink,
    copySuccess,
    showPrivacyWarning,
    dismissPrivacyWarning,
    wsStatus,
  };
}

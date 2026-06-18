/**
 * Collaboration utilities (#112)
 */

export interface PresenceRecord {
  sessionId: string;
  address: string | null;
  joinedAt: number;
  lastSeen: number;
  cursor: { x: number; y: number } | null;
}

export function createPresenceRecord(sessionId: string, address: string | null): PresenceRecord {
  return {
    sessionId,
    address: address ?? null,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    cursor: null,
  };
}

export function mergePresence(
  current: Map<string, PresenceRecord>,
  incoming: PresenceRecord
): Map<string, PresenceRecord> {
  const next = new Map(current);
  next.set(incoming.sessionId, { ...incoming, lastSeen: Date.now() });
  return next;
}

export function pruneStalePresence(
  current: Map<string, PresenceRecord>,
  ttlMs = 30_000
): Map<string, PresenceRecord> {
  const now = Date.now();
  const next = new Map<string, PresenceRecord>();
  for (const [id, record] of current) {
    if (now - record.lastSeen < ttlMs) next.set(id, record);
  }
  return next;
}

export function buildCursorPayload(x: number, y: number): { x: number; y: number } {
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

export function sessionColor(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash) + sessionId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

const SHAREABLE_KEYS = new Set(['activeTab', 'network', 'connectedAddress']);

export function mergeSharedViewState(
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...local };
  for (const [key, value] of Object.entries(remote)) {
    if (SHAREABLE_KEYS.has(key)) merged[key] = value;
  }
  return merged;
}

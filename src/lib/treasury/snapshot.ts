import { SNAPSHOT_SCHEMA_VERSION } from '../../types/treasury'
import type { PeriodSnapshot, ReconciliationPeriod } from '../../types/treasury'

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Recursively sorts object keys so the same period always serializes identically regardless of property insertion order. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

function canonicalPeriodText(period: ReconciliationPeriod): string {
  return JSON.stringify(sortKeysDeep(period))
}

/**
 * Creates a content-hashed, immutable record of a period's full state at
 * closing time. The hash lets anyone re-verify later that a stored or
 * exported snapshot hasn't been altered — see verifySnapshotIntegrity.
 */
export async function createPeriodSnapshot(period: ReconciliationPeriod, id: string, now = new Date()): Promise<PeriodSnapshot> {
  const contentHash = await sha256Hex(canonicalPeriodText(period))
  return Object.freeze({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    id,
    periodId: period.id,
    generatedAt: now.toISOString(),
    period: Object.freeze(period),
    contentHash,
  })
}

export async function verifySnapshotIntegrity(snapshot: PeriodSnapshot): Promise<boolean> {
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return false
  const recomputed = await sha256Hex(canonicalPeriodText(snapshot.period))
  return recomputed === snapshot.contentHash
}

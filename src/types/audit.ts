export interface AuditEntry {
  id: string
  timestamp: string
  severity: string
  category: string
  message: string
  metadata?: Record<string, unknown>
}

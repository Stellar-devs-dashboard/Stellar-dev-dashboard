/**
 * Best-effort redaction applied to anything from an external source (build
 * worker logs, network error messages) before it reaches the UI, console,
 * browser storage, or an exported attestation. This is defense in depth —
 * manifest validation already rejects URLs with embedded credentials — not
 * a substitute for never generating secrets in the first place.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
    .replace(/:\/\/[^/@\s]+@/g, '://[redacted]@')
    .replace(/(authorization|api[-_]?key|token|secret)\s*[:=]\s*\S+/gi, '$1: [redacted]')
}

export function redactLogLines(lines: string[], maxLines = 500): string[] {
  return lines.slice(0, maxLines).map((line) => redactSecrets(String(line)))
}

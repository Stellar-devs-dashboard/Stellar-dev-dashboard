export function highlightMatch(text: string, query: string): string {
  if (!query) return String(text ?? '');
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(escaped, 'ig'), (match) => `<mark>${match}</mark>`);
}

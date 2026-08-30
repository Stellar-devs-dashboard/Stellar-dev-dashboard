import React, { ChangeEvent, useMemo, useRef, useState } from 'react';
import { createCatalog, entriesFor, exportCatalog, pseudoCatalog, setEntry } from '../../lib/i18n/catalog';
import { importAndStore, resolveCatalog, saveStoredCatalog } from '../../lib/i18n/catalogStore';
import { summarizeIssues, validateCatalog } from '../../lib/i18n/validation';
import type { LocaleCatalog } from '../../types/i18nPlatform';
import en from '../../i18n/en.json';
import es from '../../i18n/es.json';
import fr from '../../i18n/fr.json';
import de from '../../i18n/de.json';
import pt from '../../i18n/pt.json';
import ja from '../../i18n/ja.json';
import ko from '../../i18n/ko.json';
import zh from '../../i18n/zh.json';
import ar from '../../i18n/ar.json';

const SOURCE = createCatalog('en', en);
const BUNDLED: Record<string, LocaleCatalog> = { en: SOURCE, es: createCatalog('es', es), fr: createCatalog('fr', fr), de: createCatalog('de', de), pt: createCatalog('pt', pt), ja: createCatalog('ja', ja), ko: createCatalog('ko', ko), zh: createCatalog('zh', zh), ar: createCatalog('ar', ar) };
const localeNames: Record<string, string> = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', ja: '日本語', ko: '한국어', zh: '中文', ar: 'العربية' };

function download(name: string, content: string) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = name; link.click(); URL.revokeObjectURL(link.href);
}

export default function TranslationReview() {
  const [locale, setLocale] = useState('es'); const [query, setQuery] = useState(''); const [missingOnly, setMissingOnly] = useState(false);
  const [catalog, setCatalog] = useState(() => resolveCatalog(BUNDLED.es)); const [notice, setNotice] = useState<string | null>(null); const fileInput = useRef<HTMLInputElement>(null);
  const report = useMemo(() => validateCatalog(catalog, SOURCE), [catalog]);
  const sourceEntries = useMemo(() => new Map(entriesFor(SOURCE).map(item => [item.key, item])), []);
  const visible = useMemo(() => entriesFor(SOURCE).filter(entry => {
    const target = catalog.namespaces.translation?.[entry.key.replace('translation:', '')]; const text = `${entry.key} ${entry.value} ${target?.value ?? ''}`.toLowerCase();
    return (!missingOnly || !target?.value.trim()) && text.includes(query.toLowerCase());
  }), [catalog, missingOnly, query]);
  const summary = summarizeIssues(report.issues);
  const chooseLocale = (next: string) => { setLocale(next); setCatalog(resolveCatalog(BUNDLED[next])); setNotice(null); };
  const update = (key: string, value: string) => { const next = setEntry(catalog, key, value, sourceEntries.get(key)?.metadata); setCatalog(next); saveStoredCatalog(next); };
  const onImport = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const result = importAndStore(await file.text(), locale); if (result.catalog) { setCatalog(resolveCatalog(BUNDLED[locale])); setNotice(`Imported ${result.catalog.locale}. ${result.warnings.length ? result.warnings.join(' ') : ''}`); } else setNotice(result.errors.join(' ')); event.target.value = ''; };
  const runPseudo = () => { const next = pseudoCatalog(SOURCE, 'en-XA'); setCatalog(next); setLocale('en-XA'); setNotice('Pseudo-localization is active. Export it to inspect layout expansion.'); };
  return <section aria-labelledby="translation-review-title" style={{ maxWidth: 1120, padding: '24px 0' }}>
    <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div><h2 id="translation-review-title" style={{ margin: 0 }}>Translation review</h2><p style={{ color: 'var(--text-muted)', marginTop: 6 }}>Review locale coverage locally. Imports stay in this browser until a reviewer exports a catalog.</p></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={runPseudo}>Pseudo-localize</button><button type="button" onClick={() => download(`stellar-${locale}.json`, exportCatalog(catalog))}>Export catalog</button><button type="button" onClick={() => fileInput.current?.click()}>Import catalog</button><input ref={fileInput} type="file" accept="application/json" onChange={onImport} hidden />
      </div>
    </div>
    {notice && <p role="status" style={{ padding: 10, background: 'var(--bg-elevated)', borderRadius: 6 }}>{notice}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '20px 0' }}>
      <Metric label="Coverage" value={`${report.coverage}%`} /><Metric label="Translated" value={`${report.translatedKeys}/${report.totalKeys}`} /><Metric label="Errors" value={String(report.issues.filter(item => item.severity === 'error').length)} /><Metric label="Layout risks" value={String(summary['layout-risk'])} />
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <label>Locale <select value={locale} onChange={event => chooseLocale(event.target.value)}>{Object.entries(localeNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}<option value="en-XA">Pseudo (en-XA)</option></select></label>
      <label style={{ flex: 1, minWidth: 220 }}>Search <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Key or text" style={{ width: '100%' }} /></label>
      <label><input type="checkbox" checked={missingOnly} onChange={event => setMissingOnly(event.target.checked)} /> Missing only ({summary.missing})</label>
    </div>
    <div role="region" aria-label="Translation entries" style={{ display: 'grid', gap: 12 }}>
      {visible.length === 0 ? <p role="status">No entries match this filter.</p> : visible.map(source => {
        const key = source.key; const target = catalog.namespaces.translation?.[key.replace('translation:', '')]; const invalid = report.issues.filter(item => item.key === key && item.severity === 'error');
        return <article key={key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--bg-card)' }}>
          <code>{key}</code><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginTop: 8 }}><label>Source<textarea value={source.value} readOnly rows={3} aria-label={`${key} source`} /></label><label>Translation<textarea value={target?.value ?? ''} rows={3} onChange={event => update(key, event.target.value)} aria-label={`${key} translation`} /></label></div>
          {invalid.map(item => <p key={item.code} role="alert" style={{ color: 'var(--error)', marginBottom: 0 }}>{item.message}</p>)}
        </article>;
      })}
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-card)' }}><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div><strong style={{ fontSize: 22 }}>{value}</strong></div>; }

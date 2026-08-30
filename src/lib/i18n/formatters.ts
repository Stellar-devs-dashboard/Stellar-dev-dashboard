import type { LocaleFormatter, TextDirection } from '../../types/i18nPlatform';

function numeric(value: number | string): number { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function safe<T>(work: () => T, fallback: T): T { try { return work(); } catch { return fallback; } }

export function normalizeLocale(locale: string, fallback = 'en'): string {
  try { return Intl.getCanonicalLocales(locale)[0] ?? fallback; } catch { return fallback; }
}

export function createLocaleFormatter(inputLocale: string): LocaleFormatter {
  const locale = normalizeLocale(inputLocale);
  return {
    locale,
    number(value, options = {}) { return safe(() => new Intl.NumberFormat(locale, options).format(numeric(value)), String(value)); },
    amount(value, asset = 'XLM', options = {}) {
      const maximumFractionDigits = options.maximumFractionDigits ?? (asset === 'XLM' ? 7 : 2);
      return safe(() => `${new Intl.NumberFormat(locale, { maximumFractionDigits, ...options }).format(numeric(value))} ${asset}`, `${value} ${asset}`);
    },
    date(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : safe(() => new Intl.DateTimeFormat(locale, options).format(date), String(value));
    },
    duration(seconds) {
      const total = Math.max(0, Math.round(seconds)); const minutes = Math.floor(total / 60); const hours = Math.floor(minutes / 60);
      if (hours) return new Intl.NumberFormat(locale).format(hours) + 'h ' + new Intl.NumberFormat(locale).format(minutes % 60) + 'm';
      if (minutes) return new Intl.NumberFormat(locale).format(minutes) + 'm ' + new Intl.NumberFormat(locale).format(total % 60) + 's';
      return new Intl.NumberFormat(locale).format(total) + 's';
    },
    list(values, options = { style: 'long' as const, type: 'conjunction' as const }) {
      type ListFormatOptions = { style?: 'long' | 'short' | 'narrow'; type?: 'conjunction' | 'disjunction' | 'unit' };
      const ListFormat = (Intl as typeof Intl & { ListFormat?: new (locale: string, options: ListFormatOptions) => { format(values: string[]): string } }).ListFormat;
      return ListFormat ? safe(() => new ListFormat(locale, options).format(values), values.join(', ')) : values.join(', ');
    },
    relativeTime(value, unit) { return safe(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit), `${value} ${unit}`); },
    text(value, direction?: TextDirection) {
      const rtl = direction === 'rtl' || (!direction && /^(ar|he|fa|ur)\b/i.test(locale));
      return rtl ? `\u2067${value}\u2069` : `\u2066${value}\u2069`;
    },
  };
}

export function localeDirection(locale: string): TextDirection { return /^(ar|he|fa|ur)\b/i.test(locale) ? 'rtl' : 'ltr'; }
